"""
Shared constants for temporal-workflows activities.
"""
from os import environ
from pathlib import Path

# The main Discord channel for BigClungus.
MAIN_CHANNEL_ID = "1485343472952148008"

# The inject endpoint — routes messages directly to the bot session.
INJECT_URL = "http://127.0.0.1:8085/webhooks/bigclungus-main"

# Clunger (TypeScript web server) base URL — overridable via env for non-local deployments.
CLUNGER_BASE_URL = environ.get("CLUNGER_BASE_URL", "http://localhost:8081")

# Congress check-in signals
SIGNAL_CONTINUE = "CONTINUE"
SIGNAL_ABORT = "ABORT"
SIGNAL_REFRAME = "REFRAME"
SIGNAL_NO_DISPUTE = "NO_DISPUTE"

# Filesystem paths shared across activities
BASE_DIR = "/mnt/data"
META_REPO_PATH = "/home/clungus/work/bigclungus-meta"
AGENTS_DIR = META_REPO_PATH + "/agents"
TASKS_DIR = Path(META_REPO_PATH) / "tasks"
HELLO_WORLD_DIR = BASE_DIR + "/hello-world"
HELLO_WORLD_SESSIONS_DIR = Path(HELLO_WORLD_DIR) / "sessions"
CLUNGER_DIR = BASE_DIR + "/clunger"
TEMPORAL_WORKFLOWS_DIR = BASE_DIR + "/temporal-workflows"
GRAPHITI_ENV = BASE_DIR + "/graphiti/repo/mcp_server/.env"
SCRIPTS_DIR = Path(BASE_DIR) / "scripts"
LABS_DIR = BASE_DIR + "/labs"

# Claude CLI binary path
CLAUDE_CLI = "/home/clungus/.local/bin/claude"

# Claude session JSONL directory — contains per-session .jsonl files for context analysis
CLAUDE_SESSIONS_DIR = Path("/home/clungus/.claude/projects/-mnt-data")

# Temporal server host — overridable via env for non-local deployments
TEMPORAL_HOST = environ.get("TEMPORAL_HOST", "localhost:7233")

# Internal auth token forwarded to clunger via X-Internal-Token header
INTERNAL_TOKEN = environ.get("INTERNAL_TOKEN", "")

# FalkorDB connection — overridable via env for non-local deployments
FALKORDB_HOST = environ.get("FALKORDB_HOST", "localhost")
FALKORDB_PORT = int(environ.get("FALKORDB_PORT", "6379"))

# Discord REST API base URL
DISCORD_API = "https://discord.com/api/v10"

# xAI (Grok) API URL
XAI_API_URL = "https://api.x.ai/v1/chat/completions"

# Grok proxy — local Anthropic-compatible proxy that forwards to xAI
GROK_PROXY_URL = "http://127.0.0.1:4100/v1/messages"

# Together.ai API URL
TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions"

# Congress/trial session mode constants
SESSION_MODE_MEME = "meme"
SESSION_MODE_STANDARD = "standard"
