import unittest

from backend.middleware import CacheControlMiddleware


def _drive(inner_status, path, extra_headers=()):
    """Run a canned ASGI response through CacheControlMiddleware and return
    the headers of the http.response.start message the client would see."""
    canned = [
        {"type": "http.response.start",
         "status": inner_status,
         "headers": [(k.encode(), v.encode()) for k, v in extra_headers]},
        {"type": "http.response.body", "body": b""},
    ]

    async def inner(scope, receive, send):
        for message in canned:
            await send(message)

    seen = []

    async def send(message):
        seen.append(message)

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    middleware = CacheControlMiddleware(inner)
    scope = {"type": "http", "method": "GET", "path": path, "headers": []}
    # IsolatedAsyncioTestCase runs this coroutine for us.
    return middleware(scope, receive, send), seen


def _headers_of(messages):
    start = next(m for m in messages if m["type"] == "http.response.start")
    return dict((k.decode().lower(), v.decode()) for k, v in start["headers"])


class TestCacheControlMiddleware(unittest.IsolatedAsyncioTestCase):
    async def test_stamps_media_policy_on_200(self):
        pending, seen = _drive(200, "/api/play/BGM/bgm01.mp3")
        await pending
        self.assertEqual(_headers_of(seen).get("cache-control"), "public, max-age=604800")

    async def test_stamps_media_policy_on_206_range_partials(self):
        pending, seen = _drive(206, "/api/play/BGM/bgm01.mp3")
        await pending
        self.assertEqual(_headers_of(seen).get("cache-control"), "public, max-age=604800")

    async def test_stamps_policy_on_304_revalidation(self):
        pending, seen = _drive(304, "/api/play/BGM/bgm01.mp3")
        await pending
        self.assertEqual(_headers_of(seen).get("cache-control"), "public, max-age=604800")

    async def test_leaves_existing_policy_alone(self):
        pending, seen = _drive(200, "/", [("Cache-Control", "no-cache")])
        await pending
        self.assertEqual(_headers_of(seen).get("cache-control"), "no-cache")

    async def test_error_statuses_get_no_policy(self):
        pending, seen = _drive(404, "/api/play/BGM/missing.mp3")
        await pending
        self.assertNotIn("cache-control", _headers_of(seen))


if __name__ == "__main__":
    unittest.main()
