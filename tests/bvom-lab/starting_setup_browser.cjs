'use strict';
// Real DOM, callbacks, Web Locks and localStorage. The terminal fixture is generated
// through 12 authentic VM workouts; account/access and all external services are offline.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),H=require('./lib/bvom_harness');
const root=path.resolve(__dirname,'../..'),build=H.loadBuild(root);
const {journey}=require('./starting_setup_contracts')({test(){},ok(){},H,build});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/seed'){res.end('<!doctype html><title>Offline fixture seed</title>');return}
 const file=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
});
const raw=p=>p.evaluate(()=>localStorage.getItem('bvom_data'));
const stored=async p=>JSON.parse(await raw(p));
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let browser;try{
  browser=await chromium.launch({headless:true,...(process.env.BVOM_CHROMIUM_PATH?{executablePath:process.env.BVOM_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  for(const mode of ['hlm','fourday']){
   const h=journey(mode),fixture=JSON.parse(h.ls.getItem('bvom_data')),originalSession=fixture.session;
   const context=await browser.newContext({serviceWorkers:'block'});context.setDefaultTimeout(7000);
   try{
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await context.route('**/vendor/supabase-js-2.117.3.js',route=>route.fulfill({body:'/* offline boundary: no client */',contentType:'application/javascript'}));
    await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
    const page=await context.newPage();await page.goto(origin+'/seed');
    await page.evaluate(d=>{
     localStorage.setItem('bvom_data',JSON.stringify(d));localStorage.setItem('bvom_data_owner','setup-dummy');localStorage.setItem('bvom_workout_tab_owner','closed-fixture-document');
     localStorage.setItem('bvom_entitlement_cache_setup-dummy',JSON.stringify({userId:'setup-dummy',verifiedAt:new Date().toISOString(),record:{user_id:'setup-dummy',status:'complimentary'}}));
    },fixture);
    await page.goto(origin+'/index.html');await page.waitForSelector('#app:not(.hidden)');
    const terminal=()=>page.locator('.bvomModalOverlay').filter({hasText:'HLM strength block complete'});
    const before=await raw(page);await terminal().locator('[data-r]').click();
    let confirm=page.locator('.bvomModalOverlay').last();await confirm.locator('[data-l]').click();assert.equal(await raw(page),before);assert.equal(await terminal().count(),1);
    await terminal().locator('[data-r]').click();confirm=page.locator('.bvomModalOverlay').last();await confirm.locator('[data-r]').click();
    assert.ok((await stored(page)).setupAfterFinish);assert.equal(await page.locator('.bvomModalOverlay').count(),0);
    await page.reload();await page.waitForSelector('#app:not(.hidden)');assert.ok((await stored(page)).setupAfterFinish);assert.equal(await page.locator('.bvomModalOverlay').count(),0);
    const secondary=await context.newPage();await secondary.goto(origin+'/index.html');await secondary.waitForTimeout(100);const owned=await raw(page);await secondary.evaluate(()=>finishWorkout());assert.equal(await raw(page),owned);await secondary.close();
    await page.locator('#timerbar .finish').click();let note=page.locator('.bvomModalOverlay').last();await note.locator('[data-save]').click();
    const saved=await stored(page);assert.equal(saved.history.length,12);assert.deepEqual(saved.history.at(-1).session,originalSession);assert.equal(saved.workoutStartedAt,null);assert.equal(saved.day,mode==='fourday'?'2':'H');
    assert.equal(await page.locator('.bvomModalOverlay').count(),1,'only saved acknowledgement before setup offer');await page.locator('.bvomModalOverlay [data-ok]').click();
    let offer=page.locator('.bvomModalOverlay').last();await offer.locator('[data-l]').click();assert.ok((await stored(page)).setupAfterFinish);
    await page.locator('#workout [data-resume]').click();offer=page.locator('.bvomModalOverlay').last();await offer.locator('[data-r]').click();await page.waitForSelector('#setup:not(.hidden)');
    const draftRaw=await raw(page);await page.locator('[data-setup-weight="Squat"]').fill('-1');await page.locator('#setup button[onclick="bvomDeferredDraftCancel()"]').click();assert.equal(await raw(page),draftRaw);
    await page.locator('#workout [data-resume]').click();await page.locator('.bvomModalOverlay [data-r]').click();await page.locator('[data-setup-weight="Squat"]').fill('60');
    await page.reload();await page.waitForSelector('#app:not(.hidden)');assert.equal(await raw(page),draftRaw,'reload discards draft input');
    await page.locator('.bvomModalOverlay [data-r]').click();await page.locator('[data-setup-weight="Squat"]').fill('60');await page.locator('[data-setup-weight="Bench Press"]').fill('40');
    // Entitlement service is an offline fixture; exercise the real awaited commit.
    await page.evaluate(()=>{bvomEntitlementStartTrial=async()=>true});
    await page.locator('#setup button[onclick="bvomCommitDeferredDraft()"]').click();await page.waitForSelector('#app:not(.hidden)');
    const committed=await stored(page);assert.equal(committed.history.length,12);assert.equal(committed.weights.Squat,60);assert.equal(committed.setupAfterFinish,undefined);assert.equal(committed.hlm.pendingRepChoice,undefined);assert.deepEqual(committed.hlm.rep,{Squat:5,'Bench Press':5});
    await page.evaluate(()=>finishWorkout());assert.equal((await stored(page)).history.length,12);
    console.log('PASS '+mode+': genuine terminal → cancel → durable request/reload → secondary blocked → Finish/ack → offer cancel → draft cancel/reload → one new-block commit');
   }finally{await context.close()}
  }
  console.log('PASS: isolated native Chromium interactions; no live services or production/device claim.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
