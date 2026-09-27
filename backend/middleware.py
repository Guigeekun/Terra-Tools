"""Egress-bandwidth middlewares.

The production container is billed per GB served, so every response gets an
explicit cache policy (avoid re-downloading unchanged content) and
compressible payloads are gzipped (already-compressed media is skipped).
"""
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
    """Attach a Cache-Control policy to successful GET/HEAD responses.

    Responses that already carry Cache-Control (e.g. the no-cache SPA entry
    point) are left untouched.
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
            if message["type"] == "http.response.start" and policy and message["status"] == 200:
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
