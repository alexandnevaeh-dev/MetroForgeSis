# Development-tool study — initial pass

Scope: official documentation research, not a completed hands-on comparison. Extend existing MetroForge editors rather than create parallel editors. Recommendations below are proposed work, not implemented features.

## Source observations
- Unreal Details follows viewport selection, exposes transforms and type-specific properties, supports property search and reset-to-default indicators. Source: https://dev.epicgames.com/documentation/unreal-engine/level-editor-details-panel-in-unreal-engine
- Godot separates Local and Remote scene inspection; Remote can change running-node parameters. It also documents scene synchronization and collision/navigation overlays. Source: https://docs.godotengine.org/en/stable/tutorials/scripting/debug/overview_of_debugging_tools.html
- Unity documents animation clip preview/creation/editing in its Animation window. Initial official search evidence only; full page retrieval failed this pass. Source: https://docs.unity.com/en-us/engine/6000.3/manual/animation-section/animation-mecanim/animation-clips/animation-editor-guide
- Unreal Sequencer documents a multi-track cinematic workflow. Do not confuse a cinematic timeline with gameplay animation state logic. Source: https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-sequencer-movie-tool-overview

## Proposed MetroForge application
1. Selecting a world-room node opens that room in the existing viewport; hierarchy selection and inspector share one object identity. Provide framing, transform handles, snapping, duplicate/delete and undo/redo.
2. Keep authored values distinct from live runtime values. Label changes as saved, applied live, or requiring restart; offer explicit persistence for play-session edits rather than silently losing them.
3. Inspector groups transform, appearance, collision, gameplay and loot. Search properties; indicate overridden values and offer undoable reset.
4. Asset browser previews sheets and frame geometry; animation timeline edits authored timing, looping and events with hitbox overlays. Full-body art and native playback must be reviewed separately.
5. Link generation progress to actual room/asset outputs, with cancel/retry and honest degraded-output status. Provide collision and ability-gate overlays for debugging.

## Next study passes
Compare actual room-building workflows, prefab/scene reuse, tile painting, animation state machines, equipment/loot data authoring, asset import and build/export tools. Inspect MetroForge current UI before choosing implementations. Capture before/after workflow evidence, including save/reopen and live-edit boundaries.