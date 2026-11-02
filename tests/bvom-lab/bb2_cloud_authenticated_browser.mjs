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
import { createBB2CloudSidecar } from '../../bb2/cloud-sidecar.mjs';
import { createBB2Setup } from '../../bb2/browser-core.mjs';

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
async function makeDevice(label, { userId = ownerId, login = credentials,
  accountFlow = false, configured = true } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block',
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true });
  contexts.push(context);
  context.setDefaultTimeout(15000);
  await context.route('**/*', route => {
    const target = new URL(route.request().url()).origin;
    if(context.bb2Offline&&target===apiUrl.replace(/\/$/, ''))return route.abort();
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
  }, { data: { ...fixture, configured }, id: userId });
  await page.goto(origin + '/index.html?bb2Preview=1');
  await page.waitForSelector(configured?'#app:not(.hidden)':'#setup:not(.hidden)');
  await page.waitForFunction(() => bvomWindowLockOwned === true);
  if (accountFlow) {
    // Only the Supabase client is supplied by the isolated test. Let BVOM's
    // real Auth state listener, entitlement check, account opening and BB2
    // coordinator binding derive identity from the signed-in session.
    await page.evaluate(async ({ url, key, email, password }) => {
      const client = window.supabase.createClient(url, key, { auth: {
        persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      bvomCloud.client = client;
      await bvomCloudInit();
      const signed = await client.auth.signInWithPassword({ email, password });
      if (signed.error) throw signed.error;
    }, { url: apiUrl, key: anonKey, ...login });
    try {
      await page.waitForFunction(id => bvomBb2AccountBinding?.ownerId === id &&
        bvomCloud.user?.id === id && window.__bvomAuthUserId === id &&
        bvomCloud.offlineLocalAccess === false, userId);
    } catch (error) {
      const state = await page.evaluate(() => ({
        accountMatchesLocal: bvomCloud.user?.id === bvomLocalOwnerId(),
        authMatchesLocal: window.__bvomAuthUserId === bvomLocalOwnerId(),
        offline: bvomCloud.offlineLocalAccess, startup: bvomCloud.startupState,
        entitlement: bvomEntitlement.record?.status,
        accountSwitchDeferred: bvomCloud.accountSwitchDeferred,
        appVisible: !document.querySelector('#app').classList.contains('hidden'),
        bound: !!bvomBb2AccountBinding
      }));
      console.error('Isolated BVOM account binding diagnostic:', state);
      throw error;
    }
    return page;
  }
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
  }, { url: apiUrl, key: anonKey, ...login });
  assert.equal(attached.owner, userId, label + ' local Supabase Auth account');
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

  // A separate owner signs in through BVOM's real Auth listener and verified
  // entitlement path. No test directly assigns bvomCloud.user or its owner ID.
  const accountCredentials = { email: 'bb2-account-flow@example.invalid',
    password: 'Local-Only-Account-Flow-2026!' };
  const accountUser = await admin.auth.admin.createUser({ ...accountCredentials,
    email_confirm: true });
  if (accountUser.error) throw accountUser.error;
  const accountId = accountUser.data.user.id;
  const accountPhone = await makeDevice('signed-in phone', {
    userId: accountId, login: accountCredentials, accountFlow: true });
  await check('BVOM actual sign-in binds the right authenticated account without a writer in production', async () => {
    const binding = await accountPhone.evaluate(() => ({
      ownerId: bvomBb2AccountBinding?.ownerId,
      verifiedId: bvomCloud.user?.id,
      authId: window.__bvomAuthUserId,
      isolated: bvomBb2AccountBinding?.isolated,
      writerEnabled: bvomBb2DormantAccountSnapshot().bb2WriterEnabled === true
    }));
    assert.equal(binding.ownerId, accountId);
    assert.equal(binding.verifiedId, accountId);
    assert.equal(binding.authId, accountId);
    assert.equal(binding.isolated, true);
    assert.equal(binding.writerEnabled, true);
  });

  await check('a BVOM Setup save automatically uploads only through the isolated account binding', async () => {
    await accountPhone.evaluate(() => showSetup());
    await accountPhone.locator('#setup [data-bb2-preview]').click();
    await accountPhone.locator('#setup [data-bb2-save]').click();
    await accountPhone.locator('#setup [data-bb2-back]').click();
    await accountPhone.waitForFunction(() =>
      bvomBb2AccountBinding?.lastUpload?.status === 'committed');
    assert.equal(await accountPhone.evaluate(() =>
      bvomBb2AccountBinding.lastUpload.envelope.revision), 1);
    assert.equal(await accountPhone.evaluate(() => bvomCloudPayload().bb2), undefined);
  });

  const accountTablet = await makeDevice('signed-in tablet', {
    userId: accountId, login: accountCredentials, accountFlow: true });
  await check('BVOM actual sign-in automatically retrieves BB2 on an existing second device', async () => {
    await accountTablet.waitForFunction(() =>
      bvomBb2AccountBinding?.lastDownload?.status === 'downloaded');
    assert.equal(await accountTablet.evaluate(() => state.bb2.cloudSync.baseline.revision), 1);
    assert.equal(await accountTablet.evaluate(() => state.programMode), fixture.programMode);
  });

  // A truly first-run account has BB2 sidecar history but no different legacy
  // BVOM document on the account. An unconfigured *existing* LP device is a
  // separate legacy-data conflict and must not be silently bypassed.
  const firstRunCredentials = { email: 'bb2-first-run@example.invalid',
    password: 'Local-Only-First-Run-2026!' };
  const firstRunUser = await admin.auth.admin.createUser({ ...firstRunCredentials,
    email_confirm: true });
  if (firstRunUser.error) throw firstRunUser.error;
  const firstRunId = firstRunUser.data.user.id;
  const firstRunClient = createClient(apiUrl, anonKey,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const firstRunAuth = await firstRunClient.auth.signInWithPassword(firstRunCredentials);
  if (firstRunAuth.error) throw firstRunAuth.error;
  const sidecar = createBB2CloudSidecar({ ownerId: firstRunId,
    bb2: { setup: createBB2Setup({catalogueVersion:1}), opening: null, events: [], sealedBlocks: [] },
    previousRevision: null, requestId: 'first-run-seeded-owner-record' });
  const seeded = await firstRunClient.from('bvom_cloud_state').insert({
    user_id: firstRunId, revision: 1, data_version: sidecar.protocol,
    state: sidecar }).select().maybeSingle();
  if (seeded.error) throw seeded.error;
  const firstRunDevice = await makeDevice('unconfigured first-run phone', {
    userId: firstRunId, login: firstRunCredentials, accountFlow: true,
    configured: false });
  await check('unconfigured first-run Setup retrieves owner BB2 without opening the workout screen', async () => {
    try {
      await firstRunDevice.waitForFunction(() =>
        bvomBb2AccountBinding?.lastDownload?.status === 'downloaded');
    } catch (error) {
      const diagnostic = await firstRunDevice.evaluate(() => ({
        status: bvomBb2AccountBinding?.lastDownload?.status,
        localBB2: !!state.bb2, legacyConflict: bvomCloud.conflict,
        snapshot: bvomBb2DormantAccountSnapshot(),
        appHidden: document.querySelector('#app').classList.contains('hidden')
      }));
      console.error('First-run BB2 account diagnostic:', diagnostic);
      throw error;
    }
    assert.equal(await firstRunDevice.evaluate(() => state.bb2.cloudSync.baseline.revision), 1);
    assert.equal(await firstRunDevice.locator('#app').evaluate(el => el.classList.contains('hidden')),
      true,'downloading BB2 must not bypass normal BVOM first-run Setup');
  });

  await check('a finished BVOM workout uploads automatically and sign-out revokes the account binding', async () => {
    await accountPhone.evaluate(() => bvomBb2OpenPreview());
    const loads = accountPhone.locator('#setup [data-bb2-load]');
    const increments = accountPhone.locator('#setup [data-bb2-inc]');
    for (let i = 0; i < 4; i++) {
      await loads.nth(i).fill('60');
      await increments.nth(i).fill('2.5');
    }
    await accountPhone.locator('#setup [data-bb2-start]').click();
    const pairs = await accountPhone.evaluate(() => {
      const b = state.bb2;
      const start = b.events.find(e => e.type === 'WORKOUT_STARTED' &&
        e.sessionId === b.activeSessionId);
      return start.slots.flatMap((s, i) =>
        Array.from({ length: s.sets }, (_, j) => i + '|' + j));
    });
    for (const key of pairs.slice(0, 9)) await recordSet(accountPhone, key);
    await accountPhone.locator('#workout [data-bb2-finish]').click();
    await accountPhone.waitForFunction(() =>
      bvomBb2AccountBinding?.lastUpload?.envelope?.revision === 2);
    await accountTablet.evaluate(() => bvomBb2AccountSyncNow());
    assert.equal(await accountTablet.evaluate(() => state.bb2.cloudSync.baseline.revision), 2,
      'the already-populated tablet fast-forwards instead of becoming stuck');
    assert.equal(await accountTablet.evaluate(() =>
      state.bb2.events.filter(e => e.type === 'CREDIT_GRANTED').length), 1);
    await accountTablet.evaluate(() => bvomBb2OpenPreview());
    await accountTablet.locator('#setup [data-bb2-curls]').click();
    await accountTablet.locator('#setup [data-bb2-save]').click();
    await accountTablet.locator('#setup [data-bb2-back]').click();
    await accountTablet.waitForFunction(() =>
      bvomBb2AccountBinding?.lastUpload?.envelope?.revision === 3);
    await accountPhone.evaluate(() => bvomBb2AccountSyncNow());
    assert.equal(await accountPhone.evaluate(() => state.bb2.cloudSync.baseline.revision), 3,
      'phone accepts tablet updates without losing its finished workout');
    await accountTablet.evaluate(() => bvomCloudSignOut());
    assert.equal(await accountTablet.evaluate(() => bvomBb2AccountBinding), null);
    const third = await makeDevice('signed-in fresh device', {
      userId: accountId, login: accountCredentials, accountFlow: true });
    await third.waitForFunction(() =>
      bvomBb2AccountBinding?.lastDownload?.revision === 3);
    const history = await third.evaluate(() => state.bb2.events);
    assert.equal(history.filter(e => e.type === 'SET_RECORDED').length, 9);
    assert.equal(history.filter(e => e.type === 'CREDIT_GRANTED').length, 1);
  });

  const peer = await makeDevice('reconnect peer', {
    userId: accountId, login: accountCredentials, accountFlow: true });
  await peer.waitForFunction(() => state.bb2?.cloudSync?.baseline?.revision === 3);
  const oldBackup = await accountPhone.evaluate(() => ({app:'BVOM',version:BVOM_BUILD,
    exportedAt:new Date().toISOString(),data:JSON.parse(localStorage.getItem('bvom_data'))}));
  await check('offline real workout preserves local sets and reconnect uploads exactly once', async () => {
    accountPhone.context().bb2Offline = true;
    await accountPhone.evaluate(() => bvomBb2OpenPreview());
    await accountPhone.locator('#setup [data-bb2-day="lower_b"]').click();
    for(const field of await accountPhone.locator('#setup [data-bb2-load]:not([disabled])').all())await field.fill('60');
    for(const field of await accountPhone.locator('#setup [data-bb2-inc]').all())await field.fill('2.5');
    await accountPhone.locator('#setup [data-bb2-start]').click();
    await accountPhone.waitForSelector('#workout [data-bb2-set="0|0"]');
    await accountPhone.locator('#workout [data-bb2-edit-save="0"]').click();
    await accountPhone.locator('.bvomModalOverlay [data-bb-weight]').fill('65');
    await accountPhone.locator('.bvomModalOverlay [data-bb-increment]').fill('1');
    await accountPhone.locator('.bvomModalOverlay [data-save]').click();
    const slots=await accountPhone.evaluate(()=>state.bb2.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===state.bb2.activeSessionId).slots);
    for(const [i,slot]of slots.entries())for(let j=0;j<slot.sets;j++){
      const key=i+'|'+j;
      await accountPhone.locator('#workout [data-bb2-set="'+key+'"]').click();
      await accountPhone.locator('.bvomModalOverlay [data-bb2-reps="'+key+'"]').fill(String(slot.ceiling));
      await accountPhone.locator('.bvomModalOverlay [data-save]').click();
      await accountPhone.locator('.bvomModalOverlay').waitFor({state:'detached'});
    }
    await accountPhone.locator('#workout [data-bb2-finish]').click();
    await accountPhone.waitForFunction(()=>bvomBb2AccountStatus()==='unavailable');
    const durable=await accountPhone.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')).bb2);
    assert.equal(durable.events.filter(e=>e.type==='WORKOUT_FINISHED').length,2);
    assert.equal(durable.cloudSync.baseline.revision,3);
    accountPhone.context().bb2Offline = false;
    await accountPhone.evaluate(()=>window.dispatchEvent(new Event('online')));
    await accountPhone.waitForFunction(()=>state.bb2.cloudSync.baseline.revision===4);
    await accountPhone.evaluate(()=>bvomBb2AccountSyncNow());
    assert.equal(await accountPhone.evaluate(()=>state.bb2.cloudSync.baseline.revision),4);
    await peer.evaluate(()=>bvomBb2AccountSyncNow());
    assert.equal(await peer.evaluate(()=>state.bb2.events.filter(e=>e.type==='WORKOUT_FINISHED').length),2);
    assert.equal(await peer.evaluate(()=>state.bb2.events.filter(e=>e.type==='CREDIT_GRANTED').length),2);
    const weight=await peer.evaluate(async()=>{const core=await import('./bb2/browser-core.mjs');return core.foldBB2Block(state.bb2.opening,state.bb2.events).progress['lower_b|quad|front_squat']});
    assert.equal(weight.loadG,65000);assert.equal(weight.incrementG,1000);
  });
  await check('concurrent authenticated app edits preserve both journals and pause the loser', async () => {
    for(const [page,exercise]of [[accountPhone,'dumbbell_flat_press'],[peer,'machine_chest_press']]){
      page.context().bb2Offline=true;
      await page.evaluate(()=>bvomBb2OpenPreview());
      await page.locator('#setup [data-bb2-role="upper_a|flat_press"]').selectOption(exercise);
      await page.locator('#setup [data-bb2-save]').click();
      await page.locator('#setup [data-bb2-back]').click();
      await page.waitForFunction(()=>bvomBb2AccountStatus()==='unavailable');
    }
    accountPhone.context().bb2Offline=false;peer.context().bb2Offline=false;
    await Promise.all([accountPhone.evaluate(()=>bvomBb2AccountSyncNow()),peer.evaluate(()=>bvomBb2AccountSyncNow())]);
    const statuses=await Promise.all([accountPhone,peer].map(p=>p.evaluate(()=>bvomBb2AccountStatus())));
    assert.deepEqual(statuses.sort(),['conflict','current']);
    for(const [page,exercise]of [[accountPhone,'dumbbell_flat_press'],[peer,'machine_chest_press']]){
      assert.equal(await page.evaluate(()=>state.bb2.setup.selections['upper_a|flat_press']),exercise);
      assert.equal(await page.evaluate(()=>state.bb2.events.filter(e=>e.type==='WORKOUT_FINISHED').length),2);
    }
  });
  await check('restoring an older real backup cannot overwrite the newer cloud journal', async () => {
    const restoreDevice=await makeDevice('older-backup device',{
      userId:accountId,login:accountCredentials,accountFlow:true});
    await restoreDevice.waitForFunction(()=>state.bb2?.cloudSync?.baseline?.revision===5);
    await restoreDevice.evaluate(()=>activateTab('settings'));
    await restoreDevice.locator('#settings input[type="file"]').setInputFiles({
      name:'older-bb2-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oldBackup))});
    const reload=restoreDevice.waitForEvent('domcontentloaded');
    await restoreDevice.locator('.bvomModalOverlay [data-r]').click();await reload;
    await restoreDevice.waitForSelector('#app:not(.hidden)');
    assert.equal(await restoreDevice.evaluate(()=>state.bb2.cloudSync.baseline.revision),3);
    await restoreDevice.evaluate(async({url,key,login})=>{
      const client=window.supabase.createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      bvomCloud.client=client;await bvomCloudInit();
      const result=await client.auth.signInWithPassword(login);if(result.error)throw result.error;
    },{url:apiUrl,key:anonKey,login:accountCredentials});
    await restoreDevice.waitForFunction(()=>bvomBb2AccountStatus()==='conflict');
    const remote=await admin.from('bvom_cloud_state').select('revision,state').eq('user_id',accountId).single();
    if(remote.error)throw remote.error;
    assert.equal(remote.data.revision,5);
    assert.equal(remote.data.state.snapshot.events.filter(e=>e.type==='WORKOUT_FINISHED').length,2);
    assert.ok(await restoreDevice.evaluate(()=>localStorage.getItem('bvom_pre_restore')),'pre-restore recovery copy retained');
  });

  console.log(`BB2 real app authenticated Chromium: ${passed}/${passed} PASS`);
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
