import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { bb2AppWriteStatus, createBB2AppSessionHost } from '../../bb2/app-session.mjs';

const require = createRequire(import.meta.url);
const path = require('node:path');
const H = require('./lib/bvom_harness');
const { createBB2LocalStore } = require('../../bb2/local-store.cjs');
const { createBB2Setup, setBB2OptionalCurls } = require('../../bb2/catalogue.cjs');
const testCases = [];
const test = (name, fn) => testCases.push([name, fn]);
const baseline = () => ({ authUserId: 'owner-1', cloudUserId: 'owner-1',
  localOwnerId: 'owner-1', appVisible: true, entitlementAllowed: true,
  documentLockOwned: true, documentLockState: 'owned',
  legacyRecoveryBlocked: false, tabOwnerCompatible: true,
  accountSwitchDeferred: false, recoveryBusy: false,
  localPersistenceHealthy: true, localBlobUnchanged: true,
  legacyWorkoutActive: false, cloudConflict: false,
  bb2WriterEnabled: true, multiDeviceFenceVerified: true });
const fakeRuntime = () => {
  const data = new Map(); const held = new Set();
  return { localStorage: {
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v)
  }, navigator: { locks: { request: async (name, options, fn) => {
    assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
    if (held.has(name)) return fn(null);
    held.add(name);
    try { return await fn({ name }); } finally { held.delete(name); }
  } } }, data };
};

test('all documented app, entitlement, window, persistence and cloud fences pass', () => {
  assert.deepEqual(bb2AppWriteStatus(baseline(), 'owner-1'),
    { allowed: true, reason: 'eligible' });
});

test('actual BVOM snapshot tracks account, lock and persisted data; rollout stays off', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const h = H.boot(H.loadBuild(root), { supabase: null, online: false });
  H.configureLP(h);
  h.ctx.bvomSetLocalOwnerId('owner-1');
  h.ev(`window.__bvomAuthUserId='owner-1';bvomCloud.user={id:'owner-1'};
    bvomEntitlement.record={user_id:'owner-1',status:'complimentary'};
    bvomWindowLockOwned=true;bvomWindowLockState='owned';`);
  h.els['#app'].classList.remove('hidden');
  const read = () => h.ev('bvomBb2DormantAccountSnapshot()');
  const initial = read();
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(initial.entitlementAllowed, true);
  assert.equal(initial.localOwnerId, 'owner-1');
  assert.equal(initial.documentLockOwned, true);
  assert.equal(initial.localBlobUnchanged, true);
  assert.equal(initial.bb2WriterEnabled, false);
  assert.equal(initial.multiDeviceFenceVerified, false);
  assert.equal(bb2AppWriteStatus(initial, 'owner-1').allowed, false);
  h.ev('bvomCloud.user={id:"other-owner"};bvomCloud.accountSwitchDeferred=true;');
  assert.equal(read().cloudUserId, 'other-owner');
  assert.equal(read().accountSwitchDeferred, true);
  h.ev('bvomCloud.user={id:"owner-1"};bvomCloud.accountSwitchDeferred=false;');
  h.ls.setItem('bvom_data', '{"changed":true}');
  assert.equal(read().localBlobUnchanged, false);
  h.els['#app'].classList.add('hidden');
  assert.equal(read().appVisible, false);
});

test('every individual protective guard fails closed when absent or unsafe', () => {
  const unsafe = {
    authUserId: null, cloudUserId: 'owner-2', localOwnerId: 'owner-2',
    appVisible: false, entitlementAllowed: false,
    documentLockOwned: false, documentLockState: 'competing',
    legacyRecoveryBlocked: true, tabOwnerCompatible: false,
    accountSwitchDeferred: true, recoveryBusy: true,
    localPersistenceHealthy: false, localBlobUnchanged: false,
    legacyWorkoutActive: true, cloudConflict: true,
    bb2WriterEnabled: false, multiDeviceFenceVerified: false
  };
  for (const [field, value] of Object.entries(unsafe)) {
    assert.equal(bb2AppWriteStatus({ ...baseline(), [field]: value }, 'owner-1').allowed,
      false, `unsafe ${field} must block`);
    const omitted = baseline(); delete omitted[field];
    assert.equal(bb2AppWriteStatus(omitted, 'owner-1').allowed,
      false, `missing ${field} must block`);
  }
  assert.equal(bb2AppWriteStatus(null, 'owner-1').allowed, false);
});

