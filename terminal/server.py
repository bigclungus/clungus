#!/usr/bin/env python3
"""
Live terminal server — bidirectional PTY via screen -x, served alongside an xterm.js HTML page.
"""
import asyncio
import bisect as _bisect
import fcntl
import glob
import hashlib
import hmac
import json
import os
import re
import secrets
import signal
import struct
import subprocess
import termios
import time
import traceback
import urllib.parse
import urllib.request
import falkordb as _fdb
from datetime import datetime
import aiohttp
from aiohttp import web, ClientSession

# ── Auth ──────────────────────────────────────────────────────────────────────
AUTH_COOKIE    = "tauth"
GITHUB_COOKIE  = "tauth_github"
COOKIE_MAX_AGE = 86400  # 24 hours

# GitHub OAuth — only active when GITHUB_CLIENT_ID is set
GITHUB_CLIENT_ID      = os.environ.get('GITHUB_CLIENT_ID', '')
GITHUB_CLIENT_SECRET  = os.environ.get('GITHUB_CLIENT_SECRET', '')
GITHUB_ALLOWED_USERS  = {u.lower() for u in os.environ.get('GITHUB_ALLOWED_USERS', '').split(',') if u}
COOKIE_SECRET         = os.environ.get('COOKIE_SECRET', '')


def _sign_cookie(username: str) -> str:
    """Return username.HMAC-SHA256(username, COOKIE_SECRET) for cookie storage."""
    sig = hmac.new(COOKIE_SECRET.encode(), username.encode(), hashlib.sha256).hexdigest()
    return f"{username}.{sig}"


def _verify_cookie(value: str) -> str:
    """Verify a signed cookie value. Returns the username on success, '' on failure."""
    if not COOKIE_SECRET or '.' not in value:
        return ''
    username, _, sig = value.rpartition('.')
    expected = hmac.new(COOKIE_SECRET.encode(), username.encode(), hashlib.sha256).hexdigest()
    if hmac.compare_digest(sig, expected):
        return username
    return ''

_GITHUB_BTN = """
    <a href="/auth/github" class="github-btn">
      <svg height="16" viewBox="0 0 16 16" width="16" style="fill:#fff;vertical-align:middle;margin-right:8px;">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
          0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
          -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
          .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
          -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
          1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
          1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01
          1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      Sign in with GitHub
    </a>"""

_LOGIN_STYLES = """
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#080b10; color:#c9d1d9; font-family:'Inter',system-ui,sans-serif;
           display:flex; align-items:center; justify-content:center; height:100vh; }
    .box { background:rgba(22,27,34,0.95); border:1px solid rgba(99,110,123,0.35);
           border-radius:10px; padding:36px 44px; min-width:320px; text-align:center;
           box-shadow:0 16px 48px rgba(0,0,0,0.5); backdrop-filter:blur(8px); }
    h2 { color:#c9d1d9; margin-bottom:24px; font-size:15px; font-weight:600;
         letter-spacing:.04em; }
    .github-btn { display:flex; align-items:center; justify-content:center;
      width:100%; padding:10px 16px; background:#238636; color:#fff; text-decoration:none;
      border-radius:6px; font-family:'Inter',system-ui,sans-serif; font-size:14px;
      font-weight:500; cursor:pointer; border:1px solid rgba(46,160,67,0.4);
      margin-bottom:12px; transition:background 0.15s, box-shadow 0.15s; }
    .github-btn:hover { background:#2ea043; box-shadow:0 0 12px rgba(46,160,67,0.25); }"""

LOGIN_HTML = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Login \u2014 BigClungus Terminal</title>
  <style>
{styles}
  </style>
</head>
<body>
  <div class="box">
    <h2>&#x1F916; BigClungus Terminal</h2>
{body}
  </div>
</body>
</html>"""


def _build_login_page(error=''):
    if not GITHUB_CLIENT_ID:
        raise RuntimeError('GITHUB_CLIENT_ID is not set — GitHub OAuth is required')
    body = _GITHUB_BTN
    return LOGIN_HTML.format(styles=_LOGIN_STYLES, body=body)


def _is_safe_redirect(url: str) -> bool:
    if not url:
        return False
    try:
        parsed = urllib.parse.urlparse(url)
        host = parsed.hostname or ""
        return (host == "clung.us" or host.endswith(".clung.us")) and parsed.scheme == "https"
    except Exception:
        return False


async def login_handler(request):
    return web.Response(text=_build_login_page(), content_type='text/html')


async def github_auth_handler(request):
    """Redirect user to GitHub OAuth authorization page."""
    state = secrets.token_urlsafe(16)
    next_url = request.rel_url.query.get('next', '')
    url = (
        f'https://github.com/login/oauth/authorize'
        f'?client_id={GITHUB_CLIENT_ID}&scope=read:user&state={state}'
    )
    resp = web.HTTPFound(url)
    resp.set_cookie('gh_oauth_state', state, max_age=600, httponly=True, samesite='Lax')
    if next_url:
        resp.set_cookie('gh_oauth_next', next_url, max_age=600, httponly=True, samesite='Lax', domain='.clung.us')
    return resp


async def github_callback_handler(request):
    """Handle GitHub OAuth callback, exchange code for token, verify user."""
    code  = request.rel_url.query.get('code', '')
    state = request.rel_url.query.get('state', '')
    expected_state = request.cookies.get('gh_oauth_state', '')

    if not code or not state or state != expected_state:
        raise web.HTTPForbidden(reason='OAuth state mismatch')

    async with ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
        # Exchange code for access token
        token_resp = await session.post(
            'https://github.com/login/oauth/access_token',
            json={
                'client_id':     GITHUB_CLIENT_ID,
                'client_secret': GITHUB_CLIENT_SECRET,
                'code':          code,
            },
            headers={'Accept': 'application/json'},
        )
        token_data = await token_resp.json()
        access_token = token_data.get('access_token', '')

        if not access_token:
            raise web.HTTPForbidden(reason='Failed to obtain access token')

        # Get GitHub username
        user_resp = await session.get(
            'https://api.github.com/user',
            headers={
                'Authorization': f'token {access_token}',
                'Accept': 'application/json',
            },
        )
        user_data = await user_resp.json()
        username = user_data.get('login', '')

    if not username:
        raise web.HTTPForbidden(reason='Could not determine GitHub username')

    if GITHUB_ALLOWED_USERS and username.lower() not in GITHUB_ALLOWED_USERS:
        raise web.HTTPForbidden(reason=f'GitHub user {username!r} is not allowed')

    next_url = request.cookies.get('gh_oauth_next', '')
    redirect_to = next_url if _is_safe_redirect(next_url) else '/'
    # Serve an HTML page that sets the cookie on a full page load, then redirects
    # via JS. This breaks the ITP redirect chain on iOS Safari, which throttles
    # cookies set during cross-site 302 redirect chains.
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>body{{background:#0a0a0f;color:#4ecca3;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}</style>
</head>
<body><div>authenticated — redirecting...</div>
<script>window.location.replace({json.dumps(redirect_to)});</script>
</body>
</html>"""
    resp = web.Response(text=html, content_type='text/html')
    resp.set_cookie(
        GITHUB_COOKIE, _sign_cookie(username),
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite='Lax',
        secure=True,
        domain='.clung.us',
    )
    # Clear the OAuth state and next cookies
    resp.del_cookie('gh_oauth_state')
    resp.del_cookie('gh_oauth_next', domain='.clung.us')
    return resp


def _is_authed(request):
    # Only GitHub OAuth cookie is accepted; value must have a valid HMAC signature
    raw = request.cookies.get(GITHUB_COOKIE, '')
    gh_user = _verify_cookie(raw) if raw else ''
    if gh_user:
        if not GITHUB_ALLOWED_USERS or gh_user.lower() in GITHUB_ALLOWED_USERS:
            return True
    return False


@web.middleware
async def auth_middleware(request, handler):
    path = request.path
    if path in ('/login', '/auth/github', '/auth/callback'):
        return await handler(request)
    if not _is_authed(request):
        next_url = 'https://terminal.clung.us' + path
        raise web.HTTPFound(f'https://clung.us/auth/github?next={urllib.parse.quote(next_url)}')
    return await handler(request)
# ─────────────────────────────────────────────────────────────────────────────

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

SCREEN_SESSION = "claude-bot"  # matched by screen -x as suffix; full name 130684.claude-bot
_TASKS_BASE = "/tmp/claude-1001/-mnt-data"


def _all_task_dirs() -> list[str]:
    """Return all Claude session task directories under the base path."""
    base = _TASKS_BASE
    dirs = []
    try:
        for entry in os.listdir(base):
            d = os.path.join(base, entry, "tasks")
            if os.path.isdir(d):
                dirs.append(d)
    except OSError:
        pass
    return dirs


def _find_task_dir_for_agent(agent_id: str) -> str | None:
    """Return the task directory containing agent_id's .output file, or None."""
    for d in _all_task_dirs():
        if os.path.exists(os.path.join(d, agent_id + ".output")):
            return d
    return None



