# Cursor backend requirements

Frontend-only contracts the desktop studio needs. Implement in Claude-owned packages / Electron handlers. Do not invent competing backend logic in the renderer.

---

## 1. `generateGame` archetype

**Status:** Handler type now includes `archetype?: GameArchetype`. Create + Studio send it. `GenerationPipeline.run` reads `options.archetype`.

**Remaining:** The queue executor’s local payload type still omits `archetype`. At runtime extra fields survive the spread into `pipeline.run`. Claude should add it to that payload type so it cannot be dropped in a later refactor.

---

## 2. `explainModelRouting(capability)`

**Status:** Landed by Claude and consumed by Routing Inspector.

---

## 3. `getOverworldMap(projectPath)`

**Status:** Landed by Claude and consumed by World Editor spatial view (falls back to world_graph x/y).

---

## 4. `getDungeonGraph(projectPath, dungeonId?)`

**Status:** Landed by Claude and consumed by Dungeon Editor (falls back to world_graph filter).

---

## 5. `getRoomCollision(projectPath, roomId)`

**Status:** Landed by Claude and consumed by Room Editor collision layer (falls back to tileCells).

---

## 6. `listAssets` category taxonomy

**Need:** Categories matching the gallery:

Player, NPC, Enemy, Boss, Tileset, Background, Prop, Weapon, Item, UI, Icon, VFX, Animation, Music, SFX, Voice

**Reason:** Renderer re-classifies from path so the UI works, but backend `categorizeAssetPath` still emits older labels (`Enemies`, `Tilesets`, …). Aligning avoids inspector mismatches.

---

## 7. Generation events: selected model id

**Need:** Task/artifact events include `modelId` (not only `provider`).

**Reason:** Generation Studio inspector “model/provider” currently shows provider from `ArtifactGenerated`.

---

## 8. `getAssetHistory` / restore

Already exposed via preload (`getAssetHistory`, `restoreAssetVersion`, `getAssetVersionPreview`). No change required if those handlers stay stable.

---

Do not implement these in `apps/desktop/src`. Wire them in handlers + Claude-owned packages, then the studio will consume them.
