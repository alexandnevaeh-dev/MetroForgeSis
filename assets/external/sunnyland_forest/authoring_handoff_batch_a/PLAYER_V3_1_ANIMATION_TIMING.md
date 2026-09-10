# Player V3.1 Animation Timing Contract

This document records current controller behavior only. Artwork must fit it; no gameplay timing is changed.

| State | Loop | Target frames / FPS | Gameplay duration / transition | Interruptible | Event / active window | Authoring notes |
|---|---|---|---|---|---|---|
| idle | yes | 9 / 8 | no input on floor | yes | none | Existing accepted source. |
| walk | yes | 6 / 12 | input on floor without run modifier | yes | none | First contact pose must read immediately. |
| run | yes | 8 / 14 | input plus run modifier on floor | yes | none | Higher energy than walk. |
| jump_start | no | 3 / 12 | upward velocity below -160 | yes | jump input or coyote/buffer jump | Short visual anticipation only. |
| jump | yes | 4 / 10 | airborne ascending after startup | yes | upward velocity | Existing accepted source. |
| fall | yes | 4 / 10 | airborne descending | yes | positive vertical velocity | Existing accepted source. |
| land | no | 3 / 14 | controller land timer 0.18s | yes | floor contact / landing dust | May finish after locomotion reclaims control. |
| attack | no | 5 / 18 | clip-derived cooldown, minimum 0.25s | no while playing | hitbox active 0.15s immediately after input | Strike must be visible in first 2-3 frames. |
| attack_2 | no | 5 / 18 | combo window = 1.4x clip duration | no while playing | hitbox active 0.15s | Different vector from attack. |
| attack_3 | no | 6 / 18 | combo window = 1.4x clip duration | no while playing | hitbox active 0.15s | Largest finisher silhouette. |
| hurt | no | 2 / 14 | recovery controlled by 0.5s invulnerability | no while playing | hit received / knockback | Existing accepted source. |
| death | no | 8 / 10 | waits for animation_finished | no | health died | Final defeated pose is held by scene hiding. |
| dash | no | 4 / 24 | config.dash_duration, default 0.15s | movement locked | dash trail | Read on first displayed frame. |
| air_dash | no | 4 / 24 | config.dash_duration, default 0.15s | movement locked | dash trail | Airborne silhouette. |
| double_jump | no | 4 / 14 | immediate upward velocity reset | yes | mid-air jump input | No long anticipation. |
| wall_slide | yes | 4 / 8 | wall contact and descending | yes | velocity capped at 80 | Flip-safe wall brace. |
| wall_jump | no | 4 / 14 | controller wall_jump_timer 0.18s | yes | jump from wall | Push-away pose must appear immediately. |
| ground_slam_start | no | 3 / 12 | starts airborne while down held | movement locked | slam initiated | Ends in narrow committed shape. |
| ground_slam_fall | no | 3 / 12 | until floor collision | movement locked | downward speed 900 | Dynamic collision-driven duration. |
| ground_slam_impact | no | 5 / 16 | begins on landing collision | yes | slam shock VFX | Deep compression distinct from duck. |
| swim | yes | 6 / 10 | unlocked while in water with locomotion | yes | swim physics | Horizontal propulsion. |
| swim_idle | yes | 4 / 8 | unlocked while in water without locomotion | yes | swim physics | Tread/buoyancy, not standing idle. |
| grapple | no | 5 / 12 | until target within 14px | movement locked | grapple travel / trail | Aim upper-forward and show tension. |
| phase | no | 5 / 12 | config.phase_duration, default 0.22s | yes | phase dash | Must read without shader. |
| respawn | no | 6 / 10 | event-driven | yes | respawn event | Reconstruction/re-entry. |
| interact | no | 4 / 10 | event-driven | yes | generic interaction | One-hand reach/use. |
| ability_acquire | no | 6 / 12 | event-driven | yes | ability acquired event | Strong progression-reward silhouette. |