HTML = r"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="icon" type="image/png" href="https://clung.us/favicon.png">
  <title>BigClungus Live Terminal</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css" />
  <link rel="stylesheet" href="https://clung.us/sitenav.css?v=b6d00bc">
  <script src="https://clung.us/sitenav.js?v=b6d00bc" defer></script>
  <script src="/gamecube-sounds.js"></script>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    :root {
      --bg-base:      #080b10;
      --bg-surface:   #0d1117;
      --bg-elevated:  #161b22;
      --bg-overlay:   #1c2230;
      --border:       rgba(48,54,61,0.8);
      --border-glow:  rgba(78,204,163,0.4);
      --accent:       #4ecca3;
      --accent-dim:   rgba(78,204,163,0.15);
      --red:          #f85149;
      --yellow:       #e3b341;
      --green:        #3fb950;
      --purple:       #bc8cff;
      --blue:         #58a6ff;
      --text-primary: #e6edf3;
      --text-secondary: #8b949e;
      --text-muted:   #484f58;
      --font-ui:      'Inter', system-ui, -apple-system, sans-serif;
      --font-mono:    'Consolas', 'Cascadia Code', 'SF Mono', 'Courier New', monospace;
      --radius-sm:    4px;
      --radius-md:    6px;
      --radius-lg:    8px;
      --transition:   0.15s ease;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--bg-base);
      display: flex;
      flex-direction: column;
      height: 100vh;
      font-family: var(--font-ui);
      color: var(--text-primary);
      padding-top: 0 !important;
    }
    /* sitenav override */
    .sitenav { position: relative; flex-shrink: 0; flex-wrap: nowrap !important; overflow-x: auto; }
    .sitenav .sitenav-links { flex-wrap: nowrap; }
    .sitenav .sitenav-links a, .sitenav .sitenav-brand { white-space: nowrap; }

    /* ── Session bar ─────────────────────────────────────────────────────────── */
    #session-bar {
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: stretch;
      flex-shrink: 0;
      padding: 0 8px 0 0;
      gap: 0;
    }
    #status {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-muted);
      margin-left: auto;
      padding: 0 10px;
      white-space: nowrap;
      align-self: center;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    #status::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-muted);
      flex-shrink: 0;
      transition: background var(--transition), box-shadow var(--transition);
    }
    #status.connected { color: var(--green); }
    #status.connected::before { background: var(--green); box-shadow: 0 0 6px var(--green); }
    #status.disconnected { color: var(--red); }
    #status.disconnected::before { background: var(--red); box-shadow: 0 0 6px var(--red); }

    /* ── Health bar ──────────────────────────────────────────────────────────── */
    #healthbar {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      padding: 5px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      flex-shrink: 0;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-secondary);
    }
    .hb-metric {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .hb-label {
      color: var(--text-secondary);
      font-weight: 600;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      min-width: 32px;
    }
    .hb-bar-wrap {
      width: 56px;
      height: 4px;
      background: rgba(255,255,255,0.07);
      border-radius: 2px;
      overflow: hidden;
    }
    .hb-bar-fill {
      height: 100%;
      border-radius: 2px;
      background: var(--green);
      transition: width 0.5s ease, background 0.3s ease;
    }
    .hb-bar-fill.warn { background: var(--yellow); }
    .hb-bar-fill.crit { background: var(--red); }
    .hb-val { color: var(--text-primary); min-width: 36px; font-size: 11px; }
    .hb-sep { color: var(--border); user-select: none; }
    .hb-svc {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
    }
    .hb-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--text-muted);
      flex-shrink: 0;
      transition: background var(--transition), box-shadow var(--transition);
    }
    .hb-dot.ok  { background: var(--green); box-shadow: 0 0 5px rgba(63,185,80,0.6); }
    .hb-dot.down { background: var(--red);  box-shadow: 0 0 5px rgba(248,81,73,0.6); }
    .hb-uptime { color: var(--text-muted); font-size: 11px; }

    /* ── Main split ──────────────────────────────────────────────────────────── */
    #main {
      display: flex;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }
    #terminal {
      width: 40%;
      padding: 4px;
      overflow: hidden;
      flex-shrink: 0;
      min-width: 100px;
    }
    #resizer {
      width: 4px;
      cursor: col-resize;
      background: var(--border);
      flex-shrink: 0;
      transition: background var(--transition);
    }
    #resizer:hover { background: var(--accent); }

    /* ── Subagent panel ──────────────────────────────────────────────────────── */
    #agents {
      flex: 1;
      background: var(--bg-surface);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-width: 100px;
    }
    #agents-header {
      padding: 8px 12px;
      color: var(--accent);
      font-size: 11px;
      font-weight: 600;
      font-family: var(--font-ui);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-elevated);
    }
    #agents-header::before {
      content: '';
      display: block;
      width: 3px;
      height: 14px;
      background: var(--accent);
      border-radius: 2px;
      flex-shrink: 0;
    }
    #agents-token-total {
      margin-left: auto;
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 500;
      text-transform: none;
      letter-spacing: 0;
      font-family: var(--font-mono);
    }
    #agents-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      align-content: start;
      gap: 6px;
    }
    #agents-list::-webkit-scrollbar { width: 4px; }
    #agents-list::-webkit-scrollbar-track { background: transparent; }
    #agents-list::-webkit-scrollbar-thumb { background: rgba(78,204,163,0.3); border-radius: 2px; }
    #agents-list::-webkit-scrollbar-thumb:hover { background: var(--accent); }
    .xterm-viewport::-webkit-scrollbar { width: 4px; }
    .xterm-viewport::-webkit-scrollbar-track { background: transparent; }
    .xterm-viewport::-webkit-scrollbar-thumb { background: rgba(78,204,163,0.3); border-radius: 2px; }
    #agents-empty {
      grid-column: 1 / -1;
      color: var(--text-muted);
      font-size: 12px;
      text-align: center;
      padding: 32px 12px;
      font-style: italic;
    }

    /* ── Subagent cards ──────────────────────────────────────────────────────── */
    .sa-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 10px 11px;
      font-size: 12px;
      font-family: var(--font-ui);
      min-width: 0;
      transition: border-color var(--transition), opacity 0.35s ease, filter 0.35s ease,
                  box-shadow var(--transition), transform var(--transition);
      cursor: default;
    }
    .sa-card:hover {
      border-color: var(--border-glow);
      box-shadow: 0 0 0 1px var(--border-glow), 0 4px 16px rgba(78,204,163,0.06);
    }
    .sa-card.done {
      opacity: 0.38;
      filter: grayscale(60%);
      background: var(--bg-surface);
      border-color: rgba(48,54,61,0.5);
    }
    .sa-card.done:hover { opacity: 0.72; filter: grayscale(20%); }
    .sa-top {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 5px;
    }
    .sa-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background var(--transition), box-shadow var(--transition);
    }
    .sa-dot.running {
      background: var(--yellow);
      box-shadow: 0 0 6px rgba(227,179,65,0.7);
      animation: pulse 1.8s ease-in-out infinite;
    }
    .sa-dot.complete {
      background: var(--text-muted);
      box-shadow: none;
    }
    .sa-dot.failed {
      background: var(--red);
      box-shadow: 0 0 5px rgba(248,81,73,0.5);
    }
    .sa-dot.stale {
      background: var(--text-muted);
      box-shadow: none;
      opacity: 0.4;
    }
    .sa-card.stale {
      opacity: 0.45;
      filter: grayscale(60%);
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 4px rgba(227,179,65,0.5); opacity: 1; }
      50% { box-shadow: 0 0 10px rgba(227,179,65,0.9); opacity: 0.85; }
    }
    .sa-name {
      color: var(--text-primary);
      font-weight: 500;
      font-size: 12px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: 0.01em;
    }
    .sa-age {
      color: var(--text-muted);
      font-size: 10px;
      font-family: var(--font-mono);
      flex-shrink: 0;
    }
    .sa-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 7px;
      font-size: 11px;
    }
    .sa-cost-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background: var(--accent-dim);
      color: var(--accent);
      border: 1px solid rgba(78,204,163,0.2);
      border-radius: 10px;
      padding: 1px 7px;
      font-size: 10px;
      font-weight: 600;
      font-family: var(--font-mono);
      letter-spacing: 0.02em;
    }
    .sa-tools {
      color: var(--purple);
      font-size: 10px;
      font-family: var(--font-mono);
    }
    .sa-temporal-pill {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background: rgba(96,165,250,0.08);
      color: rgba(96,165,250,0.7);
      border: 1px solid rgba(96,165,250,0.25);
      border-radius: 10px;
      padding: 1px 7px;
      font-size: 10px;
      font-weight: 500;
      font-family: var(--font-mono);
      text-decoration: none;
      letter-spacing: 0.02em;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      margin-left: auto;
    }
    .sa-temporal-pill:hover {
      background: rgba(96,165,250,0.18);
      color: #60a5fa;
      border-color: rgba(96,165,250,0.5);
    }
    .sa-output {
      background: rgba(8,11,16,0.7);
      border: 1px solid rgba(48,54,61,0.6);
      border-radius: var(--radius-sm);
      padding: 6px 8px;
      max-height: 9em;
      overflow-y: auto;
      font-family: var(--font-mono);
      font-size: 10.5px;
      color: #7d8590;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.5;
    }
    .sa-output::-webkit-scrollbar { width: 3px; }
    .sa-output::-webkit-scrollbar-track { background: transparent; }
    .sa-output::-webkit-scrollbar-thumb { background: rgba(78,204,163,0.25); border-radius: 2px; }
    .sa-output-line { display: block; }

    /* ── Action buttons/links ────────────────────────────────────────────────── */
    #graph-link, #edit-claude-link, #restart-btn {
      color: var(--text-muted);
      font-size: 11px;
      font-family: var(--font-ui);
      font-weight: 400;
      text-decoration: none;
      letter-spacing: 0;
      text-transform: none;
      padding: 3px 10px;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: none;
      transition: color var(--transition), border-color var(--transition), background var(--transition);
      white-space: nowrap;
      align-self: center;
      cursor: pointer;
    }
    #graph-link:hover, #edit-claude-link:hover {
      color: var(--blue);
      border-color: rgba(88,166,255,0.3);
      background: rgba(88,166,255,0.06);
    }
    #restart-btn:hover {
      color: var(--red);
      border-color: rgba(248,81,73,0.3);
      background: rgba(248,81,73,0.06);
    }

    /* ── Tab buttons ─────────────────────────────────────────────────────────── */
    .tab-btn {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      font-family: var(--font-ui);
      font-size: 12px;
      font-weight: 500;
      padding: 8px 18px 7px;
      cursor: pointer;
      letter-spacing: 0.02em;
      transition: color var(--transition), border-color var(--transition);
      align-self: stretch;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .tab-btn:hover { color: var(--text-secondary); }
    .tab-btn.active { color: var(--text-primary); border-bottom-color: var(--accent); }

    /* ── GigaClungus iframe tab ──────────────────────────────────────────────── */
    #giga-frame-wrap {
      flex: 1;
      overflow: hidden;
      display: none;
    }
    #giga-frame-wrap.visible { display: flex; }
    #giga-frame {
      width: 100%;
      height: 100%;
      border: none;
      background: var(--bg-base);
    }

    /* ── Mobile toggle bar (hidden on desktop) ───────────────────────────────── */
    #mobile-view-toggle {
      display: none;
    }
    .mvt-btn {
      flex: 1;
      padding: 10px 8px;
      background: var(--bg-elevated);
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      font-family: var(--font-ui);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: color var(--transition), border-color var(--transition), background var(--transition);
      letter-spacing: 0.01em;
    }
    .mvt-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      background: var(--bg-surface);
    }

    /* ── Mobile ──────────────────────────────────────────────────────────────── */
    @media (max-width: 768px) {
      /* Show the mobile view toggle bar */
      #mobile-view-toggle {
        display: flex;
        flex-shrink: 0;
        border-bottom: 1px solid var(--border);
      }

      /* Stack main panes vertically */
      #main {
        flex-direction: column;
        overflow-y: auto;
        overflow-x: hidden;
      }

      /* Terminal takes full width, fixed height */
      #terminal {
        width: 100% !important;
        height: 45vh;
        min-height: 180px;
        flex-shrink: 0;
        border-bottom: 1px solid var(--border);
      }

      /* Hide the vertical resizer on mobile */
      #resizer {
        display: none;
      }

      /* Agents panel takes full width */
      #agents {
        border-left: none;
        border-top: 1px solid var(--border);
        min-width: 0;
        width: 100%;
        flex-shrink: 0;
        min-height: 200px;
      }

      /* Single column agent cards */
      #agents-list { grid-template-columns: 1fr; }

      /* Healthbar: wrap tightly, smaller font */
      #healthbar { gap: 8px; padding: 4px 8px; font-size: 10px; flex-wrap: wrap; }
      .hb-bar-wrap { width: 36px; }
      .hb-val { min-width: 28px; font-size: 10px; }
      .hb-label { font-size: 9px; min-width: 28px; }

      /* Session bar touch targets */
      .tab-btn { padding: 10px 10px 9px; font-size: 12px; }
      #session-bar { padding: 0 2px 0 0; }

      /* Hide some session bar actions to save space on mobile */
      #graph-link, #edit-claude-link { display: none; }

      /* Bigger touch targets on agent cards */
      .sa-card { padding: 12px 13px; }
      .sa-name { font-size: 13px; }
      .sa-output { font-size: 11px; max-height: 6em; }

      /* Bigger status dot */
      .sa-dot { width: 10px; height: 10px; }
    }

    @media (max-width: 480px) {
      /* Even smaller screens: slightly reduce healthbar further */
      #healthbar { font-size: 9px; padding: 3px 6px; }
      .hb-sep { display: none; }
      .tab-btn { padding: 10px 8px 9px; font-size: 11px; }
    }
  </style>
