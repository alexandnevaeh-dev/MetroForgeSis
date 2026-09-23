#!/usr/bin/env python3
"""Test-only stub worker: no third-party dependencies (stdlib only), no model load, no real
tokenizer. Speaks the identical stdin/stdout JSON protocol as workers/apple_mps_worker.py and
workers/diffusers_image_worker.py so DiffusersProvider's TS logic (steps precedence, provenance
field wiring, prompt-budget passthrough shape) can be regression-tested fast and deterministically
without spawning torch or the real ~5GB model. This must NEVER be pointed at by a real generation
path — it returns a fixed 1x1 transparent PNG, not real image content, and its "prompt budget" is
a hardcoded stand-in, not real tokenization.
"""
import base64
import hashlib
import json
import sys

# A real, valid 1x1 transparent PNG (67 bytes), used only so downstream base64-decode/sha256
# code paths have real bytes to operate on.
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def handle_health(_req):
    return {"ok": True, "readiness": "REFERENCE_CAPABLE", "compute_backends": {"stub": {"available": True, "device": "stub"}}}


def handle_check_prompt(req):
    # Deterministic stand-in "tokenizer": word count, NOT a real CLIP tokenization. Only used to
    # exercise the TS-side plumbing/shape; real budget enforcement is tested against the real
    # tokenizer separately (see prompt-budget.real-tokenizer.evidence.test.ts).
    def count(text):
        n = len((text or "").split())
        return {"text": text, "tokenCount": n, "maxTokens": 77, "overflow": n > 77, "overflowBy": max(0, n - 77)}
    positive = count(req.get("prompt", ""))
    negative = count(req.get("negative_prompt", ""))
    return {"ok": True, "modelPath": "stub", "tokenizerClass": "StubWordCountTokenizer", "positive": positive, "negative": negative, "anyOverflow": positive["overflow"] or negative["overflow"]}


def handle_generate(req):
    return {
        "ok": True,
        "provider": "diffusers",
        "model_id": req.get("model_id", "stub-model"),
        "seed": req.get("seed", 0),
        "device": "stub",
        "offload_strategy": "stub_no_gpu",
        "image_base64": base64.b64encode(TINY_PNG).decode("ascii"),
        "execution_path": "stub_test_worker",
        "timings": {"loadSeconds": 0, "generationSeconds": 0},
        "sourceHash": hashlib.sha256(TINY_PNG).hexdigest(),
        # Echo exactly what was received so tests can assert requested == effective.
        "effectivePrompt": req.get("prompt", ""),
        "effectiveNegativePrompt": req.get("negative_prompt", ""),
        "effectiveSteps": req.get("steps"),
        "effectiveGuidance": req.get("guidance"),
        "effectiveWidth": req.get("width"),
        "effectiveHeight": req.get("height"),
    }


def handle_segment_foreground(req):
    if not req.get("image_base64"):
        return {"ok": False, "error": "no image_base64"}
    # Stand-in "segmentation": echoes the input bytes back unchanged, NOT a real alpha matte.
    # Only exercises the TS-side plumbing (request shape, response decoding); real matte quality
    # is tested against the real U2NET model separately.
    return {"ok": True, "image_base64": req["image_base64"], "model": "stub-u2net", "modelVersion": "stub-v1", "occupancy": 0.5}


def main():
    raw = sys.stdin.read()
    req = json.loads(raw) if raw.strip() else {}
    action = req.get("action")
    if action == "health":
        response = handle_health(req)
    elif action == "check_prompt":
        response = handle_check_prompt(req)
    elif action == "generate":
        response = handle_generate(req)
    elif action == "segment_foreground":
        response = handle_segment_foreground(req)
    else:
        response = {"ok": False, "error": f"unknown action {action!r}"}
    print(json.dumps(response))
    return 0 if response.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
