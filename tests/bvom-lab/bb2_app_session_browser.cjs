'use strict';
// Isolated real BVOM app: check dormant BB2 guards against actual app globals.
// Uses dummy owner/offline entitlement and blocks every external request.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const H = require('./lib/bvom_harness');

const root = path.resolve(__dirname, '../..');
const build = H.loadBuild(root);
const fixture = () => {
  const h = H.boot(build, { supabase: null, online: false });
  H.configureLP(h, { Squat: 60, 'Bench Press': 45, 'Prone Row': 40,
    'Overhead Press': 30, Deadlift: 75 });
  h.S().accessoryList = []; h.S().gppList = [];
  h.ev('save()');
  return JSON.parse(JSON.stringify(h.S()));
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  if (pathname === '/seed') { res.end('<!doctype html>seed'); return; }
  if (pathname.startsWith('/vendor/')) {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end('// Offline test: no cloud client available.'); return;
  }
  const file = path.join(root, pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': /\.(mjs|js)$/.test(file) ? 'text/javascript' :
    file.endsWith('.html') ? 'text/html' : 'image/png', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(file));
});

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let browser, context, origin;

async function open() {
  const page = await context.newPage();
  await page.goto(origin + '/index.html');
  await page.waitForSelector('#app:not(.hidden)');
  await page.waitForFunction(() => bvomWindowLockState !== 'starting');
  await page.evaluate(async () => {
    window.bb2TestEnable = false;
    window.bb2TestDeviceFence = false;
    const { createBB2AppSessionHost } = await import('/bb2/app-session.mjs');
    window.bb2AppRead = () => ({
      authUserId: window.__bvomAuthUserId,
      cloudUserId: bvomCloud.user?.id || null,
      localOwnerId: bvomLocalOwnerId(),
      appVisible: !document.querySelector('#app')?.classList.contains('hidden'),
      entitlementAllowed: bvomEntitlementAccessDecision(
        bvomEntitlement.record, bvomCloud.user?.id, true).allowed,
      documentLockOwned: bvomWindowLockOwned,
      documentLockState: bvomWindowLockState,
      legacyRecoveryBlocked: bvomRecoveryLegacyBlocked,
      tabOwnerCompatible: !bvomSecondaryTabWriteBlocked(),
      accountSwitchDeferred: bvomCloud.accountSwitchDeferred,
      recoveryBusy: bvomRecoveryBusy,
      localPersistenceHealthy: !bvomLocalPersistenceFailureActive &&
        !bvomLocalWriteConflictActive,
      localBlobUnchanged: localStorage.getItem(BVOM_DATA_KEY) === bvomLastPersistedRaw,
      legacyWorkoutActive: bvomAnyWorkoutActive(),
      cloudConflict: bvomCloud.conflict,
      bb2WriterEnabled: window.bb2TestEnable === true,
      multiDeviceFenceVerified: window.bb2TestDeviceFence === true
    });
    window.bb2AppHost = createBB2AppSessionHost({ runtime: window,
      ownerId: 'dummy-owner', readAppSnapshot: window.bb2AppRead });
  });
  return page;
}

const status = p => p.evaluate(() => window.bb2AppHost.status());
const attempt = p => p.evaluate(async () => {
  const h = window.bb2AppHost;
  try {
    await h.withExclusiveLock(h.key, () => h.storage.setItem(h.key, 'dummy-bb2'));
    return true;
  } catch (error) { return error.message; }
});

test('real app boots with both BB2 rollout gates shut; no local/cloud mutation', async () => {
  const p = await open();
  try {
    const before = await p.evaluate(() => ({
      raw: localStorage.getItem('bvom_data'),
      comparable: bvomCloudComparableFingerprint(bvomCloudPayload())
    }));
    assert.equal((await status(p)).allowed, false);
    assert.match(await attempt(p), /writer disabled/);
    await p.evaluate(() => { window.bb2TestEnable = true; });
    assert.match(await attempt(p), /writer disabled/);
    assert.equal(await p.evaluate(() => localStorage.getItem(
      'bvom.bb2.local.v1.dummy-owner')), null);
    assert.deepEqual(await p.evaluate(() => ({
      raw: localStorage.getItem('bvom_data'),
      comparable: bvomCloudComparableFingerprint(bvomCloudPayload())
    })), before);
  } finally { await p.close(); }
});

