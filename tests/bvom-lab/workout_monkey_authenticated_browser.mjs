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
const output=path.resolve(process.env.MONKEY_OUTPUT||'/tmp/bvom-workout-monkeys');fs.mkdirSync(output,{recursive:true});

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
const credentials = { email: 'monkey-bootstrap@example.invalid',
  password: 'Local-Only-Real-BVOM-2026!' };
const ownerId='00000000-0000-4000-8000-000000000000';

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

const {profiles,runJourney,stored}=require('./workout_monkey_journey.cjs');
const smoke=process.argv.includes('--smoke');
const summaries=[];
async function signIn(page,login){
 await page.evaluate(async({url,key,login})=>{
  const client=window.supabase.createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  bvomCloud.client=client;await bvomCloudInit();const result=await client.auth.signInWithPassword(login);if(result.error)throw result.error;
 },{url:apiUrl,key:anonKey,login});
 await page.waitForFunction(()=>bvomCloud.user?.id===window.__bvomAuthUserId&&!bvomCloud.offlineLocalAccess);
}
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 await Promise.all(profiles.map(async profile=>{
  const login={email:'journey-'+profile.name.toLowerCase()+'@example.invalid',password:'Disposable-Journey-2026!'};
  const user=await admin.auth.admin.createUser({...login,email_confirm:true});if(user.error)throw user.error;
  const userId=user.data.user.id;
  const page=await makeDevice(profile.name,{userId,login,accountFlow:true,configured:false});
  const reconnect=p=>signIn(p,login);
  async function checkpoint(p,report,label){
   const expected=await p.evaluate(()=>bvomCloudPayload());
   await p.locator('.tab[data-tab="settings"]').click();
   await p.locator('#settings button[onclick="bvomCloudSaveNow()"]').click();
   const confirm=p.locator('.bvomModalOverlay [data-r]');if(await confirm.isVisible())await confirm.click();
   let remote;
   for(let i=0;i<80;i++){
    const q=await admin.from('bvom_data').select('data').eq('user_id',userId).order('created_at',{ascending:false}).limit(1).maybeSingle();if(q.error)throw q.error;remote=q.data?.data;
    if(remote?.history?.length===expected.history.length)break;
    await new Promise(r=>setTimeout(r,100));
   }
   assert.ok(remote,'actual legacy cloud row exists');
   for(const key of ['history','weights','core','hlm','pbs','bodybuilding'])assert.deepEqual(remote[key],expected[key],'stored cloud '+key);
   const second=await makeDevice(profile.name+' receiving device '+label,{userId,login,accountFlow:true});
   await second.locator('.tab[data-tab="settings"]').click();
   await second.locator('#settings button[onclick="bvomCloudRestore()"]').click();
   const reload=second.waitForEvent('domcontentloaded');await second.locator('.bvomModalOverlay [data-r]').click();await reload;await second.waitForSelector('#app:not(.hidden)');await reconnect(second);
   const downloaded=await stored(second);for(const key of ['history','weights','core','hlm','pbs','bodybuilding'])assert.deepEqual(downloaded[key],expected[key],'second-device '+key);
   if(label==='BB2'){
    await second.waitForFunction(()=>state.bb2?.events?.filter(e=>e.type==='CREDIT_GRANTED').length===32);
    const local=(await stored(p)).bb2,actual=(await stored(second)).bb2;
    assert.deepEqual(actual.events,local.events);assert.deepEqual(actual.setup,local.setup);
    const q=await admin.from('bvom_cloud_state').select('revision,state').eq('user_id',userId).single();if(q.error)throw q.error;
    assert.deepEqual(q.data.state.snapshot.events,local.events,'real revisioned cloud journal');
    report.cloudRevision=q.data.revision;
   }
   report.checks.push(label+' stored cloud bytes, receiving device and previous programme journals match');
   await second.context().close();
  }
  const report=await runJourney({page,profile,checkpoint,reconnect,output,smoke});summaries.push(report);
 }));
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({source:process.env.MONKEY_SOURCE||'local',smoke,profiles:summaries},null,2));
 for(const r of summaries)console.log('MONKEY RESULT '+r.profile+' '+r.verdict+' '+JSON.stringify({counts:r.counts,sets:r.sets,progression:r.progression,defects:r.defects}));
 if(summaries.some(r=>r.verdict==='FAIL'))process.exitCode=1;
}finally{
 for(const context of contexts)await context.close().catch(()=>{});
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