</head>
<body>
  <div id="session-bar">
    <button class="tab-btn active" id="tab-big" onclick="switchTab('big')">&#x1F916; BigClungus</button>
    <button class="tab-btn" id="tab-giga" onclick="switchTab('giga')">&#x26A1; GigaClungus</button>
    <span id="status" class="disconnected">&#x25CF; disconnected</span>
    <a id="graph-link" href="/graph" target="_blank">&#x238B; Knowledge Graph</a>
    <a id="edit-claude-link" href="/edit-claude-md" target="_blank">&#x270F; claude.md</a>
    <button id="restart-btn">&#x2620; restart</button>
  </div>
  <div id="mobile-view-toggle">
    <button class="mvt-btn active" id="mvt-terminal" onclick="switchMobileView('terminal')">&#x1F5A5; Terminal</button>
    <button class="mvt-btn" id="mvt-agents" onclick="switchMobileView('agents')">&#x26A1; Agents</button>
  </div>
  <div id="healthbar">
    <div class="hb-metric">
      <span class="hb-label">CPU</span>
      <div class="hb-bar-wrap"><div class="hb-bar-fill" id="hb-cpu-bar" style="width:0%"></div></div>
      <span class="hb-val" id="hb-cpu-val">--</span>
    </div>
    <div class="hb-sep">|</div>
    <div class="hb-metric">
      <span class="hb-label">RAM</span>
      <div class="hb-bar-wrap"><div class="hb-bar-fill" id="hb-ram-bar" style="width:0%"></div></div>
      <span class="hb-val" id="hb-ram-val">--</span>
    </div>
    <div class="hb-sep">|</div>
    <div class="hb-metric">
      <span class="hb-label">DISK</span>
      <div class="hb-bar-wrap"><div class="hb-bar-fill" id="hb-disk-bar" style="width:0%"></div></div>
      <span class="hb-val" id="hb-disk-val">--</span>
    </div>
    <div class="hb-sep">|</div>
    <div class="hb-metric">
      <span class="hb-label">SWAP</span>
      <div class="hb-bar-wrap"><div class="hb-bar-fill" id="hb-swap-bar" style="width:0%"></div></div>
      <span class="hb-val" id="hb-swap-val">--</span>
    </div>
    <div class="hb-sep">|</div>
    <div class="hb-svc">
      <div class="hb-dot" id="hb-dot-cloudflared"></div>
      <span>cloudflared</span>
    </div>
    <div class="hb-svc">
      <div class="hb-dot" id="hb-dot-terminal"></div>
      <span>terminal-server</span>
    </div>
    <div class="hb-sep">|</div>
    <span class="hb-uptime" id="hb-uptime">up --</span>
  </div>
  <div id="main">
    <div id="terminal"></div>
    <div id="resizer"></div>
    <div id="agents">
      <div id="agents-header">
        &#x26A1; Subagents
        <span id="agents-token-total"></span>
      </div>
      <div id="agents-list">
        <div id="agents-empty">No active subagents</div>
      </div>
    </div>
  </div>
  <div id="giga-frame-wrap">
    <iframe id="giga-frame" src="about:blank" title="GigaClungus Terminal"></iframe>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
  <script>
    const term = new Terminal({
      theme: {
        background: '#0d0d0d',
        foreground: '#d4d4d4',
        cursor: '#e94560',
      },
      convertEol: true,
      scrollback: 5000,
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
    });
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal'));

    const statusEl = document.getElementById('status');
    let activeWs = null;

    // Forward terminal resize events to the PTY
    term.onResize(({ cols, rows }) => {
      if (activeWs && activeWs.readyState === WebSocket.OPEN) {
        activeWs.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });
    window.addEventListener('resize', () => {
      fitAddon.fit();
      // If resizing to desktop, restore both panels
      if (window.innerWidth > 768) {
        const termEl = document.getElementById('terminal');
        const agentsEl = document.getElementById('agents');
        const resizerEl = document.getElementById('resizer');
        if (termEl) termEl.style.display = '';
        if (agentsEl) agentsEl.style.display = '';
        if (resizerEl) resizerEl.style.display = '';
      }
    });

    // Send resize to server whenever xterm dimensions change
    function sendResize(ws) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    }

    // Wire up input forwarding (once, after first connect)
    let inputBound = false;
    function bindInput(ws) {
      if (inputBound) return;
      inputBound = true;
      term.onData((data) => {
        if (activeWs && activeWs.readyState === WebSocket.OPEN) {
          activeWs.send(new TextEncoder().encode(data));
        }
      });
    }

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      ws.binaryType = 'arraybuffer';
      activeWs = ws;

      ws.onopen = () => {
        statusEl.textContent = 'live';
        statusEl.className = 'connected';
        bindInput(ws);
        // Fit after DOM is fully laid out (critical on mobile where dimensions
        // may not be correct at DOMContentLoaded). fitAddon.fit() triggers
        // term.onResize which fires sendResize via the handler above, but we
        // also call sendResize explicitly as a fallback in case dimensions
        // didn't change from xterm's default.
        requestAnimationFrame(() => {
          fitAddon.fit();
          sendResize(ws);
          // Second pass: mobile browsers sometimes need an extra tick for
          // viewport to settle (address bar hide/show, safe area insets, etc.)
          setTimeout(() => {
            fitAddon.fit();
            sendResize(ws);
          }, 150);
        });
      };
      ws.onmessage = (e) => {
        const atBottom = term.buffer.active.viewportY >= term.buffer.active.baseY;
        if (e.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(e.data), () => { if (atBottom) term.scrollToBottom(); });
        } else {
          term.write(e.data, () => { if (atBottom) term.scrollToBottom(); });
        }
      };
      ws.onclose = () => {
        activeWs = null;
        statusEl.textContent = 'disconnected — reconnecting...';
        statusEl.className = 'disconnected';
        setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    }
    connect();

    // ── Resizable split ────────────────────────────────────────────────────────

    (function initResizer() {
      const resizer = document.getElementById('resizer');
      const termPane = document.getElementById('terminal');
      const main = document.getElementById('main');

      const STORAGE_KEY = 'terminal_split';
      const DEFAULT_PCT = 40;

      function applyPct(pct) {
        pct = Math.min(85, Math.max(10, pct));
        termPane.style.width = pct + '%';
      }

      // Restore saved split
      const saved = parseFloat(localStorage.getItem(STORAGE_KEY));
      applyPct(isNaN(saved) ? DEFAULT_PCT : saved);

      resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = termPane.getBoundingClientRect().width;
        const containerW = main.getBoundingClientRect().width;

        function onMove(ev) {
          const delta = ev.clientX - startX;
          const newPct = ((startW + delta) / containerW) * 100;
          applyPct(newPct);
          fitAddon.fit();
        }

        function onUp(ev) {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          const finalW = termPane.getBoundingClientRect().width;
          const finalPct = (finalW / containerW) * 100;
          localStorage.setItem(STORAGE_KEY, finalPct.toFixed(2));
          fitAddon.fit();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    })();

    // ── Subagent grid ──────────────────────────────────────────────────────────

    const CLUNGER_BASE = 'https://clung.us';

    function escHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function relativeTime(isoStr) {
      if (!isoStr) return '';
      const secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
      if (secs < 60) return secs + 's ago';
      if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
      if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
      return Math.floor(secs / 86400) + 'd ago';
    }

    function fmtCost(dollars) {
      if (!dollars || dollars <= 0) return '$0.00';
      if (dollars >= 1) return '$' + dollars.toFixed(2);
      if (dollars >= 0.01) return '$' + dollars.toFixed(3);
      return '$' + dollars.toFixed(4);
    }

    // Maps agentId → { card, outputEl, sse, lines, lastLineCount }
    const agentCards = new Map();
    // Maps agentId → EventSource
    const agentStreams = new Map();

    function parseOutputLine(rawLine) {
      // Each line is a JSONL entry; extract human-readable text from it
      const line = rawLine.trim();
      if (!line) return null;
      try {
        const obj = JSON.parse(line);
        const type = obj.type;
        const msg = obj.message || {};
        const msgContent = msg.content;

        if (type === 'assistant' && Array.isArray(msgContent)) {
          const parts = [];
          for (const block of msgContent) {
            if (block.type === 'text' && block.text) {
              // Strip AI trope phrases, trim whitespace
              const txt = block.text.trim();
              if (txt) parts.push(txt.slice(0, 200));
            } else if (block.type === 'tool_use') {
              const inp = block.input || {};
              // Prefer description for readability, fall back to command/file_path/etc
              const desc = inp.description || inp.command || inp.file_path || inp.pattern || '';
              const toolName = block.name || 'tool';
              parts.push('\u25b6 ' + toolName + (desc ? ': ' + desc.slice(0, 80) : ''));
            }
          }
          if (parts.length) return parts.join(' | ').slice(0, 220);
        }

        if (type === 'user' && Array.isArray(msgContent)) {
          for (const block of msgContent) {
            if (block.type === 'tool_result') {
              let c = Array.isArray(block.content) ? block.content[0]?.text : block.content;
              if (typeof c === 'string' && c.trim()) {
                // Strip [rerun: bN] noise appended by harness
                c = c.replace(/\[rerun: b\d+\]\s*$/m, '').trim();
                if (!c) return null;
                const prefix = block.is_error ? '\u2717 ' : '\u21aa ';
                return prefix + c.slice(0, 200);
              }
            }
          }
        }

        // First user message — show task prompt snippet
        if (type === 'user' && typeof msgContent === 'string' && msgContent.trim()) {
          return '\uD83D\uDCCC ' + msgContent.trim().slice(0, 150);
        }
      } catch { /* ignore */ }
      return null;
    }

    function startStream(agentId, outputPath, outputEl) {
      if (agentStreams.has(agentId)) return;
      const url = CLUNGER_BASE + '/api/subagents/stream?path=' + encodeURIComponent(outputPath);
      const sse = new EventSource(url);
      agentStreams.set(agentId, sse);

      let lineBuffer = agentCards.get(agentId)?.lines || [];

      sse.onmessage = (e) => {
        const text = parseOutputLine(e.data);
        if (!text) return;
        lineBuffer.push(text);
        // Keep last 200 lines
        if (lineBuffer.length > 200) {
          lineBuffer = lineBuffer.slice(-200);
          const cardState = agentCards.get(agentId);
          if (cardState) cardState.lines = lineBuffer;
          // Re-render from scratch after trim
          renderOutputPane(outputEl, lineBuffer);
        } else {
          const cardState = agentCards.get(agentId);
          if (cardState) cardState.lines = lineBuffer;
          // Append new line incrementally
          appendOutputLine(outputEl, text);
        }
      };

      sse.onerror = () => {
        sse.close();
        agentStreams.delete(agentId);
      };
    }

    function isScrolledToBottom(el) {
      return el.scrollHeight - el.scrollTop <= el.clientHeight + 20;
    }

    function renderOutputPane(outputEl, lines) {
      outputEl.innerHTML = lines.map(l => `<span class="sa-output-line">${escHtml(l)}</span>`).join('\n');
      // Always scroll to bottom on full re-render (initial load or trim)
      requestAnimationFrame(() => { outputEl.scrollTop = outputEl.scrollHeight; });
    }

    function appendOutputLine(outputEl, line) {
      const span = document.createElement('span');
      span.className = 'sa-output-line';
      span.textContent = line;
      if (outputEl.childNodes.length > 0) {
        outputEl.appendChild(document.createTextNode('\n'));
      }
      outputEl.appendChild(span);
      // Auto-scroll only if user hasn't manually scrolled up
      if (!outputEl._userScrolledUp) {
        requestAnimationFrame(() => { outputEl.scrollTop = outputEl.scrollHeight; });
      }
    }

    function agentStatusClass(status) {
      if (status === 'running') return 'running';
      if (status === 'failed') return 'failed';
      if (status === 'stale') return 'stale';
      return 'complete';
    }

    function makeCard(agent) {
      const card = document.createElement('div');
      const statusClass = agentStatusClass(agent.status);
      const isDone = agent.status !== 'running';
      card.className = 'sa-card' + (isDone ? ' done' : '') + (agent.status === 'stale' ? ' stale' : '');
      card.dataset.id = agent.id;

      const nameShort = (agent.name || agent.id).slice(0, 55);
      const age = relativeTime(agent.lastModified);
      const label = agent.status === 'stale' ? ' <span style="font-size:10px;opacity:0.6">[stale]</span>' : '';

      card.innerHTML = `
        <div class="sa-top">
          <div class="sa-dot ${statusClass}"></div>
          <div class="sa-name" title="${escHtml(agent.name || agent.id)}">${escHtml(nameShort)}${label}</div>
          <div class="sa-age">${escHtml(age)}</div>
        </div>
        <div class="sa-meta">
          <span class="sa-cost-badge">${escHtml(fmtCost(agent.cost))}</span>
          <span class="sa-tools">&#x1F527; ${agent.toolUses} calls</span>
          <a class="sa-temporal-pill" href="https://temporal.clung.us/namespaces/tasks/workflows/agent-task-${escHtml(agent.id)}" target="_blank" rel="noopener">&#x23F1; temporal &#x2197;</a>
        </div>
        <div class="sa-output"></div>
      `;

      const outputEl = card.querySelector('.sa-output');
      outputEl._userScrolledUp = false;
      outputEl.addEventListener('scroll', () => {
        outputEl._userScrolledUp = !isScrolledToBottom(outputEl);
      });
      return { card, outputEl };
    }

    function updateCard(card, outputEl, agent) {
      // Update status dot
      const dot = card.querySelector('.sa-dot');
      if (dot) {
        dot.className = 'sa-dot ' + agentStatusClass(agent.status);
      }
      // Update fade / stale
      if (agent.status !== 'running') card.classList.add('done');
      else card.classList.remove('done');
      if (agent.status === 'stale') card.classList.add('stale');
      else card.classList.remove('stale');
      // Update meta
      const tokEl = card.querySelector('.sa-cost-badge');
      if (tokEl) tokEl.textContent = fmtCost(agent.cost);
      const toolEl = card.querySelector('.sa-tools');
      if (toolEl) toolEl.textContent = '\uD83D\uDD27 ' + agent.toolUses + ' calls';
      // Update age
      const ageEl = card.querySelector('.sa-age');
      if (ageEl) ageEl.textContent = relativeTime(agent.lastModified);
    }

    function renderSubagents(agents) {
      const list = document.getElementById('agents-list');
      const emptyEl = document.getElementById('agents-empty');

      // Filter out hook_* and very short IDs with no data
      const interesting = agents.filter(a => !a.id.startsWith('hook_') && (a.tokens > 0 || a.status === 'running'));

      // Sort: in_progress first, then complete/failed/stale by lastModified descending
      interesting.sort((a, b) => {
        const aActive = a.status === 'running' ? 0 : 1;
        const bActive = b.status === 'running' ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        // stale agents sink to bottom within the done group
        const aStale = a.status === 'stale' ? 1 : 0;
        const bStale = b.status === 'stale' ? 1 : 0;
        if (aStale !== bStale) return aStale - bStale;
        return (b.lastModified || 0) - (a.lastModified || 0);
      });

      // Update cost total
      const totalCost = interesting.reduce((s, a) => s + (a.cost || 0), 0);
      const totalEl = document.getElementById('agents-token-total');
      if (totalEl) totalEl.textContent = fmtCost(totalCost) + ' total';

      if (!interesting.length) {
        emptyEl.style.display = '';
        // Remove stale cards
        for (const [id, state] of agentCards.entries()) {
          state.card.remove();
          agentCards.delete(id);
          const sse = agentStreams.get(id);
          if (sse) { sse.close(); agentStreams.delete(id); }
        }
        return;
      }
      emptyEl.style.display = 'none';

      const seen = new Set();

      for (const agent of interesting) {
        seen.add(agent.id);
        if (agentCards.has(agent.id)) {
          // Update existing card
          const state = agentCards.get(agent.id);
          updateCard(state.card, state.outputEl, agent);
        } else {
          // Create new card
          const { card, outputEl } = makeCard(agent);
          agentCards.set(agent.id, { card, outputEl, lines: [] });
          list.appendChild(card);
          startStream(agent.id, agent.outputPath, outputEl);
        }
      }

      // Remove stale cards
      for (const [id, state] of agentCards.entries()) {
        if (!seen.has(id)) {
          state.card.remove();
          agentCards.delete(id);
          const sse = agentStreams.get(id);
          if (sse) { sse.close(); agentStreams.delete(id); }
        }
      }

      // Re-order DOM to match sorted order
      for (const agent of interesting) {
        const state = agentCards.get(agent.id);
        if (state) list.appendChild(state.card);
      }
    }

    async function pollSubagents() {
      try {
        const resp = await fetch(CLUNGER_BASE + '/api/subagents');
        if (resp.ok) {
          const agents = await resp.json();
          renderSubagents(agents);
        }
      } catch (e) {
        // silently ignore network errors
      }
    }

    pollSubagents();
    setInterval(pollSubagents, 3000);

    // Health bar
    function setBar(barId, valId, pct, label) {
      const bar = document.getElementById(barId);
      const val = document.getElementById(valId);
      if (!bar || !val) return;
      const w = Math.min(100, Math.max(0, pct));
      bar.style.width = w + '%';
      bar.className = 'hb-bar-fill' + (w >= 90 ? ' crit' : w >= 70 ? ' warn' : '');
      val.textContent = label;
    }

    function setDot(id, ok) {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = 'hb-dot ' + (ok ? 'ok' : 'down');
    }

    async function pollHealth() {
      try {
        const resp = await fetch('/health');
        if (!resp.ok) return;
        const d = await resp.json();
        setBar('hb-cpu-bar', 'hb-cpu-val', d.cpu_percent, d.cpu_percent.toFixed(1) + '%');
        setBar('hb-ram-bar', 'hb-ram-val', d.ram.percent, d.ram.percent.toFixed(1) + '%');
        setBar('hb-disk-bar', 'hb-disk-val', d.disk.percent, d.disk.percent.toFixed(1) + '%');
        setBar('hb-swap-bar', 'hb-swap-val', d.swap.percent, d.swap.percent.toFixed(1) + '%');
        setDot('hb-dot-cloudflared', d.services.cloudflared);
        setDot('hb-dot-terminal', d.services['terminal-server']);
        document.getElementById('hb-uptime').textContent = 'up ' + d.uptime;
      } catch (e) {
        // silently ignore
      }
    }

    pollHealth();
    setInterval(pollHealth, 5000);

    // Restart bot button
    document.getElementById('restart-btn').addEventListener('click', async () => {
      const pw = prompt('Password:');
      if (pw === null) return;
      try {
        const resp = await fetch('/restart-bot', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({password: pw}),
        });
        const data = await resp.json();
        if (data.ok) {
          alert('Bot restarted.');
        } else {
          alert('Failed: ' + (data.error || 'unknown error'));
        }
      } catch (e) {
        alert('Request error: ' + e.message);
      }
    });

    // GameCube sounds on all buttons and nav links
    document.querySelectorAll('button, #session-bar a').forEach(function(el) {
      el.addEventListener('mouseenter', function() { if (window.GCSounds) GCSounds.hover(); });
      el.addEventListener('click', function() { if (window.GCSounds) GCSounds.click(); }, true);
    });

    // ── Mobile view toggle ─────────────────────────────────────────────────────
    function switchMobileView(view) {
      const termEl = document.getElementById('terminal');
      const agentsEl = document.getElementById('agents');
      const resizerEl = document.getElementById('resizer');
      const btnTerminal = document.getElementById('mvt-terminal');
      const btnAgents = document.getElementById('mvt-agents');
      if (view === 'agents') {
        termEl.style.display = 'none';
        agentsEl.style.display = '';
        if (resizerEl) resizerEl.style.display = 'none';
        btnTerminal.classList.remove('active');
        btnAgents.classList.add('active');
      } else {
        termEl.style.display = '';
        agentsEl.style.display = 'none';
        if (resizerEl) resizerEl.style.display = 'none';
        btnTerminal.classList.add('active');
        btnAgents.classList.remove('active');
        fitAddon.fit();
      }
    }

    // On mobile, default to showing terminal only (agents hidden until toggled)
    (function initMobileView() {
      if (window.innerWidth <= 768) {
        const agentsEl = document.getElementById('agents');
        if (agentsEl) agentsEl.style.display = 'none';
      }
    })();

    // Tab switching
    let gigaLoaded = false;
    function switchTab(name) {
      const mainEl = document.getElementById('main');
      const healthEl = document.getElementById('healthbar');
      const gigaWrap = document.getElementById('giga-frame-wrap');
      const mobileToggle = document.getElementById('mobile-view-toggle');
      const tabBig = document.getElementById('tab-big');
      const tabGiga = document.getElementById('tab-giga');
      if (name === 'giga') {
        mainEl.style.display = 'none';
        healthEl.style.display = 'none';
        if (mobileToggle) mobileToggle.style.display = 'none';
        gigaWrap.classList.add('visible');
        tabBig.classList.remove('active');
        tabGiga.classList.add('active');
        if (!gigaLoaded) {
          document.getElementById('giga-frame').src = '/giga';
          gigaLoaded = true;
        }
      } else {
        mainEl.style.display = '';
        healthEl.style.display = '';
        // Restore mobile toggle visibility based on screen size
        if (mobileToggle) mobileToggle.style.display = '';
        gigaWrap.classList.remove('visible');
        tabBig.classList.add('active');
        tabGiga.classList.remove('active');
        // On mobile, ensure we're showing only the active panel
        if (window.innerWidth <= 768) {
          const activeView = document.getElementById('mvt-terminal').classList.contains('active') ? 'terminal' : 'agents';
          switchMobileView(activeView);
        } else {
          fitAddon.fit();
        }
      }
    }

  </script>
