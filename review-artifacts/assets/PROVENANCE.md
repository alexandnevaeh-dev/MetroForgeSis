# Actor artwork provenance (room 05 NPC + spawn courier)

These sprites are **MetroForge procedural placeholders**, not licensed third-party packs and not hosted-model outputs.

| Field | Value |
|---|---|
| Tool | In-repo `generateProceduralSprite` / walk-cycle sheets (`packages/assets/src/png.ts`) |
| Palette | `actorPalette` / `npcActorPalette` (`packages/assets/src/prop-art.ts`) from Foundry style bible Brass `#8a6840` |
| License | MetroForge Procedural Generator (original work) |
| Commercial use | allowed |
| Paid APIs | none |
| Open-weight models | none |

The shrine NPC (`npc_000`) was a solid mustard cube because the generator used `NPC_ROLE_COLORS.quest_giver` as **fill**. It now uses the same courier silhouette as the player (head, torso, arm, two legs, pack, 1px outline) with a soot-iron body and a brass visor/pack accent.

Frame contract is unchanged: **64×64** stills, **256×64** 4-frame walk sheets, feet-bottom anchor in `AnimatedAssetSprite.gd`.
