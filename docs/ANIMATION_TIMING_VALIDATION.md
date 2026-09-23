# Unity animation timing validation

Walk/run transitions preserve normalized gait phase across different frame counts. Both authored loops must place the same foot contact at phase zero. Explicit restarts and transitions to action clips begin at frame zero.

Grounded locomotion playback follows horizontal speed divided by the selected authored walk/run speed. Airborne and clip-locked actions retain normal playback speed. This changes animation timing, not physics.

## Evidence (2026-09-23)

- Native Unity 6000.3.0f1 EditMode: MetroForgeAnimationValidation.Run passed unequal-frame-count gait phase, explicit restart, idle transition and clip reload checks.
- Native PlayMode in E:/Metroforge/Recovery-Audit/unity-castle-traversal-v1: CastleCadenceNativeEntry.Run used actual GameBootstrap, PlayerActor and InputSystem keyboard input through walking, running and jumping.
- cadence-runtime-result.txt: PASS; 269 acceleration samples, 271 steady samples, 1985 airborne samples; playback range 0.1407999 to 1.5. Counts are observations from this run, not frame-rate requirements.
- Logs: animation-cadence-compile.log and cadence-runtime.log in that isolated project.

The runtime harness remains in the isolated review project. The reusable phase regression is included in Assets/Editor/MetroForgeAnimationValidation.cs.

These results verify timing behavior only. They do not prove foot planting, animation anatomy, artwork quality, Windows build integration or Unreal behavior. The existing castle art review still uses a static character override. New artwork must be reviewed as a loop and during actual gameplay before replacing it.
The PlayMode log also contains the previously observed UnityEditor.Search.SearchDatabase startup ArgumentOutOfRangeException. Its stack is in editor indexing; the controller scenario subsequently passed. This is not a clean-console claim.
