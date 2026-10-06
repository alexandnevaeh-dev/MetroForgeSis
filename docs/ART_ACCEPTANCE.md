# Ashen Covenant visual acceptance target

Status: current game visuals rejected by the user. No technical test or generated concept overrides that decision.

## Original art direction
Dark fantasy with intricate gothic architecture, weathered materials, expressive silhouettes and atmospheric depth. Symphony of the Night informs architectural richness and composition; Ori informs layered light, motion and environmental life. Create original characters, environments and effects. Do not mix unrelated pixel-art, outlined cartoon and painterly asset treatments within a scene.

## First representative playable scene: the ruined abbey
Use one existing room before expanding production. Retain its authored collision and traversal measurements. Frame a readable horizontal combat and traversal space with a broken nave, distant bell tower and restrained amber shrine lighting against desaturated blue-black stone. Keep the gameplay plane orthographic; background perspective must not suggest walkable surfaces. Distinguish solid platforms, decorative ruins and hazards at normal playing scale.

Deliver separate distant sky, architecture, middle-distance atmosphere, gameplay terrain and foreground layers. Background contrast must remain below the player and enemy silhouettes. Foreground ornaments must not obscure landing edges or attacks. Lighting should establish local focal points rather than brighten the entire frame. A flattened generated illustration is a concept reference, not a completed room asset set.

## Character, combat and motion
One coherent player and enemy asset set must support idle, locomotion, jump/fall/landing, attack, hit reaction and death, with stable scale and feet anchors. Ability effects need readable anticipation, active impact and recovery, without hiding collision-critical silhouettes. Test the available dash, grapple and spell mechanics in motion; still images cannot validate animation quality. Repeated textures, foot sliding, disconnected limbs and changing costume details fail review.

## Evidence required before expanding the asset set
- Real gameplay capture at the intended camera scale, with player, enemy, HUD, terrain and effects together.
- Stills showing idle composition, traversal and active combat, with engine and build identified.
- A short continuous gameplay recording showing animation transitions and readability.
- Review of actual imported assets, alpha edges, seams, pivots, layer order and lighting.
- Separate status for technical validation, internal visual review and user acceptance. User acceptance remains pending until explicitly given.

## Separate genre directions

The user requested a full top-down redesign on 2026-09-29 and selected stylized pixel art with rich color, strong silhouettes and detailed environments. Its palette, character identity, assets, animations, levels and test games are separate from the painted Metroidvania set described above. See TOPDOWN_PIXEL_REDESIGN.md. Do not reuse or rotate side-view sprites for top-down characters.

## Production constraints
Keep all new artifacts, caches and generation reports on E:. Preserve existing assets and authored rooms. Record model/provider, prompt, seed where available, source and review result. Do not label concepts as gameplay screenshots. Do not publish rejected art as an approved milestone.
