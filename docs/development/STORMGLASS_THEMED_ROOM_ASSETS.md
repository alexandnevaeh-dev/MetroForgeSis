# Stormglass themed room assets

Original side-view asset library: gallery architecture and doorway states, archive/reliquary furniture, undercroft memorials and bell-service machinery. 48 static atlas roles, 3 transparent PNG atlases, JSON regions with opaque-bottom anchors. Every renderer AtlasTexture uses filter_clip; the archive atlas intentionally uses measured nonuniform row regions.

The blueprint layout is `templates/godot-metroidvania/data/visual/blueprints/stormglass-gallery-room-kits-v1.json`. It remains opt-in: room dimensions and actual graph ports must match the authored blueprint before installing it as data/visual/stormglass-room-kits.json. The normal generator integration is pending. Top-down and Quantum templates are separate.

Evidence: E:/MetroForgeData/Development/stormglass-reference-rebuild-20261005-v1/ROOM_ASSET_CHECKPOINT.md. Eight actual GPU room loads passed. Input-driven gallery descent passed after a failed initial short deadline; complete route, stairwell ascent, pickup and return-loop proof remain pending. Assets are candidate art, not production-approved. Ladders/levers are decoration until gameplay is explicitly implemented.

## 2026-10-06 collision-bound floor and stair courses

The11-room opening/backroom kit now uses one clipped visual course per real floor/platform collider. Original flat floor_course modules replace misleading mini-stair prop repetitions. No collision or graph changes. Native baseline failed11missing-renderer checks; final388checks across71surfaces passed with exit0. Actualinput traversal007→040→041→042→004 passed all14landings. Evidence: E:/MetroForgeData/Development/stormglass-room-surfaces-20261006-v1/README.md. Fresh actual-app regeneration of this renderer remains pending. The other32rooms and generic actors still require coherent presentation; full generation remains failed, not production approved.

## 2026-10-06 full43room kit foundation

All43selectedcampaignrooms now have original modular kit configurations. Later rooms distinguish teal flooded masonry, warm archive bookcase walls, and cold belfry stone/gears/bells. SunkenLibrary and AirDashBelfry receive purpose-specific corrections. Existing original3atlases reused; specialtywater/frostart and richer composition pending. Legacy opening adapter remains11rooms; userownedtargets preserved. Admission9controls passed. Visible nativecoverage1270checks/228surfaces/43rooms passed exit0; old11roomconfiguration failscoverage. Evidence E:/MetroForgeData/Development/stormglass-campaign-themes-20261006-v1/README.md. Fresh actualappregeneration stillpending; no fullgame/visual/production pass. Placeholderactor mismatch remainsvisible.
