import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { getResourceRoot } from '../packages/shared/dist/resources.js';
import { UnityProjectAssembler } from '../packages/unity/dist/assembler.js';
import { UnrealProjectAssembler } from '../packages/unreal/dist/assembler.js';
assert.equal(getResourceRoot({}), resolve('.'));
assert.throws(() => getResourceRoot({ METROFORGE_RESOURCE_ROOT: 'relative/resources' }), /absolute path/);
const original = process.env.METROFORGE_RESOURCE_ROOT;
try {
  // Set after importing exporters: packaged startup must not be captured at import time.
  const custom = resolve('E:/Metroforge/Recovery-Audit/nonexistent-packaged-resources');
  process.env.METROFORGE_RESOURCE_ROOT = custom;
  assert.equal(getResourceRoot(), custom);
  for (const [engine, assembler] of [['Unity', new UnityProjectAssembler()], ['Unreal', new UnrealProjectAssembler()]]) {
    const result = assembler.assemble({ outputDir: 'E:/Metroforge/Recovery-Audit/resource-check-unused' });
    assert.equal(result.success, false);
    assert.ok(result.errors.some(error => error.includes(custom) && error.includes(`${engine} template not found`)), JSON.stringify(result.errors));
  }
} finally {
  if (original === undefined) delete process.env.METROFORGE_RESOURCE_ROOT;
  else process.env.METROFORGE_RESOURCE_ROOT = original;
}
console.log('Runtime resource root regression PASS');
