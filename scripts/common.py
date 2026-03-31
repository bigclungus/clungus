import os

DB_PATH = "/mnt/data/data/discord-history.db"
EMBED_MODEL = "text-embedding-3-small"
EMBED_DIMS = 1536


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
    raise RuntimeError(
        "OPENAI_API_KEY not found in environment or any .env file\n"
        f"Checked: {env_paths}"
    )
