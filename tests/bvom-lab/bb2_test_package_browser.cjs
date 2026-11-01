'use strict';
// Browser proof of the actual packaged candidate, including automatic test entry.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const {packageBB2Test}=require('../../scripts/package-bb2-test.cjs');
const H=require('./lib/bvom_harness');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'bb2-pack-browser-'));
async function proveV3TrainingAndRestore(page){
 // Auth identity is the disposable offline fixture; all network remains routed
 // to local package bytes. Restore itself uses the real FileReader/UI callbacks.
 await page.evaluate(()=>{
  window.__bvomAuthUserId='11111111-1111-4111-8111-111111111111';
  bvomCloud.user={id:window.__bvomAuthUserId};
  bvomEntitlementAccessDecision=()=>({allowed:true});
 });
 await page.locator('#setup [data-bb2-role="upper_a|biceps_curl"]').selectOption('barbell_curl');
 await page.locator('#setup [data-bb2-role="upper_b|biceps_curl"]').selectOption('cable_curl');
 await page.locator('#setup [data-bb2-save]').click();
 async function begin(){
  await page.locator('#setup [data-bb2-day="upper_a"]').click();
  for(const el of await page.locator('#setup [data-bb2-load]:not([disabled])').all())await el.fill('60');
  for(const el of await page.locator('#setup [data-bb2-inc]').all())await el.fill('2.5');
  const curl=page.locator('#setup [data-bb2-load="4"]');
  if(await curl.isEnabled()){
   await curl.fill('30');await page.locator('#setup [data-bb2-inc="4"]').fill('1');
  }
  await page.locator('#setup [data-bb2-start]').click();await page.waitForSelector('#workout [data-bb2-finish]');
 }
 async function record(i,j,reps){
  const key=i+'|'+j;await page.locator('#workout [data-bb2-set="'+key+'"]').click();
  await page.locator('.bvomModalOverlay [data-bb2-reps="'+key+'"]').fill(String(reps));
  await page.locator('.bvomModalOverlay [data-save]').click();await page.locator('.bvomModalOverlay').waitFor({state:'detached'});
 }
 for(let exposure=0;exposure<2;exposure++){
  await begin();
  const slots=await page.evaluate(()=>state.bb2.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===state.bb2.activeSessionId).slots);
  for(const [i,slot]of slots.entries())for(let j=0;j<slot.sets;j++)await record(i,j,slot.ceiling);
  await page.locator('#workout [data-bb2-finish]').click();
  await page.locator('#workout [data-bb2-next-workout]').click();await page.waitForSelector('#setup [data-bb2-start]');
 }
 await begin();await page.locator('.tab[data-tab="warmup"]').click();
 assert.match(await page.locator('#warmup').textContent(),/Working: 62\.5 kg/);
 assert.match(await page.locator('#warmup [data-bb2-warm-card="4"]').textContent(),/Working: 31 kg/);
 await page.locator('.tab[data-tab="workout"]').click();await record(4,0,15);
 await page.locator('#workout [data-bb2-incomplete]').click();
 await page.locator('.tab[data-tab="history"]').click();
 assert.match(await page.locator('#history').textContent(),/15 reps · 31 kg/);
 await page.locator('.tab[data-tab="settings"]').click();
 const downloadEvent=page.waitForEvent('download');await page.locator('#settings button[onclick="exportBackup()"]').click();
 const download=await downloadEvent,bytes=fs.readFileSync(await download.path()),backup=JSON.parse(bytes);
 assert.equal(backup.data.bb2.setup.catalogueVersion,3);
 const before=JSON.stringify(backup.data.bb2);
 await page.evaluate(()=>{state.weights.Squat+=1;save({durable:true,localOnly:true});renderSettings()});
 const reload=page.waitForEvent('domcontentloaded');
 await page.locator('#settings input[type="file"]').setInputFiles({name:'catalogue-v3-backup.json',mimeType:'application/json',buffer:bytes});
 await page.locator('.bvomModalOverlay [data-r]').click();await reload;await page.waitForSelector('#app:not(.hidden)');
 assert.equal(await page.evaluate(()=>JSON.stringify(state.bb2)),before,'actual file restore preserves complete v3 journal');
 await page.locator('.tab[data-tab="history"]').click();
 await page.waitForSelector('#history [data-bb2-history]');
 assert.match(await page.locator('#history').textContent(),/15 reps · 31 kg/);
 const result=await page.evaluate(async()=>{
  const core=await import('./bb2/browser-core.mjs'),b=state.bb2,p=core.foldBB2Block(b.opening,b.events);
  return {curl:p.progress['upper_a|biceps_curl|barbell_curl'],setup:b.setup,credits:p.quotas.upper_a};
 });
 assert.equal(result.curl.loadG,31000);assert.equal(result.curl.incrementG,1000);assert.equal(result.credits,2);
 assert.equal(result.setup.optionalUpperACurls,true);assert.equal(result.setup.optionalUpperBCurls,true);
 assert.equal(result.setup.selections['upper_b|biceps_curl'],'cable_curl');
 console.log('PASS packaged v3 real workout screens, earned-load Warm-up/History, independent curl selection and downloaded-file restore');
}
(async()=>{
 let browser;
 try{
  const output=path.join(temp,'site');packageBB2Test({sourceSha:'1234567890abcdef1234567890abcdef12345678',output,zipFile:path.join(temp,'test.zip')});
  const h=H.boot(H.loadBuild(root));H.configureLP(h);const fixture=JSON.parse(h.ls.getItem('bvom_data'));
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  context.setDefaultTimeout(10000);
  const allowed=new Set(['bb2-package-proof.netlify.app','app.bvomstrength.com']);
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(!allowed.has(u.hostname))return route.abort();
   if(u.pathname==='/seed')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Disposable test data</title>'});
   const file=path.resolve(output,'.'+(u.pathname==='/'?'/index.html':u.pathname));
   if(!file.startsWith(output+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:file.endsWith('.html')?'text/html':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream',body:fs.readFileSync(file)});
  });
  await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const host of allowed){
   const origin='https://'+host;await page.goto(origin+'/seed');
   await page.evaluate(data=>{
    localStorage.setItem('bvom_data',JSON.stringify(data));localStorage.setItem('bvom_data_owner','11111111-1111-4111-8111-111111111111');
    localStorage.setItem('bvom_entitlement_cache_11111111-1111-4111-8111-111111111111',JSON.stringify({userId:'11111111-1111-4111-8111-111111111111',verifiedAt:new Date().toISOString(),record:{user_id:'11111111-1111-4111-8111-111111111111',status:'complimentary'}}));
   },fixture);
   await page.goto(origin+'/index.html');await page.waitForSelector('#app:not(.hidden)');
   await page.evaluate(()=>showSetup());
   if(host==='app.bvomstrength.com'){
    assert.equal(await page.locator('#setup [data-bb2-preview]').count(),0,'even a marked package stays disabled on production host');continue;
   }
   assert.match(page.url(),/bb2Preview=1/,'package opens BB2 without a hand-edited URL');
   await page.locator('#setup [data-bb2-preview]').click();await page.waitForSelector('#setup [data-bb2-template]');
   for(const [day,count] of Object.entries({upper_a:10,lower_a:10,upper_b:13,lower_b:9}))
    assert.match(await page.locator('#setup [data-bb2-template="'+day+'"]').textContent(),new RegExp(count+' working sets'));
   for(const selector of ['[data-bb2-curls-a]','[data-bb2-curls]'])await page.locator('#setup '+selector).click();
   assert.match(await page.locator('#setup [data-bb2-template="upper_a"]').textContent(),/12 working sets/);
   assert.match(await page.locator('#setup [data-bb2-template="upper_b"]').textContent(),/15 working sets/);
   await page.locator('#setup [data-bb2-save]').click();await page.reload();await page.waitForSelector('#app:not(.hidden)');
   await page.evaluate(()=>showSetup());await page.locator('#setup [data-bb2-preview]').click();
   await page.waitForSelector('#setup [data-bb2-start]');
   assert.equal(await page.locator('#setup [data-bb2-curls-a]').isChecked(),true);
   assert.equal(await page.locator('#setup [data-bb2-curls]').isChecked(),true);
   assert.equal(await page.evaluate(()=>bvomCloudPayload().bb2),undefined,'package excludes BB2 training from legacy cloud');
   await proveV3TrainingAndRestore(page);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS actual BB2 packaged mobile browser: 42-set plan, independent curls, offline reload, cloud exclusion and production-host refusal');
 }finally{if(browser)await browser.close();fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
