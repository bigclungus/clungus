#!/usr/bin/env python3
"""Test script for Kokoro TTS with the george voice."""

import time
import soundfile as sf
from kokoro_onnx import Kokoro

MODEL_PATH = "/mnt/data/kokoro-models/kokoro-v1.0.onnx"
VOICES_PATH = "/mnt/data/kokoro-models/voices-v1.0.bin"
OUTPUT_PATH = "/tmp/kokoro-test.wav"
VOICE = "bm_george"
TEXT = "Hello, this is a test of the Kokoro text to speech system"

def main():
    print("Loading Kokoro model...")
    t0 = time.time()
    kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
    load_time = time.time() - t0
    print(f"Model loaded in {load_time:.2f}s")

    print("\nAvailable male voices:")
    for v in kokoro.get_voices():
        if v.startswith(("am_", "bm_", "em_", "hm_", "im_", "jm_", "pm_", "zm_")):
            print(f"  {v}")

    print(f"\nGenerating speech with voice '{VOICE}'...")
    print(f"Text: \"{TEXT}\"")
    t0 = time.time()
    audio, sample_rate = kokoro.create(TEXT, voice=VOICE, speed=1.0, lang="en-gb")
    gen_time = time.time() - t0
    duration = len(audio) / sample_rate
    print(f"Generated {duration:.2f}s of audio in {gen_time:.2f}s (RTF: {gen_time/duration:.2f})")

    sf.write(OUTPUT_PATH, audio, sample_rate)
    print(f"\nSaved to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
