"""
Shared constants for temporal-workflows activities.
"""
import os

# The main Discord channel for BigClungus.
MAIN_CHANNEL_ID = "1485343472952148008"

# The inject endpoint — routes messages directly to the bot session.
INJECT_URL = "http://127.0.0.1:8085/webhooks/bigclungus-main"

# Clunger (TypeScript web server) base URL — overridable via env for non-local deployments.
CLUNGER_BASE_URL = os.environ.get("CLUNGER_BASE_URL", "http://localhost:8081")

# Congress check-in signals
SIGNAL_CONTINUE = "CONTINUE"
SIGNAL_ABORT = "ABORT"
SIGNAL_REFRAME = "REFRAME"

# Filesystem paths shared across activities
META_REPO_PATH = "/home/clungus/work/bigclungus-meta"
AGENTS_DIR = META_REPO_PATH + "/agents"
TASKS_DIR = META_REPO_PATH + "/tasks"
HELLO_WORLD_SESSIONS_DIR = "/home/clungus/work/hello-world/sessions"

# Discord REST API base URL
DISCORD_API = "https://discord.com/api/v10"
