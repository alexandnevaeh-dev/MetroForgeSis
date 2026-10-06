# Quantum Divergence

Updated 2026-10-01. Working title and a **third, separate genre**: side-view quantum simulation roguelite. The existing top-down woodland adventure and Stormglass Metroidvania retain their own assets, levels, animations and tests.

## Decisions and source

The user explicitly requested a new genre, a Noita-inspired game with a different objective and powers, a sci-fi setting and quantum physics. The user then authorized Codex to answer Copilot's remaining questions using its judgment. These are delegated design decisions, not claims that the user individually selected every detail.

Source discussion: the Copilot group conversation supplied by the user. Copilot was asked about the complete design, then given answers to every preference question, then asked to resolve simulation, recovery, animation and weapon contradictions. The retained local response, private source reference and screenshot are under `reports/game-tests/20261001-quantum-divergence/`, excluded from the public source upload. No credentials or private project files were sent to Copilot.

| Question | Working decision |
| --- | --- |
| Perspective | Side-view 2D, 360-degree aiming, jumping and short levitation bursts |
| Generation | Hybrid: authored landmarks and encounters connected by seeded destructible terrain |
| Tone | Mysterious, serious sci-fi with restrained cosmic horror and beautiful, readable pixel art |
| Death | Run ends; knowledge, module blueprints and alternate loadouts persist; no permanent raw stat inflation |
| Simulation | Seeded, fixed-step and reproducible, with emergent results inside strict budgets |
| Instruments | Two equipped, quick swap; four slots: waveform, operator, state, trigger |
| Programming | At safe stabilizer stations, with cost/behavior preview |
| World | Branching biome connections, optional secrets, readable landmarks and shortcuts |
| Saving | One resumable suspended run per profile; separate persistent knowledge/loadout data |

Quantum mechanics are fictional gameplay metaphors, not a scientific quantum simulation. The new genre's defining feature is actual simulated materials and programmable interactions; naming standard Metroidvania abilities after physics is insufficient.

## Premise, loop and world

An engineered Quantum Diver enters a megastructure whose Quantum Cascade threatens inhabited space. Explore, stabilize regional anchors, discover modules, recompile instruments and push toward the Quantum Core. Each region offers extraction or deeper continuation. Proposed final choices stabilize the cascade, overload it, or merge with the Core. Logs, alternate-timeline echoes and old stabilization machinery deliver lore through exploration.

The six proposed biomes are Probability Mines, Decoherence Swamps, Entanglement Forest, Chrono Rift Zone, Vacuum Caverns and Quantum Core. These names and endings are design proposals. Vacuum energy always has finite range, life and capacity; no infinite beams. Time effects cannot freeze input or prevent Recall.

## First playable biome: Probability Mines

Target world: approximately 180×120 art tiles at 32px, or 5760×3840 world pixels. A tile contains 8×8 simulation cells at 4px per cell. The complete world therefore needs roughly 1.38 million cells, chunked activation and measured performance. The current small-grid reference kernel is not that complete world.

The authored 48×32-tile entry chamber contains the two starting instruments, a safe station and a protected traversal backbone. Upper, middle and lower mine landmarks connect through procedural destructible terrain. A 64×48-tile arena houses the Probability Golem. Optional branches reach the Collapsed Survey Tunnel and an Entanglement Echo Chamber. The exit is a stable Quantum Lift.

1. Anchor the Upper Mines: interact with a protected node to lower regional flicker probability from 20% to 10% per second.
2. Collapse the Mid Mines Rift: destroy three rift crystals; required ghost platforms become permanently stable instead of disappearing.
3. Defeat the Probability Golem and stabilize its core. **All three objectives and the defeated Golem are required for the exit.**

The secret tunnel grants a module blueprint and healing nano-gel, and provides an alternate route. It must remain reachable using the starting kit and Recall. Persistent unlocks add options, not mandatory stat advantages.

## Simulation contract

Run a fixed 60Hz simulation independently of rendering. Materials include empty space, stable/mutable solids, unstable ore, falling sand and flowing fluid. Heat is a bounded scalar field, transported through a double buffer. Energy projectiles have their own bounded entity collection. Decorative particles are independent of material cells.

