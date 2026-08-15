# MetroForge P7 — Quality Director / Production Polish Plan

**Date:** 2026-08-15  
**Constraint:** No P8. No MetroForge app UI redesign. Do not weaken QA. Do not regenerate the whole game. Do not replace NVIDIA characters/tilesets/VFX unless a source image is proven unsuitable. Do not fake scores or screenshots.

**Baseline HEAD:** `072d85a89d6cfa5fd89ef09b2e81f2865cc525d2` (includes `630ad61`)  
**Project:** `GeneratedGames/heart-engine-release-candidate`  
**Before critic:** score **55**, `lumaStdDev` **2.4219**, uniqueColors **30**, occupancy **85.6%**  
**Before evidence:** `reports/p7-evidence/before/`

## Diagnosis (from P6.5 screenshots, no mutation)

1. **DEPTH / LIGHTING / CONTRAST:** Rooms stretch the 16px tileset atlas as a full-room `TextureRect`, so the frame is noisy and spatially flat. Viewport at zoom 1.5 shows large empty margins of default clear color — 3×3 cell luma stddev falls below the critic threshold of 4.
2. **ROOM_COMPOSITION:** No data-driven decor, no exclusion-aware props, no parallax layers despite StyleBible `environmentDensity`.
3. **HUD / VICTORY:** Functional CanvasLayer HUD; high-contrast gothic polish is missing.
4. **CAMERA:** `Camera2D` follows the player with no dead zone, look-ahead, or room bounds — empty lattice around the 800×600 room dominates screenshots.
5. **COMBAT / VFX:** VFX textures exist (NVIDIA); scale/timing/hitstop/flash are not profile-driven; a11y flash/shake toggles incomplete.
6. **AUDIO:** Master/Music/SFX procedural buses exist; UI/Ambience mix file missing.
7. **TRANSITIONS:** Instant room swaps; presentation fade is safe if it does not change collision or routing.

## Architecture

`packages/qa` **QualityDirector** consumes DNA, StyleBible, world, rooms, manifest, screenshots, critic, telemetry, provenance and emits `QualityReport` / `QualityPlan` / typed `RepairActions[]`.

**QualityDirector does not scatter file writes.** A **QualityRepairEngine** executes only discriminated `RepairAction` commands, with budgets and rollback if `afterScore < beforeScore` by ≥ 5.

Separate **technicalScore** (gates, playtest, commercialSafe, placeholders) and **presentationScore** (critic, luma, lighting, HUD). Overall `qualityScore` 0–100.

## Targeted LOW_RESOURCE repairs

1. Lighting/depth: `CanvasModulate` + few `PointLight2D`; palette ColorRect parallax (no new NVIDIA images).
2. Decor: data-driven props with exclusion zones (spawn, doors, jumps, combat, pickups).
3. Outline shader: subtle, skip if already readable.
4. `CombatFeedbackProfile` (hitstop/flash/VFX scale) + a11y shake/flash.
5. `CameraDirector`: lock-to-room when view ≥ room, dead zone / look-ahead otherwise. Do not change transition physics.
6. Presentation fades only.
7. Polish generated `GameHUD` (not MetroForge Studio).
8. Procedural bus mix Master/Music/SFX/UI/Ambience. No FFmpeg.
9. Recapture via existing `windowed_gpu` path; report critic honestly (70+ preferred).
10. VFX audit (scale/layer) before any regen — regen only if missing/unsuitable.
11. Pacing issues from telemetry → lighting/variety only, not layout rewrites.
12. Persist `data/quality/quality_report.json` for a future UI; no Studio redesign.

## Gates that must remain true

Playtest 8/8, 30/30 transitions, `commercialSafe` true, placeholder 0, REJECTED death sheets stay REJECTED, Godot import + CLI validate. Rollback and FAIL honestly if playtest regresses.
