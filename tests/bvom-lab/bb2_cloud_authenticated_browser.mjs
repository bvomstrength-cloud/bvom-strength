// The actual BVOM inline app + local Auth/PostgREST in two isolated Chromium
// device contexts. No production Supabase URL, keys or user data are permitted.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const H = require('./lib/bvom_harness');
const root = path.resolve(import.meta.dirname, '../..');
const h = H.boot(H.loadBuild(root)); H.configureLP(h);
const fixture = JSON.parse(h.ls.getItem('bvom_data'));
const localStatus = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'],
  { encoding: 'utf8' }));
const apiUrl = localStatus.API_URL, anonKey = localStatus.ANON_KEY;
assert.match(apiUrl || '', /^http:\/\/(?:127\.0\.0\.1|localhost):54321\/?$/);
assert.ok(anonKey && localStatus.SERVICE_ROLE_KEY);
const admin = createClient(apiUrl, localStatus.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const credentials = { email: 'bb2-real-app@example.invalid',
  password: 'Local-Only-Real-BVOM-2026!' };
const created = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
if (created.error) throw created.error;
const ownerId = created.data.user.id;

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/seed') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>Isolated BVOM device</title>');
    return;
  }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) ||
      !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html' :
    /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream',
    'Cache-Control': 'no-store' });
  response.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