- Sand falls at most one microcell per tick, then slides diagonally if blocked. Fluids fall, slide and spread laterally without creating duplicate matter. Alternate horizontal scan direction to limit bias.
- Stable solids do not randomly flicker. Unstable ore uses seeded probability with `p_tick = 1 - (1 - p_second)^(1/60)`. Initial regional probability is 0.20 per second.
- Mutable solid melts to sand at heat 0.8; sand becomes fluid at 0.6; fluid vaporizes at 0.9. Heat remains within [0,1], diffusion coefficient 0.1/second, dissipation 0.02/second. Protected anchors reject material mutations and heating.
- Collapse stabilizes eligible unstable cells for 180 ticks (three seconds). It cannot fill actor or objective occupancy. Share a 1024-cell mutation budget across all collapse calls in a tick (16 art tiles).
- Protect world boundaries, station floors, exit machinery and required escape routes. Protected empty station clearance must also stay free of material ingress in the integrated world.
- Recall is a free one-second hold action returning to the last verified-safe station. Validate the **whole player-sized** arrival rectangle against material and hazards, then grant 0.5 seconds arrival immunity. Retain a guaranteed safe entry fallback. Adding solid rescue tiles to an enclosed player is forbidden.
- Initial caps: 64 live projectile slots including reserved split capacity, eight entanglement links, 3000 cosmetic particles. Use fixed deterministic chunk work budgets in the full biome; do not skip simulation based on wall-clock timing.

## Instruments and module rules

| Starting instrument | Four slots | Damage | Cost | Cooldown | Projectile life |
| --- | --- | ---: | ---: | ---: | ---: |
| Photon Stabilizer | Photon Pulse / Collapse / Thermal / Impact | 12 | 4 energy | 0.40s | 0.60s |
| Tachyon Splitter | Tachyon Bolt / Superposition / Dark Energy / Probability Threshold | 8 per child | 6 energy | 0.60s | 0.80s |

Both have a maximum 640px travel distance and swept collision. Fire is rejected atomically on invalid direction, insufficient energy, cooldown or capacity; a rejected request does not charge resources or replace entities. Use 100 initial energy with a tunable 8/second recharge after a one-second firing pause.

Photon impact stabilizes eligible ore for three seconds; it cannot create solid matter inside actors or damage protected structures. It can hit enemies in clear space. Thermal destruction and Collapse programming must have separate previews so their opposite effects are understandable.

Tachyon splits **once** below probability density 0.40, producing three total children that replace the parent, not parent plus three. Children inherit remaining life/range and cannot split. Do not split with under 0.20 seconds remaining. Reserve split capacity at firing time so saturation cannot exceed the cap or discard existing shots.

Entanglement and Tunneling are discoverable module blueprints, not additional starting instruments. Entanglement links exactly two distinct living targets, one link per entity, up to eight pairs for six seconds. Transfer 50% damage once with a secondary tag so it cannot relay back; break links on target death. Reject link creation without cost if targets or capacity are invalid.

Tunneling traverses at most 32 **occupied** microcells total (four art tiles). Stop at immutable cells. Attenuate damage by 20% after every eight occupied cells; crossing a decorative tile boundary is not a new charge. Energy retains finite life and range in vacuum.

## Original art and animation contract

Use rich, crisp pixel art with steel-blue/slate/violet rock and machinery, cyan unstable ore, pale blue-white ghost platforms, cyan Photon effects and magenta Tachyon effects. Heat uses orange/yellow light. Foreground terrain, mine-wall background and distant machinery must form a coherent interior. Outer void glimpses belong at actual openings, not behind every interior room. Player and enemy silhouettes stay readable without excessive bloom or continuous flickering.

All actors expose idle, walk, run, attack, hit and death. A floating Wraith maps walk/run to distinct slow/fast glide clips rather than omitting locomotion. Grounded actors use bottom-center foot anchors; Wraith uses a center anchor and intentional levitation. Do not reuse the old woodland or Stormglass sprite families. Each required clip needs distinct poses, contact consistency and a reviewed sprite manifest; blur or flickering a still frame does not count as animation.

