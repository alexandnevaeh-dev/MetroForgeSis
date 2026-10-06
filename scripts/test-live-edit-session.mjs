import assert from 'node:assert/strict';
import { LiveEditSession } from '../packages/engines/dist/live-edit-session.js';

const session = new LiveEditSession('project', 'preview', [
  { id: 'enemy:1', roomId: 'room:1', x: 20, y: 30, properties: { speed: 100 } },
], new Set(['speed', 'label']));
const current = () => ({ projectId: 'project', sessionId: 'preview', baseRevision: session.snapshot().revision });
const move = (x, y) => ({ type: 'move', objectId: 'enemy:1', x, y });
assert.equal(session.snapshot().runtimeSynchronized, false);
session.acknowledgeRuntime('project', 'preview', 0);
const first = session.commit({ ...current(), operations: [move(40, 50), { type: 'property', objectId: 'enemy:1', key: 'label', value: 'Sentinel' }] });
assert.equal(session.snapshot().runtimeSynchronized, false, 'Saving authoring changes does not imply a live update');
assert.equal(session.snapshot().dirty, true);
session.markSaved(1);
assert.equal(session.snapshot().dirty, false);
assert.throws(() => session.acknowledgeRuntime('project', 'preview', 0), /Stale/);
assert.throws(() => session.acknowledgeRuntime('project', 'wrong-preview', 1), /another/);
session.acknowledgeRuntime('project', 'preview', 1);
assert.equal(session.snapshot().runtimeSynchronized, true);

const beforeInvalid = session.snapshot();
for (const operations of [
  [move(80, 90), move(NaN, 100)],
  [move(80, 90), { type: 'property', objectId: 'enemy:1', key: 'unsupported', value: 4 }],
  [move(80, 90), { type: 'move', objectId: 'missing', x: 0, y: 0 }],
  [{ type: 'property', objectId: 'enemy:1', key: '__proto__', value: 'unsafe' }],
  [{ type: 'property', objectId: 'enemy:1', key: 'speed', value: Infinity }],
  [],
]) {
  assert.throws(() => session.commit({ ...current(), operations }));
  assert.deepEqual(session.snapshot(), beforeInvalid, 'Rejected batches must change neither objects nor history');
}
assert.throws(() => session.commit({ ...current(), projectId: 'other', operations: [move(1, 2)] }), /another/);
assert.throws(() => session.commit({ ...current(), baseRevision: 0, operations: [move(1, 2)] }), /Stale/);
// External mutation of returned receipts or snapshots cannot alter undo history.
first.inverse[0].key = 'speed';
const detached = session.snapshot();
detached.objects[0].x = 999;
session.undo(current());
assert.deepEqual(session.snapshot().objects[0], { id: 'enemy:1', roomId: 'room:1', x: 20, y: 30, properties: { speed: 100 } });
session.redo(current());
assert.equal(session.snapshot().objects[0].properties.label, 'Sentinel');
assert.equal(session.snapshot().objects[0].x, 40);
session.undo(current());
session.commit({ ...current(), operations: [move(60, 70), move(80, 90)] });
assert.equal(session.snapshot().canRedo, false);
session.undo(current());
assert.equal(session.snapshot().objects[0].x, 20, 'Inverse operations must run in reverse batch order');
assert.throws(() => session.markSaved(1), /stale/);
session.acknowledgeRuntime('project', 'preview', session.snapshot().revision);
session.disconnectRuntime();
assert.equal(session.snapshot().runtimeSynchronized, false);
console.log('PASS: atomic edits, revisions, session isolation, undo/redo, snapshot ownership, save and runtime acknowledgements');
