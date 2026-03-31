#!/usr/bin/env python3
"""Transcribe a WAV file using the OpenAI Whisper API.

Usage: python3 whisper-transcribe.py <path-to-wav>

Prints the transcribed text to stdout. Exits 0 on success, 1 on error.
"""

import sys
import os


def _load_api_key() -> str:
    """Load OpenAI API key from environment or .env files."""
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return key
    for env_path in (
        "/mnt/data/temporal-workflows/.env",
        "/mnt/data/graphiti/repo/mcp_server/.env",
        os.path.expanduser("~/.claude/channels/discord/.env"),
    ):
        if os.path.isfile(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("OPENAI_API_KEY="):
                        return line.split("=", 1)[1].strip()
    print("error: OPENAI_API_KEY not found in env or .env files", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: whisper-transcribe.py <wav-path>", file=sys.stderr)
        sys.exit(1)

    wav_path = sys.argv[1]
    if not os.path.isfile(wav_path):
        print(f"error: file not found: {wav_path}", file=sys.stderr)
        sys.exit(1)

    api_key = _load_api_key()

    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    with open(wav_path, "rb") as audio_file:
        transcription = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
        )

    print(transcription.text.strip())


if __name__ == "__main__":
    main()
