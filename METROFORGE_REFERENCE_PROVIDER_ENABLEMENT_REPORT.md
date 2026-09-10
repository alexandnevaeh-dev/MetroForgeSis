# MetroForge Reference Provider Enablement Report

Date: 2026-08-19
Canonical repository: E:\Projects\MetroForge\Forged

## Executive summary

The reference-provider enablement milestone did not reach a valid custom-reference-capable route. The environment remains blocked before any player-animation family generation.

Validated evidence:

- CLI build passes via `node scripts/cli-build.mjs`
- Hardware doctor runs successfully and reports:
  - `python`: 3.11.9
  - `torch`: True
  - `torch_cuda`: True
  - `diffusers`: False
  - `accelerate`: False
  - `transformers`: True
  - `nvidia-smi`: False
  - `comfyCli`: False
- Reference setup plan reports `selectedRoute: LOCAL_REFERENCE_WORKFLOW_REQUIRED`
- Provider readiness states are:
  - `comfyui`: `REFERENCE_MODEL_NOT_INSTALLED`, reachable false
  - `nvidia-image`: `REFERENCE_CAPABILITY_UNAVAILABLE`, reachable true but arbitrary custom reference unsupported
  - `diffusers`: `REFERENCE_MODEL_NOT_INSTALLED`, reachable false

This means the system still lacks any approved route for consuming the canonical player image as an arbitrary custom reference for identity-preserving animation.

## Why the route remains blocked

The approved canonical player reference is preserved and valid, but no configured provider currently supports the required contract.

The key facts are:

1. The NVIDIA hosted FLUX.1-dev route is healthy and image-generation capable.
2. That route does not advertise or accept arbitrary custom reference images.
3. The local ComfyUI path is not usable in this environment.
4. The local Diffusers path is missing the required reference model/adapter installation.
5. No large model download or silent fallback was performed.
6. The project retains the canonical reference and refuses procedural or prompt-only identity claims.

## Provider status summary

| Provider | Health | Custom reference support | Readiness |
| --- | --- | --- | --- |
| NVIDIA hosted FLUX.1-dev | reachable | no | REFERENCE_CAPABILITY_UNAVAILABLE |
| ComfyUI | unavailable | no verified workflow | REFERENCE_MODEL_NOT_INSTALLED |
| Diffusers | unavailable | no installed reference model | REFERENCE_MODEL_NOT_INSTALLED |

## Validation commands

The following commands were run successfully to confirm the current blocked state:

```powershell
Set-Location E:\Projects\MetroForge\Forged
node scripts/cli-build.mjs
node apps/cli/dist/index.js providers:hardware:doctor
node apps/cli/dist/index.js reference:setup:plan
```

Observed output confirms:

- no `nvidia-smi` present
- no ComfyUI CLI present
- Python stack is present but Diffusers and Accelerate are absent
- no provider route reports reference capability
- setup plan explicitly requires a local reference workflow and model installation yet remains blocked

## Decision

No player-animation generation was started. The system remains intentionally blocked at the provider enablement gate, pending a real custom-reference-capable route.

REFERENCE PROVIDER ENABLEMENT PARTIAL