const contexts = [];
let passed = 0;
async function check(label, body) { await body(); passed++; console.log('PASS:', label); }
async function makeDevice(label) {
  const context = await browser.newContext({ serviceWorkers: 'block',
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true });
  contexts.push(context);
  context.setDefaultTimeout(15000);
  await context.route('**/*', route => {
    const target = new URL(route.request().url()).origin;
    return target === origin || target === apiUrl.replace(/\/$/, '') ?
      route.continue() : route.abort();
  });
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine',
    { get: () => false }));
  const page = await context.newPage();
  await page.goto(origin + '/seed');
  await page.evaluate(({ data, id }) => {
    localStorage.setItem('bvom_data', JSON.stringify(data));
    localStorage.setItem('bvom_data_owner', id);
    localStorage.setItem('bvom_entitlement_cache_' + id, JSON.stringify({
      userId: id, verifiedAt: new Date().toISOString(),
      record: { user_id: id, status: 'complimentary' }
    }));
  }, { data: fixture, id: ownerId });
  await page.goto(origin + '/index.html?bb2Preview=1');
  await page.waitForSelector('#app:not(.hidden)');
  await page.waitForFunction(() => bvomWindowLockOwned === true);
  const attached = await page.evaluate(async ({ url, key, email, password }) => {
    const client = window.supabase.createClient(url, key, { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    bvomCloud.user = signed.data.user;
    window.__bvomAuthUserId = signed.data.user.id;
    bvomCloud.accountSwitchDeferred = false;
    window.__bb2Isolated = await bvomBb2CreateDormantCloudCoordinator({
      isolatedClient: client });
    return { owner: signed.data.user.id,
      ready: bvomBb2DormantAccountSnapshot().documentLockOwned };
  }, { url: apiUrl, key: anonKey, ...credentials });
  assert.equal(attached.owner, ownerId, label + ' local Supabase Auth account');
  assert.equal(attached.ready, true, label + ' owns its BVOM document lock');
  return page;
}
async function recordSet(page, key) {
  await page.locator('#workout [data-bb2-set="' + key + '"]').click();
  await page.locator('.bvomModalOverlay [data-bb2-reps="' + key + '"]').fill('8');
  await page.locator('.bvomModalOverlay [data-save]').click();
  await page.locator('.bvomModalOverlay').waitFor({ state: 'detached' });
}

try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const phone = await makeDevice('phone');
  await check('the real BVOM Setup saves BB2 locally and cloud upload uses isolated Auth', async () => {
    await phone.evaluate(() => showSetup());
    await phone.locator('#setup [data-bb2-preview]').click();
    await phone.locator('#setup [data-bb2-save]').click();
    await phone.locator('#setup [data-bb2-back]').click();
    await phone.evaluate(() => showApp());
    const result = await phone.evaluate(() => window.__bb2Isolated.upload());
    assert.equal(result.status, 'committed');
    assert.equal(result.envelope.revision, 1);
    assert.equal(await phone.evaluate(() => bvomCloudPayload().bb2), undefined);
  });

  const tablet = await makeDevice('tablet');
  await check('a second real BVOM device downloads the owner setup without changing LP', async () => {
    const initialMode = await tablet.evaluate(() => state.programMode);
    const result = await tablet.evaluate(() => window.__bb2Isolated.downloadIfEmpty());
    assert.equal(result.status, 'downloaded');
    const saved = await tablet.evaluate(() => state.bb2);
    assert.equal(saved.opening, null);
    assert.equal(saved.cloudSync.baseline.revision, 1);
    assert.equal(await tablet.evaluate(() => state.programMode), initialMode);
    assert.equal(await tablet.evaluate(() => bvomCloudPayload().bb2), undefined);
  });

  await check('the real application refuses an older device after a later setup edit', async () => {
    await phone.evaluate(() => bvomBb2OpenPreview());
    await phone.locator('#setup [data-bb2-curls]').click();
    await phone.locator('#setup [data-bb2-save]').click();
    await phone.locator('#setup [data-bb2-back]').click();
    assert.equal((await phone.evaluate(() => window.__bb2Isolated.upload())).status,
      'committed');
    await tablet.evaluate(() => bvomBb2OpenPreview());
    await tablet.locator('#setup [data-bb2-role="upper_a|flat_press"]')
      .selectOption('dumbbell_flat_press');
    await tablet.locator('#setup [data-bb2-save]').click();
    await tablet.locator('#setup [data-bb2-back]').click();
    const result = await tablet.evaluate(() => window.__bb2Isolated.upload());
    assert.equal(result.status, 'conflict');
    assert.equal(await tablet.evaluate(() => state.bb2.setup.selections[
      'upper_a|flat_press']), 'dumbbell_flat_press');
    assert.equal(await tablet.evaluate(() => state.bb2.cloudSync.baseline.revision), 1);
  });

  await check('real Workout Finish uploads sets, quota and History to a fresh device', async () => {
    await phone.evaluate(() => bvomBb2OpenPreview());
    const loads = phone.locator('#setup [data-bb2-load]');
    const increments = phone.locator('#setup [data-bb2-inc]');
    assert.equal(await loads.count(), 4);
    for (let i = 0; i < 4; i++) {
      await loads.nth(i).fill('60');
      await increments.nth(i).fill('2.5');
    }
    await phone.locator('#setup [data-bb2-start]').click();
    await phone.waitForSelector('#workout [data-bb2-set="0|0"]');
    assert.equal((await phone.evaluate(() => window.__bb2Isolated.upload())).status,
      'blocked', 'unfinished workouts cannot reach cloud');
    const pairs = await phone.evaluate(() => {
      const b = state.bb2;
      const start = b.events.find(e => e.type === 'WORKOUT_STARTED' &&
        e.sessionId === b.activeSessionId);
      return start.slots.flatMap((s, i) => Array.from({ length: s.sets }, (_, j) => i + '|' + j));
    });
    for (const key of pairs.slice(0, 9)) await recordSet(phone, key);
    await phone.locator('#workout [data-bb2-finish]').click();
    const uploaded = await phone.evaluate(() => window.__bb2Isolated.upload());
    assert.equal(uploaded.status, 'committed');
    assert.equal(uploaded.envelope.revision, 3);
    const fresh = await makeDevice('fresh device');
    assert.equal((await fresh.evaluate(() => window.__bb2Isolated.downloadIfEmpty())).status,
      'downloaded');
    const data = await fresh.evaluate(() => state.bb2);
    assert.equal(data.events.filter(e => e.type === 'SET_RECORDED').length, 9);
    assert.equal(data.events.filter(e => e.type === 'WORKOUT_FINISHED').length, 1);
    assert.equal(data.events.filter(e => e.type === 'CREDIT_GRANTED').length, 1);
  });

  console.log(`BB2 real app authenticated Chromium: ${passed}/${passed} PASS`);
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
