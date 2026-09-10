---
title: MetroForge Reference Worker
emoji: 🧭
colorFrom: indigo
colorTo: blue
sdk: gradio
sdk_version: 5.46.1
app_file: app.py
pinned: false
---

# MetroForge Reference Worker (optional, user-owned ZeroGPU Space)

Deploy this directory as its own Hugging Face Space to get a user-owned
`HF_SPACE_ID=<user>/metroforge-reference-worker`. This is **not required** — the
official `Qwen/Qwen-Image-Edit-2509` Space already works for the initial free-GPU
reference probe (`HF_SPACE_ID=Qwen/Qwen-Image-Edit-2509`).

## Deploy

1. Create a new Space on huggingface.co with **SDK: Gradio** and **Hardware: ZeroGPU**.
2. Push this directory's contents (`app.py`, `requirements.txt`, this `README.md`) to the Space repo.
3. Set `HF_SPACE_ID=<your-username>/metroforge-reference-worker` in MetroForge's environment.
4. Run `pnpm providers:huggingface:doctor` to confirm the named API endpoint (`/reference`) is discovered.

## Design

`reference()` is decorated with `@spaces.GPU` so the GPU is only allocated for the
duration of a single call — the same "prefer high-memory GPU only for the brief
invocation, avoid leaving GPU Studios running unnecessarily" principle applied to the
Lightning AI profile. The inference logic (model id/profile env vars, dtype/offload
selection) intentionally mirrors `workers/remote-visual/server.py`'s
`get_qwen_pipeline()` / `run_qwen_reference()` so it can also run unmodified on RunPod
or Lightning — only the transport differs.
