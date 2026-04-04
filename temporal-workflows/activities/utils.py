"""
Shared utility helpers for temporal-workflows activities.
"""
import os

import aiohttp

DISCORD_TIMEOUT = aiohttp.ClientTimeout(total=10)

# Standard .env search paths
_ENV_PATHS = [
    "/mnt/data/temporal-workflows/.env",
    "/mnt/data/.env",
    os.path.expanduser("~/.claude/channels/discord/.env"),
]


def load_env_key(var_name: str) -> str:
    """Load a key from environment or .env files. Raises RuntimeError if not found."""
    key = os.environ.get(var_name)
    if key:
        return key
    for path in _ENV_PATHS:
        try:
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith(f"{var_name}=") and not line.startswith("#"):
                        return line.split("=", 1)[1].strip()
        except FileNotFoundError:
            continue
    raise RuntimeError(f"{var_name} not found in environment or any .env file")


def get_openai_key() -> str:
    return load_env_key("OPENAI_API_KEY")


def get_discord_token() -> str:
    return load_env_key("DISCORD_BOT_TOKEN")


def _discord_headers() -> dict:
    token = get_discord_token()
    return {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
    }
