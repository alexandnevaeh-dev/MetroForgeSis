# Build Status

## ✅ MetroForge AI — Feature Complete (v0.1.0)

All planned generation passes through Pass 23 are implemented.

### Pass 23 — Final Polish
- **MIDI export** (`.mid`) — OpenMPT-compatible Standard MIDI Files per biome
- **Furnace module export** (`.fur.json`) — row-based interchange for Furnace tracker
- **Stable Audio Open worker** — optional `diffusers_audio_worker.py` + `StableAudioProvider`
- **Ability-gated transitions** — `required_abilities` on room exits (orange gates)
- **TileMapLayer** — `RoomTileMap.gd` paints floor/walls from generated tilesets
- **AbilityGate.tscn** — template for gated passages

### Full Pipeline
Game DNA → Design Bible → World Graph → Content → Music (WAV/MIDI/Furnace) → Assets → Godot Assembly → QA

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
