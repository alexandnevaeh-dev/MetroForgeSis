#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_ROOT = ROOT / "models" / "openvino" / "3bc9c7f7b000b0ba"
OUTPUT_DIR = ROOT / "test-artifacts" / "openvino-diffusion"
OUTPUT_PATH = OUTPUT_DIR / "openvino_sd15_direct_gpu_384.png"
TELEMETRY_PATH = OUTPUT_DIR / "openvino_sd15_direct_gpu_384.json"
PROMPT = (
    "top-down fantasy stone combat arena, orthographic game environment, clear walkable center, "
    "simple stone obstacles, readable gameplay composition, game environment concept art"
)


def emit(stage: str, **detail: object) -> None:
    print(json.dumps({"stage": stage, **detail}), flush=True)


def compile_component(core, name: str):
    started = time.perf_counter()
    model = core.read_model(MODEL_ROOT / name / "openvino_model.xml")
    compiled = core.compile_model(model, "GPU")
    elapsed = int((time.perf_counter() - started) * 1000)
    emit(f"{name.upper()}_COMPILE=PASS", device="GPU", durationMs=elapsed)
    return compiled, elapsed


def child_main() -> int:
    import numpy as np
    import torch
    from diffusers import PNDMScheduler
    from transformers import CLIPTokenizer
    import openvino as ov
    from PIL import Image

    os.environ["HF_HUB_OFFLINE"] = "1"
    total_started = time.perf_counter()
    output = {"lastCompletedStage": "start", "lastCompletedStep": 0}
    try:
        core = ov.Core()
        if "GPU" not in core.available_devices:
            raise RuntimeError(f"OpenVINO GPU unavailable: {list(core.available_devices)}")
        emit("OPENVINO_DEVICE=GPU", availableDevices=list(core.available_devices))

        tokenizer_started = time.perf_counter()
        tokenizer = CLIPTokenizer.from_pretrained(MODEL_ROOT / "tokenizer", local_files_only=True)
        tokens = tokenizer(["", PROMPT], padding="max_length", max_length=tokenizer.model_max_length, truncation=True, return_tensors="np")
        tokenizer_ms = int((time.perf_counter() - tokenizer_started) * 1000)
        output["lastCompletedStage"] = "tokenizer"

        text_encoder, text_compile_ms = compile_component(core, "text_encoder")
        text_started = time.perf_counter()
        embeddings = next(iter(text_encoder({"input_ids": tokens.input_ids.astype(np.int64)}).values()))
        text_inference_ms = int((time.perf_counter() - text_started) * 1000)
        emit("TEXT_ENCODER_INFERENCE=PASS", device="GPU", durationMs=text_inference_ms)
        output["lastCompletedStage"] = "text_encoder"

        scheduler = PNDMScheduler.from_pretrained(MODEL_ROOT / "scheduler", local_files_only=True)
        steps = 6
        scheduler.set_timesteps(steps)
        latents = torch.from_numpy(np.random.default_rng(42).standard_normal((1, 4, 48, 48)).astype(np.float32))
        latents = latents * scheduler.init_noise_sigma

        unet, unet_compile_ms = compile_component(core, "unet")
        unet_total_ms = 0
        scheduler_ms = 0
        for index, timestep in enumerate(scheduler.timesteps, start=1):
            step_started = time.perf_counter()
            latent_input = torch.cat([latents, latents])
            latent_input = scheduler.scale_model_input(latent_input, timestep)
            noise = next(iter(unet({
                "sample": latent_input.numpy().astype(np.float32),
                "timestep": np.array([int(timestep)], dtype=np.int64),
                "encoder_hidden_states": embeddings.astype(np.float32),
            }).values()))
            unet_total_ms += int((time.perf_counter() - step_started) * 1000)
            noise_uncond, noise_text = np.split(noise, 2, axis=0)
            guided_noise = noise_uncond + 7.5 * (noise_text - noise_uncond)
            scheduler_started = time.perf_counter()
            latents = scheduler.step(torch.from_numpy(guided_noise), timestep, latents).prev_sample
            scheduler_ms += int((time.perf_counter() - scheduler_started) * 1000)
            output["lastCompletedStage"] = "unet"
            output["lastCompletedStep"] = index
            emit(f"UNET_STEP={index}/{len(scheduler.timesteps)}", device="GPU")
        emit("UNET_INFERENCE=PASS", device="GPU", durationMs=unet_total_ms)

        vae_decoder, vae_compile_ms = compile_component(core, "vae_decoder")
        vae_started = time.perf_counter()
        decoded = next(iter(vae_decoder({"latent_sample": (latents / 0.18215).numpy().astype(np.float32)}).values()))
        vae_inference_ms = int((time.perf_counter() - vae_started) * 1000)
        emit("VAE_DECODER_INFERENCE=PASS", device="GPU", durationMs=vae_inference_ms)
        output["lastCompletedStage"] = "vae_decoder"

        pixels = np.clip((decoded[0].transpose(1, 2, 0) / 2 + 0.5) * 255, 0, 255).astype(np.uint8)
        image = Image.fromarray(pixels, "RGB")
        if image.size != (384, 384):
            raise RuntimeError(f"Unexpected output dimensions: {image.size}")
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        image.save(OUTPUT_PATH, format="PNG")
        png_bytes = OUTPUT_PATH.stat().st_size
        if png_bytes <= 0:
            raise RuntimeError("Generated PNG is empty")
        output.update({
            "ok": True,
            "model": "OpenVINO/stable-diffusion-v1-5-int8-ov",
            "modelCache": str(MODEL_ROOT.relative_to(ROOT)).replace("\\", "/"),
            "computeBackend": "openvino_gpu",
            "actualDevice": "GPU",
            "executionPath": "direct_openvino",
            "precision": "int8",
            "seed": 42,
            "width": 384,
            "height": 384,
            "steps": steps,
            "schedulerTimesteps": len(scheduler.timesteps),
            "tokenizerMs": tokenizer_ms,
            "textEncoderCompileMs": text_compile_ms,
            "textEncoderInferenceMs": text_inference_ms,
            "unetCompileMs": unet_compile_ms,
            "unetTotalInferenceMs": unet_total_ms,
            "vaeCompileMs": vae_compile_ms,
            "vaeInferenceMs": vae_inference_ms,
            "schedulerMs": scheduler_ms,
            "stepsCompleted": len(scheduler.timesteps),
            "totalMs": int((time.perf_counter() - total_started) * 1000),
            "outputPath": str(OUTPUT_PATH.relative_to(ROOT)).replace("\\", "/"),
            "pngBytes": png_bytes,
        })
        TELEMETRY_PATH.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
        emit("OPENVINO_GPU_PROOF=PASS", telemetry=output)
        return 0
    except Exception as error:
        output.update({"ok": False, "error": f"{type(error).__name__}: {error}", "totalMs": int((time.perf_counter() - total_started) * 1000)})
        emit("OPENVINO_GPU_PROOF=FAIL", telemetry=output)
        return 1


def parent_main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    command = [sys.executable, str(Path(__file__).resolve()), "--child"]
    started = time.perf_counter()
    process = subprocess.run(command, capture_output=True, text=True, cwd=ROOT, check=False)
    result = {
        "command": command,
        "durationMs": int((time.perf_counter() - started) * 1000),
        "exitDecimal": process.returncode,
        "exitHex": f"0x{process.returncode & 0xFFFFFFFF:08X}",
        "stdout": process.stdout,
        "stderr": process.stderr,
    }
    (OUTPUT_DIR / "openvino_sd15_direct_gpu_384_result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return process.returncode


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--child", action="store_true")
    args = parser.parse_args()
    raise SystemExit(child_main() if args.child else parent_main())
