# Stormglass Gallery actor roster

The explicit Godot Gallery campaign owns one biome, twenty enemy identities, and four guardian arenas. District-specific room architecture remains separate from biome ownership. Procedural and top-down content retain their existing profile budgets and random names.

The roster's movement and combat slots are preserved from the existing generator. Names now describe those slots so future source art depicts appropriate grounded, winged, spectral, burrowing, or stationary actors. Every asset still needs original coherent animation artwork, runtime integration, and visual review; these names do not approve the current fallback sprites.

| Enemy | Intended visual identity |
| --- | --- |
| Gallery Watchman | Grounded castle patrol guard |
| Veilblade Acolyte | Agile projectile caster |
| Shardback Crawler | Low crawling creature |
| Glasswing Moth | Flying beam attacker |
| Lantern Wisp | Hovering light spirit |
| Reliquary Herald | Charging summoner |
| Runeseal Effigy | Stationary rune trap |
| Ashen Librarian | Teleporting archive caster |
| Ossuary Serpent | Burrowing beam creature |
| Windbound Gargoyle | Flying area attacker |
| Hollow Chorister | Hovering summoner |
| Censer Idol | Stationary censer trap |
| Marble Hound | Charging stone creature |
| Runebound Sentinel | Teleporting beam guardian |
| Graveglass Worm | Burrowing area attacker |
| Bellbound Cantor | Flying summoner |
| Memorial Ward | Stationary memorial trap |
| Chainbound Shade | Hovering burst spirit |
| Reliquary Lancer | Charging beam attacker |
| Vault Custodian | Teleporting area guardian |

| Guardian | Arena |
| --- | --- |
| Veilblade Castellan | room_008 |
| Drowned Bellkeeper | room_018 |
| Archivist of Ash | room_028 |
| Tempest Abbot | room_038 |

`scripts/verify-stormglass-content-roster.mjs` checks the actual generator, unique identities, biome ownership, arena mapping, final quest reference, input preservation, unchanged combat stats/RNG sequencing, legacy profile behavior, top-down isolation, and invalid contracts. Actual-app run1791277204299 verifies the first naming revision and content ownership; the movement-aligned naming refinement has generator evidence and still needs a fresh actual-app run. Native full validation remains failed253/382 because artwork and presentation are incomplete. No production or full-campaign approval follows from these content checks.
