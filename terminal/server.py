#!/usr/bin/env python3
"""
Live terminal stream server — streams /tmp/screenlog.txt to websocket clients,
served alongside an xterm.js HTML page.
"""
import asyncio
import bisect as _bisect
import glob
import hashlib
import hmac
import json
import os
import re
import secrets
import subprocess
import time
import urllib.parse
import urllib.request
import falkordb as _fdb
from datetime import datetime, timezone
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
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0d0d0d; color:#d4d4d4; font-family:monospace;
           display:flex; align-items:center; justify-content:center; height:100vh; }
    .box { background:#1a1a2e; border:1px solid #e94560; border-radius:6px;
           padding:32px 40px; min-width:300px; text-align:center; }
    h2 { color:#e94560; margin-bottom:20px; font-size:16px; letter-spacing:.05em; }
    .github-btn { display:flex; align-items:center; justify-content:center;
      width:100%; padding:9px; background:#238636; color:#fff; text-decoration:none;
      border-radius:3px; font-family:monospace; font-size:14px; cursor:pointer;
      border:1px solid #2ea043; margin-bottom:12px; }
    .github-btn:hover { background:#2ea043; }"""

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

LOGFILE = "/tmp/screenlog.txt"
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


# Legacy constant kept for meta_handler writes — resolved dynamically at call time.
TASKS_DIR = _TASKS_BASE  # unused sentinel; real resolution happens via helpers above

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
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0d0d0d; display: flex; flex-direction: column; height: 100vh; font-family: monospace;
           padding-top: 0 !important; }
    /* sitenav.js injects the shared nav as first flex child; override its sticky
       position so it participates in the column layout instead of floating.
       Force single-line at all viewport widths — no wrapping on the terminal page. */
    .sitenav { position: relative; flex-shrink: 0; flex-wrap: nowrap !important; overflow-x: auto; }
    .sitenav .sitenav-links { flex-wrap: nowrap; }
    .sitenav .sitenav-links a, .sitenav .sitenav-brand { white-space: nowrap; }
    /* Unified session bar — tabs left, status+actions right */
    #session-bar {
      background: #2d2d44;
      border-top: 1px solid #4a4a6a;
      border-bottom: 1px solid #4a4a6a;
      display: flex;
      align-items: stretch;
      flex-shrink: 0;
      padding: 0 12px 0 0;
      gap: 0;
    }
    #status { font-size: 11px; color: #888; margin-left: auto; padding: 0 12px; white-space: nowrap; align-self: center; }
    #status.connected { color: #4caf50; }
    #status.disconnected { color: #e94560; }
    #healthbar {
      background: #111122;
      border-bottom: 1px solid #2a2a4e;
      padding: 5px 16px;
      display: flex;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
      flex-shrink: 0;
      font-size: 11px;
      font-family: monospace;
      color: #aaa;
    }
    .hb-metric {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .hb-label {
      color: #e94560;
      font-weight: bold;
      min-width: 30px;
    }
    .hb-bar-wrap {
      width: 60px;
      height: 6px;
      background: #2a2a4e;
      border-radius: 3px;
      overflow: hidden;
    }
    .hb-bar-fill {
      height: 100%;
      border-radius: 3px;
      background: #4caf50;
      transition: width 0.4s ease;
    }
    .hb-bar-fill.warn { background: #f0c040; }
    .hb-bar-fill.crit { background: #e94560; }
    .hb-val { color: #ccc; min-width: 34px; }
    .hb-sep { color: #2a2a4e; }
    .hb-svc {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .hb-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #444;
      flex-shrink: 0;
    }
    .hb-dot.ok { background: #4caf50; box-shadow: 0 0 4px #4caf50; }
    .hb-dot.down { background: #e94560; box-shadow: 0 0 4px #e94560; }
    .hb-uptime { color: #888; }
    #main {
      display: flex;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }
    #terminal {
      width: 70%;
      padding: 4px;
      overflow: hidden;
      flex-shrink: 0;
    }
    #agents {
      width: 30%;
      background: #1a1a2e;
      border-left: 1px solid #2a2a4e;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    /* Subagent grid panel */
    #agents-header {
      padding: 0.5em 0.9em;
      color: #4ecca3;
      font-size: 0.75em;
      font-weight: bold;
      border-bottom: 1px solid #2a2a4e;
      border-left: 3px solid #4ecca3;
      flex-shrink: 0;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 0.5em;
      background: #0d1117;
    }
    #agents-token-total {
      margin-left: auto;
      color: #4ecca3;
      font-size: 0.9em;
      font-weight: normal;
      text-transform: none;
      letter-spacing: 0;
      opacity: 0.8;
    }
    #agents-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5em;
      display: flex;
      flex-direction: column;
      gap: 0.4em;
    }
    #agents-list::-webkit-scrollbar { width: 4px; }
    #agents-list::-webkit-scrollbar-track { background: #0d1117; }
    #agents-list::-webkit-scrollbar-thumb { background: #4ecca3; border-radius: 2px; }
    .xterm-viewport::-webkit-scrollbar { width: 4px; }
    .xterm-viewport::-webkit-scrollbar-track { background: #1a1a2e; }
    .xterm-viewport::-webkit-scrollbar-thumb { background: #4ecca3; border-radius: 2px; }
    #agents-empty {
      color: #444;
      font-size: 0.85em;
      text-align: center;
      padding: 1.5em 0.5em;
    }
    /* Subagent cards */
    .sa-card {
      background: #0d1117;
      border: 1px solid #1e2a3a;
      border-radius: 4px;
      padding: 0.55em 0.7em;
      font-size: 0.85em;
      flex-shrink: 0;
      transition: opacity 0.3s;
    }
    .sa-card:hover { border-color: #4ecca3; }
    .sa-card.done { opacity: 0.65; }
    .sa-card.done:hover { opacity: 1; }
    .sa-top {
      display: flex;
      align-items: center;
      gap: 0.4em;
      margin-bottom: 0.35em;
    }
    .sa-dot {
      width: 0.6em;
      height: 0.6em;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .sa-dot.in_progress {
      background: #f0c040;
      box-shadow: 0 0 5px #f0c040;
      animation: pulse 1.5s infinite;
    }
    .sa-dot.complete { background: #4ecca3; }
    .sa-dot.failed { background: #e94560; }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 3px #f0c040; }
      50% { box-shadow: 0 0 8px #f0c040; }
    }
    .sa-name {
      color: #c0c0d0;
      font-weight: bold;
      font-size: 1em;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sa-age {
      color: #444;
      font-size: 0.85em;
      flex-shrink: 0;
    }
    .sa-meta {
      display: flex;
      align-items: center;
      gap: 0.65em;
      margin-bottom: 0.35em;
      font-size: 0.85em;
      color: #555;
    }
    .sa-tokens {
      color: #4ecca3;
      font-weight: bold;
    }
    .sa-tools { color: #a78bfa; }
    .sa-output {
      background: #060a10;
      border: 1px solid #1a2232;
      border-radius: 3px;
      padding: 0.35em 0.5em;
      max-height: 12em;
      overflow-y: auto;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 0.85em;
      color: #8899aa;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.45;
    }
    .sa-output::-webkit-scrollbar { width: 3px; }
    .sa-output::-webkit-scrollbar-track { background: #060a10; }
    .sa-output::-webkit-scrollbar-thumb { background: #4ecca3; border-radius: 2px; }
    .sa-output-line { display: block; }
    /* Action button/link shared ghost style */
    #graph-link, #edit-claude-link, #restart-btn {
      color: #8b949e;
      font-size: 10px;
      font-weight: normal;
      text-decoration: none;
      letter-spacing: 0;
      text-transform: none;
      padding: 2px 8px;
      border: 1px solid transparent;
      border-radius: 3px;
      background: none;
      transition: color 0.15s, border-color 0.15s;
      white-space: nowrap;
      align-self: center;
      cursor: pointer;
      font-family: monospace;
    }
    #graph-link:hover, #edit-claude-link:hover { color: #58a6ff; border-color: #4a4a6a; }
    #restart-btn:hover { color: #e94560; border-color: #4a4a6a; }
    /* Tab buttons — live inside #session-bar */
    .tab-btn {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: #666;
      font-family: monospace;
      font-size: 12px;
      padding: 7px 16px 6px;
      cursor: pointer;
      letter-spacing: 0.04em;
      transition: color 0.15s, border-color 0.15s;
      align-self: stretch;
      display: flex;
      align-items: center;
    }
    .tab-btn:hover { color: #aaa; }
    .tab-btn.active { color: #c0c0ff; border-bottom-color: #7c7cff; }
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
      background: #0d0d0d;
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
    fitAddon.fit();
    window.addEventListener('resize', () => fitAddon.fit());

    const statusEl = document.getElementById('status');

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        statusEl.textContent = '\u25CF live';
        statusEl.className = 'connected';
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
        statusEl.textContent = '\u25CF disconnected \u2014 reconnecting...';
        statusEl.className = 'disconnected';
        setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    }
    connect();

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

    function fmtTokens(n) {
      if (!n) return '0';
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return String(n);
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
        if (lineBuffer.length > 200) lineBuffer = lineBuffer.slice(-200);
        const cardState = agentCards.get(agentId);
        if (cardState) cardState.lines = lineBuffer;
        // Re-render output pane
        renderOutputPane(outputEl, lineBuffer);
      };

      sse.onerror = () => {
        sse.close();
        agentStreams.delete(agentId);
      };
    }

    function renderOutputPane(outputEl, lines) {
      const atBottom = outputEl.scrollHeight - outputEl.scrollTop <= outputEl.clientHeight + 20;
      outputEl.innerHTML = lines.map(l => `<span class="sa-output-line">${escHtml(l)}</span>`).join('\n');
      if (atBottom) outputEl.scrollTop = outputEl.scrollHeight;
    }

    function makeCard(agent) {
      const card = document.createElement('div');
      const statusClass = agent.status === 'in_progress' ? 'in_progress' : 'complete';
      card.className = 'sa-card' + (agent.status === 'complete' ? ' done' : '');
      card.dataset.id = agent.id;

      const nameShort = (agent.name || agent.id).slice(0, 55);
      const age = relativeTime(agent.lastModified);

      card.innerHTML = `
        <div class="sa-top">
          <div class="sa-dot ${statusClass}"></div>
          <div class="sa-name" title="${escHtml(agent.name || agent.id)}">${escHtml(nameShort)}</div>
          <div class="sa-age">${escHtml(age)}</div>
        </div>
        <div class="sa-meta">
          <span class="sa-tokens">&#x25CB; ${escHtml(fmtTokens(agent.tokens))} tok</span>
          <span class="sa-tools">&#x1F527; ${agent.toolUses} calls</span>
        </div>
        <div class="sa-output"></div>
      `;

      const outputEl = card.querySelector('.sa-output');
      return { card, outputEl };
    }

    function updateCard(card, outputEl, agent) {
      // Update status dot
      const dot = card.querySelector('.sa-dot');
      if (dot) {
        dot.className = 'sa-dot ' + (agent.status === 'in_progress' ? 'in_progress' : 'complete');
      }
      // Update fade
      if (agent.status === 'complete') card.classList.add('done');
      else card.classList.remove('done');
      // Update meta
      const tokEl = card.querySelector('.sa-tokens');
      if (tokEl) tokEl.textContent = '\u25CB ' + fmtTokens(agent.tokens) + ' tok';
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
      const interesting = agents.filter(a => !a.id.startsWith('hook_') && a.tokens > 0 || a.status === 'in_progress');

      // Update token total
      const totalTokens = interesting.reduce((s, a) => s + (a.tokens || 0), 0);
      const totalEl = document.getElementById('agents-token-total');
      if (totalEl) totalEl.textContent = fmtTokens(totalTokens) + ' tok total';

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
          list.insertBefore(card, list.firstChild);
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

    // Tab switching
    let gigaLoaded = false;
    function switchTab(name) {
      const mainEl = document.getElementById('main');
      const healthEl = document.getElementById('healthbar');
      const gigaWrap = document.getElementById('giga-frame-wrap');
      const tabBig = document.getElementById('tab-big');
      const tabGiga = document.getElementById('tab-giga');
      if (name === 'giga') {
        mainEl.style.display = 'none';
        healthEl.style.display = 'none';
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
        gigaWrap.classList.remove('visible');
        tabBig.classList.add('active');
        tabGiga.classList.remove('active');
        fitAddon.fit();
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
    body { background: #0d0d0d; display: flex; flex-direction: column; height: 100vh; }
    #giga-status {
      background: #1a1a2e;
      color: #888;
      font-family: monospace;
      font-size: 11px;
      padding: 4px 12px;
      border-bottom: 1px solid #2a2a4e;
      flex-shrink: 0;
    }
    #giga-status.connected { color: #4caf50; }
    #giga-status.disconnected { color: #e94560; }
    #giga-terminal { flex: 1; padding: 4px; overflow: hidden; }
  </style>
</head>
<body>
  <div id="giga-status" class="disconnected">&#x26A1; GigaClungus — disconnected</div>
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
        statusEl.textContent = '\u26A1 GigaClungus \u2014 live';
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
        statusEl.textContent = '\u26A1 GigaClungus \u2014 disconnected \u2014 reconnecting...';
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
GIGA_LOGFILE = "/tmp/giga-screenlog.txt"


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

async def websocket_handler(request):
    if not _is_authed(request):
        # Reject unauthenticated WebSocket connections immediately
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        await ws.close(code=4401, message=b'Unauthorized')
        return ws

    ws = web.WebSocketResponse()
    await ws.prepare(request)

    # Send tail of existing log content (cap at 512KB to avoid OOM on large logs)
    MAX_INITIAL_BYTES = 512 * 1024
    try:
        with open(LOGFILE, 'rb') as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - MAX_INITIAL_BYTES))
            existing = f.read()
        if existing:
            try:
                await ws.send_bytes(existing)
            except (ConnectionResetError, aiohttp.ClientConnectionResetError, aiohttp.ServerConnectionError):
                return ws  # client already gone
    except FileNotFoundError:
        pass

    # Tail new content
    with open(LOGFILE, 'rb') as f:
        f.seek(0, 2)  # seek to end
        while not ws.closed:
            chunk = f.read(4096)
            if chunk:
                try:
                    await ws.send_bytes(chunk)
                except (ConnectionResetError, aiohttp.ClientConnectionResetError, aiohttp.ServerConnectionError):
                    break  # client disconnected, stop sending
            else:
                await asyncio.sleep(0.05)

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
    loop = asyncio.get_event_loop()

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
FALKORDB_CONTAINER = 'docker-falkordb-1'

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


def _run_falkordb_query(graph: str, query: str) -> list[str]:
    """Run a Cypher query against FalkorDB via docker exec redis-cli.

    Returns a flat list of all non-blank, non-metadata lines from the output.
    The first N lines are column headers; callers use _parse_falkordb_table to
    strip headers and split into rows.
    """
    try:
        result = subprocess.run(
            ['docker', 'exec', FALKORDB_CONTAINER,
             'redis-cli', '-p', '6379', 'GRAPH.QUERY', graph, query],
            capture_output=True, text=True, timeout=10
        )
        lines = result.stdout.splitlines()
    except Exception:
        return []

    all_data = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('Cached execution') or stripped.startswith('Query internal'):
            break
        if stripped == '':
            continue
        all_data.append(stripped)

    return all_data


def _parse_falkordb_table(raw_lines: list[str], num_cols: int) -> list[list[str]]:
    """Given flat list of values from redis-cli GRAPH.QUERY, split into rows."""
    # Skip the header row (first num_cols lines)
    data = raw_lines[num_cols:]
    rows = []
    for i in range(0, len(data), num_cols):
        row = data[i:i + num_cols]
        if len(row) == num_cols:
            rows.append(row)
    return rows


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
    loop = asyncio.get_event_loop()

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
                        import datetime
                        dt = datetime.datetime.fromisoformat(ts_clean)
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
            import datetime
            dt = datetime.datetime.fromisoformat(session_start.replace('Z', '+00:00'))
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
        loop = asyncio.get_event_loop()
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
        loop = asyncio.get_event_loop()
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
    loop = asyncio.get_event_loop()
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
