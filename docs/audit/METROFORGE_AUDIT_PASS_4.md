# MetroForge Audit Pass 4

**Date:** 2026-08-13  
**Branch:** `feature/claude-generation-runtime`  
**Repo:** MetroForge AI (`Forged`)  
**Prior:** [`METROFORGE_AUDIT_PASS_3.md`](./METROFORGE_AUDIT_PASS_3.md) · [`METROFORGE_FEATURE_STATUS.md`](./METROFORGE_FEATURE_STATUS.md)

---

## Scope

Pass 4 focused on provider enable/disable persistence, clearer NVIDIA image DEGRADED reasons, and honest unknown-ability blockers (`repairable=false`). No long generation. No commit.

## Fixed this pass

### P1 — Provider enable/disable toggles
- Settings keys `app.provider.<id>.enabled` in app settings DB (`@metroforge/shared` helpers)
- Settings UI checkboxes for text (Ollama, Gemini, Groq, OpenRouter, HuggingFace, NVIDIA) + image (ComfyUI, NVIDIA image, Diffusers)
- `bootstrapProviders({ providerEnabled })` respects toggles; hosted providers still register when disabled so `list-providers` can show `enabled: false`
- Desktop `probeImageProviders` skips disabled image providers (status `DISABLED`)
- Generation pipeline + AssetPipeline accept `providerEnabled` from desktop prefs

### P2 — NVIDIA image DEGRADED clarity
- Exact configured model required for `HEALTHY`
- Missing configured model → `DEGRADED` with actionable reason naming `NVIDIA_IMAGE_MODEL` and nearby listed image models when present
- Unit tests cover nearby-model and no-image-model cases

### P3 — Unknown ability blockers
- Completion blockers include `repairable=false` + remap guidance; no fake GDScript invention
- QA `registered_abilities_valid` details set `repairable: false`
- `RepairEngineer` explicitly skips auto-repair for that gate with a clear action note

## Validation

| Command | Result |
|---|---|
| Targeted vitest (provider-toggles, nvidia-image, project-completion, …) | See Pass 5 report |
| `pnpm --filter @metroforge/desktop typecheck` | See Pass 5 report |

## Remaining blockers

- Not production-complete without non-PLACEHOLDER art from a healthy image path
- NVIDIA image often still DEGRADED until `NVIDIA_IMAGE_MODEL` matches a listed NIM id
- Sample projects with unknown abilities (e.g. `wind_disc`) still fail gates until DNA is remapped

## Next

Pass 5 — Export image health summary, Models AVAILABLE/ROUTABLE/BLOCKED labels, FEATURE_STATUS update.
