# Windows continuation — 2026-09-29

## Working repository

Use E:/Metroforge/MetroForge-Publish, branch codex/windows-recovery-live-edit, HEAD 1ea87a73976671d222f61f57f41b3b72e306937a. Its source includes later generator/runtime work than Recovered; the larger Recovered handoff was consulted separately. Extensive existing changes were preserved; no blanket source overlay, commit, staging or push occurred. Comparison receipts and before copies: E:/Metroforge/Recovery-Audit/development-20260929. GitHub credential check found no authentication, so upload remains blocked.

## User decisions

Top-down and Metroidvania are two independent content sets: assets, animations, levels, audio, test projects, backups and save directories. Top-down needs a complete visual redesign in stylized pixel art with rich color, strong silhouettes and detailed environments. Old top-down art is rejected. See TOPDOWN_PIXEL_REDESIGN.md. The painted Metroidvania direction remains separate. User wants visible tests. All created files, dependencies, downloads and caches stay on E:.

## Implemented

- Physical navigation clearance for the real 20px top-down body; seeded, purpose-specific dungeon sizes and explicit safe spawns.
- Manual top-down scaffolding now emits its real overworld/dungeon graph and route instead of side-view room IDs.
- Top-down idle/run loading, sidecar playback timing, directional run fallback and gait phase continuity.
- Native smoke timing now respects authored attack startup and physics synchronization.
- Separate refresh and play launchers with genre checks, provenance and backups; refresh includes each source game's own audio/music.
- Boss bot no longer forcibly cancels attacks at 0.15s; the full fight still fails and is not waived.
- Opt-in woodland_ruins terrain planning, exposed in refreshTestGame and its fourth CLI argument. Old game layout remains unchanged unless selected. New woodland route/physics checks pass.
- Run Game Tests.cmd gives visible progress and saves receipts under reports/game-tests on E:.

## Verification

Application build passes. Earlier focused suite: 30 tests; latest affected suite: 28 tests including three new woodland tests (overlapping suites; do not add the totals). Latest repeatable native smoke: top-down 169 passed, Metroidvania 198 passed. Native woodland loader/timing/physics: 36 passed. Top-down input playthrough reaches all four transitions but fails boss victory; after correcting attack cancellation it still fails. Native shutdown resource/object diagnostics remain.

Unity 6000.3 imported and rendered a sprite strip. Unreal 5.8.2 loaded 23 meshes with valid bounds. These are native asset checks, not full fresh game compilation, playthroughs or packaged builds. RTX5060 ran actual offline SDXL inference. Two art candidates were generated and inspected; neither is approved production art. Latest pixel concept is too soft and remains excluded from runtime.

## Current fixtures and continuation

GeneratedGames/test-games/topdown/current is the rejected comparison build, launched visibly for the user. Do not rename it while that game is running. It predates the final audio-inclusive refresh and boss-bot repair; those source improvements will apply on its next refresh. Metroidvania/current includes its own restored audio and passes smoke checks. The separate audit topdown-boss-check contains the latest bot and woodland test data, solely for validation.

Next work: produce and review a crisp, coherent top-down terrain/prop family and true directional motion; assemble the woodland slice with new interface, clear interactions and continuous gameplay capture. Investigate boss damage/positioning and survival under real input without changing win criteria or granting invulnerability. Check generic asset pipeline animation fallbacks: it still has side-view pose prompts and shared procedural clips, so successful generation is not proof of top-down art correctness. Finish engine compile/build/play validation before claiming Unity or Unreal game readiness.

Do not copy Metroidvania art into the top-down redesign, use a generated illustration as a finished level, claim animation quality from frame counts, or label rejected art approved.
