import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as browser from '../../bb2/browser-core.mjs';
import { createBB2AppSessionHost } from '../../bb2/app-session.mjs';

const require = createRequire(import.meta.url);
const { buildBundle, inspectImports } = require('../../scripts/build-bb2-browser.cjs');
const root = path.resolve(import.meta.dirname, '../..');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const node = {
  ledger: require('../../bb2/ledger.cjs'),
  catalogue: require('../../bb2/catalogue.cjs'),
  start: require('../../bb2/start.cjs'),
  restore: require('../../bb2/restore.cjs'),
  localStore: require('../../bb2/local-store.cjs')
};

test('checked-in static browser module exactly matches all five input sources', () => {
  const { sha256, text } = buildBundle();
  assert.equal(browser.BB2_BROWSER_SOURCE_SHA256, sha256);
  assert.equal(fs.readFileSync(path.join(root, 'bb2/browser-core.mjs'), 'utf8'), text);
  assert.match(text, /GENERATED BB2 browser core/);
  assert.doesNotMatch(text, /\bimport\s*\(/);
  assert.doesNotMatch(text, /new Function\s*\(|\beval\s*\(/);
});

test('BB2 browser module is in draft Netlify ZIP and offline service-worker cache', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const zipWorkflow = fs.readFileSync(path.join(root,
    '.github/workflows/bvom-netlify-test-zip.yml'), 'utf8');
  const labWorkflow = fs.readFileSync(path.join(root,
    '.github/workflows/bvom-lab.yml'), 'utf8');
  assert.ok(sw.includes("'./bb2/browser-core.mjs'"),
    'offline installation must cache the actual dynamically imported browser module');
  assert.ok(zipWorkflow.includes('cp bb2/browser-core.mjs .bvom-netlify-test/bb2/'),
    'the test-site ZIP must contain the generated browser module');
  assert.ok(zipWorkflow.includes('test -s .bvom-netlify-test/bb2/browser-core.mjs'),
    'packaging must fail if the dynamic module is missing');
  assert.ok(labWorkflow.includes('cp bb2/browser-core.mjs .bvom-candidate/bb2/'),
    'the full regression candidate must include every service-worker precache file');
  for (const module of ['browser-host.mjs','app-session.mjs',
    'cloud-sidecar.mjs','cloud-coordinator.mjs']) {
    assert.ok(sw.includes("'./bb2/"+module+"'"),module+' must be cached');
    assert.ok(zipWorkflow.includes('bb2/'+module),
      module+' must be included in test packages');
    assert.ok(labWorkflow.includes('bb2/'+module),
      module+' must be included in regression packages');
  }
});

test('whitelist rejects Node imports and computed dependency paths', () => {
  assert.throws(() => inspectImports('evil.cjs', "require('node:fs')"), /unexpected/);
  assert.throws(() => inspectImports('evil.cjs', 'require(path)'), /unexpected/);
  assert.throws(() => inspectImports('evil.cjs', "require('./index.html')"), /unexpected/);
  assert.throws(() => inspectImports('evil.cjs', "import('./network.mjs')"), /unsupported/);
  assert.throws(() => inspectImports('evil.cjs', "eval('1+1')"), /unsupported/);
});

test('every exported module contract matches the original Node implementation', () => {
  for (const [name, exports] of Object.entries(node)) {
    assert.deepEqual(Object.keys(browser.BB2_BROWSER_MODULES[name]).sort(),
      Object.keys(exports).sort(), name);
  }
  assert.equal(browser.createBB2LocalStore, browser.BB2_BROWSER_MODULES.localStore.createBB2LocalStore);
  assert.equal(browser.foldBB2Block, browser.BB2_BROWSER_MODULES.ledger.foldBB2Block);
});

test('browser and Node agree on opening, setup, templates, and gram conversion', () => {
  const input = { ownerId: 'owner-bundle', blockId: 'block-bundle' };
  assert.deepEqual(browser.createBB2Opening(input), node.ledger.createBB2Opening(input));
  const setup = browser.createBB2Setup();
  assert.deepEqual(setup, node.catalogue.createBB2Setup());
  for (const templateId of node.catalogue.TEMPLATE_ORDER) {
    assert.deepEqual(browser.getBB2TemplatePrescription(setup, templateId),
      node.catalogue.getBB2TemplatePrescription(setup, templateId));
  }
  assert.equal(browser.BB2_BROWSER_MODULES.ledger.canonicalGrams('226', 'lb'), 102512);
});

test('browser and Node complete equal sealed-free empty ledger projections', () => {
  const opening = browser.createBB2Opening({ ownerId: 'owner-bundle', blockId: 'block-bundle' });
  assert.deepEqual(browser.foldBB2Block(opening, []), node.ledger.foldBB2Block(opening, []));
  assert.deepEqual(browser.validateBB2RestoredBlock(opening, []),
    node.restore.validateBB2RestoredBlock(opening, []));
});

test('gated browser module invokes real local writer only with explicit test flags', async () => {
  const data = new Map(); const held = new Set();
  let snapshot = { authUserId: 'owner-bundle', cloudUserId: 'owner-bundle',
    localOwnerId: 'owner-bundle', appVisible: true, entitlementAllowed: true,
    documentLockOwned: true, documentLockState: 'owned',
    legacyRecoveryBlocked: false, tabOwnerCompatible: true,
    accountSwitchDeferred: false, recoveryBusy: false,
    localPersistenceHealthy: true, localBlobUnchanged: true,
    legacyWorkoutActive: false, cloudConflict: false,
    bb2WriterEnabled: false, multiDeviceFenceVerified: false };
  const runtime = { localStorage: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)
  }, navigator: { locks: { request: async (name, options, fn) => {
    assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
    if (held.has(name)) return fn(null);
    held.add(name); try { return await fn({ name }); } finally { held.delete(name); }
  } } } };
  const host = createBB2AppSessionHost({ runtime, ownerId: 'owner-bundle',
    readAppSnapshot: () => snapshot });
  const store = browser.createBB2LocalStore({ ownerId: 'owner-bundle', ...host });
  await assert.rejects(store.initialize('block-bundle'), /writer disabled/);
  assert.equal(data.size, 0);
  snapshot = { ...snapshot, bb2WriterEnabled: true, multiDeviceFenceVerified: true };
  const committed = await store.initialize('block-bundle');
  assert.equal(committed.snapshot.revision, 0);
  assert.equal(data.size, 1);
  assert.deepEqual(store.read().opening, browser.createBB2Opening({
    ownerId: 'owner-bundle', blockId: 'block-bundle' }));
  snapshot = { ...snapshot, localBlobUnchanged: false };
  await assert.rejects(store.saveSetup(browser.setBB2OptionalCurls(
    browser.createBB2Setup(), true), { expectedRevision: 0, activeWorkout: false }), /writer disabled/);
  assert.equal(store.read().revision, 0);
});

let failures = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('PASS:', name); }
  catch (error) { failures++; console.error('FAIL:', name, error.stack); }
}
console.log(`BB2 Stage (ii) static browser bundle: ${tests.length - failures}/${tests.length} PASS`);
if (failures) process.exitCode = 1;
