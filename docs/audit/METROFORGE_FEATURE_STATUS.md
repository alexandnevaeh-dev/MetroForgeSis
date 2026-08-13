# MetroForge Feature Status Matrix

**Pass:** Audit Pass 8 (2026-08-13)  
**Branch:** `feature/claude-generation-runtime`  
**Method:** UI → IPC/handlers → packages traced against source. Statuses are evidence-based, not aspirational.

**Status legend (exactly one per row):**

| Status | Meaning |
|---|---|
| WORKING | End-to-end path exists and is exercised / unit-tested for intended scope |
| PARTIAL | Real implementation with known gaps or degraded modes |
| SCAFFOLDED | Substantial UI + wiring; backend incomplete or limited |
| BROKEN | Path exists but fails correctness for a stated requirement |
| PLACEHOLDER | UI or stub only; no real backend behavior |
| MISSING | Spec’d / expected feature not present |
| UNKNOWN | Plausible code path not re-verified this pass |

---

| feature | UI location | frontend file | backend/service | IPC/API | data source | real implementation? | test coverage | known failure | required fix | priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Dashboard | Sidebar → Dashboard | `apps/desktop/src/studio/ProjectDashboard.tsx` | `analyzeProjectCompletion`, project loader | `get-project-dashboard` + allowPlaceholders IPC | `game_dna.json`, validation report, completion | Yes — completion + playtest panel + allowPlaceholders toggle | generation completion tests | Older projects may still show PLACEHOLDER art | Gate list + live allowPlaceholders toggle | P1 done |
| New Game | Sidebar → New Game | `CreateScreen.tsx` | `GenerationPipeline` via queue | `generate-game`, create project | prompt, profile, mode, archetype | Yes | pipeline / CLI create | Hosted providers optional; deterministic DNA when LLM down | None blocking | P2 |
| Generation Studio | Sidebar → Generation Studio | `GenerationStudio.tsx` | pipeline + event bus + concurrency pool | generation events, queue, concurrency status | job phases / artifacts | Yes — live progress | progress tests (DEGRADED weight) | Procedural art still common | DEGRADED treated as completed-with-warning | P1 done |
| Projects | Sidebar → Projects | `ProjectsScreen.tsx` | FS scan of GeneratedGames | `list-projects` | directory + `game_dna.json` | Yes | light | No cloud sync | — | P3 |
| Asset Gallery | Sidebar → Asset Gallery | `AssetsGallery.tsx`, `VirtualizedAssetGrid.tsx` | manifest + thumbnails + maturity backfill | `list-assets`, `backfill-asset-maturity` | `generation_manifest.json` | Yes | backfill unit tests | Placeholder art without image providers | Backfill maturity button wired | P1 done |
| Manual Generator | Sidebar → Manual Generator | `GenerateAsset.tsx` | `generateManualAsset` / AssetPipeline | `generate-asset` | project art bible + image registry | Yes — same AssetPipeline, not a second pipeline | assets tests | Procedural fallback common without Comfy/NVIDIA | Show maturity on result | P2 |
| World Editor | Sidebar → World Editor | `WorldEditor.tsx` | world edit + recompile | world-edit IPC | `world_graph.json` | PARTIAL — edit/recompile wired | world/godot tests | Top-down overworld vs side-view graph UX uneven | Align editors to archetype | P1 |
| Room Editor | Sidebar → Room Editor | `RoomEditor.tsx` | room edit / regenerate | room IPC | room scenes + data | PARTIAL | — | Tile paint / fidelity gaps | Continue room fidelity pass | P1 |
| Dungeon Editor | Sidebar → Dungeon Editor | `DungeonEditor.tsx` | top-down dungeon data | dungeon preview IPC | overworld/dungeon JSON | PARTIAL — soft-gated for side-view | procedural topdown tests | Side-view soft empty-state; top-down usable | — | P1 done |
| Game Preview | Sidebar → Game Preview | `PreviewScreen.tsx` | readiness + Godot launch | `play-in-godot`, preview readiness | project files | PARTIAL — launch real when Godot configured | — | Headless blank screenshots; Godot path env-dependent | Doctor/Godot path UX | P1 |
| Models | Sidebar → Models | `ModelsScreen.tsx` | ModelCatalog + reconcile | `list-models`, `rank-models` | `config/models.catalog.json` + live IDs | Yes — AVAILABLE/ROUTABLE/BLOCKED labels | model-catalog tests | Hosted `enabled` depends on key + Settings toggles | Status column clarified | P2 done |
| Providers | Sidebar → Providers | `ProvidersScreen.tsx` | bootstrap + image probe | `list-providers`, `get-config` | env keys + health probes + Settings toggles | Yes | nvidia-image health tests | Image health previously boolean-only | Rich status/reason + disabled respect | P1 done |
| Routing Inspector | Sidebar → Routing | `RoutingInspector.tsx` | `explainModelRouting` + image registry explain | `explain-model-routing` | catalog + ImageProviderRegistry | WORKING for IMAGE explain (merge + locality/health columns) | image-router explain tests | Empty when providers unconfigured mitigated via stub rejects | Keep single image registry | P1 done |
| QA | Sidebar → QA | `QAScreen.tsx` | `QAValidator`, repair, acceptance | validate / acceptance IPC | project tree | Yes | `validator.test.ts` incl. top-down controller | Runtime/playtest need Godot | Keep archetype-aware gates | P0 done |
| Export | Sidebar → Export | `ExportScreen.tsx` | `exportProject` / completion | export + allowPlaceholders + backfill IPC | project + coverage + image probe | PARTIAL — productionReady honest; blockers listed; image health summary line | export / completion / backfill tests | Placeholder default without image providers | allowPlaceholders + backfill + probe summary | P1 done |
| Settings | Sidebar → Settings | `SettingsScreen.tsx` | app preferences DB + project meta | get/set app settings + provider toggles + `set-project-allow-placeholders` | SQLite settings + `project.json` | Yes — allowPlaceholders + provider toggles + NVIDIA nearby-model suggestions | provider-toggles + nvidia-image tests | — | Suggestion chips set `app.nvidia.imageModel` | P1 done |
| Ability remap (DNA + refs) | Dashboard Remap / CLI | ProjectDashboard + CLI `remap-abilities` | `remapProjectAbilities` + `remapAbilityReferences` | `remap-project-abilities` | game_dna + items/world/progression JSON | Yes — DNA aliases + item/world reward string rewrite | ability-remap + remap-project-abilities tests | Historical validation_report / some .gd literals may lag | Keep remap on DNA+refs path | P1 done |
| Concurrency meters | Studio chrome / StatusBar | `ConcurrencyMeters.tsx` | `ConcurrencyPool.getStatus()` | concurrency status IPC | in-memory pool | Yes | — | Was `0/undefined` | Fixed `max`+`limit` | P0 done |
| Text generation routing | hidden / Studio | — | `GenerationRouter` → CapabilityRouter | pipeline internal | providers | Yes | generation-router tests | Image not on text router (by design) | Keep separate image registry | — |
| Image generation routing | hidden / Manual + pipeline | — | `ImageProviderRegistry` + AssetPipeline | env Comfy/Diffusers/NVIDIA | providers | Yes | image-router tests | Procedural fallback must be DEGRADED | Implemented | P1 done |
| Asset maturity / production gate | Export / Dashboard / Gallery | Gallery detail + gate panel | `asset-maturity`, `evaluateAssetProductionGate`, backfill | completion analysis + `backfill-asset-maturity` | manifest maturity fields | Yes | shared + generation backfill tests | Real art still needs healthy image providers | Backfill + Settings/Export allowPlaceholders | P1 done |
| NVIDIA NIM text | Providers | — | `NvidiaProvider` | chat completions | NVIDIA_API_KEY | WORKING when keyed | nvidia text tests | No key → unavailable | Configure key for live | P2 |
| NVIDIA NIM image | Providers / Settings | — | `NvidiaImageProvider` | `/images/generations` | NVIDIA_API_KEY + `app.nvidia.imageModel` | PARTIAL — adapter+health; DEGRADED nearbyModels clickable in Settings/Providers | nvidia-image tests (nearbyModels/suggestedModelIds) | Configured model often not listed; live gen still needs listed id | Use suggestion buttons then re-probe | P1 done |
| Godot assembly (side-view) | Preview / generate | — | `GodotProjectAssembler` | pipeline | templates/godot-metroidvania | Yes | assembler tests | — | — | — |
| Godot assembly (top-down) | Preview / generate | — | assembler + topdown world | pipeline | templates/godot-topdown-adventure | PARTIAL | QA archetype test | Template diffs deleting side-view ability scripts — presumed intentional for top-down | Do not restore unless tests fail | P1 |
| Procedural world / content | generate | — | `@metroforge/procedural` | pipeline | seed/profile | Yes | procedural tests | Softlocks historically fixed | Monitor gated edges | P2 |
| Audio / music | generate / Gallery | — | procedural + optional Stable Audio | pipeline | WAV/MIDI | PARTIAL | — | No audio router; enhancement optional | — | P2 |
| VLM / vision QA | generate / QA | — | VLM critic factory | pipeline | Ollama/NVIDIA vision | PARTIAL | scene-critic tests | Headless frames blank | Skip honest | P2 |
| Playtest personas | Dashboard | ProjectDashboard | playtest route + Godot bot | playtest outputs | telemetry JSON | PARTIAL | playtest-output | Needs Godot runtime | — | P2 |
| Embeddings / project memory | — | — | Ollama embeddings helpers | query memory IPC | index files | SCAFFOLDED / PARTIAL | — | Not primary path | — | P2 |
| CharacterVisualDNA / Asset Foundry classes | — | — | — | — | — | MISSING | — | Spec aspirational | Out of scope this pass | P3 |