Numbers below are `unique frames @ FPS`, initial production targets subject to visual review.

| Actor / frame size / pivot | Idle | Walk or glide | Run or fast glide | Attack | Hit | Death |
| --- | --- | --- | --- | --- | --- | --- |
| Diver / 32×48 / feet | 6@10 | 8@16 | 10@24 | 6@24 | 3@18 | 12@18 |
| Skitter / 32×32 / feet | 6@10 | 8@16 | 10@24 | 6@24 | 3@18 | 8@18 |
| Wraith / 32×48 / center | 6@10 | 8@16 | 8@24 | 6@24 | 3@18 | 10@18 |
| Driller / 48×32 / feet | 6@10 | 8@16 | 10@24 | 8@24 | 3@18 | 8@18 |
| Golem / 64×96 / feet | 8@10 | 10@16 | 12@24 | slam 12@24, burst 10@24 | 4@18 | 16@18 |

Additional clips: Diver jump 4@16, levitate 6@16, dash 6@24; Wraith teleport 6@24 and levitate 6@16; Driller drill 8@24; Golem roar 8@24. Gameplay telegraph and hitbox timing own the attack; adapt animation segments to those intervals instead of deriving hit timing from arbitrary clip length.

| Attack | Telegraph | Active | Recovery | Health / damage |
| --- | ---: | ---: | ---: | --- |
| Diver Photon | 0.10s | projectile spawns after telegraph | 0.30s | player HP 100; shot 12 |
| Diver Tachyon | 0.15s | projectile spawns after telegraph | 0.45s | child 8 |
| Skitter dash | 0.20s | 0.30s | 0.30s | HP 20; damage 5 |
| Wraith shot | 0.25s | projectile spawns after telegraph | 0.35s | HP 30; damage 8 |
| Driller charge | 0.50s | 0.40s | 0.40s | HP 40; damage 10 |
| Golem slam | 0.60s | 0.30s | 0.60s | HP 300; provisional damage 15 |
| Golem burst | 0.50s | 0.40s | 0.50s | 3–5 bounded shots; provisional damage 8 |
| Golem terrain roar | 0.40s | 0.20s | 0.40s | no direct damage; bounded local material change |

Golem impact starts after its 0.60-second telegraph, not 0.30 seconds into the telegraph. Never overwrite station/actor/objective cells. Attacks use shape, motion and sound as well as color for readable warnings.

## Native architecture and save boundary

Use Godot 4.6 `CharacterBody2D`, `AnimatedSprite2D` and `TileMapLayer` where applicable; Copilot's older KinematicBody2D/TileMap names are conceptual references. Do not turn the material grid into a full scene tree of individual cells.

Simulation owns materials, temperature, seeded state, projectile entities, damage, objectives, run progression and saveable state. Presentation owns packed texture updates, animation playback, parallax, lighting, sound and HUD. A material collision adapter reads the same microcells the renderer displays, avoiding invisible old tile colliders after destruction.

Planned modules: MicrocellGrid, active-chunk scheduler, material collision adapter, QuantumInstrument compiler/preview, projectile simulation, actor state machine, objective graph, RecallController, RunManager and renderer. Inputs map move/jump/levitate/dash/aim/fire/swap/recall/interact/pause separately from UI actions.

Version saves. Separate profile blueprints/loadouts/lore from run seed, simulation tick, material and heat chunks, RNG state (if stateful), pending effects, projectile IDs/remaining life/range, actor health/position/state timers, links, objectives, station locations and ghost-platform state. Store simulation state, never engine node references. Write a complete temporary generation then publish it to a new unique filename; reject malformed or incompatible data without partial mutation. Death resets run state while preserving only allowed profile unlocks. Chunk-scale saves remain future work.

## Implementation and acceptance checklist

