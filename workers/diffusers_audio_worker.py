#!/usr/bin/env python3
"""Stable Audio Open worker for MetroForge AI (optional local music/SFX).

Actions: health, generate
"""

from __future__ import annotations

import base64
import json
import sys
from io import BytesIO
from typing import Any


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("empty stdin")
    return json.loads(raw)


def write_response(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def health_check() -> dict[str, Any]:
    try:
        import torch  # noqa: F401
        import diffusers  # noqa: F401

        return {"ok": True, "provider": "stable-audio", "cuda": torch.cuda.is_available()}
    except ImportError as exc:
        return {"ok": False, "error": str(exc), "provider": "stable-audio"}


_pipeline = None


def get_pipeline(model_id: str):
    global _pipeline
    if _pipeline is not None:
        return _pipeline

    import torch
    from diffusers import StableAudioPipeline

    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    pipe = StableAudioPipeline.from_pretrained(model_id, torch_dtype=dtype)
    if torch.cuda.is_available():
        pipe = pipe.to("cuda")
    _pipeline = pipe
    return _pipeline


def generate_audio(req: dict[str, Any]) -> dict[str, Any]:
    model_id = req.get("model_id", "stabilityai/stable-audio-open-1.0")
    prompt = req.get("prompt", "dark ambient metroidvania exploration loop")
    duration = float(req.get("duration", 8.0))
    seed = int(req.get("seed", 42))

    pipe = get_pipeline(model_id)

    import torch

    generator = torch.Generator(device="cuda" if torch.cuda.is_available() else "cpu").manual_seed(seed)
    result = pipe(prompt, num_inference_steps=8, audio_end_in_s=duration, generator=generator)
    audio = result.audios[0]

    import scipy.io.wavfile as wavfile
    import numpy as np

    buf = BytesIO()
    samples = np.asarray(audio).T
    wavfile.write(buf, pipe.vae.sampling_rate, samples)
    return {
        "ok": True,
        "provider": "stable-audio",
        "model_id": model_id,
        "sample_rate": pipe.vae.sampling_rate,
        "audio_base64": base64.b64encode(buf.getvalue()).decode("ascii"),
    }


def main() -> None:
    req = read_request()
    action = req.get("action", "health")

    if action == "health":
        write_response(health_check())
        return

    if action == "generate":
        try:
            write_response(generate_audio(req))
        except Exception as exc:
            write_response({"ok": False, "error": str(exc), "provider": "stable-audio"})
        return

    write_response({"ok": False, "error": f"unknown action: {action}"})


if __name__ == "__main__":
    main()
