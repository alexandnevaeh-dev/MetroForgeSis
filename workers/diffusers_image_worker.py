#!/usr/bin/env python3

"""Local SDXL image generation worker for MetroForge AI.

Reads JSON from stdin, writes JSON to stdout.
Actions: health, generate

Requires: pip install -r workers/requirements-diffusers.txt
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from io import BytesIO
from pathlib import Path
from typing import Any

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

SDXL_BASE_MODEL_ID = os.environ.get("DIFFUSERS_SDXL_BASE_MODEL_ID", "stabilityai/stable-diffusion-xl-base-1.0")
CONTROLNET_MODEL_ID = os.environ.get("DIFFUSERS_CONTROLNET_MODEL_ID", "diffusers/controlnet-canny-sdxl-1.0")
IP_ADAPTER_REPO = os.environ.get("DIFFUSERS_IP_ADAPTER_REPO", "h94/IP-Adapter")
IP_ADAPTER_WEIGHT = os.environ.get("DIFFUSERS_IP_ADAPTER_WEIGHT", "ip-adapter_sdxl.bin")
OPENVINO_SD15_MODEL_ID = os.environ.get(
    "METROFORGE_OPENVINO_SD15_MODEL_ID", "OpenVINO/stable-diffusion-v1-5-int8-ov"
)
OPENVINO_CACHE_ROOT = os.environ.get(
    "METROFORGE_OPENVINO_MODEL_CACHE", os.path.join(os.path.dirname(__file__), "..", "models", "openvino")
)
OPENVINO_CACHE_ROOT = os.path.abspath(OPENVINO_CACHE_ROOT)

_pipeline = None
_pipeline_key = None
_img2img_pipeline = None
_img2img_pipeline_key = None
_controlnet_pipeline = None
_controlnet_pipeline_key = None
_ip_adapter_pipeline = None
_ip_adapter_pipeline_key = None
_openvino_pipelines: dict[tuple[str, str, int, int], Any] = {}


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("empty stdin")
    return json.loads(raw)


def write_response(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def _package_version(name: str) -> str | None:
    try:
        from importlib.metadata import version
        return version(name)
    except Exception:
        return None


def _model_report(req: dict[str, Any]) -> dict[str, Any]:
    base_path = req.get("base_model_path") or os.environ.get("DIFFUSERS_BASE_MODEL_PATH")
    adapter_path = req.get("ip_adapter_path") or os.environ.get("DIFFUSERS_IP_ADAPTER_PATH")
    return {
        "base_model_id": req.get("model_id") or SDXL_BASE_MODEL_ID,
        "base_model_path": base_path,
        "base_model_installed": bool(base_path and os.path.isdir(str(base_path))),
        "ip_adapter_repo": req.get("ip_adapter_repo") or IP_ADAPTER_REPO,
        "ip_adapter_weight": req.get("ip_adapter_weight") or IP_ADAPTER_WEIGHT,
        "ip_adapter_path": adapter_path,
        "ip_adapter_installed": bool(adapter_path and os.path.isfile(str(adapter_path))),
    }


def _model_is_cached(model_id: str) -> bool:
    try:
        from huggingface_hub import scan_cache_dir

        for repo in scan_cache_dir().repos:
            if repo.repo_id != model_id:
                continue
            return any(
                (revision.snapshot_path / "model_index.json").is_file()
                and (
                    (revision.snapshot_path / "unet" / "diffusion_pytorch_model.safetensors").is_file()
                    or (revision.snapshot_path / "unet" / "diffusion_pytorch_model.bin").is_file()
                )
                for revision in repo.revisions
            )
    except Exception:
        return False
    return False


def _ensure_model_available(model_id: str) -> dict[str, Any]:
    # A registered local model is a directory, not a Hugging Face repository ID.
    if os.path.isdir(model_id):
        if not os.path.isfile(os.path.join(model_id, "model_index.json")):
            raise ValueError(f"Local model is missing model_index.json: {model_id}")
        return {"cached_before": True, "downloaded": False, "download_ms": 0, "cached_after": True}
    if os.path.isabs(model_id):
        raise ValueError(f"Local model directory does not exist: {model_id}")
    cached_before = _model_is_cached(model_id)
    download_ms = 0
    if not cached_before:
        from huggingface_hub import snapshot_download

        download_start = time.perf_counter()
        snapshot_download(repo_id=model_id, max_workers=1)
        download_ms = int((time.perf_counter() - download_start) * 1000)
    return {
        "cached_before": cached_before,
        "downloaded": not cached_before,
        "download_ms": download_ms,
        "cached_after": _model_is_cached(model_id),
    }


def _cpu_dtype_for_runtime() -> str:
    import torch

    if hasattr(torch, "bfloat16") and hasattr(torch.cpu, "is_bf16_supported"):
        try:
            if torch.cpu.is_bf16_supported():
                return "bfloat16"
        except Exception:
            pass
    return "float32"


def _openvino_probe() -> dict[str, Any]:
    try:
        import openvino as ov

        core = ov.Core()
        devices = list(core.available_devices)
        gpu_present = any(str(device).upper().startswith("GPU") for device in devices)
        return {
            "installed": True,
            "available": bool(devices),
            "gpuAvailable": gpu_present,
            "devices": devices,
        }
    except Exception as exc:
        return {
            "installed": False,
            "available": False,
            "gpuAvailable": False,
            "devices": [],
            "error": str(exc),
        }


def _openvino_generation_probe() -> dict[str, Any]:
    status = _openvino_probe()
    if not status.get("gpuAvailable"):
        return {**status, "supportsGeneration": False}
    try:
        from optimum.intel import OVDiffusionPipeline  # noqa: F401

        return {**status, "supportsGeneration": True, "generationStatus": "VERIFIED"}
    except Exception as exc:
        return {**status, "supportsGeneration": False, "generationError": str(exc)}


def _openvino_model_supported(model_id: str) -> bool:
    return model_id in {"sd-1.5", "runwayml/stable-diffusion-v1-5", OPENVINO_SD15_MODEL_ID}


def _openvino_model_prepared(req: dict[str, Any]) -> bool:
    source_model_id = str(req.get("openvino_model_id") or OPENVINO_SD15_MODEL_ID)
    revision = req.get("revision") if isinstance(req.get("revision"), str) else None
    try:
        _validate_openvino_model(_openvino_model_path(source_model_id, revision))
        return True
    except RuntimeError:
        return False


def _backend_catalog() -> dict[str, Any]:
    import torch

    openvino = _openvino_generation_probe()
    cuda_available = bool(torch.cuda.is_available())
    cpu_available = True
    compute_backends = {
        "cuda": {
            "available": cuda_available,
            "device": "cuda" if cuda_available else None,
            "dtype": "float16" if cuda_available else None,
            "supportsGeneration": cuda_available,
        },
        "openvino_gpu": {
            "available": bool(openvino.get("available") and openvino.get("gpuAvailable")),
            "device": "GPU" if openvino.get("gpuAvailable") else None,
            "dtype": "int8",
            "supportsGeneration": bool(openvino.get("supportsGeneration")),
            "generationStatus": openvino.get("generationStatus", "UNAVAILABLE"),
        },
        "cpu": {
            "available": cpu_available,
            "device": "cpu",
            "dtype": _cpu_dtype_for_runtime(),
            "supportsGeneration": cpu_available,
        },
    }
    recommended = "cuda" if compute_backends["cuda"]["available"] else "cpu"
    return {
        "computeBackends": compute_backends,
        "recommendedBackend": recommended,
        "cpuAvailable": cpu_available,
        "cudaAvailable": cuda_available,
        "openvino": openvino,
    }


def health_check(req: dict[str, Any]) -> dict[str, Any]:
    if req.get("quick"):
        import importlib.util

        required = ("torch", "diffusers", "transformers", "accelerate")
        missing = [name for name in required if importlib.util.find_spec(name) is None]
        return {
            "ok": not missing,
            "provider": "diffusers",
            "readiness": "RUNTIME_DISCOVERED" if not missing else "RUNTIME_NOT_INSTALLED",
            "runtime": {"discovery": "module_specs_present", "missing": missing},
            "compute_backends": {"local_runtime": {"available": not missing}},
        }
    try:
        import torch
        import diffusers
        import transformers
        import accelerate

        devices = []
        for index in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(index)
            devices.append({
                "index": index,
                "name": torch.cuda.get_device_name(index),
                "vram_bytes": props.total_memory,
                "compute_capability": f"{props.major}.{props.minor}",
                "allocated_bytes": torch.cuda.memory_allocated(index),
                "reserved_bytes": torch.cuda.memory_reserved(index),
            })
        runtime = {
            "python": sys.version.split()[0],
            "torch": _package_version("torch"),
            "torch_cuda": getattr(torch.version, "cuda", None),
            "diffusers": getattr(diffusers, "__version__", _package_version("diffusers")),
            "transformers": getattr(transformers, "__version__", _package_version("transformers")),
            "accelerate": _package_version("accelerate"),
            "safetensors": _package_version("safetensors"),
            "pillow": _package_version("Pillow"),
            "cuda_available": bool(torch.cuda.is_available()),
            "cuda_device_count": torch.cuda.device_count(),
            "devices": devices,
        }
        backends = _backend_catalog()
        models = _model_report(req)
        selected_backend = _resolve_backend(req)
        openvino_prepared = _openvino_model_prepared(req)
        any_backend = any(info.get("available") for info in backends["computeBackends"].values())
        readiness = (
            "MODEL_NOT_INSTALLED" if not models["base_model_installed"] else
            "ADAPTER_NOT_INSTALLED" if not models["ip_adapter_installed"] else
            "REFERENCE_CAPABLE"
        )
        return {
            "ok": bool(any_backend),
            "cuda": bool(torch.cuda.is_available()),
            "provider": "diffusers",
            "runtime": {**runtime, **backends},
            "models": models,
            "openvino_model_prepared": openvino_prepared,
            "readiness": readiness,
            "compute_backends": backends["computeBackends"],
            "selected_backend": selected_backend,
            "dtype": backends["computeBackends"][selected_backend]["dtype"],
            "recommended_backend": backends["recommendedBackend"],
        }
    except ImportError as exc:
        return {
            "ok": False,
            "error": str(exc),
            "provider": "diffusers",
            "readiness": "RUNTIME_NOT_INSTALLED",
            "compute_backends": {
                "cuda": {"available": False},
                "openvino_gpu": {"available": False},
                "cpu": {"available": False},
            },
        }


def _prepare_init_image(req: dict[str, Any], width: int, height: int):
    from PIL import Image

    init_b64 = req.get("init_image_base64")
    if not init_b64:
        return None

    raw = base64.b64decode(init_b64)
    image = Image.open(BytesIO(raw)).convert("RGB")
    return image.resize((width, height))


def _canny_control_image(image):
    """Build a Canny edge map suitable for SDXL ControlNet."""
    try:
        import cv2
        import numpy as np

        arr = np.array(image.convert("RGB"))
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 100, 200)
        edges_rgb = np.stack([edges, edges, edges], axis=-1)
        from PIL import Image

        return Image.fromarray(edges_rgb)
    except ImportError:
        from PIL import ImageFilter

        return image.convert("L").filter(ImageFilter.FIND_EDGES).convert("RGB")


def _torch_dtype(device: str | None = None):
    import torch

    requested = (device or "cpu").lower()
    if requested == "cuda" and torch.cuda.is_available():
        return torch.float16
    if requested == "openvino_gpu":
        return torch.float32
    if requested == "cpu":
        if hasattr(torch, "bfloat16") and hasattr(torch.cpu, "is_bf16_supported"):
            try:
                if torch.cpu.is_bf16_supported():
                    return torch.bfloat16
            except Exception:
                pass
        return torch.float32
    return torch.float16 if torch.cuda.is_available() else torch.float32


def _resolve_backend(req: dict[str, Any]) -> str:
    value = str(
        req.get("compute_backend")
        or req.get("device")
        or req.get("backend")
        or os.environ.get("METROFORGE_DIFFUSION_DEVICE")
        or os.environ.get("DIFFUSERS_DEVICE")
        or "auto"
    ).strip().lower()
    if value in ("", "auto"):
        backends = _backend_catalog()["computeBackends"]
        if backends["cuda"]["available"]:
            return "cuda"
        if (
            backends["openvino_gpu"]["supportsGeneration"]
            and _openvino_model_supported(str(req.get("model_id", "")))
            and _openvino_model_prepared(req)
        ):
            return "openvino_gpu"
        return "cpu"
    if value in {"cuda", "cpu"}:
        return value
    if value == "openvino_gpu":
        backend = _backend_catalog()["computeBackends"]["openvino_gpu"]
        if not backend["supportsGeneration"]:
            raise RuntimeError("OPENVINO_GPU_UNAVAILABLE")
        if not _openvino_model_supported(str(req.get("model_id", ""))):
            raise RuntimeError("OPENVINO_MODEL_UNSUPPORTED")
        if not _openvino_model_prepared(req):
            raise RuntimeError("OPENVINO_MODEL_NOT_PREPARED")
        return value
    return "cpu"


def _cpu_offload_enabled(device: str) -> bool:
    return device == "cuda" and os.environ.get("DIFFUSERS_CPU_OFFLOAD", "0").strip().lower() in {"1", "true", "yes"}


def _offload_strategy(device: str) -> str:
    if not _cpu_offload_enabled(device):
        return "none"
    strategy = os.environ.get("DIFFUSERS_OFFLOAD_STRATEGY", "model").strip().lower()
    if strategy not in {"model", "sequential"}:
        raise ValueError("DIFFUSERS_OFFLOAD_STRATEGY must be model or sequential")
    return strategy


def _move_pipe(pipe, device: str = "cpu"):
    import torch

    if device == "cuda" and torch.cuda.is_available():
        if _cpu_offload_enabled(device):
            strategy = _offload_strategy(device)
            offload = getattr(pipe, "enable_sequential_cpu_offload" if strategy == "sequential" else "enable_model_cpu_offload", None)
            if not callable(offload):
                raise RuntimeError("DIFFUSERS_CPU_OFFLOAD_UNSUPPORTED")
            # Accelerate moves active components to CUDA; do not preload the entire model there.
            offload()
            for method_name in ("enable_attention_slicing", "enable_vae_slicing", "enable_vae_tiling"):
                method = getattr(pipe, method_name, None)
                if callable(method):
                    method()
            return pipe
        return pipe.to("cuda")
    if hasattr(pipe, "to"):
        try:
            pipe = pipe.to("cpu")
        except Exception:
            pass
    if device == "cpu":
        for method_name in ("enable_attention_slicing", "enable_vae_slicing"):
            method = getattr(pipe, method_name, None)
            if callable(method):
                method()
    return pipe


def get_pipeline(model_id: str, device: str = "cpu", local_files_only: bool = False):
    global _pipeline, _pipeline_key
    key = (model_id, device, _offload_strategy(device))
    if _pipeline is not None and _pipeline_key == key:
        return _pipeline
    _pipeline = None
    _pipeline_key = None

    from diffusers import AutoPipelineForText2Image

    # Use installed half-precision weights without downloading duplicate full-precision files.
    load_options = {}
    if os.path.isfile(os.path.join(model_id, "unet", "diffusion_pytorch_model.fp16.safetensors")):
        load_options["variant"] = "fp16"
    pipe = AutoPipelineForText2Image.from_pretrained(
        model_id,
        torch_dtype=_torch_dtype(device),
        local_files_only=local_files_only,
        **load_options,
    )
    _pipeline = _move_pipe(pipe, device)
    _pipeline_key = key
    return _pipeline


def _openvino_model_path(source_model_id: str, revision: str | None) -> str:
    key = hashlib.sha256(f"{source_model_id}|{revision or 'main'}|int8|openvino".encode("utf-8")).hexdigest()[:16]
    return os.path.join(OPENVINO_CACHE_ROOT, key)


def _validate_openvino_model(path: str) -> None:
    required_files = (
        "model_index.json",
        os.path.join("unet", "openvino_model.xml"),
        os.path.join("unet", "openvino_model.bin"),
        os.path.join("vae_decoder", "openvino_model.xml"),
        os.path.join("vae_decoder", "openvino_model.bin"),
        os.path.join("text_encoder", "openvino_model.xml"),
        os.path.join("text_encoder", "openvino_model.bin"),
    )
    missing = [name for name in required_files if not os.path.isfile(os.path.join(path, name))]
    if missing:
        raise RuntimeError(f"OPENVINO_MODEL_CACHE_INVALID: missing {', '.join(missing)}")


def _classify_model_download_error(exc: Exception) -> str:
    message = str(exc).lower()
    if "getaddrinfo" in message or "name resolution" in message or "dns" in message:
        return "MODEL_DOWNLOAD_DNS_FAILED"
    if "401" in message or "403" in message or "authentication" in message or "token" in message:
        return "MODEL_DOWNLOAD_AUTH_FAILED"
    if "no space" in message or "disk" in message:
        return "MODEL_DOWNLOAD_DISK_FAILED"
    return "MODEL_DOWNLOAD_HTTP_FAILED"


def prepare_openvino_model(req: dict[str, Any]) -> dict[str, Any]:
    source_model_id = str(req.get("openvino_model_id") or OPENVINO_SD15_MODEL_ID)
    local_override = req.get("local_model_path") or os.environ.get("METROFORGE_SD15_MODEL_PATH")
    revision = req.get("revision") if isinstance(req.get("revision"), str) else None
    cache_path = _openvino_model_path(source_model_id, revision)
    if local_override:
        local_path = os.path.abspath(str(local_override))
        _validate_openvino_model(local_path)
        return {
            "ok": True,
            "provider": "diffusers",
            "compute_backend": "openvino_gpu",
            "source_model_id": source_model_id,
            "local_model_path": local_path,
            "model_prepared": True,
            "cached_before": True,
            "downloaded": False,
            "download_ms": 0,
            "local_override": True,
        }
    try:
        _validate_openvino_model(cache_path)
        return {
            "ok": True,
            "provider": "diffusers",
            "compute_backend": "openvino_gpu",
            "source_model_id": source_model_id,
            "local_model_path": cache_path,
            "model_prepared": True,
            "cached_before": True,
            "downloaded": False,
            "download_ms": 0,
        }
    except RuntimeError:
        pass

    from huggingface_hub import snapshot_download

    temporary_path = f"{cache_path}.partial"
    download_start = time.perf_counter()
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            source_path = snapshot_download(
                repo_id=source_model_id,
                revision=revision,
                local_files_only=False,
                max_workers=1,
                ignore_patterns=["safety_checker/*", "feature_extractor/*"],
            )
            _validate_openvino_model(source_path)
            shutil.rmtree(temporary_path, ignore_errors=True)
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            shutil.copytree(source_path, temporary_path)
            _validate_openvino_model(temporary_path)
            shutil.rmtree(cache_path, ignore_errors=True)
            os.replace(temporary_path, cache_path)
            return {
                "ok": True,
                "provider": "diffusers",
                "compute_backend": "openvino_gpu",
                "source_model_id": source_model_id,
                "local_model_path": cache_path,
                "model_prepared": True,
                "cached_before": False,
                "downloaded": True,
                "download_ms": int((time.perf_counter() - download_start) * 1000),
                "attempts": attempt,
            }
        except Exception as exc:
            last_error = exc
            shutil.rmtree(temporary_path, ignore_errors=True)
            if attempt < 3:
                time.sleep(attempt * 2)
    assert last_error is not None
    raise RuntimeError(f"{_classify_model_download_error(last_error)}: {last_error}") from last_error


def _get_openvino_pipeline(req: dict[str, Any], width: int, height: int):
    source_model_id = str(req.get("openvino_model_id") or OPENVINO_SD15_MODEL_ID)
    revision = req.get("revision")
    cache_path = _openvino_model_path(source_model_id, revision if isinstance(revision, str) else None)
    cache_key = (source_model_id, "GPU", width, height)
    if cache_key in _openvino_pipelines:
        return _openvino_pipelines[cache_key], {
            "source_model_id": source_model_id,
            "cache_path": cache_path,
            "conversion_required": False,
            "conversion_ms": 0,
            "cached_before": True,
        }, 0

    from optimum.intel import OVStableDiffusionPipeline

    _validate_openvino_model(cache_path)
    pipeline_start = time.perf_counter()
    with open(os.path.join(cache_path, "model_index.json"), encoding="utf-8") as model_index_file:
        model_index = json.load(model_index_file)
    pipe = OVStableDiffusionPipeline._from_pretrained(
        model_id=Path(cache_path),
        config=model_index,
        device="GPU",
        compile=False,
        safety_checker=None,
        local_files_only=True,
    )
    pipeline_load_ms = int((time.perf_counter() - pipeline_start) * 1000)

    pipe.to(device="GPU")
    if hasattr(pipe, "reshape"):
        pipe.reshape(batch_size=1, height=height, width=width, num_images_per_prompt=1)
    compile_start = time.perf_counter()
    pipe.compile()
    compile_ms = int((time.perf_counter() - compile_start) * 1000)
    actual_device = str(getattr(pipe, "device", ""))
    if "GPU" not in actual_device.upper():
        raise RuntimeError(f"OPENVINO_COMPILE_FAILED: pipeline compiled for {actual_device or 'unknown device'}")
    _openvino_pipelines[cache_key] = pipe
    return pipe, {
        "source_model_id": source_model_id,
        "cache_path": cache_path,
        "conversion_required": False,
        "conversion_ms": 0,
        "pipeline_load_ms": pipeline_load_ms,
        "cached_before": True,
    }, compile_ms


def _generate_openvino_image(req: dict[str, Any], full_prompt: str, width: int, height: int, steps: int, seed: int) -> dict[str, Any]:
    if req.get("conditioning_mode") or req.get("init_image_base64"):
        raise RuntimeError("OPENVINO_MODEL_UNSUPPORTED: conditioning is not implemented")
    if (width, height, steps, seed) != (384, 384, 6, 42):
        raise RuntimeError("OPENVINO_MODEL_UNSUPPORTED: only the verified SD1.5 384px preview profile is available")

    runner = Path(__file__).resolve().parent.parent / "scripts" / "validate-direct-openvino-gpu.py"
    result = subprocess.run([sys.executable, str(runner), "--child"], capture_output=True, text=True, cwd=runner.parent.parent)
    if result.returncode != 0:
        raise RuntimeError(f"OPENVINO_INFERENCE_FAILED: {result.stdout or result.stderr}")
    telemetry_path = Path(__file__).resolve().parent.parent / "test-artifacts" / "openvino-diffusion" / "openvino_sd15_direct_gpu_384.json"
    output_path = Path(__file__).resolve().parent.parent / "test-artifacts" / "openvino-diffusion" / "openvino_sd15_direct_gpu_384.png"
    telemetry = json.loads(telemetry_path.read_text(encoding="utf-8"))
    image = output_path.read_bytes()
    return {
        "ok": True,
        "provider": "diffusers",
        "model_id": req.get("model_id", "sd-1.5"),
        "seed": seed,
        "conditioning_mode": None,
        "compute_backend": "openvino_gpu",
        "device": telemetry["actualDevice"],
        "dtype": telemetry["precision"],
        "precision": telemetry["precision"],
        "steps": steps,
        "width": width,
        "height": height,
        "effective_prompt": full_prompt,
        "execution_path": telemetry["executionPath"],
        "compile_ms": telemetry["textEncoderCompileMs"] + telemetry["unetCompileMs"] + telemetry["vaeCompileMs"],
        "inference_ms": telemetry["textEncoderInferenceMs"] + telemetry["unetTotalInferenceMs"] + telemetry["vaeInferenceMs"],
        "duration_ms": telemetry["totalMs"],
        "total_ms": telemetry["totalMs"],
        "image_base64": base64.b64encode(image).decode("ascii"),
    }


def get_img2img_pipeline(model_id: str, device: str = "cpu"):
    global _img2img_pipeline, _img2img_pipeline_key
    key = (model_id, device, _offload_strategy(device))
    if _img2img_pipeline is not None and _img2img_pipeline_key == key:
        return _img2img_pipeline
    _img2img_pipeline = None
    _img2img_pipeline_key = None

    from diffusers import AutoPipelineForImage2Image

    # Match text-to-image loading for locally installed half-precision snapshots.
    load_options = {}
    if os.path.isfile(os.path.join(model_id, "unet", "diffusion_pytorch_model.fp16.safetensors")):
        load_options["variant"] = "fp16"
    pipe = AutoPipelineForImage2Image.from_pretrained(
        model_id, torch_dtype=_torch_dtype(device), **load_options
    )
    _img2img_pipeline = _move_pipe(pipe, device)
    _img2img_pipeline_key = key
    return _img2img_pipeline


def get_controlnet_pipeline(base_model_id: str, device: str = "cpu"):
    global _controlnet_pipeline, _controlnet_pipeline_key
    key = (base_model_id, device, _offload_strategy(device))
    if _controlnet_pipeline is not None and _controlnet_pipeline_key == key:
        return _controlnet_pipeline
    _controlnet_pipeline = None
    _controlnet_pipeline_key = None

    from diffusers import ControlNetModel, StableDiffusionXLControlNetPipeline

    controlnet = ControlNetModel.from_pretrained(CONTROLNET_MODEL_ID, torch_dtype=_torch_dtype(device))
    load_options = {}
    if os.path.isfile(os.path.join(base_model_id, "unet", "diffusion_pytorch_model.fp16.safetensors")):
        load_options["variant"] = "fp16"
    pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
        base_model_id,
        controlnet=controlnet,
        torch_dtype=_torch_dtype(device),
        **load_options,
    )
    _controlnet_pipeline = _move_pipe(pipe, device)
    _controlnet_pipeline_key = key
    return _controlnet_pipeline


def get_ip_adapter_pipeline(base_model_id: str, device: str = "cpu"):
    global _ip_adapter_pipeline, _ip_adapter_pipeline_key
    key = (base_model_id, device, _offload_strategy(device))
    if _ip_adapter_pipeline is not None and _ip_adapter_pipeline_key == key:
        return _ip_adapter_pipeline
    _ip_adapter_pipeline = None
    _ip_adapter_pipeline_key = None

    from diffusers import StableDiffusionXLPipeline

    load_options = {}
    if os.path.isfile(os.path.join(base_model_id, "unet", "diffusion_pytorch_model.fp16.safetensors")):
        load_options["variant"] = "fp16"
    pipe = StableDiffusionXLPipeline.from_pretrained(base_model_id, torch_dtype=_torch_dtype(device), **load_options)
    pipe.load_ip_adapter(
        IP_ADAPTER_REPO,
        subfolder="sdxl_models",
        weight_name=IP_ADAPTER_WEIGHT,
    )
    _ip_adapter_pipeline = _move_pipe(pipe, device)
    _ip_adapter_pipeline_key = key
    return _ip_adapter_pipeline


def generate_image(req: dict[str, Any]) -> dict[str, Any]:
    model_id = req.get("model_id", "stabilityai/sdxl-turbo")
    prompt = req.get("prompt", "game asset")
    negative = req.get("negative_prompt", "blurry, low quality, text, watermark")
    requested_backend = _resolve_backend(req)
    width = int(req.get("width", 512))
    height = int(req.get("height", 512))
    seed = int(req.get("seed", 42))
    steps = int(req.get("steps", 6 if requested_backend == "openvino_gpu" else 4 if "turbo" in model_id else 20))
    if requested_backend == "cpu":
        width = min(width, 512)
        height = min(height, 512)
        if "turbo" in model_id.lower():
            steps = min(steps, 8)
        elif "lightning" in model_id.lower():
            steps = min(steps, 10)
        else:
            steps = min(steps, 16)
    # The asset pipeline already supplies project style and framing. Preserve its
    # exact prompt so token-budget checks and execution provenance agree.
    full_prompt = prompt
    init_image = _prepare_init_image(req, width, height)
    conditioning_mode = req.get("conditioning_mode")
    conditioning_base_model = req.get("base_model_path") or os.environ.get("DIFFUSERS_BASE_MODEL_PATH") or SDXL_BASE_MODEL_ID
    strength = float(req.get("conditioning_strength", 0.65))

    if requested_backend == "openvino_gpu":
        return _generate_openvino_image(req, full_prompt, width, height, steps, seed)

    import torch

    compute_backend = requested_backend
    device = "cuda" if compute_backend == "cuda" and torch.cuda.is_available() else "cpu"
    generator = torch.Generator(device=device).manual_seed(seed)
    dtype = _torch_dtype(device)
    total_start = time.perf_counter()

    if init_image is not None and conditioning_mode == "controlnet_canny":
        pipe = get_controlnet_pipeline(conditioning_base_model, device)
        control_image = _canny_control_image(init_image)
        _assert_prompt_budget(pipe, full_prompt, negative)
        result = pipe(
            prompt=full_prompt,
            negative_prompt=negative,
            image=control_image,
            controlnet_conditioning_scale=strength,
            width=width,
            height=height,
            num_inference_steps=max(steps, 20),
            generator=generator,
        )
    elif init_image is not None and conditioning_mode == "ip_adapter":
        pipe = get_ip_adapter_pipeline(conditioning_base_model, device)
        pipe.set_ip_adapter_scale(strength)
        _assert_prompt_budget(pipe, full_prompt, negative)
        result = pipe(
            prompt=full_prompt,
            negative_prompt=negative,
            ip_adapter_image=init_image,
            width=width,
            height=height,
            num_inference_steps=max(steps, 20),
            generator=generator,
        )
    elif init_image is not None and conditioning_mode:
        pipe = get_img2img_pipeline(model_id, device)
        generation_options = {"guidance_scale": 0.0} if "turbo" in model_id.lower() else {}
        _assert_prompt_budget(pipe, full_prompt, negative)
        result = pipe(
            prompt=full_prompt,
            negative_prompt=negative,
            image=init_image,
            strength=strength,
            width=width,
            height=height,
            num_inference_steps=steps,
            generator=generator,
            **generation_options,
        )
    else:
        model_acquisition = _ensure_model_available(model_id)
        budget = check_prompt({"model_id": model_id, "prompt": full_prompt, "negative_prompt": negative})
        if budget["anyOverflow"]:
            raise ValueError("Prompt exceeds model token budget: " + json.dumps(budget))
        pipeline_start = time.perf_counter()
        pipe = get_pipeline(model_id, device, local_files_only=True)
        pipeline_load_ms = int((time.perf_counter() - pipeline_start) * 1000)
        inference_start = time.perf_counter()
        # Distilled Turbo models require classifier-free guidance to be disabled.
        generation_options = {"guidance_scale": 0.0} if "turbo" in model_id.lower() else {}
        _assert_prompt_budget(pipe, full_prompt, negative)
        result = pipe(
            prompt=full_prompt,
            negative_prompt=negative,
            width=width,
            height=height,
            num_inference_steps=steps,
            generator=generator,
            **generation_options,
        )
        inference_ms = int((time.perf_counter() - inference_start) * 1000)

    image = result.images[0]
    buf = BytesIO()
    image.save(buf, format="PNG")
    total_ms = int((time.perf_counter() - total_start) * 1000)

    return {
        "ok": True,
        "provider": "diffusers",
        "model_id": model_id,
        "seed": seed,
        "conditioning_mode": conditioning_mode,
        "compute_backend": compute_backend,
        "device": device,
        "offload_strategy": _offload_strategy(device),
        "dtype": str(dtype).replace("torch.", ""),
        "steps": steps,
        "width": width,
        "height": height,
        "effective_prompt": full_prompt,
        "effectivePrompt": full_prompt,
        "effectiveNegativePrompt": negative,
        "effectiveSteps": max(steps, 20) if init_image is not None and conditioning_mode == "controlnet_canny" else steps,
        "effectiveGuidance": getattr(pipe, "guidance_scale", None),
        "effectiveWidth": image.width,
        "effectiveHeight": image.height,
        "execution_path": "diffusers_torch_" + device,
        "timings": {"totalMs": total_ms},
        "model_acquisition": model_acquisition if init_image is None and not conditioning_mode else None,
        "pipeline_load_ms": pipeline_load_ms if init_image is None and not conditioning_mode else None,
        "inference_ms": inference_ms if init_image is None and not conditioning_mode else None,
        "duration_ms": total_ms,
        "total_ms": total_ms,
        "image_base64": base64.b64encode(buf.getvalue()).decode("ascii"),
    }


def _prompt_budget(tokenizers, prompt: str, negative: str) -> dict:
    if not tokenizers:
        raise ValueError("Model has no supported text tokenizer for budget validation")
    def side(text):
        checks = []
        for tokenizer in tokenizers:
            limit = int(tokenizer.model_max_length)
            if limit <= 0 or limit > 1000000:
                raise ValueError("Tokenizer does not declare a bounded context length")
            count = len(tokenizer(text, truncation=False, add_special_tokens=True)["input_ids"])
            checks.append((count, limit))
        count, limit = max(checks, key=lambda pair: pair[0] - pair[1])
        return {"text": text, "tokenCount": count, "maxTokens": limit,
                "overflow": count > limit, "overflowBy": max(0, count - limit)}
    positive, negative_side = side(prompt), side(negative)
    return {"ok": True, "tokenizerClass": ",".join(type(t).__name__ for t in tokenizers),
            "positive": positive, "negative": negative_side,
            "anyOverflow": positive["overflow"] or negative_side["overflow"]}


def check_prompt(req: dict) -> dict:
    from transformers import AutoTokenizer
    model = req.get("model_id", "stabilityai/sdxl-turbo")
    path = Path(model)
    if not path.is_dir():
        from huggingface_hub import snapshot_download
        path = Path(snapshot_download(model, local_files_only=True))
    index = json.loads((path / "model_index.json").read_text(encoding="utf-8"))
    names = [name for name, entry in index.items()
             if name.startswith("tokenizer") and isinstance(entry, list) and entry[-1]]
    tokenizers = [AutoTokenizer.from_pretrained(str(path / name), local_files_only=True) for name in names]
    return {**_prompt_budget(tokenizers, req.get("prompt", ""), req.get("negative_prompt", "")), "modelPath": str(path)}


def _assert_prompt_budget(pipe, prompt: str, negative: str) -> None:
    tokenizers = [getattr(pipe, name) for name in ("tokenizer", "tokenizer_2", "tokenizer_3")
                  if getattr(pipe, name, None) is not None]
    result = _prompt_budget(tokenizers, prompt, negative)
    if result["anyOverflow"]:
        raise ValueError("Prompt exceeds model token budget: " + json.dumps(result))


def main() -> None:
    req = read_request()
    action = req.get("action", "health")
    if action == "health":
        write_response(health_check(req))
        return
    if action == "check_prompt":
        try:
            write_response(check_prompt(req))
        except Exception as exc:
            write_response({"ok": False, "error": str(exc), "provider": "diffusers"})
        return
    if action == "prepare":
        try:
            write_response(prepare_openvino_model(req))
        except Exception as exc:
            write_response({"ok": False, "error": str(exc), "provider": "diffusers"})
        return
    if action == "generate":
        try:
            write_response(generate_image(req))
        except Exception as exc:
            write_response({"ok": False, "error": str(exc), "provider": "diffusers"})
        return
    write_response({"ok": False, "error": f"unknown action: {action}"})


if __name__ == "__main__":
    main()
