# Player V2 Production Baseline

## Scope
This is the production baseline after the SunnyLand V3.1 experiment was rejected. `Player.tscn` remains the active player scene. Collision geometry, controller behavior, and abilities were not changed by the experiment.

## Movement
- Walk speed: `200.0`; run speed: `350.0`.
- Ground acceleration/deceleration: `1800.0` / `2200.0`.
- Air acceleration: `900.0`; gravity: `980.0`; maximum fall speed: `650.0`.
- Jump velocity: `-400.0` by default, or derived from generated movement data when present.
- Coyote time: `0.12s`; jump buffer: `0.10s`.
- Player facing is set from horizontal input and rendered through horizontal sprite scale flipping.

## Combat
- Attack chain selects `attack`, then `attack_2`, then `attack_3` when a corresponding clip exists. Production V2 ships `attack` and `attack_2`; missing `attack_3` intentionally follows the controller's existing fallback to `attack`.
- Attack hitbox is a `30x24` rectangle positioned at `(30, -20)` and is active for `0.15s` after attack input.
- Hurt applies supplied knockback and grants `0.5s` invulnerability.
- Death disables player physics, plays `death`, waits for animation completion, hides the player, and emits the death event.

## Abilities
- Ground dash: `500.0` speed, `0.15s` duration, `0.5s` cooldown.
- Air dash: `450.0` speed and the same configured duration/cooldown.
- Double jump restores one air jump after landing.
- Wall slide caps descent at `80.0`; wall jump uses horizontal `280.0`, vertical `-320.0`, and a `0.18s` visual window.
- Ground slam moves downward at `900.0` until floor collision.
- Grapple moves toward a valid point at `620.0` until within `14px`.
- Swimming uses `180.0` speed and a quarter-gravity idle drift.
- Phase dash uses a configured `0.22s` duration.

## Scene Geometry And Camera
- Body collision: `24x48`, position `(0, -24)`.
- Hurtbox: `20x44`, position `(0, -22)`.
- Attack hitbox: `30x24`, position `(30, -20)` before facing adjustment.
- Camera is a player child at `(0, -32)` with `1.85x` zoom.

## Animation Contract
The V2 asset metadata contains 26 states: `idle`, `walk`, `run`, `jump_start`, `jump`, `fall`, `land`, `attack`, `attack_2`, `dash`, `wall_slide`, `wall_jump`, `swim`, `hurt`, `death`, `air_dash`, `double_jump`, `ground_slam_start`, `ground_slam_fall`, `ground_slam_impact`, `swim_idle`, `grapple`, `phase`, `respawn`, `interact`, and `ability_acquire`.

The live controller directly selects 16 animation names: `idle`, `walk`, `run`, `jump_start`, `jump`, `fall`, `land`, `attack`, `attack_2`, `attack_3`, `dash`, `wall_slide`, `wall_jump`, `swim`, `hurt`, and `death`. The production scene loads V2 sheets for all except `attack_3`; that optional third combo request intentionally falls back to `attack` in `PlayerController.gd` when no third clip is present. The remaining metadata states are retained V2 pack assets for ability/content integrations, not active direct animation selections in `PlayerController.gd`.

## Validation
`node scripts/validate-industrial-transit-pack.mjs` passed with 68 assets and 26 metadata states. The optional `attack_3` controller fallback is intentionally outside that metadata contract.