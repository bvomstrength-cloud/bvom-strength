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

  let beforeOffline;
  const remoteBB2=async()=>{const q=await admin.from('bvom_cloud_state').select('revision,state').eq('user_id',userId).single();if(q.error)throw q.error;return q.data};
  async function offlineBB2(phase,p,report){
   if(phase==='before'){
    await p.waitForFunction(()=>bvomBb2AccountStatus()==='current'&&!bvomBb2AccountBinding.syncing);
    beforeOffline=await remoteBB2();p.context().bb2Offline=true;return;
   }
   assert.deepEqual(await remoteBB2(),beforeOffline,'offline workout cannot have reached cloud');
   const local=(await stored(p)).bb2.events;p.context().bb2Offline=false;await p.evaluate(()=>window.dispatchEvent(new Event('online')));
   await p.waitForFunction(()=>bvomBb2AccountStatus()==='current'&&!bvomBb2AccountBinding.syncing);
   const after=await remoteBB2();assert.ok(after.revision>beforeOffline.revision);assert.deepEqual(after.state.snapshot.events,local,'reconnect uploads every actual set/note/completion exactly');
   await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.waitForTimeout(350);assert.deepEqual((await remoteBB2()).state.snapshot.events,local,'focus retry cannot duplicate offline workout');
   report.checks.push('offline actual workout, reconnect and duplicate retry verified against stored canonical data');
  }
  async function concurrentCorrections(a,b,report){
   const before=await remoteBB2(),originalEvents=(await stored(a)).bb2.events;
   for(const [device,delta]of [[a,1],[b,2]]){
    device.context().bb2Offline=true;await device.locator('.tab[data-tab="history"]').click();
    const row=device.locator('#history .histLift').filter({hasText:'EXTRA SET'}).first();const input=row.locator('[data-bb2-correct-reps]');const reps=Number(await input.inputValue());await input.fill(String(reps+delta));await row.locator('[data-bb2-correct-save]').click();
   }
   const copies=await Promise.all([a,b].map(async d=>(await stored(d)).bb2.events));
   assert.equal(copies[0].length,originalEvents.length+1);assert.equal(copies[1].length,originalEvents.length+1);assert.notDeepEqual(copies[0],copies[1]);
   for(const d of [a,b])d.context().bb2Offline=false;
   await Promise.all([a,b].map(d=>d.evaluate(()=>window.dispatchEvent(new Event('online')))));
   let latest;for(let i=0;i<100;i++){latest=await remoteBB2();if(latest.revision>before.revision)break;await new Promise(r=>setTimeout(r,100))}
   assert.equal(latest.revision,before.revision+1,'only one concurrent correction commits');
   assert.ok(copies.some(events=>{try{assert.deepEqual(events,latest.state.snapshot.events);return true}catch{return false}}),'no journal combination');
   let loser;for(let i=0;i<100;i++){for(const d of [a,b])if(await d.evaluate(()=>bvomBb2AccountStatus()==='conflict'))loser=d;if(loser)break;await new Promise(r=>setTimeout(r,100))}
   assert.ok(loser,'stale losing device visibly pauses');const preserved=(await stored(loser)).bb2.events;
   const notice=loser.locator('#bvomCloudConflictOverlay [data-settings]');if(await notice.isVisible())await notice.click();else await loser.locator('.tab[data-tab="settings"]').click();
   await loser.locator('#settings button[onclick="bvomCloudRestore()"]').click();await loser.locator('.bvomModalOverlay [data-r]').click();
   await loser.waitForFunction(()=>bvomBb2AccountStatus()==='current'&&!bvomBb2AccountBinding.syncing);
   assert.deepEqual(await loser.evaluate(()=>JSON.parse(localStorage.getItem('bvom_pre_cloud_restore')).bb2.events),preserved,'losing journal retained in recovery copy');
   assert.deepEqual((await stored(loser)).bb2.events,latest.state.snapshot.events,'confirmed recovery adopts the exact winning journal');
   assert.deepEqual(await remoteBB2(),latest,'recovery cannot rewrite the winning cloud record');
   await a.evaluate(()=>window.dispatchEvent(new Event('focus')));await a.waitForFunction(()=>bvomBb2AccountStatus()==='current'&&!bvomBb2AccountBinding.syncing);
   report.checks.push('simultaneous real History corrections: one CAS winner, stale-device pause, both journals retained, explicit recovery and no merged/duplicate workouts');
   const legacyBefore=await admin.from('bvom_data').select('data').eq('user_id',userId).order('created_at',{ascending:false}).limit(1).single();if(legacyBefore.error)throw legacyBefore.error;
   const old=await makeDevice(profile.name+' obsolete backup device',{userId,login,accountFlow:true});await old.waitForTimeout(100);
   const oldNotice=old.locator('#bvomCloudConflictOverlay [data-settings]');if(await oldNotice.isVisible())await oldNotice.click();else await old.locator('.tab[data-tab="settings"]').click();
   const bytes=fs.readFileSync(path.join(output,profile.name.toLowerCase()+'-LP-backup.json'));
   await old.locator('#settings input[type="file"]').setInputFiles({name:'old-LP-backup.json',mimeType:'application/json',buffer:bytes});
   const reload=old.waitForEvent('domcontentloaded');await old.locator('.bvomModalOverlay [data-r]').click();await reload;await old.waitForSelector('#app:not(.hidden)');await reconnect(old);await old.waitForTimeout(1600);
   assert.deepEqual(await remoteBB2(),latest,'pre-BB2 backup cannot overwrite the newer revisioned journal');
   const legacyAfter=await admin.from('bvom_data').select('data').eq('user_id',userId).order('created_at',{ascending:false}).limit(1).single();if(legacyAfter.error)throw legacyAfter.error;
   assert.deepEqual(legacyAfter.data,legacyBefore.data,'old LP backup cannot silently overwrite newer programme History');
   report.checks.push('restoring the actual older LP export cannot overwrite newer cloud History or the BB2 journal');await old.context().close();

  }

  async function checkpoint(p,report,label){
   const expected=await p.evaluate(()=>bvomCloudPayload());
   let remote;
   for(let i=0;i<150;i++){
    const q=await admin.from('bvom_data').select('data').eq('user_id',userId).order('created_at',{ascending:false}).limit(1).maybeSingle();if(q.error)throw q.error;remote=q.data?.data;
    let same=!!remote;try{for(const key of ['history','weights','core','hlm','pbs','bodybuilding'])assert.deepEqual(remote?.[key],expected[key])}catch{same=false}if(same)break;
    await new Promise(r=>setTimeout(r,100));
   }
   assert.ok(remote,'actual legacy cloud row exists');
   for(const key of ['history','weights','core','hlm','pbs','bodybuilding'])assert.deepEqual(remote[key],expected[key],'stored cloud '+key);
   const second=await makeDevice(profile.name+' receiving device '+label,{userId,login,accountFlow:true});
   await second.waitForTimeout(100);const notice=second.locator('#bvomCloudConflictOverlay [data-settings]');if(await notice.isVisible())await notice.click();else await second.locator('.tab[data-tab="settings"]').click();
   await second.locator('#settings button[onclick="bvomCloudRestore()"]').click();
   const reload=second.waitForEvent('domcontentloaded');await second.locator('.bvomModalOverlay [data-r]').click();await reload;await second.waitForSelector('#app:not(.hidden)');await reconnect(second);
   const downloaded=await stored(second);for(const key of ['history','weights','core','hlm','pbs','bodybuilding'])assert.deepEqual(downloaded[key],expected[key],'second-device '+key);
   if(label.startsWith('BB2')){
    const credits=label==='BB2'?32:16;
    await second.waitForFunction(credits=>state.bb2?.events?.filter(e=>e.type==='CREDIT_GRANTED').length===credits,credits);
    const local=(await stored(p)).bb2,actual=(await stored(second)).bb2;
    assert.deepEqual(actual.events,local.events);assert.deepEqual(actual.setup,local.setup);
    const q=await admin.from('bvom_cloud_state').select('revision,state').eq('user_id',userId).single();if(q.error)throw q.error;
    assert.deepEqual(q.data.state.snapshot.events,local.events,'real revisioned cloud journal');
    report.cloudRevision=q.data.revision;
   }
   report.checks.push(label+' automatic upload, stored cloud bytes, receiving device and previous programme journals match');
   if(label==='BB2-mid')await concurrentCorrections(p,second,report);
   await second.context().close();
  }
  const report=await runJourney({page,profile,checkpoint,reconnect,offlineBB2,output,smoke});summaries.push(report);
 }));
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({source:process.env.MONKEY_SOURCE||'local',smoke,profiles:summaries},null,2));
 for(const r of summaries)console.log('MONKEY RESULT '+r.profile+' '+r.verdict+' '+JSON.stringify({counts:r.counts,sets:r.sets,progression:r.progression,defects:r.defects}));
 if(summaries.some(r=>r.verdict==='FAIL'))process.exitCode=1;
}finally{
 for(const context of contexts)await context.close().catch(()=>{});
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