test('test-only permitted BB2 write changes neither BVOM data nor cloud fingerprint', async () => {
  const p = await open();
  try {
    const before = await p.evaluate(() => ({
      raw: localStorage.getItem('bvom_data'),
      comparable: bvomCloudComparableFingerprint(bvomCloudPayload())
    }));
    await p.evaluate(() => { window.bb2TestEnable = true;
      window.bb2TestDeviceFence = true; });
    assert.deepEqual(await status(p), { allowed: true, reason: 'eligible' });
    assert.equal(await attempt(p), true);
    assert.equal(await p.evaluate(() => localStorage.getItem(
      'bvom.bb2.local.v1.dummy-owner')), 'dummy-bb2');
    assert.deepEqual(await p.evaluate(() => ({
      raw: localStorage.getItem('bvom_data'),
      comparable: bvomCloudComparableFingerprint(bvomCloudPayload())
    })), before);
  } finally { await p.close(); }
});

test('legacy working sets, owner change, stale blob, and read-only second tab block BB2', async () => {
  const a = await open();
  try {
    await a.evaluate(() => { window.bb2TestEnable = true;
      window.bb2TestDeviceFence = true; });
    assert.equal((await status(a)).allowed, true);
    const b = await open();
    try {
      await b.evaluate(() => { window.bb2TestEnable = true;
        window.bb2TestDeviceFence = true; });
      assert.equal((await status(b)).allowed, false);
      assert.match(await attempt(b), /writer disabled/);
    } finally { await b.close(); }

    await a.evaluate(() => { bvomCloud.user = { id: 'another-account' };
      bvomCloud.accountSwitchDeferred = true; });
    assert.equal((await status(a)).allowed, false);
    assert.match(await attempt(a), /owner changed/);
    await a.evaluate(() => { bvomCloud.user = { id: 'dummy-owner' };
      bvomCloud.accountSwitchDeferred = false; });
    assert.equal((await status(a)).allowed, true);

    await a.evaluate(() => localStorage.setItem('bvom_data', '{"tampered":true}'));
    assert.equal((await status(a)).allowed, false);
    assert.match(await attempt(a), /writer disabled/);
    await a.evaluate(() => localStorage.setItem('bvom_data', bvomLastPersistedRaw));
    assert.equal((await status(a)).allowed, true);
    await a.evaluate(() => tapSet('Squat', 0));
    await a.locator('.bvomModalOverlay [data-ok]').last().click();
    assert.equal((await status(a)).allowed, false);
    assert.match(await attempt(a), /writer disabled/);
  } finally { await a.close(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  let failures = 0;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ?
      route.continue() : route.abort());
    await context.addInitScript(() => Object.defineProperty(navigator, 'onLine',
      { get: () => false }));
    const seed = await context.newPage();
    await seed.goto(origin + '/seed');
    await seed.evaluate(data => {
      localStorage.setItem('bvom_data', JSON.stringify(data));
      localStorage.setItem('bvom_data_owner', 'dummy-owner');
      localStorage.setItem('bvom_entitlement_cache_dummy-owner', JSON.stringify({
        userId: 'dummy-owner', verifiedAt: new Date().toISOString(),
        record: { user_id: 'dummy-owner', status: 'complimentary' }
      }));
    }, fixture());
    await seed.close();
    for (const [name, run] of tests) {
      try { await run(); console.log('PASS:', name); }
      catch (error) { failures++; console.error('FAIL:', name, error.stack); }
    }
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(`BB2 Stage (ii) actual BVOM account boundary: ${tests.length - failures}/${tests.length} PASS`);
  if (failures) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