- [x] Finish Copilot consultation and answer remaining preferences with delegated judgment.
- [x] Isolate the quantum simulation foundation under `prototypes/quantum-divergence`.
- [x] Implement native reference microcells, sand/fluid, seeded ore, double-buffered heat, protected anchors, collapse lifetime/budget and clearance checks.
- [x] Implement native simulation snapshots and deterministic continuation.
- [x] Initial full-size bounded chunk activation, cached terrain rendering and native measurement.
- [ ] Production frame budget across every region; fluid viscosity tuning and vapor event output.
- [x] Native playground player collision/movement, 360-degree aim, two starting instruments, Recall hold/action, safe station fallback.
- [x] Starting-instrument swept projectile simulation, exact three-child split behavior and atomic capacity/resource accounting in the native playground.
- [x] Station compiler/preview and discoverable entanglement/tunneling modules in the connected-world candidate.
- [x] Native progression rules: regional anchor, three projectile-damaged crystals, permanent ghost-platform stabilization, defeated-Golem/core gate, secret reward and fully gated extraction in a rendered control.
- [x] Initial full-size connected Probability Mines layout, seeded deposits, safe stations and live encounter placement.
- [x] Starting-kit optional branch traversal and physical return, and a completed native full-world combat/objective playthrough.
- [ ] Production world dressing and complete final biome presentation.
- [x] Native live actor controller for Skitter, Wraith, Driller and Golem: telegraphs, active/recovery timing, material collision, damage, hit/death state, bounded terrain pulses and shared projectile capacity in an integrated objective route.
- [ ] Three enemy families and Golem with original complete reviewed animation sets and timings above.
- [ ] Original coherent terrain, interior backgrounds, effects, audio and HUD.
- [x] Local CUDA pixel-style adapter, pinned weight integrity, actual foreground isolation and native static alpha-anchor review. [Evidence and visual limits](QUANTUM_ART_PIPELINE.md).
- [x] Durable versioned profile/suspend files, safe recovery, death/restart and extraction ending in the compact native encounter.
- [x] Station programming preview.
- [ ] Chunk-scale saves and durable programmed loadouts.
- [x] Native full-biome objective, defeated-core and extraction flow with a living player.
- [x] Add genre schemas, capability registry, own assembler/template and app UI only when the runtime exists. Unknown genre IDs must never silently generate the existing Metroidvania.
- [x] Generate through MetroForge's real app UI, play through all three objectives, show gameplay/animation captures and retain failures honestly.

Native simulation behavior tests must prove mass conservation, one-cell movement, deterministic same-seed replay, differing seed layouts, stable-solid exclusion from flicker, per-second rates, protected anchors, occupied-cell rejection, exact collapse expiry, shared budgets, symmetric bounded heat and identical post-resume future state. Save corruption and blocked recall destination tests must fail safely.

Later acceptance must prove swept terrain/projectile collision, damage/energy/cooldown accounting, three total nonrecursive children, eight-link saturation with no relay feedback, tunneling attenuation, full-size Recall clearance and immunity, actual enemy timing, all objective ordering, hidden route access, death profile isolation and complete suspend recovery. Physics tests cannot stand in for visual approval or an app generation playthrough.

## References and limits

Official pages verified 2026-10-01. These are references to study, not licensed assets to vendor.

