# Expanded Metroidvania reference matrix

Added 2026-09-23 from the user's list. All 26 distinct entries are retained; Bo was listed twice. This extends [the main study](METROIDVANIA_DESIGN_STUDY.md). Source-backed feature descriptions below are separated from proposed MetroForge applications and animation review targets. These targets are not claims that frame-by-frame footage analysis or hands-on playtesting has been performed. Do not turn review targets into purported measurements.

Scores are not used as design requirements. The supplied review scores were not independently audited. Release descriptions can become stale: GIGASWORD's publisher announced release in November 2025; Silksong has a live official support site; Well Dweller's current store page is available. Keep dates and ratings out of generation prompts.

## Reference -> design lesson -> animation review target

| Game and source | Source-backed feature / reference scope | Original MetroForge application and motion target |
| --- | --- | --- |
| [Metroid Fusion](https://www.nintendo.com/en-gb/Games/Game-Boy-Advance/Metroid-Fusion-267046.html) | Story, platform action and exploration | Plan tension/release beats within a connected map. Review movement readability during danger and changes in room state. |
| [Aria of Sorrow](https://www.konami.com/games/eu/it/products/castlevania_ac/) | Captured enemy souls grant abilities | Design optional enemy-derived powers with a clear source and acquisition record. Study gesture -> summon/effect -> recovery synchronization. Required traversal must not depend on a random drop. |
| [Circle of the Moon](https://www.konami.com/games/eu/it/products/castlevania_ac/) | Action/attribute card combinations change magic effects | A future two-part modifier system needs valid combinations, preview and readable costs. Review distinct poses/effects so combinations do not look like palette swaps. |
| [Metroid Dread](https://www.nintendo.com/au/news-and-articles/metroid-dread-report-vol-9-handy-tips-for-newcomers/) | Movement abilities and map cues support exploration | Teach, practice and revisit; study locomotion-to-action transitions and whether input response survives animation polish. |
| [Metroid Prime Remastered](https://www.nintendo.com/us/store/products/metroid-prime-remastered-switch/) | Scanning reveals information about objects/enemies | Add discoverable lore and inspection cues to rooms; adapt discovery principles to 2D rather than copying first-person presentation. |
| [Animal Well](https://store.steampowered.com/app/813230/ANIMAL_WELL/) | Multi-use items, systemic interactions, dense nonlinear puzzle world | Generate interaction rules and solvable puzzle chains; animate object state changes with legible cause/effect. A new use of an existing tool can be a reward. |
| [Hollow Knight](https://www.hollowknight.com/) | Connected world, distinct areas, hand-drawn creatures | Region silhouettes, local enemy families and clear action poses. Review anticipation and recovery at actual game scale. |
| [Silksong](https://hollowknightsilksong.com/) | Hand-crafted 2D interconnected kingdom | Review room scale against an agile character's movement envelope; inspect whole-body direction changes and silhouette continuity. Exact speeds remain unmeasured. |
| [Ori and the Will of the Wisps](https://news.xbox.com/en-us/2020/03/11/ori-and-the-will-of-the-wisps-available-now/) | Painted world, weapons/skills and configurable shards | Cohesive painted lighting and build variation. Review arcs, landings, secondary motion and the separation between effects and collision edges. |
| [Ender Lilies](https://store.steampowered.com/app/1369630/ENDER_LILIES/?l=english) | Defeated foes become allies; mixed melee/ranged/magic skills and relics | Potential spectral-companion school with separate caster and summoned-attacker roles. Review spawn anchor, attack ownership, visibility and release timing. |
| [Nine Sols](https://shop.redcandlegames.com/projects/ninesols) | Hand-drawn, deflection-focused action | Optional defensive combat emphasis. Review telegraph -> contact -> deflection -> recoil; tune a distinct defensive loop before adding many abilities. |
| [Axiom Verge series](https://www.axiomverge.com/) / [sequel](https://www.axiomverge2.com/) | Exploration references; sequel is a separate game | Investigate environmental-rule changes and layered routes. Glitch/transformation behavior remains a study target here, not a verified implementation specification. |
| [Blasphemous 2](https://team17.helpshift.com/hc/en/3-team17/faq/584-blasphemous-2-launching-on-xbox-one-and-playstation-4/?p=web) | Distinct weapons expand tactics and customization | Give heavy, fast and reach weapons different commitments and silhouettes. Study grip, torso drive, impact and recovery; do not reproduce cultural imagery as generic decoration. |
| [Dead Cells](https://deadcells.com/) | Rogue-lite castle action with permadeath | Useful combat and encounter reference. Keep a run-based ruleset separate from the persistent-world default. Review fast transitions without sacrificing attack readability. |
| [Iconoclasts](https://store.steampowered.com/app/393520/Iconoclasts/) | Puzzle adventure with personal narrative, characters and bosses | Connect room mechanisms to inhabitants and story consequences. Study interaction poses and machine feedback. |
| [Bo: Path of the Teal Lotus](https://store.steampowered.com/app/1614440/Bo_Path_of_the_Teal_Lotus/) | Acrobatic aerial combat and interconnected mythic world | Optional air-combo/traversal focus. Review launch, air attack, redirection and landing as a continuous chain. |
| [Pseudoregalia](https://store.steampowered.com/app/2365810/Pseudoregalia/) | Open-ended 3D exploration, air-kick platforming, movement-centered combat | Test alternate traversal routes and player expression. Transfer route-design ideas, not its 3D camera or dimensions directly to the 2D generator. |
| [Deedlit in Wonder Labyrinth](https://store.steampowered.com/app/1203630/Record_of_Lodoss_WarDeedlit_in_Wonder_Labyrinth/) | Sword/bow attacks, swappable equipment and elemental spirits | Explore a readable stance/loadout system. Review equipment continuity, attack direction and visual feedback when switching. |
| [Tales of Kenzera: Zau](https://www.ea.com/games/tales-of-kenzera/zau/buy/pc) | Sun/moon powers and hand-crafted animation | A future paired-power system should have distinct silhouettes and consistent switch rules. Review cast preparation, recoil and effects anchored to the acting hand. |
| [Guacamelee!](https://www.guacamelee.com/games/guacamelee-super-turbo-championship-edition/) | Melee combat and parallel dimensions | Dual-use combat/traversal verbs; any world switching needs collision and reachability validation in both states. Review anticipation and body follow-through. |
| [The Messenger](https://store.steampowered.com/app/764790/The_Messenger/) | Acrobatic controls, branching paths, 8/16-bit presentation and time-traveling adventure | Alternate world states must remain navigable and visually consistent within each state. Study linked movement actions; do not mix art media accidentally. |
| Muramasa: The Demon Blade; [publisher's current related edition](https://marvelousgames.com/games/muramasa-revenant-blades) | Adjacent action-RPG art/combat reference; current page describes a newer edition | Study layered illustrated environments and expressive weapon motion. Verify original-version footage separately before attributing exact mechanics to the original. |
| [Yoku's Island Express](https://www.team17.com/games/yokus-island-express) | Pinball adventure reference | A single unusual movement verb can organize a whole world. Investigate momentum/return-route puzzles as an optional mode, not mandatory platformer behavior. |
| [The Lost Crown](https://news.ubisoft.com/en-au/article/e1SD5gR3TWqk5GPAjWHSz/prince-of-persia-the-lost-crown-will-put-your-combat-platforming-and-puzzlesolving-skills-to-the-test) | Combat/platforming/puzzle powers and constrained loadouts | Shared verbs across combat and traversal. Review directional attacks, landing recovery, counter feedback and readable effects. |
| [Well Dweller](https://store.steampowered.com/app/3699590/Well_Dweller/) | Tiny matchstick-wielding bird, dark fairy tale, abilities and secrets | Strong character/object/world scale relationships. Review how a small protagonist stays visible against large scenery; no claim to have verified the supplied score. |
| [GIGASWORD](https://store.steampowered.com/app/1885930/GIGASWORD/) | Sword weight affects combat, plates, blocks and traversal | A future carried-object mechanic must track object location and prove recoverability. Review carried/grounded weight, hand grip, setting down and retrieving. |

## What to incorporate into MetroForge

Keep the current dark-fantasy identity. Use a coherent painted abbey/castle kit and full-body animation as the immediate production target. Draw from references at the level of readable poses, world rules and reward structures; create original assets, names, enemies and lore.

Proposed generation emphases, not currently implemented preset buttons:

- Exploration-led: persistent map, landmarks, ability gates and shortcuts. Metroid/Castlevania/Hollow Knight references.
- Movement-led: generous expressive traversal, airborne chains, measured room dimensions. Ori/Bo/Pseudoregalia references.
- Combat-led: distinct weapon commitments, defensive timing and bounded loadouts. Nine Sols/Blasphemous/Deedlit references.
- Puzzle-led: multi-use tools, observable object state and recoverable puzzle sequences. Animal Well/Iconoclasts/GIGASWORD references.

Choose one primary emphasis and one supporting emphasis per generated game. Do not bolt on permadeath, pinball physics, random power drops, mandatory parries and dimension switching simultaneously. Each added system must have runtime support, editable parameters, save/load behavior and engine compatibility evidence before it enters required progression.

## Animation comparison worksheet for the next footage pass

For each selected action, record game/version, official footage link, timestamp, playback speed, visible pose changes and what remains hidden. Capture contact, compression, passing and push-off for locomotion; wind-up, active strike and recovery for attacks; takeoff, apex, descent and absorption for jumps. Observe pelvis/chest opposition, elbow flex, head compensation, weapon grip and secondary cloth separately.

Do not infer engine hitbox timing from a trailer or confuse video FPS with sprite-frame rate. Proposed MetroForge timings need controller tests and runtime capture. A state must carry authored frame count, FPS/loop and attack events; a global instruction such as 4-8 frames for every action conflicts with existing clips that need more poses.

Review at normal speed first, then slow motion and stills. Smooth interpolation cannot rescue poor anatomy, foot skating, mismatched painted layers or unreadable attack silhouettes. Approve one complete motion family before generating a large animation library.
