#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_ROOT = ROOT / "models" / "openvino" / "3bc9c7f7b000b0ba"
ARTIFACTS = ROOT / "test-artifacts" / "openvino-diagnostics"
SUMMARY_PATH = ARTIFACTS / "diagnostic_summary.json"
LOG_PATH = ARTIFACTS / "diagnostic.log"
DEVICE_PATH = ARTIFACTS / "device_properties.json"
COMPONENTS = {
    "text_encoder": MODEL_ROOT / "text_encoder" / "openvino_model.xml",
    "unet": MODEL_ROOT / "unet" / "openvino_model.xml",
    "vae_decoder": MODEL_ROOT / "vae_decoder" / "openvino_model.xml",
}


def memory_snapshot() -> dict[str, int | None]:
    try:
        import psutil

        virtual = psutil.virtual_memory()
        process = psutil.Process()
        return {"availablePhysicalRamBytes": virtual.available, "processWorkingSetBytes": process.memory_info().rss}
    except Exception:
        return {"availablePhysicalRamBytes": None, "processWorkingSetBytes": None}


def supported_property(core, device: str, name: str):
    try:
        value = core.get_property(device, name)
        if isinstance(value, (str, int, float, bool, type(None))):
            return value
        if isinstance(value, (list, tuple)):
            return [str(item) for item in value]
        return str(value)
    except Exception as error:
        return {"unsupported": str(error)}


def run_stage(stage: str) -> dict[str, object]:
    import numpy as np
    import openvino as ov

    core = ov.Core()
    if stage == "core":
        devices = list(core.available_devices)
        properties = {
            name: supported_property(core, "GPU", name)
            for name in ("FULL_DEVICE_NAME", "SUPPORTED_PROPERTIES", "OPTIMIZATION_CAPABILITIES", "DEVICE_TYPE")
        }
        return {"devices": devices, "gpuProperties": properties}

    if stage == "tiny_gpu":
        parameter = ov.opset13.parameter([1], ov.Type.f32, name="input")
        constant = ov.opset13.constant(np.array([2.0], dtype=np.float32))
        model = ov.Model([ov.opset13.result(ov.opset13.add(parameter, constant))], [parameter], "tiny_add")
        compiled = core.compile_model(model, "GPU")
        result = compiled({"input": np.array([3.0], dtype=np.float32)})
        value = float(next(iter(result.values())).reshape(-1)[0])
        if value != 5.0:
            raise RuntimeError(f"Tiny GPU result mismatch: {value}")
        return {"result": value, "device": "GPU"}

    if stage.startswith("optimum_"):
        from optimum.intel import OVStableDiffusionPipeline

        with (MODEL_ROOT / "model_index.json").open(encoding="utf-8") as model_index_file:
            model_index = json.load(model_index_file)
        # Optimum Intel 2.1.0 misclassifies absolute Windows paths in its public loader.
        # Keep the workaround isolated here until that release supports local IR paths.
        pipeline = OVStableDiffusionPipeline._from_pretrained(
            model_id=MODEL_ROOT,
            config=model_index,
            device="GPU",
            compile=False,
            safety_checker=None,
            local_files_only=True,
        )
        if stage == "optimum_load":
            return {"device": str(pipeline.device), "modelRoot": str(MODEL_ROOT)}
        pipeline.to(device="GPU")
        pipeline.reshape(batch_size=1, height=384, width=384, num_images_per_prompt=1)
        pipeline.compile()
        if stage == "optimum_compile":
            return {"device": str(pipeline.device)}
        result = pipeline(
            prompt=(
                "pixel art game environment background, parallax, top-down fantasy stone combat arena, "
                "orthographic game environment, clear walkable center, simple stone obstacles, "
                "readable gameplay composition, game environment concept art"
            ),
            height=384,
            width=384,
            num_inference_steps=6,
            num_images_per_prompt=1,
            generator=42,
        )
        image = result.images[0]
        if image.size != (384, 384):
            raise RuntimeError(f"Unexpected inference dimensions: {image.size}")
        return {"device": str(pipeline.device), "imageSize": list(image.size)}

    component, action = stage.rsplit("_", 1)
    path = COMPONENTS[component]
    if not path.is_file() or not path.with_suffix(".bin").is_file():
        raise RuntimeError(f"Missing IR pair for {component}: {path}")
    model = core.read_model(path)
    if action == "read":
        return {"component": component, "xml": str(path), "inputs": len(model.inputs), "outputs": len(model.outputs)}
    device = "CPU" if action == "cpu" else "GPU"
    core.compile_model(model, device)
    return {"component": component, "device": device}


