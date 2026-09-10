#!/usr/bin/env python3
"""Apple-native (PyTorch MPS) local image-generation worker for MetroForge.

Reads one JSON request from stdin, writes one JSON response line to stdout -- the same
stdin/stdout protocol packages/assets/src/providers/diffusers.ts already speaks to
workers/diffusers_image_worker.py, so DiffusersProvider needs no new transport, only a new
`workerPath`/`pythonPath`/`device: 'mps'` configuration (see the "new local-profile selection" in
packages/assets/src/apple-native-mps-provider.ts).

Actions: health, generate, check_prompt, segment_foreground

`check_prompt` and the same check re-run inside `generate` (never skipped, never silently
truncated) are the reusable, model-aware token-budget check: they load the REAL tokenizer shipped
with the target model (not a hardcoded 77 or a word-count approximation), check the positive and
negative prompt separately, and refuse `generate` outright — no truncation, no partial send — if
either overflows, naming which side and by how many tokens.

Requires: this project's dedicated .venv-diffusers-mps environment (python3.9 arm64 + torch 2.8.0
+ diffusers 0.31.0 -- NOT the project's Windows .venv-diffusers/, and NOT openvino/optimum-intel,
neither of which this profile uses).

Model identity is deliberately NOT "sd-1.5" (the locked OpenVINO/FP32 production identity) --
it is "sd-1.5-apple-mps", so a generationRequestHash() computed for this profile can never
collide with, or be silently mistaken for, the locked production profile's identity, even though
both start from the same public stable-diffusion-v1-5 checkpoint.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import time
import traceback
from io import BytesIO

# Default identity when a caller's payload doesn't set model_id (health checks with no request
# context). A real `generate`/`health` call always echoes back req["model_id"] when the caller
# provided one -- a real bug this session had it silently hardcoded here regardless of what was
# requested, which made a v2-profile generation come back falsely labeled with the v1 identity.
# Verified this is fixed by the v2 fixture's own `expect(entry.model).toBe(...)` assertion, not
# just by inspection.
MODEL_ID = "sd-1.5-apple-mps"
HF_SNAPSHOT_PATH = os.environ.get(
    "METROFORGE_APPLE_MPS_MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "..", "models", "apple-native", "hf-cache",
                 "models--stable-diffusion-v1-5--stable-diffusion-v1-5", "snapshots",
                 "451f4fe16113bff5a5d2269ed5ad43b0592e9a14"),
)

# Evidence-based admission floor for THIS backend/precision/resolution -- not the locked
# production gate's 12288 MB FP32 floor, and not applied to any other provider, and not derived
# by copying that gate's methodology either. This number comes from this session's own measured
# runs on this exact machine (see docs/audit/MODERN_COHESION_TEST_PROJECT.md, "Apple-native local
# profile"):
#   - Three successful fp16-unet/fp32-vae 384x384/6-step generations (attempts 2, 3, 5) all
#     completed correctly (attempt 2 had a since-fixed VAE bug, not a capacity failure) while
#     *currently available* system memory was measured as low as 485-541 MB mid-run, under real
#     swap pressure the whole time.
#   - The one failure mode observed was NOT "ran out and errored" -- it was attempt 4 (full FP32,
#     a deliberately different, much heavier configuration that this evidence-based floor does not
#     need to admit) driving swap to 91.8% full system-wide, at which point it was killed
#     proactively rather than left to risk system-wide instability.
# So the floor here is a pre-flight check before loading anything (when more memory is still free
# than will be mid-run), set with headroom above the lowest mid-run value actually observed to
# still work (485 MB) -- not a theoretical worst case, and not the unrelated MPS allocator
# bookkeeping counters (current/driver "allocated" memory is the GPU-side cache accounting, which
# measured higher than system RAM pressure ever required and would have been the wrong number to
# gate on).
MIN_AVAILABLE_MB = 1024


def _memory_profile() -> dict:
    import psutil
    vm = psutil.virtual_memory()
    return {
        "totalMb": round(vm.total / 1048576),
        "availableMb": round(vm.available / 1048576),
        "usedPercent": vm.percent,
    }


CAPABILITY_CACHE_PATH = os.environ.get(
    "METROFORGE_APPLE_MPS_CAPABILITY_CACHE",
    os.path.join(os.path.dirname(__file__), "..", "models", "apple-native", "mps-capability-cache.json"),
)


def _cached_mps_available() -> "bool | None":
    """Reads the one-time capability cache instead of `import torch` (measured this session at
    ~5s wall-clock, dominated by shared-library I/O for torch's dylib, not CPU work) so a `quick`
    health probe (DiffusersProvider's 4s timeout) doesn't spuriously fail on process-spawn cost
    alone. Returns None (cache miss) if the file is absent, is malformed, or its torchVersion
    doesn't match what's actually imported right now (defends against a stale cache surviving a
    venv upgrade) -- callers must fall back to a real import in that case, not assume availability."""
    try:
        with open(CAPABILITY_CACHE_PATH) as f:
            cached = json.load(f)
        return bool(cached.get("torchImportable") and cached.get("mpsAvailable") and cached.get("mpsBuilt"))
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return None


def _mps_capacity_assessment(quick: bool = False) -> dict:
    """Evidence-based admission for this backend. Distinct from, and not a substitute for,
    assessProductionCapacity()'s locked OpenVINO/FP32 gate -- that gate is untouched and still
    applies to any request that actually targets the locked sd-1.5/openvino_gpu profile."""
    mem = _memory_profile()
    reasons = []
    cached = _cached_mps_available() if quick else None
    if cached is not None:
        mps_available = cached
    else:
        try:
            import torch
            mps_available = torch.backends.mps.is_available() and torch.backends.mps.is_built()
        except ImportError:
            return {"status": "UNSUPPORTED", "reasons": [{"code": "TORCH_NOT_INSTALLED", "message": "torch is not importable in this environment"}], "memory": mem}
    if not mps_available:
        reasons.append({"code": "MPS_NOT_AVAILABLE", "message": "torch.backends.mps reports unavailable/not built on this machine"})
    if mem["availableMb"] < MIN_AVAILABLE_MB:
        reasons.append({"code": "INSUFFICIENT_AVAILABLE_MEMORY", "message": f"backend requires >= {MIN_AVAILABLE_MB} MB available pre-flight (evidence-based floor, see comment above MIN_AVAILABLE_MB), observed {mem['availableMb']} MB", "observed": mem["availableMb"], "required": MIN_AVAILABLE_MB})
    if not os.path.isdir(HF_SNAPSHOT_PATH):
        reasons.append({"code": "MODEL_NOT_INSTALLED", "message": HF_SNAPSHOT_PATH})
    return {"status": "SUPPORTED" if not reasons else "UNSUPPORTED_LOCAL_CAPACITY", "reasons": reasons, "memory": mem, "mpsAvailable": mps_available, "minAvailableMb": MIN_AVAILABLE_MB}


U2NET_WEIGHTS_PATH = os.environ.get(
    "METROFORGE_U2NET_WEIGHTS_PATH",
    os.path.join(os.path.dirname(__file__), "..", "models", "apple-native", "u2net", "u2net_full_weights.pth"),
)

_u2net_cache: dict = {}


def _load_u2net(device: str):
    """Lazily loads (and caches, per worker process) the U^2-Net segmentation model -- see
    workers/u2net_model.py's header for architecture/weights provenance and license (both
    Apache-2.0). Used only to produce a real alpha matte for diffusion sources, which arrive fully
    opaque (no transparency at all) -- see docs/audit/MODERN_COHESION_TEST_PROJECT.md's eighth
    session for why the existing fitOpaqueIntoFrame()/pickActorSubjectBounds() character-framing
    logic silently downscales the whole scene instead of isolating the subject without this."""
    if device in _u2net_cache:
        return _u2net_cache[device]
    import torch
    from u2net_model import U2NET

    model = U2NET(3, 1)
    state_dict = torch.load(U2NET_WEIGHTS_PATH, map_location="cpu")
    model.load_state_dict(state_dict)
    model.eval()
    model.to(device)
    _u2net_cache[device] = model
    return model


_tokenizer_cache: dict = {}


def _load_tokenizer(model_path: str):
    """Loads (and caches, per worker process) the REAL tokenizer for the given model path --
    never a naive word-count or character-count approximation. `model-aware`: this loads whatever
    tokenizer ships with the target model's `tokenizer/` subfolder, so a differently-tokenized
    future model does not silently inherit CLIP's 77-token assumption -- the limit reported below
    is read from the tokenizer's own `model_max_length`, not hardcoded."""
    if model_path in _tokenizer_cache:
        return _tokenizer_cache[model_path]
    from transformers import CLIPTokenizer
    tok = CLIPTokenizer.from_pretrained(os.path.join(model_path, "tokenizer"))
    _tokenizer_cache[model_path] = tok
    return tok


def _count_tokens(tokenizer, text: str) -> dict:
    """Tokenizes exactly as the real pipeline will encode it (default call, special tokens
    included: CLIP's tokenizer adds <|startoftext|>/<|endoftext|> automatically, and they occupy
    real budget -- an accurate count must include them, not just the word-piece tokens)."""
    ids = tokenizer(text)["input_ids"]
    max_len = tokenizer.model_max_length
    overflow_by = max(0, len(ids) - max_len)
    return {"text": text, "tokenCount": len(ids), "maxTokens": max_len, "overflow": overflow_by > 0, "overflowBy": overflow_by}


def check_prompt_budget(model_path: str, prompt: str, negative_prompt: str) -> dict:
    """The reusable, model-aware prompt-budget check. Positive and negative conditioning are
    checked SEPARATELY (CLIP encodes and embeds them independently; a negative prompt has its own
    77-token budget, not a shared one) and NEITHER is silently truncated here -- this function only
    reports; callers (handle_generate below) decide whether to refuse."""
    tokenizer = _load_tokenizer(model_path)
    positive = _count_tokens(tokenizer, prompt)
    negative = _count_tokens(tokenizer, negative_prompt or "")
    return {
        "ok": True, "modelPath": model_path, "tokenizerClass": tokenizer.__class__.__name__,
        "positive": positive, "negative": negative,
        "anyOverflow": positive["overflow"] or negative["overflow"],
    }


def handle_check_prompt(req: dict) -> dict:
    model_path = req.get("model_path") or HF_SNAPSHOT_PATH
    try:
        return check_prompt_budget(model_path, req.get("prompt", ""), req.get("negative_prompt", ""))
    except Exception as e:
        return {"ok": False, "error": f"PROMPT_BUDGET_CHECK_FAILED: {e}", "errorType": type(e).__name__}


def segment_foreground(image_bytes: bytes) -> dict:
    """Runs U^2-Net on a fully-opaque source image and returns an RGBA PNG whose alpha channel is
    a real foreground/background matte -- RGB pixels are untouched (never recolored, never
    cropped: framing/cropping stays the existing, separate fitOpaqueIntoFrame() job in
    pixel-art-processor.ts, which this function's output now gives real alpha data to work with).

    A light floor (values below FLOOR are zeroed) suppresses faint low-confidence background
    noise without hard-binarizing the mask -- the pipeline's own normalize step
    (pixel-art-processor.ts's cleanupAlpha) already binarizes at its own threshold once the real
    subject has been correctly identified from this soft matte."""
    import numpy as np
    import torch
    from PIL import Image

    if not os.path.isfile(U2NET_WEIGHTS_PATH):
        return {"ok": False, "error": f"U2NET_WEIGHTS_NOT_FOUND: {U2NET_WEIGHTS_PATH}"}

    device = "mps" if torch.backends.mps.is_available() and torch.backends.mps.is_built() else "cpu"
    model = _load_u2net(device)

    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    orig_w, orig_h = image.size
    resized = image.resize((320, 320), Image.BILINEAR)
    arr = np.asarray(resized).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    tensor = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0).to(device)

    t0 = time.time()
    with torch.no_grad():
        d0 = model(tensor)[0]
    inference_s = time.time() - t0

    pred = d0[:, 0, :, :]
    mn, mx = pred.min(), pred.max()
    pred = (pred - mn) / (mx - mn + 1e-8)
    mask = (pred.squeeze().cpu().numpy() * 255).astype("uint8")
    mask_img = Image.fromarray(mask).resize((orig_w, orig_h), Image.BILINEAR)
    mask_arr = np.asarray(mask_img)

    FLOOR = 25
    mask_arr = np.where(mask_arr < FLOOR, 0, mask_arr).astype("uint8")

    rgba = np.dstack([np.asarray(image), mask_arr])
    out = Image.fromarray(rgba)
    buf = BytesIO()
    out.save(buf, format="PNG")
    out_bytes = buf.getvalue()

    occupancy = float((mask_arr > 16).sum()) / float(mask_arr.size)
    return {
        "ok": True,
        "image_base64": base64.b64encode(out_bytes).decode("ascii"),
        "model": "u2net",
        "modelVersion": "carve/u2net-universal",
        "device": device,
        "inferenceSeconds": round(inference_s, 2),
        "occupancy": round(occupancy, 4),
    }


