"""
Shared utility helpers for temporal-workflows activities.
"""
import os


def get_openai_key() -> str:
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return key
    env_paths = [
        "/mnt/data/temporal-workflows/.env",
        "/mnt/data/.env",
        os.path.expanduser("~/.claude/channels/discord/.env"),
    ]
    for path in env_paths:
        try:
            with open(path) as f:
                for line in f:
                    if line.startswith("OPENAI_API_KEY="):
                        return line.split("=", 1)[1].strip()
        except FileNotFoundError:
            continue
    raise RuntimeError("OPENAI_API_KEY not found in environment or any .env file")


def get_discord_token() -> str:
    env_file = "/home/clungus/.claude/channels/discord/.env"
    env_vars: dict[str, str] = {}
    if os.path.exists(env_file):
        for line in open(env_file):
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip()
    token = os.environ.get("DISCORD_BOT_TOKEN") or env_vars.get("DISCORD_BOT_TOKEN", "")
    if not token:
        raise RuntimeError("DISCORD_BOT_TOKEN not available")
    return token