</body>
</html>
"""

GIGA_HTML = r"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GigaClungus Terminal</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #080b10; display: flex; flex-direction: column; height: 100vh; }
    #giga-status {
      background: #161b22;
      color: #484f58;
      font-family: 'Consolas','Cascadia Code','SF Mono','Courier New',monospace;
      font-size: 11px;
      padding: 5px 14px;
      border-bottom: 1px solid rgba(48,54,61,0.8);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #giga-status::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #484f58;
      flex-shrink: 0;
      transition: background 0.15s, box-shadow 0.15s;
    }
    #giga-status.connected { color: #3fb950; }
    #giga-status.connected::before { background: #3fb950; box-shadow: 0 0 6px #3fb950; }
    #giga-status.disconnected { color: #f85149; }
    #giga-status.disconnected::before { background: #f85149; box-shadow: 0 0 6px #f85149; }
    #giga-terminal { flex: 1; padding: 4px; overflow: hidden; }
  </style>
</head>
<body>
  <div id="giga-status" class="disconnected">GigaClungus — disconnected</div>
  <div id="giga-terminal"></div>
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
  <script>
    const term = new Terminal({
      theme: { background: '#0d0d0d', foreground: '#d4d4d4', cursor: '#26c0b0' },
      convertEol: true,
      scrollback: 5000,
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
    });
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('giga-terminal'));
    fitAddon.fit();
    window.addEventListener('resize', () => fitAddon.fit());

    const statusEl = document.getElementById('giga-status');

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Connect to parent origin's /giga-ws if we're in an iframe, otherwise same host
      const host = window.parent !== window
        ? new URL(document.referrer || location.href).host
        : location.host;
      const ws = new WebSocket(proto + '//' + host + '/giga-ws');
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        statusEl.textContent = 'GigaClungus — live';
        statusEl.className = 'connected';
        // ttyd requires an init message: plain JSON with AuthToken + terminal dimensions.
        // This triggers ttyd to spawn the pty process and send the initial screen repaint.
        const init = JSON.stringify({AuthToken: '', columns: term.cols, rows: term.rows});
        ws.send(new TextEncoder().encode(init));
      };
      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
          const buf = new Uint8Array(e.data);
          if (buf.length === 0) return;
          // ttyd binary frames: first byte is message type.
          // 0x30='0' output data, 0x31='1' set_window_title, 0x32='2' set_preferences.
          // Only write type '0' (output) frames to the terminal; strip the prefix byte.
          if (buf[0] === 0x30) {
            const atBottom = term.buffer.active.viewportY >= term.buffer.active.baseY;
            term.write(buf.slice(1), () => { if (atBottom) term.scrollToBottom(); });
          }
        } else {
          // Text frames: also prefixed with type byte as a character.
          if (e.data.length > 0 && e.data[0] === '0') {
            const atBottom = term.buffer.active.viewportY >= term.buffer.active.baseY;
            term.write(e.data.slice(1), () => { if (atBottom) term.scrollToBottom(); });
          }
        }
      };
      ws.onclose = () => {
        statusEl.textContent = 'GigaClungus — disconnected — reconnecting...';
        statusEl.className = 'disconnected';
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }
    connect();
  </script>
</body>
</html>
"""

GIGA_TTYD_PORT = 7683


async def giga_page_handler(request):
    return web.Response(text=GIGA_HTML, content_type='text/html')


