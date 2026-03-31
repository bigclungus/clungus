#!/usr/bin/env python3
"""Generate speech with Kokoro TTS. Prints output WAV path to stdout."""
import sys
import os
import tempfile

if len(sys.argv) < 2:
    print("Usage: kokoro-speak.py <text> [voice]", file=sys.stderr)
    sys.exit(1)

text = sys.argv[1]
voice = sys.argv[2] if len(sys.argv) > 2 else "bm_george"

model_dir = "/mnt/data/kokoro-models"
from kokoro_onnx import Kokoro
kokoro = Kokoro(
    os.path.join(model_dir, "kokoro-v1.0.onnx"),
    os.path.join(model_dir, "voices-v1.0.bin")
)

samples, sr = kokoro.create(text, voice=voice, speed=1.0, lang="en-us")

fd, path = tempfile.mkstemp(suffix=".wav")
os.close(fd)

import soundfile as sf
sf.write(path, samples, sr)
print(path)
