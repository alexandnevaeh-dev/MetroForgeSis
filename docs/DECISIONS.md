# Architecture Decisions

## ADR-001: Monorepo with pnpm workspaces

**Status:** Accepted

Use pnpm workspaces for apps (cli, desktop) and packages (shared, schemas, core, etc.). Enables shared TypeScript config and incremental builds.

## ADR-002: Configurable product name

**Status:** Accepted

Product name read from `METROFORGE_APP_NAME` env var. Internal id remains `metroforge-ai`. Allows rebranding without code changes.

## ADR-003: Hybrid generation architecture

**Status:** Accepted

Do not generate entire games from arbitrary AI code. Use stable Godot template + procedural algorithms + schema-driven data + AI content.

## ADR-004: Zod for all schemas

**Status:** Accepted

All data contracts validated with Zod. AI outputs must conform to schemas or trigger repair/fallback.

## ADR-005: SQLite for application data

**Status:** Accepted (Pass 3)

Local SQLite for projects, jobs, artifacts. Generated Godot projects remain files on disk.

## ADR-006: Ollama as primary local provider

**Status:** Accepted

Ollama first for local text/code generation. Hardware-aware routing for model selection.

## ADR-008: Model-agnostic capability routing

**Status:** Accepted

Application modules request CAPABILITIES via `GenerationRouter.generate({ capability, ... })`, never model names. All models registered in `ModelCatalog` with license, hardware requirements, and specialization scores. `ModelScout` refreshes catalog periodically.

## ADR-009: Independent VLM asset critique

**Status:** Accepted

Image generators must not self-approve assets. Vision models (`VISION_ANALYSIS`) validate generated sprites, tiles, and UI independently when hardware permits.
