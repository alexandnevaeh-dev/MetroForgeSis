"""Optional deployable MetroForge ZeroGPU reference worker (workers/huggingface-zerogpu/).

Deploy this directory as its own Hugging Face Space (SDK: gradio) to get a user-owned
`HF_SPACE_ID=<user>/metroforge-reference-worker` that wraps MetroForge's normalized
reference operation. Not required if the official Qwen-Image-Edit-2509 Space already
works for the initial free-GPU probe (`HF_SPACE_ID=Qwen/Qwen-Image-Edit-2509`).

The inference logic here intentionally mirrors `workers/remote-visual/server.py`'s
`get_qwen_pipeline()` / `run_qwen_reference()` (same model id/profile env vars, same
dtype/offload selection, same OOM classification) so the identical reference behavior
can run unmodified on RunPod, Lightning, or a user-owned ZeroGPU Space — only the
transport (HTTP protocol server vs. Gradio + spaces.GPU) differs.
"""
from __future__ import annotations

import hashlib
import os
from io import BytesIO

import gradio as gr
import spaces
from PIL import Image

MODEL_ID = os.environ.get("METROFORGE_REMOTE_MODEL", "Qwen/Qwen-Image-Edit-2509")
MODEL_REVISION = os.environ.get("METROFORGE_REMOTE_MODEL_REVISION", "main")
MODEL_PROFILE = os.environ.get("RUNPOD_MODEL_PROFILE", "FULL_BF16")

_pipeline = None


def _get_pipeline():
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    import torch
    from diffusers import QwenImageEditPipeline

    dtype = torch.bfloat16 if MODEL_PROFILE in ("FULL_BF16", "LAYER_OFFLOAD") else torch.float16
    pipe = QwenImageEditPipeline.from_pretrained(MODEL_ID, revision=MODEL_REVISION, torch_dtype=dtype)
    if MODEL_PROFILE == "CPU_OFFLOAD":
        pipe.enable_model_cpu_offload()
    elif MODEL_PROFILE == "LAYER_OFFLOAD":
        pipe.enable_sequential_cpu_offload()
    else:
        pipe = pipe.to("cuda")
    _pipeline = pipe
    return _pipeline


@spaces.GPU
def reference(image: Image.Image, prompt: str, negative_prompt: str, seed: int, width: int, height: int):
    """MetroForge's normalized reference operation, exposed as a ZeroGPU-decorated function.
    Returns (output_image, seed, source_sha256, output_sha256) so callers get the same
    provenance fields the HTTP worker protocol returns."""
    import torch

    if image is None:
        raise gr.Error("REFERENCE_IMAGE_REQUIRED")
    source_bytes = BytesIO()
    image.convert("RGB").save(source_bytes, format="PNG")
    source_hash = hashlib.sha256(source_bytes.getvalue()).hexdigest().upper()

    pipe = _get_pipeline()
    generator = torch.Generator(device="cuda").manual_seed(int(seed))
    source = image.convert("RGB").resize((int(width), int(height)))
    result = pipe(image=source, prompt=prompt, negative_prompt=negative_prompt, generator=generator, num_inference_steps=30)
    output = result.images[0]

    output_bytes = BytesIO()
    output.save(output_bytes, format="PNG")
    output_hash = hashlib.sha256(output_bytes.getvalue()).hexdigest().upper()
    return output, int(seed), source_hash, output_hash


with gr.Blocks(title="MetroForge Reference Worker") as demo:
    gr.Markdown("# MetroForge Reference Worker (ZeroGPU)\nNormalized reference-image edit operation for MetroForge's remote-worker execution layer.")
    with gr.Row():
        image_in = gr.Image(type="pil", label="Reference Image")
        image_out = gr.Image(type="pil", label="Result")
    prompt_in = gr.Textbox(label="Prompt", value="Change the character pose from standing to running. Keep everything else identical.")
    negative_in = gr.Textbox(label="Negative Prompt", value="")
    seed_in = gr.Slider(minimum=0, maximum=2_147_483_647, step=1, value=42, label="Seed")
    width_in = gr.Slider(minimum=256, maximum=2048, step=8, value=1024, label="Width")
    height_in = gr.Slider(minimum=256, maximum=2048, step=8, value=1024, label="Height")
    seed_out = gr.Number(label="Seed Used")
    source_hash_out = gr.Textbox(label="Source SHA-256")
    output_hash_out = gr.Textbox(label="Output SHA-256")
    submit = gr.Button("Run Reference Edit")
    submit.click(
        reference,
        inputs=[image_in, prompt_in, negative_in, seed_in, width_in, height_in],
        outputs=[image_out, seed_out, source_hash_out, output_hash_out],
        api_name="reference",
    )

if __name__ == "__main__":
    demo.launch()
