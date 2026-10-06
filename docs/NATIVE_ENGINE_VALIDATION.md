# Native Unity and Unreal validation on Windows

The generated baseline projects target Unity 6000.3.0f1 and Unreal 5.8. Keep initial validation on those versions before planning an upgrade. TypeScript assembly checks do not prove native C#/C++ compilation, runtime behavior or visual quality.

Install editors and toolchains on E:, and activate the required accounts/licenses yourself. Epic requires sign-in and acceptance of its engine agreements: https://dev.epicgames.com/documentation/unreal-engine/install-unreal-engine. Unity's pinned official installer is linked from https://unity.com/releases/editor/whats-new/6000.3.0f1. Do not silently accept license terms or change paid account settings.

Run from PowerShell with isolated generated test projects on E:

```powershell
& .\scripts\validate-native-engines.ps1 `
  -UnityProject E:\Metroforge\Recovery-Audit\engine-smoke\unity `
  -UnrealProject E:\Metroforge\Recovery-Audit\engine-smoke\unreal `
  -UnityEditor E:\Engines\Unity\6000.3.0f1\Editor\Unity.exe `
  -UnrealRoot E:\Engines\UE_5.8
```

Adjust editor paths to their actual installation locations. The wrapper redirects temporary files, app data, Unity UPM/Bee caches and Unreal DDC/Zen data to E: and records every selected path. Unity/Unreal project-local imports and build outputs stay inside the E:-resident projects. Run launcher installation and account activation separately; the wrapper does not configure a launcher or relocate existing global installations.

Cache configuration references:
- Unity UPM: https://docs.unity.cn/2020.3/Documentation/Manual/upm-config.html
- Unity Bee: https://docs.unity.com/en-us/engine/6000.7/manual/building-and-publishing/build-analyze-builds/build-cache-location-reference
- Unreal DDC/Zen: https://dev.epicgames.com/documentation/unreal-engine/using-zen-storage-server-as-cooked-output-store-for-unreal-engine

Acceptance requires editor compilation, actual play acceptance, visual capture, and a native Windows player build for both engines. Inspect the JSON reports and logs; exit 2 means incomplete acceptance. The generated test project must contain representative assets before interpreting screenshots as game-quality evidence. Unreal C++ builds additionally need the supported Microsoft compiler/Windows SDK toolchain. Missing editors, licenses or compilers must be reported as blocked, never as passed.
