# Architecture

## Overview

MetroForge AI uses a hybrid architecture combining:

1. **Reusable Godot runtime framework** — Stable game systems in `templates/godot-metroidvania/`
2. **Procedural algorithms** — Deterministic world/progression generation
3. **Schema-driven game data** — Zod-validated JSON contracts
4. **AI-generated content** — Design, narrative, parameters, specialized code
5. **Automated validation & repair** — Godot headless + progression graph checks

## Monorepo Layout

| Package | Responsibility |
|---------|----------------|
| `@metroforge/shared` | Constants, config, logging, utilities |
| `@metroforge/schemas` | Zod schemas for all data contracts |
| `@metroforge/core` | Business logic orchestration |
| `@metroforge/cli` | Command-line interface |
| `@metroforge/desktop` | Electron desktop UI |

## AI Provider Architecture

Providers are decoupled from business logic via:

- **ProviderRegistry** — Registered provider adapters
- **ModelCatalog** — Rich model metadata (license, hardware, specialization scores)
- **CapabilityRouter** — Task → model routing by capability, hardware, cost
- **GenerationRouter** — Model-agnostic `generate({ capability, ... })`
- **ModelScout** — Automatic catalog refresh and install discovery
- **FallbackManager** — Automatic retry across providers

See [MODEL_ECOSYSTEM.md](./MODEL_ECOSYSTEM.md) for the full model pool specification.

## Generation Pipeline

37 phases from intake through export. Each phase is checkpointed with status: PENDING, RUNNING, PASSED, FAILED, REPAIRING, SKIPPED.

## Product Naming

Product identity is read from `METROFORGE_APP_NAME` environment variable. Code references `PRODUCT.defaultName` as fallback only.

## Target Output

```
GeneratedGames/<slug>/
  project.godot
  assets/
  data/
  scenes/
  scripts/
  game_dna.json
  generation_manifest.json
```

## Key Design Principles

1. Correctness over scale
2. Generated game must actually run
3. Deterministic procedural decisions where possible
4. No required manual Godot assembly
5. Free/local generation must work without paid APIs
