"""Request middlewares: access logging and egress-bandwidth policies.

The production container is billed per GB served, so every response gets an
explicit cache policy (avoid re-downloading unchanged content) and
compressible payloads are gzipped (already-compressed media is skipped).

RequestLoggingMiddleware replaces uvicorn's default access log (method, path,
status only) with one enriched line per request, adding status, duration and
the number of bytes sent on the wire for egress monitoring in log
aggregators (Datadog indexes the JSON variant into attributes directly).
"""
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MEDIA_CACHE_TTL = "public, max-age=604800"  # 7 days; ETag revalidation covers older entries
CATALOG_CACHE_TTL = "public, max-age=300"  # catalog JSON only changes on user-data releases

# First matching prefix wins, so media endpoints must come before the /api/ catch-all.
CACHE_RULES = (
    ("/assets/", "public, max-age=31536000, immutable"),  # Vite content-hashed bundles
    ("/api/assets/image", MEDIA_CACHE_TTL),
    ("/api/assets/item/", MEDIA_CACHE_TTL),
    ("/api/play/", MEDIA_CACHE_TTL),
    ("/api/bg/", MEDIA_CACHE_TTL),
    ("/api/", CATALOG_CACHE_TTL),
    ("/TerraToolbox.png", MEDIA_CACHE_TTL),
    ("/favicon.ico", MEDIA_CACHE_TTL),
)

# Endpoints serving already-compressed binaries (PNG/WAV): gzipping burns CPU
# for ~no size gain.
GZIP_EXCLUDED_PATHS = (
    "/api/assets/image",
    "/api/assets/item/",
    "/api/play/",
    "/api/bg/",
    "/TerraToolbox.png",
    "/favicon.ico",
)


class CacheControlMiddleware:
    """Attach a Cache-Control policy to successful cacheable GET/HEAD responses.

    Covers 200 bodies, 206 range partials (audio scrubbing streams via
    ranges — without a policy those would fall back to heuristic freshness)
    and 304 revalidation answers.  Responses that already carry Cache-Control
    (e.g. the no-cache SPA entry point) are left untouched.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in ("GET", "HEAD"):
            await self.app(scope, receive, send)
            return

        path = scope["path"]
        policy = next((value for prefix, value in CACHE_RULES if path.startswith(prefix)), None)

        async def send_with_cache_control(message: Message) -> None:
            if message["type"] == "http.response.start" and policy and message["status"] in (200, 206, 304):
                headers = dict((k.decode("latin-1"), v.decode("latin-1")) for k, v in message["headers"])
                if "cache-control" not in headers:
                    message["headers"] = [
                        *message["headers"],
                        (b"cache-control", policy.encode("latin-1")),
                    ]
            await send(message)

        await self.app(scope, receive, send_with_cache_control)


class SelectiveGZipMiddleware(GZipMiddleware):
    """GZipMiddleware that passes media endpoints through uncompressed."""

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["path"].startswith(GZIP_EXCLUDED_PATHS):
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)


# json (production, log aggregator friendly) or text (local development).
LOG_FORMAT = os.environ.get("LOG_FORMAT", "text").strip().lower()

_access_logger = logging.getLogger("terra.access")
_access_logger.setLevel(logging.INFO)
_access_logger.propagate = False
if not _access_logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _access_logger.addHandler(_handler)


def _fmt_bytes(num: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if num < 1024 or unit == "GB":
            return f"{num:.1f}{unit}" if unit != "B" else f"{num:.0f}B"
        num /= 1024


def _fmt_duration(ms: float) -> str:
    return f"{ms:.1f}ms" if ms < 1000 else f"{ms / 1000:.2f}s"


class RequestLoggingMiddleware:
    """Log one line per HTTP request with response metadata.

    Must be the outermost middleware: the byte count it reports is what the
    client actually received, gzip included. 5xx responses are logged at
    ERROR level, everything else at INFO.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status = 500  # stays 500 if the app errors before sending a response
        bytes_sent = 0

        async def send_with_counting(message: Message) -> None:
            nonlocal status, bytes_sent
            if message["type"] == "http.response.start":
                status = message["status"]
            elif message["type"] == "http.response.body":
                bytes_sent += len(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, receive, send_with_counting)
        except Exception as exc:
            self._log(scope, status, bytes_sent, time.perf_counter() - start, exc)
            raise
        self._log(scope, status, bytes_sent, time.perf_counter() - start, None)

    def _log(
        self,
        scope: Scope,
        status: int,
        bytes_sent: int,
        elapsed: float,
        exception: Exception | None,
    ) -> None:
        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        forwarded = headers.get("x-forwarded-for", "")
        client_ip = (
            forwarded.split(",")[0].strip()
            if forwarded
            else (scope.get("client") or ("-", 0))[0]
        )
        user_agent = headers.get("user-agent", "-")
        query = f"?{scope['query_string'].decode('latin-1')}" if scope.get("query_string") else ""
        method, path = scope["method"], scope["path"]
        duration_ms = elapsed * 1000

        if exception is not None:
            reason = f" ({type(exception).__name__})"
        elif status >= 500:
            reason = " ERROR"
        else:
            reason = ""

        if LOG_FORMAT == "json":
            record = {
                "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                "level": "ERROR" if status >= 500 else "INFO",
                "logger": "terra.access",
                "message": f"{method} {path}{query} {status}{reason}",
                "method": method,
                "path": path,
                "query": query.lstrip("?"),
                "status": status,
                "duration_ms": round(duration_ms, 2),
                "response_bytes": bytes_sent,
                "client_ip": client_ip,
                "user_agent": user_agent,
            }
            if exception is not None:
                record["exception"] = repr(exception)
            _access_logger.log(
                logging.ERROR if status >= 500 else logging.INFO,
                json.dumps(record, ensure_ascii=False),
            )
        else:
            _access_logger.log(
                logging.ERROR if status >= 500 else logging.INFO,
                f'{client_ip} - "{method} {path}{query}" {status}{reason} '
                f"{_fmt_duration(duration_ms)} {_fmt_bytes(bytes_sent)}",
            )