async def giga_websocket_handler(request):
    """WebSocket proxy: bridge client to ttyd running on port GIGA_TTYD_PORT.

    ttyd speaks the ttyd WebSocket protocol (binary frames, resize msgs, etc.).
    We relay bytes transparently in both directions.
    """
    if not _is_authed(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        await ws.close(code=4401, message=b'Unauthorized')
        return ws

    client_ws = web.WebSocketResponse()
    await client_ws.prepare(request)

    ttyd_url = f'ws://127.0.0.1:{GIGA_TTYD_PORT}/ws'
    try:
        async with ClientSession() as session:
            async with session.ws_connect(ttyd_url, protocols=['tty']) as server_ws:
                async def relay_to_client():
                    async for msg in server_ws:
                        if client_ws.closed:
                            break
                        try:
                            if msg.type == 0x2:  # WSMsgType.BINARY
                                await client_ws.send_bytes(msg.data)
                            elif msg.type == 0x1:  # WSMsgType.TEXT
                                await client_ws.send_str(msg.data)
                            else:
                                break
                        except (ConnectionResetError, aiohttp.ClientConnectionResetError, aiohttp.ServerConnectionError):
                            break  # client disconnected

                async def relay_to_server():
                    async for msg in client_ws:
                        if server_ws.closed:
                            break
                        try:
                            if msg.type == 0x2:
                                await server_ws.send_bytes(msg.data)
                            elif msg.type == 0x1:
                                await server_ws.send_str(msg.data)
                            else:
                                break
                        except (ConnectionResetError, aiohttp.ClientConnectionResetError, aiohttp.ServerConnectionError):
                            break  # server disconnected

                done, pending = await asyncio.wait(
                    [asyncio.ensure_future(relay_to_client()),
                     asyncio.ensure_future(relay_to_server())],
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
    except Exception as exc:
        # ttyd not reachable — send error message to terminal
        if not client_ws.closed:
            msg = f'\r\n\x1b[31m[giga-terminal] could not connect to ttyd: {exc}\x1b[0m\r\n'
            await client_ws.send_str(msg)

    return client_ws


async def index(request):
    return web.Response(text=HTML, content_type='text/html')

async def graph_page_handler(request):
    graph_html_path = os.path.join(os.path.dirname(__file__), 'graph.html')
    with open(graph_html_path, 'r') as f:
        content = f.read()
    return web.Response(text=content, content_type='text/html')

def _set_pty_size(fd: int, cols: int, rows: int) -> None:
    """Set PTY window size via ioctl TIOCSWINSZ."""
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
    except OSError:
        pass


async def websocket_handler(request):
    if not _is_authed(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        await ws.close(code=4401, message=b'Unauthorized')
        return ws

    ws = web.WebSocketResponse()
    await ws.prepare(request)

    loop = asyncio.get_running_loop()

    # Open a PTY pair and spawn screen -x to attach to the existing session.
    # Using os.openpty() so we retain the master fd for both read and resize.
    master_fd, slave_fd = os.openpty()
    try:
        env = os.environ.copy()
        env["TERM"] = "xterm-256color"
        proc = subprocess.Popen(
            ['screen', '-x', SCREEN_SESSION],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            close_fds=True,
            preexec_fn=os.setsid,
            env=env,
        )
    except Exception as exc:
        os.close(master_fd)
        os.close(slave_fd)
        try:
            await ws.send_str(f'\r\n\x1b[31m[terminal] failed to attach to screen session: {exc}\x1b[0m\r\n')
        except Exception:
            pass
        return ws

    os.close(slave_fd)  # parent doesn't need the slave end

    # Set initial PTY size to a reasonable default; client will send a resize shortly
    _set_pty_size(master_fd, 220, 50)

    # Make master_fd non-blocking for asyncio compatibility
    flags = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

    async def pty_to_ws():
        """Read from pty master fd using asyncio reader, forward bytes to browser."""
        read_ready = asyncio.Event()

        def _on_readable():
            read_ready.set()

        loop.add_reader(master_fd, _on_readable)
        try:
            while not ws.closed:
                await read_ready.wait()
                read_ready.clear()
                try:
                    data = os.read(master_fd, 4096)
                except BlockingIOError:
                    continue
                except OSError:
                    break
                if not data:
                    break
                try:
                    await ws.send_bytes(data)
                except (ConnectionResetError, aiohttp.ClientConnectionResetError, aiohttp.ServerConnectionError):
                    break
        finally:
            loop.remove_reader(master_fd)

    async def ws_to_pty():
        """Read from browser, forward to pty (or handle resize)."""
        try:
            async for msg in ws:
                if msg.type == 0x2:  # BINARY — raw terminal input
                    try:
                        os.write(master_fd, msg.data)
                    except OSError:
                        break
                elif msg.type == 0x1:  # TEXT — control messages (resize)
                    try:
                        obj = json.loads(msg.data)
                        if obj.get('type') == 'resize':
                            cols = int(obj.get('cols', 80))
                            rows = int(obj.get('rows', 24))
                            _set_pty_size(master_fd, cols, rows)
                            # Signal screen to repaint at new dimensions
                            try:
                                os.kill(proc.pid, signal.SIGWINCH)
                            except ProcessLookupError:
                                pass
                    except (json.JSONDecodeError, ValueError, KeyError):
                        pass
                else:
                    break
        except asyncio.CancelledError:
            raise
        except (ConnectionResetError, aiohttp.ClientConnectionResetError, aiohttp.ServerConnectionError):
            # Client dropped the websocket mid-iteration — normal disconnect.
            return
        except Exception as exc:
            # Anything else is unexpected; surface it to logs so we can debug.
            print(f'[terminal ws_to_pty] error: {type(exc).__name__}: {exc}')
            traceback.print_exc()
            return
    read_task  = asyncio.ensure_future(pty_to_ws())
    write_task = asyncio.ensure_future(ws_to_pty())
    try:
        done, pending = await asyncio.wait(
            [read_task, write_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()
    finally:
        try:
            os.close(master_fd)
        except OSError:
            pass
        try:
            proc.terminate()
        except Exception:
            pass

    return ws


def get_task_description(agent_id, fpath):
    """Return a short human-readable description for a task.

    Priority:
    1. {agent_id}.meta.json in the same directory — use its 'description' field.
    2. First line of the output file parsed as JSONL — extract message.content,
       take the first line, truncate to 60 chars, strip 'You are BigClungus' prefix.
    """
    tasks_dir = os.path.dirname(fpath)
    meta_path = os.path.join(tasks_dir, agent_id + '.meta.json')
    try:
        with open(meta_path, 'r') as f:
            meta = json.load(f)
        desc = meta.get('description', '').strip()
        if desc:
            return desc
    except (OSError, json.JSONDecodeError, KeyError):
        pass

    # Fall back to parsing first line of output file
    try:
        with open(fpath, 'r', errors='replace') as f:
            first_line = f.readline()
        obj = json.loads(first_line)
        if not isinstance(obj, dict):
            return ''
        content = obj.get('message', {}).get('content', '')
        if not isinstance(content, str):
            return ''
        # Take first non-empty line of the content
        first_content_line = ''
        for line in content.splitlines():
            if line.strip():
                first_content_line = line.strip()
                break
        if not first_content_line:
            return ''
        # Strip common prefix
        prefix = 'You are BigClungus'
        if first_content_line.startswith(prefix):
            remainder = first_content_line[len(prefix):].lstrip('., ')
            # Take up to first sentence end or just truncate
            for sep in ['. ', '! ', '? ']:
                idx = remainder.find(sep)
                if idx != -1:
                    remainder = remainder[:idx + 1]
                    break
            first_content_line = remainder
        return first_content_line[:60]
    except (OSError, json.JSONDecodeError, KeyError, StopIteration):
        return ''


async def tasks_handler(request):
    now = time.time()
    two_hours_ago = now - 7200
    thirty_secs_ago = now - 30

    tasks = []
    task_dirs = _all_task_dirs()
    if not task_dirs:
        return web.Response(text='[]', content_type='application/json')

    all_entries: list[tuple[str, str]] = []  # (task_dir, fname)
    for task_dir in task_dirs:
        try:
            for fname in os.listdir(task_dir):
                if fname.endswith('.output'):
                    all_entries.append((task_dir, fname))
        except OSError:
            pass

    for task_dir, fname in all_entries:
        fpath = os.path.join(task_dir, fname)
        try:
            stat = os.stat(fpath)
        except OSError:
            continue

        mtime = stat.st_mtime
        if mtime < two_hours_ago:
            continue

        # Read last 200 bytes for summary
        summary = ''
        try:
            with open(fpath, 'rb') as f:
                f.seek(max(0, stat.st_size - 200), 0)
                raw = f.read(200)
            summary = raw.decode('utf-8', errors='replace')
            # Get last non-empty line
            lines = [l for l in summary.splitlines() if l.strip()]
            summary = lines[-1] if lines else summary.strip()
        except OSError:
            pass

        agent_id = fname[:-7]  # strip .output
        status = 'running' if mtime >= thirty_secs_ago else 'completed'

        # Read meta file once; fall back to parsing the output file for description.
        requester = ''
        meta_description = ''
        meta_path = os.path.join(task_dir, agent_id + '.meta.json')
        try:
            with open(meta_path) as f:
                meta = json.load(f)
            meta_description = meta.get('description', '').strip()
            requester = meta.get('requester', '')
        except (OSError, json.JSONDecodeError):
            pass

        description = meta_description or get_task_description(agent_id, fpath)

        tasks.append({
            'id': agent_id,
            'status': status,
            'summary': summary,
            'description': description,
            'requester': requester,
            'mtime': int(mtime),
        })

    tasks.sort(key=lambda t: t['mtime'], reverse=True)
    return web.Response(text=json.dumps(tasks), content_type='application/json')


async def task_output_handler(request):
    agent_id = request.match_info['agentId']
    if not agent_id.replace('-', '').replace('_', '').isalnum():
        return web.Response(status=400, text='Invalid agentId')
    task_dir = _find_task_dir_for_agent(agent_id)
    if task_dir is None:
        return web.Response(status=404, text='Task output not found')
    fpath = os.path.join(task_dir, agent_id + '.output')
    try:
        with open(fpath, 'r', errors='replace') as f:
            content = f.read()
    except FileNotFoundError:
        return web.Response(status=404, text='Task output not found')
    except OSError as e:
        return web.Response(status=500, text=str(e))
    return web.Response(text=content, content_type='text/plain')


async def meta_handler(request):
    agent_id = request.match_info['agentId']
    # Basic sanity check — agent IDs are hex strings
    if not agent_id.replace('-', '').replace('_', '').isalnum():
        return web.Response(status=400, text='Invalid agentId')
    try:
        body = await request.json()
    except Exception:
        return web.Response(status=400, text='Invalid JSON')
    description = body.get('description', '').strip()
    if not description:
        return web.Response(status=400, text='Missing description field')
    requester = body.get('requester', '').strip()
    task_dir = _find_task_dir_for_agent(agent_id)
    if task_dir is None:
        return web.Response(status=404, text='Task not found')
    meta_path = os.path.join(task_dir, agent_id + '.meta.json')
    try:
        with open(meta_path, 'w') as f:
            json.dump({'description': description, 'requester': requester}, f)
    except OSError as e:
        return web.Response(status=500, text=str(e))
    return web.Response(text=json.dumps({'ok': True, 'agentId': agent_id, 'description': description}),
                        content_type='application/json')

def format_uptime(seconds):
    seconds = int(seconds)
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, _ = divmod(rem, 60)
    if days > 0:
        return f"{days}d {hours}h {minutes}m"
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def check_service_running(name):
    """Return True if a systemd --user service is active."""
    try:
        result = subprocess.run(
            ['systemctl', '--user', 'is-active', name],
            capture_output=True, text=True, timeout=3
        )
        return result.stdout.strip() == 'active'
    except Exception:
        return False


def check_process_running(name):
    """Return True if a process with the given name is running."""
    if HAS_PSUTIL:
        for proc in psutil.process_iter(['name', 'cmdline']):
            try:
                pname = proc.info['name'] or ''
                cmdline = ' '.join(proc.info['cmdline'] or [])
                if name in pname or name in cmdline:
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return False
    # Fallback: check /proc
    try:
        for pid in os.listdir('/proc'):
            if not pid.isdigit():
                continue
            try:
                with open(f'/proc/{pid}/comm', 'r') as f:
                    if name in f.read():
                        return True
            except OSError:
                pass
    except OSError:
        pass
    return False


OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_SPEND_LIMIT = 10.0
_openai_cache = {'spend': 0.0, 'ts': 0.0}

# Approximate cost per 1M tokens by model snapshot prefix (prompt / completion)
_MODEL_PRICING = {
    'gpt-4o':        (2.50, 10.00),
    'gpt-4-turbo':   (10.00, 30.00),
    'gpt-4':         (30.00, 60.00),
    'gpt-3.5-turbo': (0.50,  1.50),
    'o1':            (15.00, 60.00),
    'o3':            (10.00, 40.00),
}

def _estimate_cost(snapshot_id: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Return estimated USD cost for a usage record."""
    prompt_usd_per_m, compl_usd_per_m = 2.50, 10.00  # default to gpt-4o pricing
    sid = (snapshot_id or '').lower()
    for prefix, pricing in _MODEL_PRICING.items():
        if sid.startswith(prefix):
            prompt_usd_per_m, compl_usd_per_m = pricing
            break
    return (prompt_tokens * prompt_usd_per_m + completion_tokens * compl_usd_per_m) / 1_000_000


async def fetch_openai_spend() -> float:
    """Fetch today's OpenAI spend in USD. Cached for 60 seconds."""
    now = time.time()
    if now - _openai_cache['ts'] < 60:
        return _openai_cache['spend']

    today = time.strftime('%Y-%m-%d')
    url = f'https://api.openai.com/v1/usage?date={today}'
    loop = asyncio.get_running_loop()

    def _do_fetch():
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {OPENAI_API_KEY}'})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read())
        except Exception:
            return None

    result = await loop.run_in_executor(None, _do_fetch)
    spend = 0.0
    if result and isinstance(result, dict):
        for record in result.get('data', []):
            snapshot_id = record.get('snapshot_id', '')
            prompt_tokens = record.get('n_context_tokens_total', 0) or 0
            completion_tokens = record.get('n_generated_tokens_total', 0) or 0
            spend += _estimate_cost(snapshot_id, prompt_tokens, completion_tokens)

    _openai_cache['spend'] = spend
    _openai_cache['ts'] = now
    return spend


async def health_handler(request):
    data = {}

    if HAS_PSUTIL:
        # CPU
        data['cpu_percent'] = psutil.cpu_percent(interval=0.1)

        # RAM
        vm = psutil.virtual_memory()
        data['ram'] = {
            'total': vm.total,
            'used': vm.used,
            'available': vm.available,
            'percent': vm.percent,
        }

        # Disk
        du = psutil.disk_usage('/')
        data['disk'] = {
            'total': du.total,
            'used': du.used,
            'free': du.free,
            'percent': du.percent,
        }

        # Swap
        sw = psutil.swap_memory()
        data['swap'] = {
            'total': sw.total,
            'used': sw.used,
            'percent': sw.percent,
        }

        # Uptime
        boot_time = psutil.boot_time()
        uptime_secs = time.time() - boot_time
        data['uptime'] = format_uptime(uptime_secs)
        data['uptime_seconds'] = int(uptime_secs)
    else:
        # Fallback: parse /proc files
        # CPU (single snapshot, not interval-based — less accurate)
        try:
            with open('/proc/stat', 'r') as f:
                line = f.readline()
            fields = list(map(int, line.split()[1:]))
            idle = fields[3]
            total = sum(fields)
            data['cpu_percent'] = round((1 - idle / total) * 100, 1)
        except Exception:
            data['cpu_percent'] = 0.0

        # RAM
        try:
            meminfo = {}
            with open('/proc/meminfo', 'r') as f:
                for line in f:
                    k, v = line.split(':')
                    meminfo[k.strip()] = int(v.split()[0]) * 1024
            total = meminfo.get('MemTotal', 0)
            avail = meminfo.get('MemAvailable', 0)
            used = total - avail
            pct = round(used / total * 100, 1) if total else 0
            data['ram'] = {'total': total, 'used': used, 'available': avail, 'percent': pct}
        except Exception:
            data['ram'] = {'total': 0, 'used': 0, 'available': 0, 'percent': 0}

        # Disk
        try:
            st = os.statvfs('/')
            total = st.f_blocks * st.f_frsize
            free = st.f_bfree * st.f_frsize
            used = total - free
            pct = round(used / total * 100, 1) if total else 0
            data['disk'] = {'total': total, 'used': used, 'free': free, 'percent': pct}
        except Exception:
            data['disk'] = {'total': 0, 'used': 0, 'free': 0, 'percent': 0}

        # Swap
        try:
            swapinfo = {}
            with open('/proc/meminfo', 'r') as f:
                for line in f:
                    k, v = line.split(':')
                    swapinfo[k.strip()] = int(v.split()[0]) * 1024
            stotal = swapinfo.get('SwapTotal', 0)
            sfree = swapinfo.get('SwapFree', 0)
            sused = stotal - sfree
            spct = round(sused / stotal * 100, 1) if stotal else 0
            data['swap'] = {'total': stotal, 'used': sused, 'percent': spct}
        except Exception:
            data['swap'] = {'total': 0, 'used': 0, 'percent': 0}

        # Uptime
        try:
            with open('/proc/uptime', 'r') as f:
                uptime_secs = float(f.read().split()[0])
            data['uptime'] = format_uptime(uptime_secs)
            data['uptime_seconds'] = int(uptime_secs)
        except Exception:
            data['uptime'] = 'unknown'
            data['uptime_seconds'] = 0

    # Services
    data['services'] = {
        'cloudflared': check_process_running('cloudflared'),
        'terminal-server': check_service_running('terminal-server'),
    }

    return web.Response(
        text=json.dumps(data),
        content_type='application/json',
        headers={'Cache-Control': 'no-cache'},
    )


GRAPHITI_GRAPHS = ['discord', 'infrastructure', 'discord-history', 'discord_history']

# Entity classifier — module-level constants so they're built once, not per-request.
_ENTITY_PEOPLE = {
    'jaboostin', 'justin', 'koole', 'graeme', 'centronias', 'bernie', 'biden',
    'trump', 'musk', 'elon', 'elon musk', 'donald trump', 'joe biden',
    'bernie sanders', 'harris', 'kamala', 'kamala harris', 'obama', 'pelosi',
    'aoc', 'ocasio-cortez', 'zelensky', 'putin', 'xi jinping', 'xi', 'pope',
    'pope francis', 'zuckerberg', 'mark zuckerberg', 'sam altman', 'altman',
    'bezos', 'jeff bezos', 'cook', 'tim cook', 'sundar pichai',
}
_ENTITY_PLACES = {
    'america', 'usa', 'us', 'united states', 'new york', 'texas', 'california',
    'florida', 'ohio', 'michigan', 'pennsylvania', 'georgia', 'arizona',
    'washington', 'dc', 'washington dc', 'canada', 'mexico', 'uk',
    'united kingdom', 'europe', 'russia', 'china', 'ukraine', 'israel',
    'gaza', 'taiwan', 'north korea', 'iran', 'iraq', 'afghanistan',
    'san francisco', 'los angeles', 'chicago', 'boston', 'seattle',
    'new jersey', 'brooklyn', 'manhattan', 'silicon valley',
}
_ENTITY_COMPANIES = {
    'openai', 'anthropic', 'google', 'microsoft', 'meta', 'apple', 'amazon',
    'tesla', 'spacex', 'twitter', 'x', 'discord', 'reddit', 'facebook',
    'instagram', 'tiktok', 'youtube', 'netflix', 'uber', 'lyft',
    'nvidia', 'amd', 'intel', 'qualcomm', 'arm', 'broadcom',
    'palantir', 'oracle', 'ibm', 'salesforce', 'shopify', 'stripe',
    'github', 'gitlab', 'atlassian', 'slack', 'zoom', 'twitch',
    'bytedance', 'baidu', 'alibaba', 'tencent', 'huawei',
    'nyt', 'new york times', 'cnn', 'fox', 'fox news', 'msnbc',
    'bbc', 'reuters', 'ap', 'associated press', 'washington post',
}
_ENTITY_TECH = {
    'ai', 'ml', 'llm', 'gpt', 'chatgpt', 'grok', 'gemini', 'claude',
    'llama', 'mistral', 'deepseek', 'copilot', 'dall-e', 'midjourney',
    'stable diffusion', 'neural network', 'machine learning',
    'python', 'javascript', 'rust', 'golang', 'typescript',
    'linux', 'windows', 'macos', 'android', 'ios',
    'bitcoin', 'ethereum', 'crypto', 'nft', 'blockchain',
    'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'cloud',
    'internet', 'web', 'api', 'github', 'open source',
}
_ENTITY_POLITICS = {
    'congress', 'senate', 'house', 'democrat', 'republican', 'gop',
    'election', 'vote', 'voting', 'ballot', 'primary', 'campaign',
    'white house', 'president', 'vice president', 'secretary',
    'supreme court', 'court', 'roe', 'abortion', 'immigration',
    'nato', 'un', 'united nations', 'eu', 'european union',
    'tariff', 'tariffs', 'trade war', 'sanctions', 'doge',
    'maga', 'woke', 'progressive', 'conservative', 'liberal',
    'left', 'right', 'socialism', 'capitalism', 'populism',
    'fbi', 'cia', 'nsa', 'doj', 'fcc', 'sec', 'fed', 'federal reserve',
}
_ENTITY_SUMMARY_KEYWORDS = {
    'Person':   ['person', 'user', 'developer', 'engineer', 'founder', 'ceo',
                 'politician', 'activist', 'journalist', 'researcher', 'scientist',
                 'actor', 'comedian', 'artist', 'streamer', 'youtuber'],
    'Place':    ['country', 'city', 'state', 'region', 'location', 'territory',
                 'nation', 'continent', 'island', 'coast', 'district', 'county'],
    'Company':  ['company', 'corporation', 'startup', 'firm', 'organization',
                 'platform', 'service', 'media', 'publication', 'outlet'],
    'Tech':     ['technology', 'software', 'hardware', 'model', 'framework',
                 'language', 'protocol', 'algorithm', 'database', 'system',
                 'network', 'ai model', 'tool', 'library', 'cryptocurrency'],
    'Politics': ['policy', 'political', 'legislation', 'bill', 'law', 'party',
                 'movement', 'government', 'administration', 'department',
                 'agency', 'bureau', 'committee', 'ideology'],
}
_DISCORD_USER_ALIASES = {
    'justin':              'jaboostin',
    'discord user':        'discord',
    'americans':           'america',
    'american':            'america',
    'new york city':       'new york',
    'new yorkers':         'new york',
    'openai millionaires': 'openai',
    'genai':               'ai',
    'grok ai chatbot':     'grok',
    'biden administration':'biden',
    'bernie sanders':      'bernie',
    'bernie bros':         'bernie',
}


def _classify_entity(name: str, summary: str) -> str:
    n = (name or '').strip().lower()
    s = (summary or '').lower()
    if n in _ENTITY_PEOPLE:    return 'Person'
    if n in _ENTITY_PLACES:    return 'Place'
    if n in _ENTITY_COMPANIES: return 'Company'
    if n in _ENTITY_TECH:      return 'Tech'
    if n in _ENTITY_POLITICS:  return 'Politics'
    for group, keywords in _ENTITY_SUMMARY_KEYWORDS.items():
        if any(kw in s for kw in keywords):
            return group
    return 'Concept'


def _user_dedup_key(label: str) -> str:
    k = (label or '').strip().lower()
    return _DISCORD_USER_ALIASES.get(k, k)



def _query_graph(graph_name: str):
    """Query a FalkorDB graph for entity nodes and edges (uses Python library for multi-line safety)."""
    r = _fdb.FalkorDB(host='localhost', port=6379)
    g = r.select_graph(graph_name)
    node_results, edge_results = [], []
    try:
        res = g.query(
            "MATCH (n) WHERE NOT 'Episodic' IN labels(n) "
            "RETURN n.uuid, n.name, labels(n), n.summary"
        )
        node_results = res.result_set
    except Exception as exc:
        print(f'[graph_data] node query failed for {graph_name!r}: {exc}')
    try:
        res = g.query(
            "MATCH (a)-[r:RELATES_TO]->(b) "
            "RETURN a.uuid, a.name, r.name, r.fact, b.uuid, b.name"
        )
        edge_results = res.result_set
    except Exception as exc:
        print(f'[graph_data] edge query failed for {graph_name!r}: {exc}')
    return node_results, edge_results


async def graph_data_handler(request):
    """Query all Graphiti FalkorDB graphs and return nodes + edges for vis.js."""
    loop = asyncio.get_running_loop()

    nodes_map = {}   # uuid -> {id, label, group, title}
    edges_list = []  # {from, to, label, title}
    edge_set = set()

    all_results = await asyncio.gather(
        *[loop.run_in_executor(None, _query_graph, graph) for graph in GRAPHITI_GRAPHS]
    )
    for graph, (node_results, edge_results) in zip(GRAPHITI_GRAPHS, all_results):

        for row in node_results:
            if len(row) < 4:
                continue
            uuid_val, name_val, labels_val, summary_val = row
            if not uuid_val:
                continue
            # labels_val is a list like ['Entity', 'Organization']
            if isinstance(labels_val, list):
                parts = labels_val
            else:
                parts = [p.strip() for p in str(labels_val).strip('[]').split(',')]
            new_groups = [p for p in parts if p not in ('Entity', '')]
            summary_str = str(summary_val) if summary_val else ''
            if uuid_val not in nodes_map:
                nodes_map[uuid_val] = {
                    'id': uuid_val,
                    'label': name_val,
                    'summary': summary_str,
                    'groups': new_groups,
                    '_graphs': [graph],
                }
            else:
                existing = nodes_map[uuid_val]
                for g in new_groups:
                    if g not in existing['groups']:
                        existing['groups'].append(g)
                if graph not in existing['_graphs']:
                    existing['_graphs'].append(graph)

        for row in edge_results:
            if len(row) < 6:
                continue
            src_uuid, _src_name, rel_name, fact, dst_uuid, _dst_name = row
            if not src_uuid or not dst_uuid:
                continue
            key = (src_uuid, dst_uuid, rel_name)
            if key in edge_set:
                continue
            edge_set.add(key)
            edges_list.append({
                'from': src_uuid,
                'to': dst_uuid,
                'label': rel_name,
                'title': fact or rel_name,
            })

    name_to_canonical = {}
    uuid_remap = {}
    for uuid_val, node in list(nodes_map.items()):
        key = _user_dedup_key(node.get('label') or '')
        if not key:
            continue
        if key not in name_to_canonical:
            name_to_canonical[key] = uuid_val
        else:
            canonical_uuid = name_to_canonical[key]
            uuid_remap[uuid_val] = canonical_uuid
            del nodes_map[uuid_val]

    # Finalise vis.js fields: classify entity type and build title tooltip.
    for node in nodes_map.values():
        node.pop('groups', None)
        graphs = node.pop('_graphs', [])
        summary = node.pop('summary', '')
        vis_group = _classify_entity(node.get('label', ''), summary)
        node['group'] = vis_group
        graphs_str = ', '.join(graphs)
        node['title'] = f"{node['label']} [{vis_group}] ({graphs_str})"

    # Remap edge endpoints and deduplicate.
    seen_edges = set()
    deduped_edges = []
    for edge in edges_list:
        src = uuid_remap.get(edge['from'], edge['from'])
        dst = uuid_remap.get(edge['to'], edge['to'])
        if src == dst:
            continue
        key = (src, dst, edge.get('label'))
        if key not in seen_edges:
            seen_edges.add(key)
            deduped_edges.append({**edge, 'from': src, 'to': dst})

    payload = {
        'nodes': list(nodes_map.values()),
        'edges': deduped_edges,
    }
    return web.Response(
        text=json.dumps(payload),
        content_type='application/json',
        headers={'Cache-Control': 'no-cache'},
    )


JSONL_PATH = "/home/clungus/.claude/projects/-home-clungus-work/bb9407c6-0d39-400c-af71-7c6765df2c69.jsonl"
CLAUDE_PRICING = {
    'input':       3.00 / 1_000_000,
    'output':     15.00 / 1_000_000,
    'cache_read':  0.30 / 1_000_000,
    'cache_write': 3.75 / 1_000_000,
}
_cost_cache = {'data': None, 'ts': 0.0}


def _parse_cost_data():
    totals = {
        'input': 0,
        'output': 0,
        'cache_read': 0,
        'cache_write': 0,
    }
    session_start = None
    now = time.time()
    one_hour_ago = now - 3600
    recent_tokens = 0

    try:
        with open(JSONL_PATH, 'r', errors='replace') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if obj.get('type') != 'assistant':
                    continue
                msg = obj.get('message', {})
                if not isinstance(msg, dict):
                    continue
                usage = msg.get('usage')
                if not usage or not isinstance(usage, dict):
                    continue

                ts_str = obj.get('timestamp', '')
                ts = None
                if ts_str:
                    try:
                        # Parse ISO timestamp with Z suffix
                        ts_clean = ts_str.replace('Z', '+00:00')
                        dt = datetime.fromisoformat(ts_clean)
                        ts = dt.timestamp()
                    except Exception:
                        pass

                if session_start is None and ts is not None:
                    session_start = ts_str

                inp = usage.get('input_tokens', 0) or 0
                out = usage.get('output_tokens', 0) or 0
                cr = usage.get('cache_read_input_tokens', 0) or 0
                cw = usage.get('cache_creation_input_tokens', 0) or 0

                totals['input'] += inp
                totals['output'] += out
                totals['cache_read'] += cr
                totals['cache_write'] += cw

                if ts is not None and ts >= one_hour_ago:
                    recent_tokens += inp + out + cr + cw

    except FileNotFoundError:
        pass

    cost_input = totals['input'] * CLAUDE_PRICING['input']
    cost_output = totals['output'] * CLAUDE_PRICING['output']
    cost_cr = totals['cache_read'] * CLAUDE_PRICING['cache_read']
    cost_cw = totals['cache_write'] * CLAUDE_PRICING['cache_write']
    total_cost = cost_input + cost_output + cost_cr + cost_cw

    elapsed_hours = 0.0
    if session_start:
        try:
            dt = datetime.fromisoformat(session_start.replace('Z', '+00:00'))
            elapsed_hours = (now - dt.timestamp()) / 3600
        except Exception:
            pass

    tokens_per_hour = 0.0
    cost_per_hour = 0.0
    if elapsed_hours > 0:
        total_tokens = totals['input'] + totals['output'] + totals['cache_read'] + totals['cache_write']
        tokens_per_hour = total_tokens / elapsed_hours
        cost_per_hour = total_cost / elapsed_hours

    return {
        'session_start': session_start,
        'elapsed_hours': round(elapsed_hours, 3),
        'total_input_tokens': totals['input'],
        'total_output_tokens': totals['output'],
        'total_cache_read_tokens': totals['cache_read'],
        'total_cache_write_tokens': totals['cache_write'],
        'total_cost_usd': round(total_cost, 6),
        'cost_breakdown': {
            'input': round(cost_input, 6),
            'output': round(cost_output, 6),
            'cache_read': round(cost_cr, 6),
            'cache_write': round(cost_cw, 6),
        },
        'tokens_per_hour': round(tokens_per_hour, 1),
        'cost_per_hour': round(cost_per_hour, 6),
        'tokens_last_hour': recent_tokens,
    }


async def cost_data_handler(request):
    now = time.time()
    if now - _cost_cache['ts'] < 60 and _cost_cache['data'] is not None:
        data = _cost_cache['data']
    else:
        loop = asyncio.get_running_loop()
        data = await loop.run_in_executor(None, _parse_cost_data)
        data['openai_spend_usd'] = await fetch_openai_spend()
        _cost_cache['data'] = data
        _cost_cache['ts'] = now

    return web.Response(
        text=json.dumps(data),
        content_type='application/json',
        headers={
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
        },
    )


# ── GitHub Project Tasks Cache ────────────────────────────────────────────────
_github_tasks_cache: dict = {'data': None, 'ts': 0.0}


BIGCLUNGUS_TASKS_DIR = '/home/clungus/work/bigclungus-meta/tasks'

_EVENT_TO_STATUS = {
    'started': 'in_progress',
    'done': 'done',
    'stale': 'stale',
    'failed': 'failed',
}

_STATUS_LABELS = {
    'in_progress': 'In Progress',
    'done': 'Done',
    'stale': 'Stale',
    'failed': 'Failed',
}


def _derive_status(task: dict) -> str:
    """Derive status string from the last log[] entry's event, or fall back to top-level status."""
    log = task.get('log')
    if log and isinstance(log, list) and len(log) > 0:
        last_event = log[-1].get('event', '')
        return _EVENT_TO_STATUS.get(last_event, last_event)
    return task.get('status', 'unknown')


def _get_started_ts(task: dict) -> str:
    """Return started_at timestamp from first 'started' log entry, or top-level started_at."""
    log = task.get('log')
    if log and isinstance(log, list):
        for entry in log:
            if entry.get('event') == 'started':
                return entry.get('ts', '')
    return task.get('started_at', '')


def _get_finished_ts(task: dict) -> str:
    """Return finished_at timestamp from last non-started log entry, or top-level finished_at."""
    log = task.get('log')
    if log and isinstance(log, list):
        for entry in reversed(log):
            if entry.get('event') != 'started':
                return entry.get('ts', '')
    return task.get('finished_at', '')


def _fetch_github_tasks() -> list:
    """Read task files from bigclungus-meta/tasks/ and return parsed items."""
    try:
        import glob as _glob
        parsed = []
        for fpath in _glob.glob(os.path.join(BIGCLUNGUS_TASKS_DIR, '*.json')):
            try:
                with open(fpath) as f:
                    task = json.load(f)
            except Exception:
                continue
            task_id = task.get('id', os.path.basename(fpath))
            status = _derive_status(task)
            started = _get_started_ts(task)
            finished = _get_finished_ts(task)
            status_label = _STATUS_LABELS.get(status, status)
            # Extract summary: prefer top-level summary, else last log context
            summary = task.get('summary') or ''
            if not summary:
                log = task.get('log')
                if log and isinstance(log, list):
                    for entry in reversed(log):
                        ctx = entry.get('context', '')
                        if ctx and entry.get('event') != 'started':
                            summary = ctx
                            break
            parsed.append({
                'id': task_id,
                'title': task.get('title', task_id),
                'status': status_label,
                'url': f'https://clung.us/tasks',
                'number': None,
                'createdAt': started,
                'updatedAt': finished or started,
                'labels': [task.get('agent_type', '')] if task.get('agent_type') else [],
                'discord_user': task.get('discord_user'),
                'run_in_background': task.get('run_in_background'),
                'isolation': task.get('isolation'),
                'model': task.get('model'),
                'summary': summary,
            })
        parsed.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        return parsed
    except Exception as exc:
        print(f'[github-tasks] error: {exc}')
        return []


async def github_tasks_handler(request):
    now = time.time()
    if now - _github_tasks_cache['ts'] < 10 and _github_tasks_cache['data'] is not None:
        items = _github_tasks_cache['data']
    else:
        loop = asyncio.get_running_loop()
        items = await loop.run_in_executor(None, _fetch_github_tasks)
        _github_tasks_cache['data'] = items
        _github_tasks_cache['ts'] = now
    return web.Response(
        text=json.dumps(items),
        content_type='application/json',
        headers={'Cache-Control': 'no-cache'},
    )


RESTART_PASSWORD = os.environ.get('RESTART_PASSWORD', '')

async def restart_bot_handler(request):
    if not _is_authed(request):
        return web.Response(
            status=401,
            text=json.dumps({'ok': False, 'error': 'authentication required'}),
            content_type='application/json',
        )
    try:
        body = await request.json()
    except Exception:
        return web.Response(status=400, text='Invalid JSON')
    if body.get('password') != RESTART_PASSWORD:
        return web.Response(
            status=403,
            text=json.dumps({'ok': False, 'error': 'wrong password'}),
            content_type='application/json',
        )
    try:
        subprocess.run(
            ['systemctl', '--user', 'restart', 'claude-bot'],
            env={**os.environ, 'XDG_RUNTIME_DIR': '/run/user/1001'},
            check=True,
            timeout=10,
        )
    except Exception as e:
        return web.Response(
            text=json.dumps({'ok': False, 'error': str(e)}),
            content_type='application/json',
        )
    return web.Response(text=json.dumps({'ok': True}), content_type='application/json')


SERVICES = [
    "claude-bot", "terminal-server", "clunger",
    "omni-gateway", "temporal", "temporal-worker", "cloudflared"
]

async def system_status_handler(request):
    nodes = []
    for svc in SERVICES:
        result = subprocess.run(
            ["systemctl", "--user", "is-active", svc],
            capture_output=True, text=True,
            env={**os.environ, 'XDG_RUNTIME_DIR': '/run/user/1001'},
            timeout=5,
        )
        status = result.stdout.strip()  # "active", "inactive", "failed"
        nodes.append({"id": svc, "status": status})

    # Also check Docker containers
    try:
        docker = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}|{{.Status}}"],
            capture_output=True, text=True, timeout=10
        )
        for line in docker.stdout.strip().split('\n'):
            if '|' in line:
                name, status = line.split('|', 1)
                nodes.append({
                    "id": name.strip(),
                    "status": "active" if "Up" in status else "down",
                    "type": "docker"
                })
    except Exception as exc:
        print(f'[cockpit] docker ps failed: {exc}')

    # Add Discord MCP Plugin as a virtual node (not a systemd service)
    nodes.append({"id": "discord-mcp-plugin", "status": "active"})

    # Virtual/external nodes
    nodes.append({"id": "congress-page", "status": "active", "type": "virtual"})
    nodes.append({"id": "agents/active/", "status": "active", "type": "virtual"})
    nodes.append({"id": "agents/fired/", "status": "active", "type": "virtual"})
    nodes.append({"id": "claude-cli", "status": "active", "type": "virtual"})
    nodes.append({"id": "healthcheck-loop", "status": "active", "type": "virtual"})
    nodes.append({"id": "sitenav.js+css", "status": "active", "type": "virtual"})

    # Define edges (relationships/dependencies)
    edges = [
        {"from": "discord-mcp-plugin", "to": "claude-bot", "label": "MCP notifications"},
        {"from": "claude-bot", "to": "discord-mcp-plugin", "label": "inject :9876"},
        {"from": "claude-bot", "to": "temporal-worker", "label": "spawns workflows"},
        {"from": "claude-bot", "to": "docker-graphiti-mcp-1", "label": "memory queries"},
        {"from": "terminal-server", "to": "docker-graphiti-mcp-1", "label": "queries"},
        {"from": "docker-graphiti-mcp-1", "to": "docker-falkordb-1", "label": "stores in"},
        {"from": "temporal-worker", "to": "temporal", "label": "connects to"},
        {"from": "cloudflared", "to": "terminal-server", "label": "terminal.clung.us"},
        {"from": "cloudflared", "to": "website", "label": "clung.us :8080"},
        {"from": "cloudflared", "to": "temporal-proxy", "label": "temporal.clung.us"},
        {"from": "temporal-proxy", "to": "temporal", "label": "proxies :8233"},
        # Congress page
        {"from": "cloudflared", "to": "congress-page", "label": "clung.us/congress"},
        {"from": "congress-page", "to": "website", "label": "served by"},
        {"from": "congress-page", "to": "agents/active/", "label": "reads identities"},
        {"from": "congress-page", "to": "claude-cli", "label": "persona responses (OAuth)"},
        # Agent identity system
        {"from": "agents/active/", "to": "agents/fired/", "label": "fired →"},
        # Healthcheck workflow
        {"from": "healthcheck-loop", "to": "temporal", "label": "every 60s"},
        {"from": "healthcheck-loop", "to": "discord-mcp-plugin", "label": "alerts via inject"},
        {"from": "healthcheck-loop", "to": "cloudflared", "label": "checks endpoints"},
        # Shared sitenav
        {"from": "website", "to": "sitenav.js+css", "label": "serves"},
        {"from": "sitenav.js+css", "to": "congress-page", "label": "loaded by"},
    ]

    return web.Response(
        text=json.dumps({"nodes": nodes, "edges": edges}),
        content_type='application/json',
        headers={'Cache-Control': 'no-cache'},
    )


async def topology_page_handler(request):
    topology_html_path = os.path.join(os.path.dirname(__file__), 'topology.html')
    with open(topology_html_path, 'r') as f:
        content = f.read()
    return web.Response(text=content, content_type='text/html')


async def gamecube_sounds_handler(request):
    path = os.path.join(os.path.dirname(__file__), 'gamecube-sounds.js')
    with open(path) as f:
        return web.Response(text=f.read(), content_type='application/javascript')


async def ingestion_status_handler(request):
    """Return discord_history ingestion progress stats from FalkorDB."""
    try:
        r = _fdb.FalkorDB(host='localhost', port=6379)
        g = r.select_graph('discord_history')
        episodes = g.query("MATCH (e:Episodic) RETURN count(e) as cnt").result_set[0][0]
        nodes    = g.query("MATCH (n:Entity) RETURN count(n) as cnt").result_set[0][0]
        edges    = g.query("MATCH ()-[r]->() RETURN count(r) as cnt").result_set[0][0]
    except Exception as exc:
        return web.Response(
            text=json.dumps({'error': str(exc)}),
            content_type='application/json',
            status=503,
        )
    # total_episodes is no longer a hardcoded constant — use the actual ingested
    # count as the total so the display never shows a nonsensical x/y where x > y.
    # If a true target is known in the future, set it here explicitly.
    total_episodes = episodes
    try:
        result = subprocess.run(
            'ps aux | grep discord_ingest_incremental | grep -v grep | wc -l',
            shell=True, capture_output=True, text=True, timeout=5,
        )
        workers_running = int(result.stdout.strip())
    except Exception:
        workers_running = 0
    pct = 100.0 if total_episodes == episodes else round(episodes / total_episodes * 100, 1) if total_episodes else 0
    return web.Response(
        text=json.dumps({
            'episodes': episodes,
            'total_episodes': total_episodes,
            'entities': nodes,
            'edges': edges,
            'workers_running': workers_running,
            'pct': pct,
        }),
        content_type='application/json',
    )


CLAUDE_MD_PATH = '/home/clungus/.claude/CLAUDE.md'

_EDIT_CLAUDE_MD_STYLE = """
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0d0d0d; color:#d4d4d4; font-family:monospace; padding:24px; }
    h1 { color:#e94560; font-size:15px; letter-spacing:.05em; }
    .breadcrumb { display:flex; align-items:center; gap:6px; margin-bottom:16px;
                  font-size:11px; color:#555; }
    .breadcrumb a { color:#8b949e; text-decoration:none; transition:color 0.15s; }
    .breadcrumb a:hover { color:#58a6ff; }
    .breadcrumb .sep { color:#333; user-select:none; }
    .breadcrumb .current { color:#e94560; font-weight:bold; }
    .header { display:flex; align-items:center; margin-bottom:8px; }
    textarea {
      width:100%; height:calc(100vh - 130px); background:#111122; color:#d4d4d4;
      border:1px solid #2a2a4e; border-radius:4px; padding:12px; font-family:monospace;
      font-size:13px; resize:vertical; outline:none; line-height:1.5;
    }
    textarea:focus { border-color:#e94560; }
    .actions { margin-top:10px; display:flex; align-items:center; gap:12px; }
    button { background:#238636; color:#fff; border:1px solid #2ea043; border-radius:3px;
             padding:6px 18px; font-family:monospace; font-size:13px; cursor:pointer; }
    button:hover { background:#2ea043; }
    .msg { font-size:12px; color:#4caf50; }
    .msg.err { color:#e94560; }
"""

async def edit_claude_md_get(request):
    saved = request.rel_url.query.get('saved', '')
    error = request.rel_url.query.get('error', '')
    try:
        with open(CLAUDE_MD_PATH, 'r') as f:
            content = f.read()
    except OSError as e:
        content = ''
        error = str(e)

    # Escape for HTML textarea
    escaped = content.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    status_html = ''
    if saved:
        status_html = '<span class="msg">&#x2713; Saved successfully.</span>'
    elif error:
        status_html = f'<span class="msg err">Error: {error}</span>'

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Edit CLAUDE.md \u2014 BigClungus</title>
  <link rel="stylesheet" href="https://clung.us/sitenav.css?v=b6d00bc">
  <script src="https://clung.us/sitenav.js?v=b6d00bc" defer></script>
  <style>{_EDIT_CLAUDE_MD_STYLE}</style>
</head>
<body>
  <div class="breadcrumb">
    <a href="https://clung.us/">clung.us</a>
    <span class="sep">/</span>
    <a href="/">terminal</a>
    <span class="sep">/</span>
    <span class="current">claude.md</span>
  </div>
  <div class="header">
    <h1>&#x270F; Edit ~/.claude/CLAUDE.md</h1>
  </div>
  <form method="POST" action="/edit-claude-md">
    <textarea name="content" spellcheck="false">{escaped}</textarea>
    <div class="actions">
      <button type="submit">&#x1F4BE; Save</button>
      {status_html}
    </div>
  </form>
</body>
</html>"""
    return web.Response(text=html, content_type='text/html')


async def edit_claude_md_post(request):
    try:
        data = await request.post()
        content = data.get('content', '')
    except Exception as e:
        raise web.HTTPFound(f'/edit-claude-md?error={e}')

    try:
        with open(CLAUDE_MD_PATH, 'w') as f:
            f.write(content)
    except OSError as e:
        raise web.HTTPFound(f'/edit-claude-md?error={e}')

    raise web.HTTPFound('/edit-claude-md?saved=1')


app = web.Application(middlewares=[auth_middleware])
app.router.add_get('/login', login_handler)
app.router.add_post('/login', login_handler)
app.router.add_get('/auth/github', github_auth_handler)
app.router.add_get('/auth/callback', github_callback_handler)
app.router.add_get('/', index)
app.router.add_get('/health', health_handler)
app.router.add_get('/graph-data', graph_data_handler)
app.router.add_get('/graph', graph_page_handler)
app.router.add_get('/ingestion-status', ingestion_status_handler)
app.router.add_get('/ws', websocket_handler)
app.router.add_get('/giga', giga_page_handler)
app.router.add_get('/giga-ws', giga_websocket_handler)
app.router.add_get('/tasks', tasks_handler)
app.router.add_get('/github-tasks', github_tasks_handler)
app.router.add_get('/task-output/{agentId}', task_output_handler)
app.router.add_post('/meta/{agentId}', meta_handler)
app.router.add_post('/restart-bot', restart_bot_handler)
app.router.add_get('/cost-data', cost_data_handler)
app.router.add_get('/system-status', system_status_handler)
app.router.add_get('/topology', topology_page_handler)
app.router.add_get('/gamecube-sounds.js', gamecube_sounds_handler)
app.router.add_get('/edit-claude-md', edit_claude_md_get)
app.router.add_post('/edit-claude-md', edit_claude_md_post)

_JSONL_DIR = '/home/clungus/.claude/projects/-mnt-data'


def _build_discord_event_index() -> list[tuple[float, str]]:
    """Read the two most-recent session JSONLs and return a sorted list of (ts, user) pairs.

    Called once per auto_meta_loop iteration so the expensive file reads happen
    only once, not once per task file.
    """
    jsonl_files = sorted(glob.glob(f'{_JSONL_DIR}/*.jsonl'), key=os.path.getmtime, reverse=True)
    events: list[tuple[float, str]] = []
    for jsonl_path in jsonl_files[:2]:
        try:
            content = open(jsonl_path).read()
        except OSError:
            continue
        for m in re.finditer(
            r'user=\\"([^\\"]+)\\"[^>]*ts=\\"(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\\"',
            content
        ):
            try:
                ts = datetime.fromisoformat(m.group(2).replace('Z', '+00:00')).timestamp()
            except ValueError:
                continue
            events.append((ts, m.group(1)))
    events.sort(key=lambda x: x[0])
    return events


def _requester_from_index(events: list[tuple[float, str]], task_ctime: float) -> str:
    """Given the pre-built event index, find the most recent Discord user before task_ctime."""
    if not events:
        return ''
    # Find rightmost event with ts < task_ctime
    idx = _bisect.bisect_left(events, (task_ctime,)) - 1
    if idx < 0:
        return ''
    return events[idx][1]


def _auto_meta_work() -> None:
    """Synchronous body of _auto_meta_loop — runs in a thread via run_in_executor."""
    # Build the Discord event index once for this entire pass.
    events = _build_discord_event_index()

    for task_dir in _all_task_dirs():
        try:
            entries = os.listdir(task_dir)
        except OSError:
            continue
        for fname in entries:
            if not fname.endswith('.output'):
                continue
            agent_id = fname[:-7]
            meta_path = os.path.join(task_dir, agent_id + '.meta.json')
            existing_desc = ''
            if os.path.exists(meta_path):
                try:
                    data = json.load(open(meta_path))
                    if data.get('requester'):
                        continue  # Already has a requester
                    existing_desc = data.get('description', '')
                except (OSError, json.JSONDecodeError):
                    pass
            try:
                ctime = os.path.getctime(os.path.join(task_dir, fname))
            except OSError:
                continue
            requester = _requester_from_index(events, ctime)
            if not requester:
                continue
            try:
                with open(meta_path, 'w') as f:
                    json.dump({'description': existing_desc, 'requester': requester}, f)
            except OSError:
                pass


async def _auto_meta_loop():
    """Background task: auto-create .meta.json for tasks that lack a requester."""
    await asyncio.sleep(10)  # Let the server start first
    loop = asyncio.get_running_loop()
    while True:
        try:
            await loop.run_in_executor(None, _auto_meta_work)
        except Exception as exc:
            print(f'[auto_meta] error: {exc}')
        await asyncio.sleep(30)


async def _start_background_tasks(app):
    app['auto_meta'] = asyncio.ensure_future(_auto_meta_loop())


async def _stop_background_tasks(app):
    app['auto_meta'].cancel()
    await asyncio.gather(app['auto_meta'], return_exceptions=True)


app.on_startup.append(_start_background_tasks)
app.on_cleanup.append(_stop_background_tasks)

if __name__ == '__main__':
    web.run_app(app, host='127.0.0.1', port=7682)
