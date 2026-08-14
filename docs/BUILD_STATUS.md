# Build Status

## Recent updates (2026-08-13)

Continued from 2026-08-12 baseline:

- **Playtest dashboard** — `playtest_route.json` + `playtest_telemetry.json` surfaced in desktop Project Dashboard
- **Playtest personas + telemetry** — `victory_rusher` / `ability_collector`; balance hints; `playtest_telemetry.json` after QA
- **Extended abilities** — grapple, swim, phase (9 registered abilities; room objects for grapple points, water zones, phase barriers)
- **Movement-feasibility QA** — `validateMovementFeasibility()` static gate; ability gates aligned to transition axes
- **Room archetype fidelity** — `worldArchetype` preserved in `rooms.json`; `auditRoomArchetypeFidelity()` static gate
- **Quest objective breadth** — all 10 schema types generated + tracked (Discover/Activate/Interact/Choice via new EventBus signals)
- **Project memory / RAG** — `project_memory.json` indexed from game content; studio LLM commands retrieve top-k chunks via Ollama embeddings
- **Image conditioning** — `ip_adapter` / `controlnet_canny` / `img2img` modes: Diffusers uses SDXL ControlNet + IP-Adapter pipelines; ComfyUI uses SDXL ControlNet/IP-Adapter node graphs (Flux img2img for plain img2img)
- **Repair template coverage** — grapple/swim/phase abilities + world objects in `TEMPLATE_STATIC_FILES`
- **Movement tuning pipeline** — `buildMovementJson()` writes full `movement.json` (grapple/swim/phase + dash tuning) from Game DNA
- **Boss telegraph/recovery** — per-phase timing from generated data
- **`COMMERCIAL_SAFE` generation mode** — license-filtered text routing
- **Template refresh** — `metroforge project refresh-template <slug>` (or `--all`) copies current runtime template into existing generated games without regenerating rooms/assets
- **Animation/tileset vision QA** — cross-frame consistency + tileset palette/occupancy critic on generated sheets (`animation-critic.ts`)
- **HUD quest tracker** — always-visible `QuestTrackerPanel` on GameHUD (active quests); pause-menu `QuestPanel` remains the full log
- **Equipment / upgrades** — relics raise max health, charms raise attack; keys and upgrade shards tracked in inventory; shops sell charms
- **Boss music + audio buses** — arenas play `audio/music/boss.wav`; Master/Music/SFX buses; biome music restores on leave
- **313/313 tests passing**, `pnpm build` succeeds

## Recent updates (2026-08-12)

Continued from Pass 23 baseline:

- **Model catalog reconciliation** — `catalog-reconciliation.ts`; desktop Models screen shows routable/live API status
- **Automated playtest bot** — `PlaytestAgent.gd` + `godot_playtest` gate
- **Rich VFX** — 8 textures, boss phase/attack feedback, ground slam shockwave
- **Cooperative generation cancel** — `AbortSignal` through pipeline and asset loops
- **Default runtime validation** — `godot_runtime` + `godot_playtest` in pipeline; `--skip-runtime-validation` opts out
- **`COMMERCIAL_SAFE` generation mode** — `mode-routing.ts` wires license filtering into text routing
- **248/248 tests passing**, `pnpm build` succeeds

## ✅ MetroForge AI — Feature Complete (v0.1.0)

All planned generation passes through Pass 23 are implemented.

### Pass 23 — Final Polish
- **MIDI export** (`.mid`) — OpenMPT-compatible Standard MIDI Files per biome
- **Tracker-interchange export** (`.tracker-interchange.json`) — row-based note-list, a manual-recreation aid for a real tracker (Furnace, OpenMPT), not a native project file
- **Stable Audio Open worker** — optional `diffusers_audio_worker.py` + `StableAudioProvider`
- **Ability-gated transitions** — `required_abilities` on `RoomTransition` (orange gates)
- **TileMapLayer** — `RoomTileMap.gd` paints floor/walls from generated tilesets
- **World map** — `MapManager` + pause-menu `WorldMapPanel` + corner HUD `MinimapPanel`
- **Save slots** — 3 independent slots, title-screen file select, legacy `savegame.json` migrates into slot 1
- **Enemy/boss attack anims** — attack sheets play on melee and projectile; walk/idle no longer override mid-swing
- **Animation/tileset vision QA** — cross-frame consistency + tileset palette/occupancy critic on generated sheets
- **HUD quest tracker** — `QuestTrackerPanel` on GameHUD lists active quests; pause menu still has the full `QuestPanel`

### Full Pipeline
Game DNA → Design Bible → World Graph → Content → Music (WAV/MIDI/tracker-interchange JSON) → Assets → Godot Assembly → QA

### Runtime Notes
- **Database:** CLI uses Node built-in `node:sqlite`; Electron desktop uses `sql.js` (no native compile step).
- **Electron:** `pnpm install` runs the desktop postinstall to fetch the Electron binary.
- **Node.js:** 22.5+ required.

### Run

```bash
pnpm install && pnpm build && pnpm test
pnpm dev:desktop          # Electron UI
pnpm metroforge doctor
pnpm metroforge create --prompt "Ruined temple Metroidvania" --profile TINY_TEST --mode LOCAL_ONLY
```

### Optional Local AI

```bash
pip install -r workers/requirements-diffusers.txt
pnpm metroforge models download sdxl-turbo --approve
```
