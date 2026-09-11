# Actor artwork provenance (room 05 NPC + spawn courier)

Player and shrine NPC stills are **original MetroForge pixel art**, not a recolor of the
4-color `paintHumanoid` placeholder and not a third-party pack.

| Field | Value |
|---|---|
| Source | `packages/assets/authored/foundry-courier/` |
| Tool | Local `paint_foundry_courier.py` + Pillow (rasterizer only) |
| License | Original-MetroForge — commercial OK (`LICENSE` in that directory) |
| Paid APIs | none |
| Hosted / open-weight models | none |
| Pipeline provider | `authored-original` (`sourceType: manual`) |
| Inferred maturity | `QA_REVIEW` (never auto-`PRODUCTION_READY`) |

Frame contract is unchanged: **64×64** stills, **256×64** 4-frame walk/attack/hurt/death
sheets, feet-bottom anchor in `AnimatedAssetSprite.gd`.

Previous procedural silhouettes (5 unique colors) are kept only as before-stills in
`review-artifacts/assets/before-placeholder/`.
