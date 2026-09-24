# Top-down directional character strips

AnimatedAssetSprite supports an optional exported directional_sheets Dictionary mapping action names (idle, walk, attack, hurt, death) to N, NE, E, SE, S, SW, W, NW resource paths. For example: {"walk": {"N": "assets/characters/player_walk_N.png"}}. Use horizontal strips sharing the sprite's frame_size; each strip can have its own frame count. directional_fps defaults to 10. Each strip must be exactly one frame high and an integral number of frames wide. Invalid strips warn and retain generic fallback.

Player direction selects an exact matching clip. Authored directional clips are never horizontally flipped. Missing directions use the existing generic clip. A directional walk's first frame supplies idle if no authored directional idle exists. Turning between walk strips preserves normalized cycle phase even if frame counts differ. Attack/hurt facing stays fixed until the state ends; completed one-shot clips hold their final pose. Death also resolves the current direction.

Current scope: native Godot top-down template and player. Enemy controllers, generation of directional artwork, Unity/Unreal parity, animation editing UI and visual quality approval remain outstanding. Existing generated projects and portable builds are not automatically migrated.
