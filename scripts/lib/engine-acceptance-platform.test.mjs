import assert from 'node:assert/strict';
import { nativeBuildPlan, playtestPassed } from './engine-acceptance-platform.mjs';

for (const [platform, binary, suffix, method] of [
  ['win32', '/engines/UE/Engine/Binaries/Win64/UnrealEditor.exe', 'BatchFiles/Build.bat', 'BuildWindows'],
  ['darwin', '/engines/UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor', 'BatchFiles/Mac/Build.sh', 'BuildMacOS'],
  ['linux', '/engines/UE/Engine/Binaries/Linux/UnrealEditor', 'BatchFiles/Linux/Build.sh', 'BuildLinux'],
]) {
  const plan = nativeBuildPlan(platform, binary, '/games/test');
  assert.equal(plan.command.replaceAll('\\', '/'), `/engines/UE/Engine/Build/${suffix}`);
  assert.equal(plan.unityMethod, method);
  assert.equal(plan.args[0], 'MetroForgeGameEditor');
}
assert.throws(() => nativeBuildPlan('unknown', '', ''), /Unsupported/);
assert.equal(playtestPassed(0, null, 100), false, 'Exit zero without evidence cannot pass');
assert.equal(playtestPassed(0, { data: { status: 'PASS' }, modifiedAt: 99 }, 100), false, 'Stale evidence cannot pass');
assert.equal(playtestPassed(1, { data: { status: 'PASS' }, modifiedAt: 101 }, 100), false, 'Failed process cannot pass');
assert.equal(playtestPassed(0, { data: { status: 'FAIL' }, modifiedAt: 101 }, 100), false);
assert.equal(playtestPassed(0, { data: { status: 'PASS' }, modifiedAt: 101 }, 100), true);
console.log('PASS: platform build plans and five playtest evidence cases');