---

## Hidden / non-nav systems

| System | Status | Notes |
|---|---|---|
| Generation queue + cancel | WORKING | Desktop queue + AbortSignal cooperative cancel |
| Review pause gates | PARTIAL | Interactive generation review exists |
| License / COMMERCIAL_SAFE | PARTIAL | LicenseRouter + mode; not default LOCAL_ONLY |
| Doctor / tool registry | WORKING | CLI doctor |
| Catalog reconciliation | WORKING | `reconcileModelCatalog` / live IDs |
| Asset coverage report | WORKING | Written post asset phase |
| Acceptance report | WORKING | QA acceptance helpers |

## Classification counts (this pass)

- WORKING: core generate/QA/CLI/catalog/concurrency/maturity gate + allowPlaceholders + provider toggles + Models status labels  
- PARTIAL: editors, preview, image live quality (NVIDIA DEGRADED model list / Comfy down), export production claims  
- SCAFFOLDED: dungeon (non top-down), some memory UI paths  
- BROKEN: none newly confirmed this continuation  
- PLACEHOLDER: none as primary nav screens (all have real IPC)  
- MISSING: Asset Foundry named architecture, CharacterVisualDNA, etc.  
- UNKNOWN: full live Godot end-to-end on this machine this continuation (not re-run)
