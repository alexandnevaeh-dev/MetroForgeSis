# MetroForge: Metroidvania design and animation study

Date: 2026-09-23. Direction: original dark fantasy action adventure, with a separate top-down adaptation. This is a source-backed design study and integration plan, not a claim that commercial games were installed, played, or frame-measured in this session. Publisher/developer descriptions were read; the GDC animation session abstract was read, not its full video. Recommendations and proposed numerical targets below are MetroForge design choices, not measurements of the reference games.

## Reference findings

| Reference | Documented finding | MetroForge application |
| --- | --- | --- |
| Symphony of the Night | Gothic castle adventure, transformations, hidden weapons and secrets. [Konami](https://www.konami.com/games/castlevania/us/en-us/page/history_1997_ps) | Monumental interiors and rewarding detours; a recognizable equipment silhouette and meaningful discovery. Preserve an original protagonist, architecture and lore. |
| Hollow Knight | Interconnected areas, evolving abilities, distinct environments and traditionally animated hand-drawn creatures. [Team Cherry](https://www.hollowknight.com/) | Give each region an identity and revisitable landmarks; judge silhouettes in motion at game scale. |
| Hollow Knight production | Traditional Photoshop animation exported as PNGs; layered 2D assets and soft lighting shapes supported the presentation. [Unity case study](https://unity.com/made-with-unity/hollow-knight) | Cohesive drawings and layered composition matter more than adding expensive rendering effects. A sprite pipeline is viable if the poses themselves are good. |
| Ori and the Will of the Wisps | Painted environments, spirit weapons/spells, configurable shards, bosses and traversal challenges. [Xbox/Moon Studios](https://news.xbox.com/en-us/2020/03/11/ori-and-the-will-of-the-wisps-available-now/) | Separate atmosphere from collision readability; make builds modify play style; give traversal its own enjoyable challenges. |
| Ori animation process | James Benson's session concerns producing many character animations that fit a painted world under production constraints. [GDC session abstract](https://gdcvault.com/play/1021791/Animation-Bootcamp-The-Animation-Process) | Choose a repeatable animation pipeline that preserves character identity and finish across every action. The abstract does not establish exact rig or frame-count settings. |
| Metroid Dread | Nintendo explains using movement abilities and map icons to navigate previously blocked routes. [Nintendo developer tips](https://www.nintendo.com/au/news-and-articles/metroid-dread-report-vol-9-handy-tips-for-newcomers/) | The world should teach an ability, then make its newly reachable routes recognizable on revisits. |
| The Lost Crown | Responsive combat and platforming, limited amulet capacity, readable attack classes, powers used in combat and puzzles, map screenshots for revisiting discoveries. [Ubisoft](https://news.ubisoft.com/en-au/article/e1SD5gR3TWqk5GPAjWHSz/prince-of-persia-the-lost-crown-will-put-your-combat-platforming-and-puzzlesolving-skills-to-the-test) | Distinct loadout tradeoffs, telegraphs with shape as well as color, and map notes that preserve the reason to return. |

## Unified original art direction

Build an inhabited, ruined religious fortress: the Ashen Abbey, Rainworn Cloister, Drowned Reliquary and Bellkeeper Heights. These are proposed region identities, not newly implemented biomes. Stonework, oxidized silver, worn cloth, candlelight and restrained supernatural light should recur across backgrounds, weapons, characters and UI. Avoid mixing glossy metallic limbs with a painted torso.

Use long galleries with repeated structural bays interrupted by a statue, collapsed window, organ or major doorway. Alternate them with tall shafts, courtyards, intimate safe rooms and branching crypts. A bigger room needs landmarks and encounters, not simply more empty floor. Proposed initial proportions: galleries 2-4 viewports wide; towers 2-3 viewports tall; resting chambers about one viewport. These must be tested against camera scale and actual jump/dash reach before becoming defaults.

Composition layers: distant silhouette; architectural depth; playable platforms with clear contact edges; local props; foreground framing that does not hide hazards. Keep the busiest texture out of the player's immediate movement corridor. Test the player against the darkest and brightest region backgrounds. Decorative cracks must not be indistinguishable from breakable surfaces.

Asset kits should include wall/floor transitions, corners, stair faces, ledge caps, doorway variants, arches, columns, balconies, shrine, chest, breakable-floor treatment, ability-gate motif, enemy family and an effects family. Produce a small approved kit before multiplying variants. Select either polished pixel art or painted illustration explicitly; do not silently combine rendering media.

## Animation is a core gameplay system

Full-body motion is required. Moving the whole sprite vertically or rotating a rigid arm cannot substitute for joint action. A painted character needs clean independent layers or authored complete poses: head/neck, torso/pelvis, upper arms, forearms/hands, thighs, shins/feet, equipment and cloth. Maintain overlap at joints, volume, light direction and weapon grip; do not cut parts from a portrait where clothing hides the anatomy.

| Action | Required pose study | Gameplay connection |
| --- | --- | --- |
| Idle | Subtle breath through chest; settled hips; small head compensation; delayed cloth | No fake locomotion or distracting constant bounce |
| Walk | Contact, compression, passing and push-off; opposite arm/leg swing; chest counter-rotation | Planted foot remains stable relative to floor; cadence follows speed |
| Run | Forward lean, stronger elbow drive, clear push-off and flight; head remains readable | Distinct from a sped-up walk; preserve gait phase on walk/run changes |
| Jump/fall/land | Short preparation, leg extension, airborne tuck, descent preparation, knee/hip absorption | Takeoff follows input promptly; landing recovers into movement without an unnecessary lock |
| Turn/stop | Foot adjustment, pelvis lead, torso/head follow, equipment inertia | Avoid instantaneous silhouette pops and skating |
| Dash/wall motion | Whole-body directional line; wall contact hand/foot; visible push-off | Art follows the actual direction and collision state |
| Melee | Hips lead shoulder, elbow and wrist; readable wind-up, strike, recoil and recovery | Hitbox active interval matches blade travel; cancel windows are deliberate |
| Spell | Gesture and torso preparation, release pose, recoil/settle; distinct hand/effect anchor | Projectile/effect spawn event matches release, not clip start by default |
| Hurt/death | Local recoil and loss of support, followed by weight settling | No rigid flashing or whole-image sinking presented as finished acting |

Animation production order: approved character turnaround and proportions -> contact/key poses -> in-betweens -> equipment/cloth follow-through -> sprite sheet and metadata -> runtime transitions -> visual approval. For combat, preserve canonical attack event metadata in player-animation-spec.ts rather than inventing different hit frames in art prompts.

Review one cycle as stills at 0%, 25%, 50%, 75%, plus normal-speed and quarter-speed playback. Inspect both directions, acceleration, stop/start, walk/run switch, jump-to-land-to-attack, slopes/steps where supported, and motion beside a fixed floor ruler. Look for head/neck gaps, elbow seams, changing sword length, sliding stance feet, duplicated frames, silhouette jumps and cloth that moves before the body. Evaluate at intended gameplay size, not only enlarged inspection size.

Proposed acceptance targets: no visible loop discontinuity; grounded stance foot drift below 2% of character height over a contact phase in a controlled test; no joint gaps; attack events within one simulation tick of authored timing. These are targets requiring measurement, not existing passes. Animation FPS is independent of simulation/update FPS. Do not delay gameplay input to make anticipation pretty; use a brief responsive pose and tune buffering/cancel rules separately.

Existing head/arm/leg cutout studies remain diagnostic and are not approved final artwork. Current changes generate better pose instructions; they do not synthesize a rig, animate joints, or prove fluid motion.

## World, movement and progression algorithms

Keep existing topology, progression-proof and movement-feasibility modules. Add constraints there rather than a second world generator. Reachability must track (room, owned abilities, persistent switches/keys), not just room adjacency. Before placing a gate, prove its ability can be obtained without crossing that gate. After a one-way drop, prove either a return route or a reachable safe progression path.

For each major ability, construct a safe introduction, an uncomplicated required use, an optional reward use and a later combination with an earlier skill. Tease a reachable-looking reward before the unlock, then offer a shortcut after mastery. Run proof again after user edits; annotate broken routes and preserve the edit for correction.

Room geometry should come from measured movement envelopes with margin for landing, camera visibility and controller error. Avoid mandatory landings at exact maximum jump reach. Longer halls need pacing variation: discovery, encounter, release, landmark. Gate counts and room counts alone do not measure exploration quality.

Registered side-view abilities currently include dash, double jump, wall slide/jump, air dash, ground slam, grapple, swim and phase. Use their canonical IDs. New fiction can name a supported mechanic, but elemental seals, temporary platforms and other new behavior require runtime work before entering the required route.

Top-down shares world identity, loot principles and discovery loops but uses readable floor paths, directional movement, sightlines and dungeon tools. Do not reuse platformer jump gates or side-view sprite orientation without adaptation.

## Equipment, spells, enemies and economy

Proposed equipment roles: a quick short blade with limited reach; a heavier cleaver with commitment; a thrusting spear with narrow coverage; a ranged focus with resource cost. These are design proposals; the current catalog's attack modifier does not implement those attack patterns. Armor should eventually trade protection against a clearly communicated cost, and relics should enable builds within a capacity budget. Do not add unexplained stat penalties.

Proposed original spells: Ember Thread (narrow ranged pressure), Grave Bell (slow area interruption), Mourning Ward (timed protection), Cinder Step (visual identity for supported dash). Costs, cooldowns, hit rules, targeting, telegraphs and supported engines must be defined before a spell is labeled playable. Never gate required progression on an unimplemented spell or random drop.

Preserve the existing separation of repeatable utility/equipment drops from keys, quests and permanent progression rewards. The current content generator already excludes progression items from enemy loot. Expand enemy-specific tables deliberately: local materials, optional equipment and capped recovery supplies. Expose drop chance, quantity range, stack cap, source, uniqueness and placement in the existing editors, with validation and undo.

Enemies should each test a skill: advancing guard, ranged sentry, diving attacker, shielded blocker. Pair roles only when their attack telegraphs leave a fair response. Boss phases should develop a taught behavior, then combine it; effects must not hide the safe lane. Checkpoints and return shortcuts should limit repetitive travel while retaining meaningful exploration.

## Changes incorporated in this pass

- Visual prompt compiler version 2: action-aware full-body direction; separate walk/run/jump/landing/attack/hurt/death guidance; environment depth and quieter playable space; clear terrain edges, small icon silhouettes and restrained effects.
- Both VisualDNA and fallback replacement prompts use the shared action guidance. Fallback style labels no longer acquire an unwanted pixel-art suffix.
- Actual AI GameDNA requests now include genre-aware guidance for coherent art, exploration and responsive combat, with explicit schema/runtime boundaries. Deterministic DNA and existing project data are unchanged.
- Existing movement feasibility, progression checks, registered abilities and loot safety rules are retained. This pass does not add new spell or weapon runtime implementations.

Known remaining gaps: default gothic VisualDNA/style-bible selection still contains pixel-oriented assumptions; top-down character prompt orientation needs dedicated handling; prompt length must be checked against the selected provider tokenizer before paid/local generation; prompt quality is not visual quality. No commercial art was copied or imported.

## Next implementation and evidence sequence

1. Resolve a consistent approved painted-versus-pixel style through the complete art-bible and VisualDNA paths. Produce one clean character and one abbey room kit for review.
2. Replace the current cutout motion experiment with coherent full-body key poses, then verify transitions and hit events in a playable room.
3. Add measured long-room pacing and return-route constraints to existing layout tests; show generated maps and actual traversal video.
4. Implement one genuinely distinct weapon and spell at a time with editable data and engine capability reporting, then test acquisition, equip/use, drops, save/load and live-edit behavior.
5. Capture Windows generation -> room selection/edit -> runtime gameplay; separately report Unity, Unreal and local NVIDIA results. No completion claim without gameplay and visual evidence.

## Validation recorded for this integration

Procedural, assets and AI packages compile. Four focused suites pass: 24 tests covering actual provider request guidance, visual prompt determinism, state-specific animation direction, and fallback style/pose behavior. The first compile exposed a missing public export; that export was corrected before the successful rerun. These are source-level generation checks. No newly rendered asset, gameplay footage, Unity/Unreal run or NVIDIA generation was produced by this study pass. The prior portable-grid-export-v1 package predates this integration.