- [Noita official developer page](https://www.noitagame.com/): the developer describes pixel-material simulation including liquids, sand, gas and simplified thermodynamics. Study readable material interactions and emergent routes. Its linked official trailer embed is `https://www.youtube-nocookie.com/embed/0cDkmQ0F0Jw`; the link was verified from the page, but the video has not been played/reviewed in this pass.
- [Dead Cells publisher storefront](https://store.steampowered.com/app/588650/Dead_Cells/): use its official screenshots/trailers as motion and combat-readability references. The publisher describes responsive combat and a branching roguelite structure. No frame-by-frame video review has yet been performed.
- [Hyper Light Drifter developer storefront](https://store.steampowered.com/app/257850/Hyper_Light_Drifter/): use as a palette and environmental-cohesion reference. Heart Machine describes hand animation throughout its characters/backgrounds. Its top-down movement is not the new game's camera model.
- Copilot's Nolla YouTube channel link is unverified as a channel in this pass and is not an individual gameplay video. Generic stock quantum pictures from its earlier response are excluded from the game art plan.

This specification is not production-ready software. Current implementation evidence and its limits are recorded in the mechanics milestone below; unfinished systems and visual review remain explicit above.

## Mechanics milestone, 2026-10-01

The isolated native playground now runs interactive controls against the same material grid shown on screen. It includes walk/run/jump, finite levitation, collision-safe dash, free aiming, Photon thermal/collapse impacts, Tachyon three-child nonrecursive splits, swept grid/target collision, damage, energy and cooldown accounting, atomic capacity reservation, protected entry clearance and Recall. A held Recall triggers once and cannot continually refresh immunity; a blocked newest station falls back to an older safe station.

53 native behavior checks pass: 27 material/snapshot checks and 26 player/instrument checks. A real GPU-rendered 450-tick control run fired three times, split once, recalled once, and ended with the Diver's feet at the 336px floor and HP 100. Three actual viewport images are retained under `reports/game-tests/20261001-quantum-divergence/`. The initial capture driver failed because it expected `60` instead of the engine's zero-padded `060` filename; the real captures existed and the verifier was corrected.

In the same small playground, measured mean simulation/update work improved from 17.53ms to 12.26ms after avoiding zero heat-field scans and transparent-cell color work. The later run processed 450 ticks in 7.46 seconds; its worst tick was 21.23ms. These measurements concern this small world only and do not establish a 60 FPS full biome or a production performance budget. All heat, replay, collision, capacity and Recall behavior checks passed after the optimization.

Current presentation uses original programmatic test poses and geometry. It is not final approved sprite animation, the complete Probability Mines biome, an enemy/boss slice, a completed roguelite, or proof of MetroForge app generation. Actual module programming, discoverable entanglement/tunneling, complete run/profile saves, chunked world scale, final assets, enemy AI and app integration remain on the checklist.

## Progression milestone, 2026-10-01

`MinesProgression.gd` now owns the first biome's objective rules. Interacting with the upper anchor changes its region from 0.20 to 0.10 per second while preserving the lower region's seeded material replay. Three distinct 24-HP rift crystals require actual projectile damage. After all three are destroyed, the authored ghost platforms become permanently solid; a full preflight defers the entire commit if any actor occupies a future platform cell. No partial route is built inside an actor. Required platforms then reject heating and destruction. Core stabilization requires the 300-HP Golem target to be defeated; extraction requires all three objectives plus that defeated target. A secret grants one Entanglement blueprint and 25 healing, capped at 100 HP and once per run.

The native suites now contain 87 checks: 27 material checks, 29 movement/instrument checks and 31 progression checks. These include all 16 combinations of objective/boss flags, proximity/death guards, crystal damage, deferred atomic platform stabilization, permanent-route protection, duplicate reward prevention, regional snapshot continuation, malformed-region rejection and lower-region isolation. Profile knowledge is currently an in-memory contract; durable profile/suspend files and an integrated death/reset flow remain pending.

The separate `ProgressionPlayground.tscn` control uses real movement, aim, windup, collision, cooldown, energy recharge and interaction input. Its seeded fluid basin spills in front of the stationary Golem target, intercepting two shots. The verified route therefore fires 33 times: six crystal hits, 25 Golem hits and exactly two liquid impacts at approximately (532,301). An earlier verifier assumed 31 total shots and correctly failed; impact telemetry identified the real material barrier, and an independent fluid-shield regression confirmed that a first shot heats/vaporizes the liquid instead of damaging an enemy behind it. The route verifier now checks the precise hit counts, impact count/locations and every extraction flag; failures and captures are retained.

Double-click `prototypes/quantum-divergence/Run Probability Progression.cmd` for the interactive progression control; press E near the anchor, secret, defeated core or exit. The automated control and optional movie recording use offscreen native GPU rendering, never injected desktop input. Source hashes, actual viewport images and results are under the E:-resident quantum test reports. This compact control proves integrated progression and material-aware damage. Its stationary targets, programmatic test art and protected traversal floor do **not** establish finished enemy attacks, final animation, the full 180×120-tile biome or MetroForge app generation.

## Live encounter milestone, 2026-10-01

`EnemySimulation.gd` adds live Skitter dash, Wraith projectile/slow and fast glide, Driller charge/carving and a Golem cycling through slam, three-shot burst and terrain roar. Actor collision reads the authoritative microcell grid, moving in bounded substeps. Grounded actors use foot pivots; Wraith uses an intentional center/levitation pivot. The instrument target table owns HP, so the rendered enemy, projectile hit detection and progression gate use the same health. Hit state does not silently restart attack clocks. Death stops movement and new attacks. All actors expose idle, walk, run, attack, hit and death states; production sprite sheets for these states remain pending.

Hostile shots and reserved player split capacity share the 64-slot limit. Both sides reject saturated capacity without replacing existing entities. Hostile shots use swept material/player collision with finite lifetime and range. Player damage enters hit/death state and grants a bounded 30-tick hurt immunity that also respects Recall arrival immunity. Drilling preserves immutable, reserved and occupied cells. Slam/roar currently collapse only eligible existing ore with the shared mutation budget; new ore creation and biome-specific impact dressing remain pending. Material stepping resets that shared budget before hostile and player effects, so enemy effects cannot obtain a second budget in the same tick.

128 native checks pass: the previous 87 plus 41 actor/combat checks. These prove complete Skitter/Driller timing, Wraith shot timing and shielding, Golem's full 0.60-second warning/active impact/recovery, burst count, no direct roar damage, genuine ore collapse lifetime, protected/reserved ore exclusion, meaningful jump avoidance versus an intentionally too-late jump, mixed projectile saturation, hurt/Recall immunity, actual enemy hit/death, no attacks after death, distinct Wraith fast glide and deterministic actor replay. The jump tests exposed a real controller issue: held levitation had clamped a faster jump down to -190px/s. It now preserves faster upward jump velocity while limiting levitation acceleration.

`CombatPlayground.tscn` integrates these four live enemies with the existing three-objective route. The successful control ended after 2280 ticks (37.87 seconds) with HP 44, 41 shots, all four enemies defeated, the secret blueprint collected and every objective/extraction flag true. It recorded 40 damaging hits (two, three and four hits for the small families, six crystal hits and 25 Golem hits) plus one real fluid interception. Every enemy reached an active attack; the Golem reached eight slams, seven bursts and seven roars. Eight projectile damage events occurred, with the early secret heal restoring the first eight damage; no test-only invulnerability, health grants or objective bypass was used. The first live control failed by waiting outside the Driller's detection range; its terminal report/log/capture are retained, and the test player's approach was corrected without widening enemy aggression.

Play with `Run Live Mine Encounters.cmd`; record with `scripts/record-quantum-playground.mjs --combat`. The compact authored control uses original programmatic poses and diagnostic HUD/telegraphs. It proves live combat connected to progression; it is not the full specified biome, final approved character animation, complete save/death/restart flow, finished audio or a MetroForge app-generation walkthrough. The original stationary progression control remains as a separate regression fixture. Godot GPU movies use fixed recording cadence; they do not establish full-biome performance.

## Durable run milestone, 2026-10-01

The live encounter now includes F5 suspend/pause, F9 resume, automatic loading of a valid suspend at launch, and Enter to start a fresh run after death or extraction. `RunState.gd` reconstructs a detached complete bundle before the controller swaps any running component. It preserves material/heat/collapse arrays, seeded tick, player velocity and timers, pending instrument windup, reserved split capacity, hostile projectiles, actor attack clocks/HP and objective/platform state. Unknown fields, incompatible world dimensions, nonfinite data, forged HP/flags/capacity, excessive immunity/velocity and extended projectile lifetime are rejected. This version intentionally supports only the 192x96-cell encounter world; it is not a full-biome chunk-save implementation.

`SaveStore.gd` writes checksum-verified immutable generations on E:, publishing a completed temporary file under a fresh unique filename. It avoids replacing an existing Windows file in place and retains eight generations per profile/run group. A damaged latest active candidate can fall back to an older valid generation, while a published death/extraction/new-run marker blocks resurrection of an earlier active run even if that marker's body is damaged. Incomplete temporary files are ignored. This is logical crash recovery, not a claim of guaranteed durability through every hardware power-loss scenario. Profile data admits blueprint/loadout/lore IDs and rejects raw stat fields; a corrupt profile is reported without silently overwriting knowledge.

The five native suites now contain 182 checks, including 54 save/session checks. They compare every restored field and subsequent material/AI/projectile/damage state against an uninterrupted run; exercise truncated and semantically malformed files, independent process/session loading, bounded backup retention, profile isolation, terminal markers and a clean restart. The separate rendered save control suspends during a live hostile projectile, resumes at the same tick without gameplay mutation, lets actual enemy attacks cause death, verifies both disk and memory reject the ended run, and starts a fresh 100-HP/100-energy world with the earned Entanglement blueprint retained. It uses its own E:-resident report profile rather than the user's interactive save directory. The full live objective route remains a separate regression control.

Run `scripts/verify-quantum-save.mjs` for rendered proof and `scripts/record-quantum-playground.mjs --save` for its native viewport movie. All assets remain original test poses; final animations/art, chunked world scale, module programming, production audio and actual MetroForge app generation remain unfinished.

## Connected world milestone, 2026-10-01

`MineWorld.gd` now constructs the intended 180x120-tile (5760x3840-pixel, 1440x960-cell) Probability Mines layout. Eight authored landmarks include the 48x32-tile entry, Upper Mines, Mid Rift, Collapsed Survey Tunnel, Lower Works, Echo Chamber, 64x48-tile Golem Foundry and Quantum Lift. Seeded ore, sand and liquid pockets vary without moving these authored regions. Protected floors, full-body station clearance, actual shaft openings and reachable stair/bridge connections form a continuous mine rather than isolated test rooms. The main traversal backbone has 101 waypoints; survey and echo branches remain separate optional routes.

`ChunkedGrid.gd` keeps bounded dense material storage for the complete 1,382,400-cell world while restricting computation to awake dynamic chunks and their halos. Chunks contain 32x32 microcells, with a deterministic 96-chunk activation cap. Sleeping matter and heat freeze; collapse expiry uses the global fixed tick and is applied on activation. This is explicit active-world simulation, not the same semantics as simulating every offscreen cell continuously. Awake material/heat behavior matches the original reference kernel across chunk seams. Snapshots preserve active regions and reconstruct sparse work metadata. They are not yet integrated into durable world-run files.

Sleeping actor positions and phase timers also freeze. Waking cannot skip a warning and fire immediately. Existing entity lifetime/range and global projectile capacity remain bounded. World focus admits the camera first and additional projectile regions in stable order if the work budget is saturated; it preserves entities rather than discarding arbitrary shots. Rendering caches world-coordinate chunk textures and rebuilds only changed chunks. Scene movement/aiming/collision and rendering read the same grid.

Twenty-three native chunk/actor/precision checks and ten native world checks accompany the existing 184 compact mechanics/progression/combat/save checks. Native world traversal uses the actual starting movement controller without teleportation or health grants to walk the complete main backbone, reach the lift, and Recall safely. The larger map exposed a real collision bug: subtracting a tiny epsilon from body bounds rounded away at deep world coordinates and included the supporting floor in the body. Player and enemy bounds now use exact half-open cell bounds. Traversal also exposed blocked shaft and stair joins; failed runs are retained under the quantum reports and authored connections were corrected rather than granting new movement powers. Optional branch traversal and a full-world objective/combat completion are still unverified.

`WorldPlayground.tscn` places live Skitter, Wraith, Driller and Golem encounters in this world and connects the same crystal/anchor/core/lift rules. The rendered control is intentionally scoped to actual movement from entry to the Upper Mines anchor. All eight visible stations can register a safe Recall destination; full-world death/extraction can start a fresh layout with Enter, retaining in-memory knowledge. Durable saves remain available in the separate compact encounter and are not silently reused for the full world. Final character/terrain assets, complete animation sheets, full-world durable recovery, module programming, production audio and MetroForge app generation remain unfinished.

Play with `Run Probability Mines World.cmd`, verify with `scripts/verify-quantum-world.mjs`, and record the entry walk with `scripts/record-quantum-playground.mjs --world`. The current mine-wall layer, machinery and actor poses are original diagnostic art. Native GPU capture and the full physics traverse do not establish production visual approval, completed full-biome combat or a stable 60 FPS budget in every region. In the same entry route, changing full viewport raster rebuilding to changed-chunk texture updates reduced measured CPU work from about 20.30ms to 15.80ms; the final verifier additionally includes focus work in its reported CPU metric. Fixed-rate movie output is presentation evidence, not a hardware-performance measurement.
The connected-world integration also verifies that living enemy occupancy blocks Recall arrival, and that a cleared destination becomes usable after death. Station registration removes only the player's own occupancy while retaining living enemies; standing at a station cannot block its own admission.

## Full-world encounter milestone, 2026-10-01

The larger mine now has a completed native combat/objective route in addition to the earlier entry and physics controls. `WorldRunDriver.gd` emits only normal movement, jump/levitation, aim/fire and E interaction requests. It never writes player position, health, immunity, enemy HP, material cells or objective flags. The complete tour physically walks both the Echo Chamber and Collapsed Survey Tunnel outward and back before continuing the main mine route. No Recall or teleport shortens this tour. Separately named branch routes remain part of the authored world manifest.

The first branch test found that alternating ascending platforms stacked a ceiling above the launch pad in the echo route. Ascending stairs now advance sideways, preserving side access. Both branch round trips pass from the actual entry with the unchanged starting movement kit, full-body clearance and no health grants. Six new native branch checks join the existing 217, for **223 native behavior checks**. The first failed echo result remains in `branches-first.log`; the corrected main backbone and all 23 chunk checks also pass.

`WorldVictoryPlayground.tscn` and `scripts/verify-quantum-world-victory.mjs` run the full-size world with actual GPU rendering. The accepted tour reaches all 161 waypoints and all eight landmarks, registers all eight stations through E, anchors the upper region, damages three crystals with projectiles, earns the secret Entanglement blueprint, defeats Skitter/Wraith/Driller/Golem, stabilizes the defeated core and extracts. Every family reaches an active attack. The Golem reaches three slams, three bursts and two roars. Forty accepted Photon shots produce exactly 40 damaging target hits: two, three and four for the small enemies, six crystal hits and 25 Golem hits. Three genuine hostile projectile hits leave HP 76. No scripted health or invulnerability grants are used.

The successful rendered route runs for 6182 ticks, including the 90-tick post-extraction hold, and retains six real viewport captures. An earlier rendered attempt completed every gate but pressed E one frame before its final waypoint was recorded; the strict test correctly failed at 160/161. The test now waits for physical arrival before requesting lift interaction. That failed result and captures remain under `world-victory-1790862683447/`; the acceptance conditions were not weakened. Latest source hashes, exact target hit counts, all attack activations, landmark visits, branch returns and captures are recorded in `world-victory-latest.json`.

Add `--world-victory` to `scripts/record-quantum-playground.mjs` for the complete native viewport movie. Recording uses the existing E: Godot/FFmpeg runtimes and verifies the resulting MP4 by decoding the whole file. Movie timing is fixed at 60 FPS and is not proof of stable hardware frame rate. Awake chunks remain at or below the 96-chunk cap throughout the tour. This milestone establishes the complete prototype gameplay loop; original reviewed art/animation sheets, module programming, full-world durable saves, audio and generation through MetroForge's actual app are still pending.

## Station programming milestone, 2026-10-03

The separate Quantum candidate now implements the four-slot compiler, native paused stabilizer workbench, discovered Entanglement and Tunneling operators, living-target links and occupied-cell attenuation. Custom recipes bind to queued shots; editing another recipe cannot rewrite a shot already in flight. Grounding, safe distance, pending attacks, hurt state and hostile projectiles all guard station access. Application consumes no energy; actual firing uses the displayed price. Defaults retain their existing simulation/save behavior. Full-world durable saves and profile/loadout persistence remain pending. [Exact native, app and release evidence](../verification/quantum-programming-20261003/README.md).
