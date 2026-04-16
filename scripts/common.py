import os
import struct

DB_PATH = "/mnt/data/data/discord-history.db"
BOT_ENV = "/home/clungus/.claude/channels/discord/.env"

# Legacy OpenAI embeddings (kept for backward compat)
EMBED_MODEL = "text-embedding-3-small"
EMBED_DIMS = 1536

# Local embeddings (sentence-transformers)
LOCAL_EMBED_MODEL = "all-MiniLM-L6-v2"
LOCAL_EMBED_DIMS = 384


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


_local_model = None


def get_local_model():
    """Lazy-load the local sentence-transformers model."""
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer
        _local_model = SentenceTransformer(LOCAL_EMBED_MODEL)
    return _local_model


def local_embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed texts using the local model. Returns list of float lists."""
    model = get_local_model()
    embeddings = model.encode(texts, show_progress_bar=False)
    return [emb.tolist() for emb in embeddings]


def get_bot_token() -> str:
    """Load DISCORD_BOT_TOKEN from environment or .env file."""
    token = os.environ.get("DISCORD_BOT_TOKEN")
    if token:
        return token
    with open(BOT_ENV) as f:
        for line in f:
            line = line.strip()
            if line.startswith("DISCORD_BOT_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError(f"DISCORD_BOT_TOKEN not found in {BOT_ENV}")


def serialize_f32(vec: list[float]) -> bytes:
    """Serialize a list of floats to bytes for sqlite-vec."""
    return struct.pack(f"{len(vec)}f", *vec)
