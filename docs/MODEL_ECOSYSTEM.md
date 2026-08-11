# Expanded Open / Free AI Model Ecosystem

> Master specification for MetroForge AI model-agnostic production pipeline.
> Application code must request **CAPABILITIES** — never hardcode model names.

## Core Principle

MetroForge is not "Qwen + FLUX + Stable Audio." It is an **AI game-production operating system** that orchestrates specialized model pools for reasoning, coding, vision, art, animation, audio, speech, embeddings, and QA — selected dynamically via `ModelRegistry` and `CapabilityRouter`.

## Model Entry Requirements

Every model registered must track:

| Field | Description |
|-------|-------------|
| `id` | Unique model identifier |
| `provider` | Runtime provider (ollama, huggingface, comfyui, etc.) |
| `repository` | Source repo / catalog URL |
| `modality` | text, vision, image, video, audio, speech, embedding, etc. |
| `capabilities` | Task capabilities (see below) |
| `local` / `cloud` | Deployment type |
| `license` | SPDX or descriptive license string |
| `commercialUse` | known / unknown / restricted |
| `parameterCount` | e.g. "7B", "30B" |
| `quantization` | Q4, Q5, Q6, Q8, fp16, etc. |
| `minRamMb` / `recommendedRamMb` | Memory requirements |
| `minVramMb` / `recommendedVramMb` | GPU memory |
| `contextWindow` | Token/context limit |
| `supportsTools` | Tool-calling |
| `supportsStructuredOutput` | JSON/schema output |
| `supportsVision` | Image input |
| `supportsImageGeneration` | Image output |
| `supportsAudio` | Audio generation |
| `estimatedSpeed` | fast / medium / slow |
| `estimatedQuality` | low / medium / high |
| `specializationScores` | Per-capability scores 0–100 |
| `enabled` / `health` / `priority` | Runtime state |

**Never assume open weights = unrestricted commercial use.** Licensing is stored and checked independently.

---

## Capability Pools

### 1. General Reasoning / Game Design
Families: Qwen3, Qwen3-Coder, DeepSeek-R1, Llama, Mistral, Gemma, Phi, GLM, SmolLM, OLMo, Granite, Yi, InternLM, etc.

Tasks: Game DNA, design, narrative planning, world/quest/enemy/boss/economy design, JSON, QA reasoning, repair.

### 2. Coding (`CODE_GENERATION`, `GDSCRIPT`)
Qwen3-Coder, DeepSeek-Coder, StarCoder2, CodeGemma, Granite Code, Code Llama, etc.
Router benchmarks installed models on small Godot/GDScript tasks — not static rankings.

### 3. Low-Resource Pool (`LOW_RESOURCE_MODEL_POOL`)
1B–14B models for classification, tagging, simple JSON, metadata, validation triage, routing.

### 4. Vision (`VISION_ANALYSIS`)
Qwen-VL, Gemma-VL, InternVL, MiniCPM-V, LLaVA, Florence, SmolVLM.
Independent VLM critic validates generated assets — image generators do not self-approve.

### 5. Image (`IMAGE_GENERATION`)
FLUX.1-schnell, SDXL, SD 1.5/3.x, PixArt, Sana, Lumina, Hunyuan, Kandinsky, etc.
Integrations: ComfyUI, Diffusers, A1111, Forge, HF endpoints.

### 6. Image Task Profiles
`CONCEPT_ART`, `CHARACTER`, `ENEMY`, `BOSS`, `NPC`, `PORTRAIT`, `ITEM`, `WEAPON`, `ICON`, `ENVIRONMENT`, `BACKGROUND`, `TILE_SOURCE`, `VFX_TEXTURE`, `UI_ART`, `MARKETING_ART`

### 7–16. Post-Processing & Optional
ControlNet/conditioning, CharacterIdentityProfile, PixelArtProcessor, sprite/animation generation, frame interpolation, background removal, segmentation, depth/normal, upscaling, optional 3D generation.

### 17–22. Audio & Language
`TEXTURE_GENERATION`, `MUSIC_GENERATION`, `SFX_GENERATION`, `SPEECH_GENERATION`, `SPEECH_RECOGNITION`, `EMBEDDING`, rerankers.

### 23–26. Runtimes & Hardware
Ollama, llama.cpp, GGUF, Transformers, vLLM, Diffusers, ComfyUI, whisper.cpp.
`HardwareProfiler` detects CPU, RAM, GPU, VRAM, CUDA/ROCm/DirectML/Metal.
`CapabilityRouter` selects models that fit available hardware.

### 27–29. Benchmarking & Ensemble
`ModelBenchmarkService` tests JSON compliance, GDScript, latency, vision, image speed.
Ensemble: DRAFT → CRITIQUE → REVISE for critical tasks only.

### 30–32. Validation & Downloads
Code/asset validation loops. `ModelDownloadManager` — user must approve large downloads.

### 33–36. Storage & UI
Default `models/` directory (gitignored). Model install UI with filters. Hardware-appropriate starter packs.

### 37–47. Routing, Failure Handling, Lifecycle
FREE_ONLY priority: local installed → local compatible → free hosted → procedural → fallback.
Model lifecycle: load → warm → execute → idle → unload.
Model-agnostic API:

```typescript
generationRouter.generate({
  capability: 'CHARACTER_CONCEPT',
  projectId,
  prompt,
  constraints,
});
```

---

## Model Scout (Automatic Catalog Refresh)

`ModelScout` periodically:

1. Refreshes compatible free/open model catalog (Ollama library, Hugging Face metadata, provider APIs, local filesystem)
2. Records licenses and hardware requirements
3. Benchmarks newly installed models (optional)
4. Updates router preferred models per capability
5. Surfaces new models without application code changes

Configuration: `METROFORGE_SCOUT_INTERVAL_HOURS`, manual `metroforge scout refresh`.

---

## Implementation Map

| Module | Package | Status |
|--------|---------|--------|
| `ModelEntrySchema` | `@metroforge/schemas` | Implemented |
| `CAPABILITIES` constants | `@metroforge/ai` | Implemented |
| `ModelRegistry` (enhanced) | `@metroforge/ai` | Implemented |
| `HardwareProfiler` | `@metroforge/ai` | Implemented |
| `CapabilityRouter` (hardware-aware) | `@metroforge/ai` | Implemented |
| `GenerationRouter` | `@metroforge/ai` | Implemented |
| `ModelCatalog` | `@metroforge/ai` | Implemented |
| `ModelScout` | `@metroforge/ai` | Implemented |
| `ModelBenchmarkService` | `@metroforge/ai` | Implemented |
| `ModelDownloadManager` | `@metroforge/ai` | Stub |
| `ProviderPlugin` SDK | `@metroforge/ai` | Implemented |
| Asset provider interfaces | `@metroforge/ai` | Stubs |
| `config/models.catalog.json` | repo | Implemented |
| `metroforge models` / `scout` CLI | `@metroforge/cli` | Implemented |

See also: [ARCHITECTURE.md](./ARCHITECTURE.md), [BUILD_STATUS.md](./BUILD_STATUS.md), [DECISIONS.md](./DECISIONS.md).
