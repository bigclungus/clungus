#!/usr/bin/env python3
"""
Thin authenticated reverse proxy for temporal.clung.us.

Listens on :8234, requires a valid tauth_github cookie (set by clung.us),
then proxies all traffic to the Temporal dev server on localhost:8233.

Authentication is handled by clung.us — unauthenticated requests are
redirected there to log in.
"""
import asyncio
import hashlib
import hmac
import os
from aiohttp import web, ClientSession, ClientTimeout, ClientConnectorError

# ── Auth ──────────────────────────────────────────────────────────────────────
GITHUB_COOKIE  = "tauth_github"
GITHUB_ALLOWED_USERS = {u.lower() for u in os.environ.get('GITHUB_ALLOWED_USERS', '').split(',') if u}
COOKIE_SECRET = os.environ.get('COOKIE_SECRET', '')

UPSTREAM = "http://localhost:8233"
LOGIN_URL = "https://clung.us/auth/github?next=https://temporal.clung.us"


def _verify_cookie(value: str) -> str:
    """Verify a signed cookie value. Returns the username on success, '' on failure."""
    if not COOKIE_SECRET or '.' not in value:
        return ''
    username, _, sig = value.rpartition('.')
    expected = hmac.new(COOKIE_SECRET.encode(), username.encode(), hashlib.sha256).hexdigest()
    if hmac.compare_digest(sig, expected):
        return username
    return ''


def _is_authed(request):
    raw = request.cookies.get(GITHUB_COOKIE, '')
    gh_user = _verify_cookie(raw) if raw else ''
    if gh_user:
        if not GITHUB_ALLOWED_USERS or gh_user.lower() in GITHUB_ALLOWED_USERS:
            return True
    return False


@web.middleware
async def auth_middleware(request, handler):
    if not _is_authed(request):
        raise web.HTTPFound(LOGIN_URL)
    return await handler(request)


# ── Proxy ─────────────────────────────────────────────────────────────────────
async def proxy_handler(request):
    """Forward the request upstream and stream the response back."""
    # Use raw_path to preserve percent-encoded characters (e.g. %2F in workflow IDs)
    url = UPSTREAM + request.raw_path

    # Build forwarded headers (drop hop-by-hop)
    skip = {'host', 'connection', 'transfer-encoding', 'te', 'trailers',
            'upgrade', 'proxy-authorization', 'proxy-authenticate', 'keep-alive'}
    headers = {k: v for k, v in request.headers.items() if k.lower() not in skip}
    headers['X-Forwarded-For'] = request.remote or ''
    headers['X-Forwarded-Host'] = request.headers.get('Host', '')

    timeout = ClientTimeout(total=60)
    try:
        body = await request.read()
        async with ClientSession(timeout=timeout) as session:
            async with session.request(
                method=request.method,
                url=url,
                headers=headers,
                data=body or None,
                allow_redirects=False,
                ssl=False,
            ) as upstream_resp:
                # Forward response headers (drop hop-by-hop again)
                resp_headers = {
                    k: v for k, v in upstream_resp.headers.items()
                    if k.lower() not in skip | {'content-encoding', 'content-length'}
                }
                resp_body = await upstream_resp.read()
                return web.Response(
                    status=upstream_resp.status,
                    headers=resp_headers,
                    body=resp_body,
                )
    except ClientConnectorError:
        return web.Response(status=502, text="Temporal upstream unreachable")
    except asyncio.TimeoutError:
        return web.Response(status=504, text="Upstream timeout")


app = web.Application(middlewares=[auth_middleware])
# Catch-all proxy route
app.router.add_route('*', '/{path:.*}', proxy_handler)


if __name__ == '__main__':
    web.run_app(app, host='127.0.0.1', port=8234)
