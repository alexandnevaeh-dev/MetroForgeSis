# Authored melee contact-window candidate

Enemy melee attacks can opt into a separate weapon window through the attack animation sidecar. Standing body-contact damage remains separate. Clips without valid window metadata retain their original behavior; no production asset currently opts in.

Example for the isolated six-source Watchman study:

```json
{"hitWindow":{"frames":[2],"rect":[24,-52,32,20]}}
```

The object belongs to the existing `attack` metadata entry. Frames must be in-range integers forming one ascending contiguous interval. The actual attack must be a one-shot. Rect values are finite, bounded to 256 local game units, with positive width/height. Damage comes from the real enemy definition. The rectangle mirrors with the facing captured at attack start. The existing HitboxComponent deduplicates targets within the window; recovery, another animation, hurt and death disable it. The spatial strike component inherits the enemy transform.

Evidence: `E:/MetroForgeData/Development/stormglass-melee-window-20261008`. The controlled target follows the real enemy outside standing-contact reach and has the actual HurtboxComponent/HealthComponent wiring. Natural AI attacks in both facings passed nine checks: window admission, standing contact still active, two normal 14-damage hits on frame 2, one hit per swing, recovery deactivation and final health. Six source-image hashes stayed unchanged. No health grants, direct damage calls to the target or forced attack timers were used.

The first candidate used a nonspatial Node and its weapon collider stayed at world (40,-42), instead of following the enemy. A native transform probe reproduced this; the corrected Node2D run exited zero without script/native errors. Failed preparation, failed no-hit run, transform probe and source backups are retained. The repeatable fixture is `tests/godot/EnemyMeleeStrikeValidation.gd`; it requires the six-source opt-in study, not a default generated game.

Native admission/lifecycle coverage now passed 31 checks, followed by nine natural-damage checks with the final code. Authored frame count and FPS must match the actually loaded one-shot clip. Controlled pause, hurt/death state, different clips, no-hurt-art damage cancellation, same-clip replay and removal passed. Legacy default melee retains standing contact without a weapon window. A shared HitboxComponent activation fix registers at most one pending overlap callback; rapid cancel/replay no longer logs a duplicate connection. Earlier guard assertion passes with engine errors are retained and are not clean acceptance. The final guard run waits for owned feedback before teardown and logs no script/native errors. These are controlled lifecycle states and a real hurtbox event, separate from the natural two-facing damage test. Fresh actual-app export and full-game validation are also pending. This candidate is unuploaded, and the Watchman family remains draft art. The successful controlled test does not establish finished combat balance or production readiness.

## App export and shared-script compatibility

Fresh actual-app report `1791443001844` passed export and retained the broader 255/382 art/presentation failure. The exported EnemyController, EnemyMeleeStrike and HitboxComponent bytes match current source. No production enemy sidecar opts into a weapon window. An unchanged finalized export is importing for the full Stormglass campaign.

The shared hitbox fix separately passed the existing eight-stage Platformer campaign in an isolated copy: seven transitions, final-boss victory, 26 attacks, 70 damage, zero deaths and approximately 50 seconds. The only copied-file differences were the planned HitboxComponent overlay and the runtime playtest telemetry output; all other inputs remained unchanged. Evidence: `E:/MetroForgeData/Development/platformer-hitbox-20261008/preservation.json`. This does not establish a fresh full-current-Platformer export or finished Platformer artwork.

## Completed exported campaign and boolean guard follow-up

The unchanged app export completed the visible 34-step Stormglass campaign: six abilities, four bosses, 117 attacks, 130 damage, zero deaths and victory after 321593ms. All 1907 exported inputs retained their hashes (`campaign-v1/preservation.json`). Native exit was zero without script/native errors; existing NPC and ObjectDB warnings remain.

An additional metadata probe then showed numeric/string loop flags causing operand errors despite rejection assertions. The explicit boolean-type guard fixes this. The expanded native admission/lifecycle fixture passed 34 checks without script/native errors (`guards-extra-fixed.log`, `loop-type-proof.json`). The full campaign predates this narrow boolean guard; fresh source export/import verification remains pending. No production enemy opts into windows, and draft contact sources remain outside production admission.

## Final follow-up export scope

Actual-app report `1791444413477` passed export; broader art/presentation remained failed at 255/382. Final EnemyMeleeStrike bytes match current source. Comparison of scripts, scenes and data against the completed campaign export found only the boolean-type guard change in EnemyMeleeStrike; all eight compared gameplay fields are unchanged across 43 rooms. No production enemy sidecar declares a weapon window. `final-guard-scope.json` records the exact versions. The final guard also passed the natural two-facing damage fixture (`native-loop-type-final.log`) and the 34-check metadata/lifecycle fixture. The earlier full campaign is not relabeled as a run of the later guard source.
