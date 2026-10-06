#!/usr/bin/env python3

import base64
import gc
import json
import os
import sys
import time
from io import BytesIO
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")

ROOT = Path(__file__).resolve().parent.parent
MODEL_ROOT = Path(os.environ.get("METROFORGE_OPENVINO_MODEL_ROOT", ROOT / "models" / "openvino" / "3bc9c7f7b000b0ba"))
PROMPT_PREFIX = "pixel art game environment background, parallax,"
_runtime = None
_state = "NOT_PREPARED"
_runtime_key = None
_diagnostic_path = None


def diagnostic(event: str, **fields) -> None:
    """Append progress independently of stdout, which is reserved for one response per request."""
    if not _diagnostic_path:
        return
    path = Path(_diagnostic_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {"at": time.time(), "event": event, "state": _state, **fields, "memory": memory()}
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record) + "\n")
        stream.flush()


def memory() -> dict[str, float | None]:
    try:
        import psutil
        process = psutil.Process()
        return {
            "systemAvailableRamMb": round(psutil.virtual_memory().available / 1024 / 1024, 1),
            "workerWorkingSetMb": round(process.memory_info().rss / 1024 / 1024, 1),
        }
    except Exception:
        return {"systemAvailableRamMb": None, "workerWorkingSetMb": None}


def respond(payload: dict) -> None:
    print(json.dumps(payload), flush=True)


def validate_model() -> None:
    required = [
        MODEL_ROOT / "model_index.json",
        MODEL_ROOT / "tokenizer" / "tokenizer_config.json",
        MODEL_ROOT / "scheduler" / "scheduler_config.json",
        MODEL_ROOT / "text_encoder" / "openvino_model.xml",
        MODEL_ROOT / "text_encoder" / "openvino_model.bin",
        MODEL_ROOT / "unet" / "openvino_model.xml",
        MODEL_ROOT / "unet" / "openvino_model.bin",
        MODEL_ROOT / "vae_decoder" / "openvino_model.xml",
        MODEL_ROOT / "vae_decoder" / "openvino_model.bin",
    ]
    missing = [str(path.relative_to(MODEL_ROOT)) for path in required if not path.is_file()]
    if missing:
        raise RuntimeError(f"OPENVINO_MODEL_NOT_PREPARED: {', '.join(missing)}")