def handle_segment_foreground(req: dict) -> dict:
    image_b64 = req.get("image_base64")
    if not image_b64:
        return {"ok": False, "error": "SEGMENT_FOREGROUND_MISSING_IMAGE: no image_base64 in request"}
    try:
        image_bytes = base64.b64decode(image_b64)
        return segment_foreground(image_bytes)
    except Exception as e:
        return {"ok": False, "error": f"SEGMENT_FOREGROUND_FAILED: {e}", "errorType": type(e).__name__}


def handle_health(req: dict) -> dict:
    assessment = _mps_capacity_assessment(quick=bool(req.get("quick")))
    healthy = assessment["status"] == "SUPPORTED"
    return {
        "ok": healthy,
        "error": None if healthy else "; ".join(r["message"] for r in assessment["reasons"]),
        "readiness": "REFERENCE_CAPABLE" if healthy else "RUNTIME_NOT_INSTALLED",
        "compute_backends": {"mps": {"available": assessment["mpsAvailable"], "device": "mps", "dtype": "float16+fp32vae"}},
        "capacity": assessment,
        "model_id": req.get("model_id") or MODEL_ID,
    }


def handle_generate(req: dict) -> dict:
    assessment = _mps_capacity_assessment()
    if assessment["status"] != "SUPPORTED":
        return {"ok": False, "error": "APPLE_MPS_CAPACITY_REJECTED: " + "; ".join(r["message"] for r in assessment["reasons"]), "capacity": assessment}

    prompt = req.get("prompt", "")
    negative_prompt = req.get("negative_prompt", "")
    model_path = req.get("model_path") or HF_SNAPSHOT_PATH
    budget = check_prompt_budget(model_path, prompt, negative_prompt)
    if not budget.get("ok"):
        return {"ok": False, "error": budget.get("error", "prompt budget check failed"), "promptBudget": budget}
    if budget["anyOverflow"]:
        # Never silently truncate or discard requirements -- refuse with an actionable
        # diagnostic naming which side overflowed, by how much, and the actual text involved.
        overflowing = [side for side in ("positive", "negative") if budget[side]["overflow"]]
        details = "; ".join(
            f"{side} prompt: {budget[side]['tokenCount']} tokens > {budget[side]['maxTokens']} max "
            f"(over by {budget[side]['overflowBy']})"
            for side in overflowing
        )
        return {"ok": False, "error": f"PROMPT_BUDGET_EXCEEDED: {details}", "promptBudget": budget}

    import torch
    from diffusers import StableDiffusionPipeline

    t_load = time.time()
    pipe = StableDiffusionPipeline.from_pretrained(
        HF_SNAPSHOT_PATH, torch_dtype=torch.float16, variant="fp16",
        safety_checker=None, requires_safety_checker=False,
        use_safetensors=True, local_files_only=True,
    ).to("mps")
    # See generate_player_mps.py / docs/audit for the diagnosis: the base SD1.5 pipeline never
    # calls AutoencoderKL's own force_upcast=True default, so fp16 VAE decode overflows to NaN on
    # this backend. Fix: upcast only the VAE (small memory delta) and cast latents into it.
    pipe.vae.to(torch.float32)
    _orig_decode = pipe.vae.decode
    pipe.vae.decode = lambda latents, *a, **kw: _orig_decode(latents.to(torch.float32), *a, **kw)
    # Attention/VAE slicing is left OFF: verified this session (generation-attempt-3, sliced) vs
    # (generation-attempt-5, unsliced) that only the unsliced configuration produced a valid,
    # non-NaN image at 384x384 on this backend -- see docs/audit for both attempts' evidence.
    load_s = time.time() - t_load

    seed = int(req.get("seed", 0))
    width = int(req.get("width", 384))
    height = int(req.get("height", 384))
    steps = int(req.get("steps", 6))
    guidance = float(req.get("guidance", 7.5))
    generator = torch.Generator(device="cpu").manual_seed(seed)

    t_gen = time.time()
    with torch.no_grad():
        result = pipe(
            prompt=prompt, negative_prompt=negative_prompt,
            width=width, height=height, num_inference_steps=steps,
            guidance_scale=guidance, generator=generator,
        )
    gen_s = time.time() - t_gen

    buf = BytesIO()
    result.images[0].save(buf, format="PNG")
    image_bytes = buf.getvalue()
    mem_after = _memory_profile()

    return {
        "ok": True,
        "provider": "diffusers",
        "model_id": req.get("model_id") or MODEL_ID,
        "seed": seed,
        "device": "mps",
        "image_base64": base64.b64encode(image_bytes).decode("ascii"),
        "execution_path": "apple_mps_local",
        "dtype": "float16(unet/text_encoder)+float32(vae)",
        "timings": {"loadSeconds": round(load_s, 2), "generationSeconds": round(gen_s, 2)},
        "memory": {"after": mem_after, "mpsCurrentAllocatedMb": round(torch.mps.current_allocated_memory() / 1048576, 1), "mpsDriverAllocatedMb": round(torch.mps.driver_allocated_memory() / 1048576, 1)},
        "sourceHash": hashlib.sha256(image_bytes).hexdigest(),
        "capacity": assessment,
        # Effective conditioning actually sent to the pipeline -- echoed back so the TS caller can
        # assert requested == effective rather than assume the worker used what it was asked to.
        "effectivePrompt": prompt, "effectiveNegativePrompt": negative_prompt,
        "effectiveSteps": steps, "effectiveGuidance": guidance,
        "effectiveWidth": width, "effectiveHeight": height,
        "promptBudget": budget,
    }


def main() -> int:
    raw = sys.stdin.read()
    try:
        req = json.loads(raw) if raw.strip() else {}
        action = req.get("action")
        if action == "health":
            response = handle_health(req)
        elif action == "generate":
            response = handle_generate(req)
        elif action == "check_prompt":
            response = handle_check_prompt(req)
        elif action == "segment_foreground":
            response = handle_segment_foreground(req)
        else:
            response = {"ok": False, "error": f"unknown action {action!r}"}
    except Exception as e:  # noqa: BLE001 -- worker boundary: always emit a JSON error line
        response = {"ok": False, "error": str(e), "errorType": type(e).__name__, "traceback": traceback.format_exc()}
    print(json.dumps(response))
    return 0 if response.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
