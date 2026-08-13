# MetroForge Audit Pass 6

**Date:** 2026-08-13  
**Branch:** `feature/claude-generation-runtime`  
**Repo:** MetroForge AI (`Forged`)  
**Prior:** [`METROFORGE_AUDIT_PASS_5.md`](./METROFORGE_AUDIT_PASS_5.md) · [`METROFORGE_FEATURE_STATUS.md`](./METROFORGE_FEATURE_STATUS.md)

---

## Scope

Pass 6: remap LLM-invented ability ids onto registered runtime ids (`wind_disc` → `dash`), desktop remap IPC + Dashboard action, and persist NVIDIA NIM image model via `app.nvidia.imageModel` for image probes. No long generation. No commit.

## Fixed this pass

### Ability remap (`@metroforge/shared`)
- `ABILITY_ALIAS_MAP` + `remapAbilityList` / `resolveAbilityAlias`
- Drops unknown ids; dedupes after remap; `wind_disc` / `wind_blade` / `gale` → `dash`

### Project DNA remap (`@metroforge/generation`)
- `remapProjectAbilities(projectPath)` reads/writes `game_dna.json`

### Desktop wiring
- IPC `remap-project-abilities` → preload → `metroforge.remapProjectAbilities`
- Project Dashboard **Remap Abilities** button

### NVIDIA image model setting
- Key `app.nvidia.imageModel` (already in `APP_SETTING_KEYS`)
- SettingsScreen editable input; saved with preferences
- `probeImageProviders` prefers setting over `NVIDIA_IMAGE_MODEL` env

## Validation

Targeted vitest + desktop typecheck (see agent report).

## Remaining

- Real image generation still needs a listed NIM model id (or healthy ComfyUI)
- Full `pnpm test` sweep if CI not already green