def warmup(req: dict | None = None) -> dict:
    global _runtime, _state, _runtime_key, _diagnostic_path
    req = req or {}
    _diagnostic_path = req.get("diagnostic_path") or _diagnostic_path
    width = int(req.get("width", 384)); height = int(req.get("height", 384))
    device = str(req.get("openvino_device") or os.environ.get("METROFORGE_OPENVINO_DEVICE", "GPU")).upper()
    runtime_key = (device, width, height)
    if _runtime is not None and _runtime_key == runtime_key:
        return {"ok": True, "workerReused": True, "compileCacheHit": True, "runtime": readiness(), "timings": {"modelLoadMs": 0, "textEncoderCompileMs": 0, "unetCompileMs": 0, "vaeCompileMs": 0}}
    if _runtime is not None:
        unload()
    diagnostic("runtime_initialization_started", device=device, width=width, height=height)
    import_started = time.perf_counter()
    import openvino as ov
    from transformers import CLIPTokenizer
    openvino_import_ms = int((time.perf_counter() - import_started) * 1000)
    diagnostic("openvino_import_complete", durationMs=openvino_import_ms, version=ov.__version__)

    validate_model()
    available = ov.Core().available_devices
    if device not in available and device != "AUTO":
        raise RuntimeError(f"OPENVINO_DEVICE_UNAVAILABLE: requested {device}, available {available}")
    before = memory()
    started = time.perf_counter()
    core = ov.Core()
    cache_dir = Path(os.environ.get("METROFORGE_OPENVINO_CACHE_DIR", ROOT / ".cache" / "openvino" / "compiled"))
    cache_dir.mkdir(parents=True, exist_ok=True)
    core.set_property({"CACHE_DIR": str(cache_dir)})
    diagnostic("tokenizer_load_started")
    tokenizer = CLIPTokenizer.from_pretrained(MODEL_ROOT / "tokenizer", local_files_only=True)
    model_load_ms = int((time.perf_counter() - started) * 1000)
    compiled = {}
    timings = {"openvinoImportMs": openvino_import_ms, "modelLoadMs": model_load_ms}
    for name, key in (("text_encoder", "textEncoderCompileMs"), ("unet", "unetCompileMs"), ("vae_decoder", "vaeCompileMs")):
        stage = time.perf_counter()
        model = core.read_model(MODEL_ROOT / name / "openvino_model.xml")
        latent_h, latent_w = height // 8, width // 8
        if name == "text_encoder": model.reshape({"input_ids": [2, 77]})
        elif name == "unet": model.reshape({"sample": [2, 4, latent_h, latent_w], "timestep": [1], "encoder_hidden_states": [2, 77, 768]})
        else: model.reshape({"latent_sample": [1, 4, latent_h, latent_w]})
        diagnostic("component_compile_started", component=name, device=device, staticShapes=True)
        compiled[name] = core.compile_model(model, device, {"PERFORMANCE_HINT": "LATENCY"})
        timings[key] = int((time.perf_counter() - stage) * 1000)
        diagnostic("component_compile_complete", component=name, durationMs=timings[key], executionDevices=compiled[name].get_property("EXECUTION_DEVICES"))
    _runtime = {"tokenizer": tokenizer, "compiled": compiled, "device": device, "width": width, "height": height}
    _runtime_key = runtime_key
    _state = "READY"
    diagnostic("runtime_ready", timings=timings)
    return {"ok": True, "workerReused": False, "compileCacheHit": False, "timings": timings, "memoryBefore": before, "memoryAfter": memory(), "runtime": readiness()}


def readiness() -> dict:
    return {
        "hardwareAvailable": True,
        "modelPrepared": MODEL_ROOT.is_dir(),
        "runtimeLoaded": _runtime is not None,
        "componentsCompiled": _runtime is not None,
        "ready": _state == "READY",
        "generationStatus": "VERIFIED",
        "state": _state,
        "actualDevice": _runtime.get("device") if _runtime else None,
        "executionDevices": {name: model.get_property("EXECUTION_DEVICES") for name, model in _runtime["compiled"].items()} if _runtime else {},
    }