def child_main(stage: str) -> int:
    started = time.perf_counter()
    before = memory_snapshot()
    try:
        detail = run_stage(stage)
        payload = {"ok": True, "stage": stage, "durationMs": int((time.perf_counter() - started) * 1000), "memoryBefore": before, "memoryAfter": memory_snapshot(), "detail": detail}
        print(json.dumps(payload, default=str))
        return 0
    except Exception as error:
        payload = {"ok": False, "stage": stage, "durationMs": int((time.perf_counter() - started) * 1000), "memoryBefore": before, "memoryAfter": memory_snapshot(), "error": f"{type(error).__name__}: {error}"}
        print(json.dumps(payload, default=str))
        return 1


def exit_hex(code: int) -> str:
    return f"0x{code & 0xFFFFFFFF:08X}"


def parent_main() -> int:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    stages = ["core", "tiny_gpu"]
    for component in COMPONENTS:
        stages.extend((f"{component}_read", f"{component}_cpu", f"{component}_gpu"))
    stages.extend(("optimum_load", "optimum_compile", "optimum_inference"))
    records: list[dict[str, object]] = []
    device_properties: dict[str, object] = {}
    with LOG_PATH.open("w", encoding="utf-8") as log:
        for stage in stages:
            started_at = datetime.now(timezone.utc).isoformat()
            started = time.perf_counter()
            command = [sys.executable, str(Path(__file__).resolve()), "--stage", stage]
            process = subprocess.run(command, capture_output=True, text=True, cwd=ROOT, check=False)
            duration_ms = int((time.perf_counter() - started) * 1000)
            try:
                detail = json.loads(process.stdout.strip().splitlines()[-1]) if process.stdout.strip() else {}
            except json.JSONDecodeError:
                detail = {"rawStdout": process.stdout}
            record = {
                "stage": stage,
                "command": command,
                "startTime": started_at,
                "durationMs": duration_ms,
                "exitCodeDecimal": process.returncode,
                "exitCodeHex": exit_hex(process.returncode),
                "result": "PASS" if process.returncode == 0 and detail.get("ok") else "FAIL",
                "stdout": process.stdout,
                "stderr": process.stderr,
                "detail": detail,
            }
            records.append(record)
            log.write(json.dumps(record, indent=2) + "\n")
            log.flush()
            if stage == "core" and record["result"] == "PASS":
                device_properties = detail.get("detail", {}).get("gpuProperties", {})
                DEVICE_PATH.write_text(json.dumps(device_properties, indent=2) + "\n", encoding="utf-8")
            if record["result"] == "FAIL":
                break
    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelRoot": str(MODEL_ROOT.relative_to(ROOT)).replace("\\", "/"),
        "baselineMemory": memory_snapshot(),
        "stages": records,
        "firstFailingOperation": next((record["stage"] for record in records if record["result"] == "FAIL"), None),
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"summary": str(SUMMARY_PATH.relative_to(ROOT)), "firstFailingOperation": summary["firstFailingOperation"]}, indent=2))
    return 0 if summary["firstFailingOperation"] is None else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage")
    arguments = parser.parse_args()
    raise SystemExit(child_main(arguments.stage) if arguments.stage else parent_main())
