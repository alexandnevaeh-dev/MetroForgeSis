# MetroForge Development Setup

## Canonical Repository

Use the Git-backed `Forged` checkout as the development repository: `E:\Projects\MetroForge\Forged` on Windows or `/Volumes/DevDrive/Projects/MetroForge/Forged` on this Mac. Run all commands below from that directory. `Forged-cursor-desktop` is a preserved comparison copy and is not the development source of truth.

## Prerequisites

- Windows 10/11, macOS, or Linux.
- Node.js `>=22.5.0` (the current validated environment is Node `v24.19.0`).
- pnpm `10.15.0` or a compatible pnpm `>=9.0.0` implementation. The repository declares `packageManager: pnpm@10.15.0`.
- Git.
- Godot 4.x for import/runtime validation. Godot is optional for unit tests and static generation, but projects are not runtime-certified without it.
- Optional: Ollama, ComfyUI, Diffusers/Python, FFmpeg, Piper, Whisper, and provider credentials.

## Install

```powershell
cd E:\Projects\MetroForge\Forged
pnpm install --frozen-lockfile
```

A clean install does not require paid API credentials. Optional provider services are detected by `doctor` and reported as unavailable or not configured.

## Environment

Copy `.env.example` to `.env` only when local configuration is needed. Important optional variables include `GODOT_EXECUTABLE`, `OLLAMA_BASE_URL`, `OLLAMA_DEFAULT_MODEL`, `NVIDIA_API_KEY`, `NVIDIA_API_BASE_URL`, `COMFYUI_BASE_URL`, `DIFFUSERS_PYTHON` / `METROFORGE_PYTHON`, and image/audio provider keys. Never commit `.env` or print credentials.

On Windows, point `DIFFUSERS_PYTHON` at a real interpreter (for this machine: `E:\MetroForgeData\Python\diffusers-native\Scripts\python.exe`, with its base interpreter at `E:\MetroForgeData\Python\base-3.12`). The previous `Python\diffusers` junction points to C: and should not be used for new generation. Do not use the Microsoft Store App Execution Alias under `WindowsApps` — disable those aliases under Settings → Apps → Advanced app settings → App execution aliases if `where python` still resolves there. Prefer `scripts\metroforge-create.cmd` over raw PowerShell `node ... create` so Node `ExperimentalWarning` on stderr does not become a false exit code.

## Commands

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm doctor
pnpm validate
pnpm smoke:generate
pnpm smoke:godot
```

`pnpm validate` runs typecheck, the full test suite, and the TypeScript build. It does not require external AI services or Godot. `pnpm smoke:godot` runs deterministic generation and then Godot validation when a supported Godot 4 executable is available; otherwise it exits with an explicit unverified result.

## Desktop

```powershell
pnpm dev:desktop
pnpm desktop:build
```

## Godot Setup

Set `GODOT_EXECUTABLE` to a Godot 4.x executable when it is not on PATH. MetroForge checks explicit configuration, saved preferences, PATH, and common platform install locations, including `/Applications/Godot.app` and `~/Applications/Godot.app` on macOS. Godot 3.x is not a supported runtime for this repository.

## Troubleshooting

- If `pnpm install --frozen-lockfile` fails, do not globally install tools. Confirm the lockfile and root manifest agree.
- If `pnpm typecheck` fails, run it from the canonical root; the root script uses the declared TypeScript binary rather than broken package-local shims.
- If Godot is missing, generated projects may still be written, but validation is `NEEDS_RUNTIME_VALIDATION` and export certification is `UNVERIFIED`.
- If an external provider is unavailable, the generation report records degraded/fallback behavior. This is not equivalent to production-quality asset validation.

## Apple Silicon audit environment

The local native Node and pnpm install is in `~/.local/bin`; add that directory to the shell PATH when needed. A Windows `.venv-diffusers/Scripts` environment is not usable on macOS. Metal hardware detection does not prove PyTorch/MPS inference support. Run provider doctors before requesting assets; preserve the production model and immutable generation specification.

When launching Electron from an agent environment, remove `ELECTRON_RUN_AS_NODE` from the Electron child environment only. `pnpm desktop:build` builds the desktop application; it does not produce a signed/notarized macOS installer. New Godot macOS ZIP export presets use built-in ad-hoc signing for local development; existing user presets are preserved. Distribution still requires the appropriate signing/notarization workflow.