test('real local writer stays off while future rollout and device fences are off', async () => {
  let state = { ...baseline(), bb2WriterEnabled: false,
    multiDeviceFenceVerified: false };
  const runtime = fakeRuntime();
  const host = createBB2AppSessionHost({ runtime, ownerId: 'owner-1',
    readAppSnapshot: () => state });
  const store = createBB2LocalStore({ ownerId: 'owner-1', ...host });
  assert.match(host.status().reason, /disabled/);
  assert.equal(store.read(), null);
  await assert.rejects(store.initialize('block-1'), /writer disabled/);
  assert.equal(runtime.data.size, 0);
  state = { ...state, bb2WriterEnabled: true };
  await assert.rejects(store.initialize('block-1'), /writer disabled/);
  assert.equal(runtime.data.size, 0);
  state = { ...state, multiDeviceFenceVerified: true };
  await store.initialize('block-1');
  assert.equal(runtime.data.size, 1);
});

test('owner or auth switch blocks reads of previous account and all further writes', async () => {
  let state = baseline(); const runtime = fakeRuntime();
  const host = createBB2AppSessionHost({ runtime, ownerId: 'owner-1',
    readAppSnapshot: () => state });
  const store = createBB2LocalStore({ ownerId: 'owner-1', ...host });
  await store.initialize('block-1');
  state = { ...state, cloudUserId: 'owner-2', accountSwitchDeferred: true };
  assert.throws(() => store.read(), /owner changed/);
  await assert.rejects(store.saveSetup(setBB2OptionalCurls(createBB2Setup(), true), {
    expectedRevision: 0, activeWorkout: false }), /owner changed/);
  assert.equal(runtime.data.size, 1);
  state = baseline();
  assert.equal(store.read().revision, 0);
});

test('lost document lock and stale legacy blob reject even while BB2 lock exists', async () => {
  let state = baseline(); const runtime = fakeRuntime();
  const host = createBB2AppSessionHost({ runtime, ownerId: 'owner-1',
    readAppSnapshot: () => state });
  const store = createBB2LocalStore({ ownerId: 'owner-1', ...host });
  await store.initialize('block-1');
  state = { ...state, documentLockOwned: false };
  await assert.rejects(store.saveSetup(setBB2OptionalCurls(createBB2Setup(), true), {
    expectedRevision: 0, activeWorkout: false }), /writer disabled/);
  state = { ...baseline(), localBlobUnchanged: false };
  await assert.rejects(store.saveSetup(setBB2OptionalCurls(createBB2Setup(), true), {
    expectedRevision: 0, activeWorkout: false }), /writer disabled/);
  assert.equal(store.read().revision, 0);
});

test('mid-lock sign-out or new legacy workout prevents a committed BB2 write', async () => {
  let state = baseline(); const runtime = fakeRuntime();
  const host = createBB2AppSessionHost({ runtime, ownerId: 'owner-1',
    readAppSnapshot: () => state });
  const store = createBB2LocalStore({ ownerId: 'owner-1', ...host });
  await store.initialize('block-1');
  await assert.rejects(host.withExclusiveLock(host.key, async () => {
    state = { ...state, legacyWorkoutActive: true };
    host.storage.setItem(host.key, 'injected');
  }), /writer disabled/);
  assert.equal(store.read().revision, 0);
  state = baseline();
  await assert.rejects(host.withExclusiveLock(host.key, async () => {
    state = { ...state, authUserId: null };
    host.storage.setItem(host.key, 'injected');
  }), /owner changed/);
  state = baseline();
  assert.equal(store.read().revision, 0);
});

test('a broken app snapshot reader fails closed without modifying local data', async () => {
  let reader = () => baseline(); const runtime = fakeRuntime();
  const host = createBB2AppSessionHost({ runtime, ownerId: 'owner-1',
    readAppSnapshot: () => reader() });
  const store = createBB2LocalStore({ ownerId: 'owner-1', ...host });
  await store.initialize('block-1');
  reader = () => { throw Error('app state unavailable'); };
  await assert.rejects(store.saveSetup(setBB2OptionalCurls(createBB2Setup(), true), {
    expectedRevision: 0, activeWorkout: false }), /app state unavailable/);
  assert.equal(runtime.data.size, 1);
});

let failures = 0;
for (const [name, run] of testCases) {
  try { await run(); console.log('PASS:', name); }
  catch (error) { failures++; console.error('FAIL:', name, error.stack); }
}
console.log(`BB2 Stage (ii) BVOM app session: ${testCases.length - failures}/${testCases.length} PASS`);
if (failures) process.exitCode = 1;
