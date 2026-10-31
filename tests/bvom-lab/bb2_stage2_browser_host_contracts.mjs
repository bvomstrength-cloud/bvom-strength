import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createBB2BrowserHost } from '../../bb2/browser-host.mjs';

const require = createRequire(import.meta.url);
const { createBB2LocalStore } = require('../../bb2/local-store.cjs');
const { setBB2OptionalCurls, createBB2Setup } = require('../../bb2/catalogue.cjs');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const memory = () => {
  const map = new Map();
  return {
    map,
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, value)
  };
};
const mockLocks = () => {
  const held = new Set();
  return { request: async (name, options, fn) => {
    assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
    if (held.has(name)) return fn(null);
    held.add(name);
    try { return await fn({ name, mode: 'exclusive' }); }
    finally { held.delete(name); }
  } };
};
const make = (options = {}) => {
  let auth = 'owner-1', local = 'owner-1', enabled = true;
  const runtime = { localStorage: options.storage || memory(),
    navigator: { locks: options.locks || mockLocks() } };
  const host = createBB2BrowserHost({ runtime, ownerId: 'owner-1',
    getAuthenticatedOwnerId: () => auth,
    getLocalOwnerId: () => local,
    canWrite: () => enabled });
  return { host, runtime, setAuth: v => { auth = v; },
    setLocal: v => { local = v; }, setEnabled: v => { enabled = v; } };
};

test('actual local writer uses only its isolated owner key and browser lock', async () => {
  const { host, runtime } = make();
  const store = createBB2LocalStore({ ownerId: 'owner-1', ...host });
  const initialized = await store.initialize('block-1');
  assert.equal(initialized.snapshot.revision, 0);
  assert.deepEqual([...runtime.localStorage.map.keys()], [host.key]);
  await store.saveSetup(setBB2OptionalCurls(createBB2Setup(), true), {
    expectedRevision: 0, activeWorkout: false });
  assert.equal(store.read().revision, 1);
  assert.equal(store.read().setup.optionalUpperBCurls, true);
  assert.equal(runtime.localStorage.getItem('bvom_data'), null);
});

test('no direct storage write is possible without a held exclusive lock', async () => {
  const { host } = make();
  assert.throws(() => host.storage.setItem(host.key, 'unsafe'), /without exclusive/);
  assert.throws(() => host.storage.setItem('bvom_data', 'unsafe'), /foreign or legacy/);
  assert.throws(() => host.storage.getItem('bvom_data'), /foreign or legacy/);
});

test('unsupported Web Locks fails closed with a readable existing local block', async () => {
  const { host, runtime } = make();
  const store = createBB2LocalStore({ ownerId: 'owner-1', ...host });
  await store.initialize('block-1');
  runtime.navigator.locks = undefined;
  assert.equal(store.read().revision, 0);
  await assert.rejects(store.saveSetup(createBB2Setup(), {
    expectedRevision: 0, activeWorkout: false }), /Web Locks unavailable/);
  assert.equal(store.read().revision, 0);
});

test('closed writer policy denies writes, even if Web Locks are available', async () => {
  const { host, setEnabled } = make();
  const store = createBB2LocalStore({ ownerId: 'owner-1', ...host });
  await store.initialize('block-1');
  setEnabled(false);
  assert.equal(store.read().revision, 0);
  await assert.rejects(store.saveSetup(setBB2OptionalCurls(createBB2Setup(), true), {
    expectedRevision: 0, activeWorkout: false }), /writer disabled/);
});

test('account switching fences reads and writes, including mid-transaction', async () => {
  const { host, setAuth, setLocal } = make();
  const store = createBB2LocalStore({ ownerId: 'owner-1', ...host });
  await store.initialize('block-1');
  setAuth('owner-2');
  assert.throws(() => store.read(), /owner changed/);
  await assert.rejects(store.saveSetup(createBB2Setup(), {
    expectedRevision: 0, activeWorkout: false }), /owner changed/);
  setAuth('owner-1'); setLocal('owner-2');
  assert.throws(() => store.read(), /owner changed/);
  setLocal('owner-1');
  await assert.rejects(host.withExclusiveLock(host.key, async () => {
    setAuth('owner-2');
    host.storage.setItem(host.key, '{}');
  }), /owner changed/);
  setAuth('owner-1');
  assert.equal(store.read().revision, 0);
});

test('a locked callback cannot write another owner or legacy key', async () => {
  const { host, runtime } = make();
  await assert.rejects(host.withExclusiveLock('bvom_data', async () => {}), /foreign or legacy/);
  await host.withExclusiveLock(host.key, async () => {
    assert.throws(() => host.storage.setItem('bvom_data', '{}'), /foreign or legacy/);
    assert.throws(() => host.storage.setItem('bvom.bb2.local.v1.owner-2', '{}'), /foreign or legacy/);
    host.storage.setItem(host.key, 'safe');
  });
  assert.equal(runtime.localStorage.getItem(host.key), 'safe');
});

test('contended lock fails instantly rather than queuing a stale writer', async () => {
  const storage = memory(), locks = mockLocks();
  const a = make({ storage, locks }).host, b = make({ storage, locks }).host;
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const holding = a.withExclusiveLock(a.key, async () => {
    entered();
    await blocked;
    a.storage.setItem(a.key, 'a');
  });
  await started;
  await assert.rejects(b.withExclusiveLock(b.key, async () => {
    b.storage.setItem(b.key, 'b');
  }), /another BB2 tab/);
  release(); await holding;
  assert.equal(storage.getItem(a.key), 'a');
});

test('exception inside lock releases ownership for a safe retry', async () => {
  const { host, runtime } = make();
  await assert.rejects(host.withExclusiveLock(host.key, async () => {
    host.storage.setItem(host.key, 'preserved');
    throw Error('mock interrupted write');
  }), /mock interrupted/);
  await host.withExclusiveLock(host.key, async () => {
    assert.equal(host.storage.getItem(host.key), 'preserved');
    host.storage.setItem(host.key, 'retried');
  });
  assert.equal(runtime.localStorage.getItem(host.key), 'retried');
});

let failures = 0;
for (const [name, run] of tests) {
  try { await run(); console.log('PASS:', name); }
  catch (error) { failures++; console.error('FAIL:', name, error.stack); }
}
console.log(`BB2 Stage (ii) browser host: ${tests.length - failures}/${tests.length} PASS`);
if (failures) process.exitCode = 1;