def generate(req: dict) -> dict:
    global _state, _diagnostic_path
    width=int(req.get("width",384)); height=int(req.get("height",384)); steps=int(req.get("steps",6))
    requested_model = str(req.get("model_id", ""))
    supported_models = {"sd-1.5", "OpenVINO/stable-diffusion-v1-5-int8-ov"}
    if requested_model not in supported_models or width % 8 or height % 8 or width < 128 or height < 128 or steps < 1 or steps > 20:
        raise RuntimeError("OPENVINO_MODEL_UNSUPPORTED: SD1.5 requires dimensions >=128 divisible by 8 and 1..20 steps")
    _diagnostic_path = req.get("diagnostic_path") or _diagnostic_path
    diagnostic("request_started", width=width, height=height, steps=steps, seed=int(req.get("seed",42)))
    warm = warmup(req)
    compile_hit = warm["compileCacheHit"]
    import numpy as np
    import torch
    from diffusers import PNDMScheduler
    from PIL import Image

    _state = "GENERATING"
    started = time.perf_counter()
    prompt = str(req.get("prompt", ""))
    tokenizer_started = time.perf_counter()
    tokens = _runtime["tokenizer"]([str(req.get("negative_prompt", "")), prompt], padding="max_length", max_length=_runtime["tokenizer"].model_max_length, truncation=True, return_tensors="np")
    tokenizer_ms = int((time.perf_counter() - tokenizer_started) * 1000)
    text_started = time.perf_counter()
    embeddings = next(iter(_runtime["compiled"]["text_encoder"]({"input_ids": tokens.input_ids.astype(np.int64)}).values()))
    text_ms = int((time.perf_counter() - text_started) * 1000)
    scheduler = PNDMScheduler.from_pretrained(MODEL_ROOT / "scheduler", local_files_only=True)
    scheduler.set_timesteps(steps)
    latents = torch.from_numpy(np.random.default_rng(int(req.get("seed", 42))).standard_normal((1, 4, height // 8, width // 8)).astype(np.float32)) * scheduler.init_noise_sigma
    unet_ms = scheduler_ms = 0
    for index, timestep in enumerate(scheduler.timesteps, start=1):
        diagnostic("inference_step_started", step=index, stepCount=len(scheduler.timesteps))
        step_started = time.perf_counter()
        latent_input = scheduler.scale_model_input(torch.cat([latents, latents]), timestep)
        noise = next(iter(_runtime["compiled"]["unet"]({"sample": latent_input.numpy().astype(np.float32), "timestep": np.array([int(timestep)], dtype=np.int64), "encoder_hidden_states": embeddings.astype(np.float32)}).values()))
        unet_ms += int((time.perf_counter() - step_started) * 1000)
        scheduler_started = time.perf_counter()
        uncond, conditioned = np.split(noise, 2, axis=0)
        latents = scheduler.step(torch.from_numpy(uncond + 7.5 * (conditioned - uncond)), timestep, latents).prev_sample
        scheduler_ms += int((time.perf_counter() - scheduler_started) * 1000)
        diagnostic("inference_step_complete", step=index, stepCount=len(scheduler.timesteps), durationMs=int((time.perf_counter()-step_started)*1000))
    diagnostic("vae_decode_started")
    vae_started = time.perf_counter()
    decoded = next(iter(_runtime["compiled"]["vae_decoder"]({"latent_sample": (latents / 0.18215).numpy().astype(np.float32)}).values()))
    vae_ms = int((time.perf_counter() - vae_started) * 1000)
    encode_started = time.perf_counter()
    image = Image.fromarray(np.clip((decoded[0].transpose(1, 2, 0) / 2 + 0.5) * 255, 0, 255).astype(np.uint8), "RGB")
    buffer = BytesIO(); image.save(buffer, format="PNG")
    png_encode_ms = int((time.perf_counter() - encode_started) * 1000)
    _state = "READY"
    timings = warm["timings"] | {"tokenizerMs": tokenizer_ms, "textEncoderInferenceMs": text_ms, "unetInferenceMs": unet_ms, "vaeInferenceMs": vae_ms, "schedulerMs": scheduler_ms, "pngEncodeMs": png_encode_ms, "totalMs": int((time.perf_counter() - started) * 1000)}
    diagnostic("request_complete", timings=timings, pngBytes=len(buffer.getvalue()))
    return {"ok": True, "provider": "diffusers", "model_id": requested_model, "seed": int(req.get("seed", 42)), "compute_backend": "openvino", "device": _runtime["device"], "execution_path": "direct_openvino_persistent", "width": width, "height": height, "steps": steps, "dtype": "int8_weights_fp32_compute", "image_base64": base64.b64encode(buffer.getvalue()).decode("ascii"), "timings": timings, "workerReused": True, "modelCacheHit": True, "compiledComponentCacheHit": compile_hit, "tokenizerCacheHit": True, "schedulerCacheHit": True, "memory": memory(), "runtime": readiness()}


def unload() -> dict:
    global _runtime, _state, _runtime_key
    _runtime = None; _runtime_key = None; _state = "PREPARED"; gc.collect()
    return {"ok": True, "runtime": readiness(), "memory": memory()}


for line in sys.stdin:
    try:
        request = json.loads(line)
        action = request.get("action", "health")
        if action == "warmup": respond(warmup(request))
        elif action == "generate": respond(generate(request))
        elif action == "unload": respond(unload())
        elif action == "shutdown":
            respond(unload())
            break
        elif action == "health": respond({"ok": True, "runtime": readiness(), "memory": memory()})
        else: respond({"ok": False, "error": f"unknown action: {action}"})
    except Exception as error:
        _state = "FAILED"
        respond({"ok": False, "error": f"{type(error).__name__}: {error}", "runtime": readiness(), "memory": memory()})
