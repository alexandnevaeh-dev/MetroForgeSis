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

Version saves. Separate profile blueprints/loadouts/lore from run seed, simulation tick, material and heat chunks, RNG state (if stateful), pending effects, projectile IDs/remaining life/range, actor health/position/state timers, links, objectives, station locations and ghost-platform state. Store simulation state, never engine node references. Write a temporary save then atomically replace it; reject malformed or incompatible data without partial mutation. Death resets run state while preserving only allowed profile unlocks.

## Implementation and acceptance checklist

- [x] Finish Copilot consultation and answer remaining preferences with delegated judgment.
- [x] Isolate the quantum simulation foundation under `prototypes/quantum-divergence`.
- [x] Implement native reference microcells, sand/fluid, seeded ore, double-buffered heat, protected anchors, collapse lifetime/budget and clearance checks.
- [x] Implement native simulation snapshots and deterministic continuation.
- [ ] Chunk activation and performance measurement at biome scale; fluid viscosity tuning and vapor event output.
- [x] Native playground player collision/movement, 360-degree aim, two starting instruments, Recall hold/action, safe station fallback.
- [x] Starting-instrument swept projectile simulation, exact three-child split behavior and atomic capacity/resource accounting in the native playground.
- [ ] Station compiler/preview and discoverable entanglement/tunneling modules.
- [x] Native progression rules: regional anchor, three projectile-damaged crystals, permanent ghost-platform stabilization, defeated-Golem/core gate, secret reward and fully gated extraction in a rendered control.
- [ ] Full authored/procedural Probability Mines world generator and playable enemy encounters at the specified biome scale.
- [ ] Three enemy families and Golem with original complete reviewed animation sets and timings above.
- [ ] Original coherent terrain, interior backgrounds, effects, audio and HUD.
- [ ] Station programming preview, actual profile/suspend files, death/reset and victory/extraction flow.
- [ ] Add genre schemas, capability registry, own assembler/template and app UI only when the runtime exists. Unknown genre IDs must never silently generate the existing Metroidvania.
- [ ] Generate through MetroForge's real app UI, play through all three objectives, show gameplay/animation captures and retain failures honestly.

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
