/* One entry point for the generated browser core + real app ownership fence.
 * Simulated account only. No browser globals, cloud calls or production writes.
 */
import assert from 'node:assert/strict';
import { createBB2DormantAppBridge } from '../../bb2/app-bridge.mjs';
import { createBB2Setup, setBB2OptionalCurls, getBB2TemplatePrescription,
  foldBB2Block } from '../../bb2/browser-core.mjs';

const tests = [];
const test = (name, run) => tests.push([name, run]);
const ownerId = 'bridge-test-owner';
const safe = () => ({
  authUserId: ownerId, cloudUserId: ownerId, localOwnerId: ownerId,
  appVisible: true, entitlementAllowed: true,
  documentLockOwned: true, documentLockState: 'owned',
  legacyRecoveryBlocked: false, tabOwnerCompatible: true,
  accountSwitchDeferred: false, recoveryBusy: false,
  localPersistenceHealthy: true, localBlobUnchanged: true,
  legacyWorkoutActive: false, cloudConflict: false,
  bb2WriterEnabled: false, multiDeviceFenceVerified: false
});
const runtime = () => {
  const items = new Map();
  const held = new Set();
  const locks = { request: async (name, options, callback) => {
    assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name }); } finally { held.delete(name); }
  } };
  return { items, localStorage: {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); }
  }, navigator: { locks } };
};
const make = (host, state) => createBB2DormantAppBridge({ runtime: host,
  ownerId, readAppSnapshot: () => state.current });

test('import is inert; both rollout gates must be independently true', async () => {
  const host = runtime(), state = { current: safe() }, app = make(host, state);
  assert.deepEqual(host.items.size, 0);
  assert.equal(app.status().allowed, false);
  assert.equal(app.read(), null);
  await assert.rejects(app.initialize('bridge-block'), /writer disabled/);
  state.current = { ...state.current, bb2WriterEnabled: true };
  await assert.rejects(app.initialize('bridge-block'), /writer disabled/);
  state.current = { ...state.current, multiDeviceFenceVerified: true };
  assert.equal(app.status().allowed, true);
  const created = await app.initialize('bridge-block');
  assert.deepEqual([created.snapshot.revision, host.items.size], [0, 1]);
  assert.match(app.key, /^bvom\.bb2\.local\.v1\./);
  assert.equal(app.initialize instanceof Function, true);
  assert.equal(Object.isFrozen(app), true);
});

test('setup, catalogue Start and replay share the same guarded ESM engine', async () => {
  const host = runtime(), state = { current: {
    ...safe(), bb2WriterEnabled: true, multiDeviceFenceVerified: true
  } }, app = make(host, state);
  await app.initialize('bridge-block');
  const newSetup = setBB2OptionalCurls(createBB2Setup(), true);
  assert.equal((await app.saveSetup(newSetup,
    { expectedRevision: 0, activeWorkout: false })).snapshot.revision, 1);
  const slots = getBB2TemplatePrescription(newSetup, 'upper_b').slots.map(s => {
    const { roleSlotId, exerciseId, sets, floor, ceiling, equipment } = s;
    const plan = { roleSlotId, exerciseId, sets, floor, ceiling, equipment };
    return equipment === 'loaded'
      ? { ...plan, plannedG: 60000, plannedOrigin: { value: '60', unit: 'kg' },
        incrementG: 2500, incrementOrigin: { value: '2.5', unit: 'kg' } }
      : { ...plan, variation: exerciseId, assistance: 'none' };
  });
  const started = await app.commitStart({ type: 'WORKOUT_STARTED',
    eventId: 'start-1', commitOrdinal: 1, blockId: 'bridge-block',
    sessionId: 'session-1', templateId: 'upper_b', kind: 'NORMAL', slots },
  { expectedRevision: 1, activeWorkout: false });
  assert.equal(started.snapshot.revision, 2);
  assert.equal(started.snapshot.events.length, 1);
  assert.equal(foldBB2Block(started.snapshot.opening,
    started.snapshot.events).headOrdinal, 1);
  await assert.rejects(app.saveSetup(createBB2Setup(),
    { expectedRevision: 2, activeWorkout: false }), /active workout/);
});

test('sign-out, competing tab, old workout and corrupt storage fail closed', async () => {
  const host = runtime(), state = { current: {
    ...safe(), bb2WriterEnabled: true, multiDeviceFenceVerified: true
  } }, app = make(host, state);
  await app.initialize('bridge-block');
  state.current = { ...state.current, cloudUserId: 'other' };
  assert.throws(() => app.read(), /owner changed/);
  await assert.rejects(app.saveSetup(createBB2Setup(),
    { expectedRevision: 0, activeWorkout: false }), /owner changed/);
  state.current = { ...safe(), bb2WriterEnabled: true,
    multiDeviceFenceVerified: true, tabOwnerCompatible: false };
  await assert.rejects(app.saveSetup(createBB2Setup(),
    { expectedRevision: 0, activeWorkout: false }), /writer disabled/);
  state.current = { ...state.current, tabOwnerCompatible: true,
    legacyWorkoutActive: true };
  await assert.rejects(app.saveSetup(createBB2Setup(),
    { expectedRevision: 0, activeWorkout: false }), /writer disabled/);
  state.current = { ...state.current, legacyWorkoutActive: false };
  host.items.set(app.key, '{bad json');
  assert.throws(() => app.read(), /corrupt local BB2 JSON/);
});

test('missing Web Locks never silently falls back to unsafe writes', async () => {
  const host = runtime(), state = { current: {
    ...safe(), bb2WriterEnabled: true, multiDeviceFenceVerified: true
  } };
  delete host.navigator.locks;
  const app = make(host, state);
  await assert.rejects(app.initialize('bridge-block'), /Web Locks unavailable/);
  assert.equal(host.items.size, 0);
});

let failures = 0;
for (const [name, run] of tests) {
  try { await run(); console.log('PASS: ' + name); }
  catch (error) { failures++; console.error('FAIL: ' + name, error.stack); }
}
console.log(`BB2 Stage (ii) guarded browser bridge: ${tests.length - failures}/${tests.length} PASS`);
if (failures) process.exitCode = 1;
