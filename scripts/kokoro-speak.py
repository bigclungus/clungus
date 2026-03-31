#!/usr/bin/env python3
"""Generate speech with OpenAI TTS API. Prints output file path to stdout.

Usage: kokoro-speak.py <text> [voice]

text:  The text to speak.
voice: Optional. An OpenAI TTS voice name (alloy, echo, fable, nova, onyx,
       shimmer, etc.) or a legacy Kokoro voice name (mapped automatically).
       Defaults to "onyx".

Writes audio to a temp file and prints its path to stdout.
"""

import sys
import os
import tempfile

# Voice mapping: old Kokoro voices -> OpenAI TTS voices
VOICE_MAP = {
    "bm_george": "onyx",
    "af_heart": "nova",
    "af_bella": "shimmer",
    "am_adam": "echo",
    "am_michael": "fable",
    "bf_emma": "alloy",
}

OPENAI_VOICES = {
    "alloy", "ash", "ballad", "coral", "echo",
    "fable", "nova", "onyx", "sage", "shimmer", "verse",
}


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
        print("Usage: kokoro-speak.py <text> [voice]", file=sys.stderr)
        sys.exit(1)

    text = sys.argv[1]
    raw_voice = sys.argv[2] if len(sys.argv) > 2 else "bm_george"

    # Map old Kokoro voice names to OpenAI voices, or pass through
    voice = VOICE_MAP.get(raw_voice, raw_voice)
    if voice not in OPENAI_VOICES:
        voice = "onyx"

    api_key = _load_api_key()

    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    fd, output_path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)

    with client.audio.speech.with_streaming_response.create(
        model="tts-1",
        voice=voice,
        input=text,
        response_format="mp3",
    ) as response:
        with open(output_path, "wb") as f:
            for chunk in response.iter_bytes():
                f.write(chunk)
    print(output_path)


if __name__ == "__main__":
    main()
