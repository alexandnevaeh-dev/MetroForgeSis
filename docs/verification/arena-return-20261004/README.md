# MetroForge arena returns and native audio shutdown — 2026-10-04

Returning through a defeated guardian arena now keeps the boss absent and exits open after normal travel or checkpoint restore. Cleared arenas use exploration music. Defeat is checked before the boss enters the scene tree, so it cannot start AI or collision setup on return. New Game clears this record and restores the encounter.

AudioManager now stops and releases music, voice, pooled SFX and caches before normal window-close or Studio disconnect. Quit is idempotent, blocks new sounds, and allows 200 ms for native playback cleanup even while paused or under hit-stop. The standalone Studio bridge still works without AudioManager. A direct immediate SceneTree.quit call bypasses the pre-shutdown step; legacy test harnesses are not all migrated.

## Evidence

- Exact final portable frontend: 24 real Electron IPC checks, empty credential environment, hidden window, actual room/asset/API Keys navigation and separate castle/Quantum switching. No provider inference.
- Native Godot 4.6 / NVIDIA RTX 5060 Laptop GPU: 40 normal-input transitions, four real guardian defeat events, six abilities, three cleared-arena return observations. Production fades and hit-stop retained. Input-only combat and traversal; no actor/health/door mutations or granted abilities.
- Audio lifecycle: 20 checks in each of two native fixtures, including paused simulated window-close and duplicate quit requests. Actual game WAVs, Dummy audio; no listening acceptance. Both fixtures have zero warnings and native errors.
- Studio lifecycle: actual loopback authentication and disconnect with music, and standalone without AudioManager. Both native scenarios exit with zero warnings/errors.
- Controlled save/load: 34 checks for all four guardians and new-game reset. Defeat records and room loads are explicitly seeded; this is separate from ordinary gameplay evidence.
- Four blueprint/anti-assistance checks and workspace TypeScript/native desktop build passed.

The native journey now has zero native errors and the strict driver passes. Remaining warning: ['WARNING: ObjectDB instances leaked at exit (run with --verbose for details).']. Zero-reference coroutine/object ownership still needs investigation; this is not clean-warning or production acceptance.

## Preserved failures

before-fixes contains the original music leak, insufficient exit-tree-only cleanup, arena restoration failure, and delayed recorder failure. The 0.5-second recorder missed legitimate brief return visits; the final recorder samples synchronously on room_entered. No gameplay was changed to force a longer visit. Logs and outcomes were preserved.

All 632 PNG/WAV/OGG game media files match the accepted source. Top-down/Quantum remains separate; no new visual assets were generated in this frame. The complete tested castle is bundled in the E: portable and promoted as a whole with the preceding local set backed up. Canonical HEAD and dirty Git index remain preserved. Credentials are referenced by launcher rather than copied.

Godot API reference: [AudioStreamPlayer](https://docs.godotengine.org/en/4.6/classes/class_audiostreamplayer.html). Setting stream clears active playback; the wait requirement was established by the retained native fixtures, not assumed from the documentation.

Remaining: zero-reference ObjectDB warning, optional/ending room input traversal, distinct guardian artwork/environment polish, fresh provider-backed app generation, separate top-down progression, Unity/Unreal native acceptance and human visual/audio review. Overall goal remains active.
