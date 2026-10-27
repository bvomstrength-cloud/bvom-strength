'use strict';
// BB2 Stage (ii): the real BVOM chooser opens the versioned catalogue only on
// loopback with an explicit preview flag. Only an explicit setup save changes
// the existing BVOM local document, never the current cloud payload.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const H=require('./lib/bvom_harness');

const root=path.resolve(__dirname,'../..');
const h=H.boot(H.loadBuild(root));
H.configureLP(h);
const fixture=JSON.parse(h.ls.getItem('bvom_data'));
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/seed'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Test setup</title>');return}
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end();return;
 }
 res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream','Cache-Control':'no-store'});
 res.end(fs.readFileSync(file));
});

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({serviceWorkers:'block'});
  context.setDefaultTimeout(8000);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/seed');
  await page.evaluate(data=>{
   localStorage.setItem('bvom_data',JSON.stringify(data));
   localStorage.setItem('bvom_data_owner','bb2-preview-owner');
   localStorage.setItem('bvom_entitlement_cache_bb2-preview-owner',JSON.stringify({
    userId:'bb2-preview-owner',verifiedAt:new Date().toISOString(),
    record:{user_id:'bb2-preview-owner',status:'complimentary'}
   }));
  },fixture);

  await page.goto(origin+'/index.html');
  await page.waitForSelector('#app:not(.hidden)');
  await page.evaluate(()=>showSetup());
  assert.equal(await page.locator('#setup [data-bb2-preview]').count(),0,'ordinary BVOM has no BB2 development control');

  await page.goto(origin+'/index.html?bb2Preview=1');
  await page.waitForSelector('#app:not(.hidden)');
  await page.evaluate(()=>{showSetup();showSetup()});
  assert.equal(await page.locator('#setup [data-bb2-preview]').count(),1,'one BB2 button in the standard program chooser');
  assert.equal(await page.locator('#setup [data-bb-program]').count(),1,'BB1 chooser remains available');
  const savedBefore=await page.evaluate(()=>localStorage.getItem('bvom_data'));
  await page.locator('#setup [data-bb2-preview]').click();
  await page.waitForSelector('#setup [data-bb2-template]');
  assert.equal(await page.locator('#setup [data-bb2-template]').count(),4,'four BB2 training days');
  assert.equal(await page.locator('#setup [data-bb2-role]').count(),20,'optional curl omitted initially');
  assert.equal(await page.locator('#setup button:has-text("START BODYBUILDING 2")').count(),0,'no active Start button');
  assert.match(await page.locator('#setup').textContent(),/save keeps choices on this device/i);

  await page.locator('#setup [data-bb2-role="upper_a|shoulder_press"]').selectOption('log_push_press');
  assert.match(await page.locator('#setup [data-bb2-template="upper_a"]').textContent(),/2 × 4–6 reps/);
  await page.locator('#setup [data-bb2-curls]').click();
  assert.equal(await page.locator('#setup [data-bb2-role]').count(),21,'optional curls appear in Upper B');
  assert.equal(await page.evaluate(()=>localStorage.getItem('bvom_data')),savedBefore,'preview edits never persist');
  await page.locator('#setup [data-bb2-save]').click();
  assert.match(await page.locator('#setup [data-bb2-save]').textContent(),/SAVED ON THIS DEVICE/);
  const savedAfter=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
  assert.equal(savedAfter.bb2.setup.optionalUpperBCurls,true,'explicit save persists curls in normal state');
  assert.equal(savedAfter.bb2.setup.selections['upper_a|shoulder_press'],'log_push_press');
  assert.equal(savedAfter.programMode,fixture.programMode,'saving BB2 does not change the active program');
  assert.equal(savedAfter.history.length,fixture.history.length,'saving BB2 does not add a workout');
  assert.equal(await page.evaluate(()=>!!bvomCloudPayload().bb2),false,'BB2 setup is absent from cloud payload');
  await page.locator('#setup [data-bb2-back]').click();
  assert.equal(await page.locator('#setup [data-bb2-preview]').count(),1,'return to the normal chooser');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')).bb2.setup),savedAfter.bb2.setup,'closing the preview does not clear the saved setup');

  await page.locator('#setup [data-bb2-preview]').click();
  await page.waitForSelector('#setup [data-bb2-template]');
  assert.equal(await page.locator('#setup [data-bb2-curls]').isChecked(),true,'saved curls restored on reopen');
  assert.equal(await page.locator('#setup [data-bb2-role="upper_a|shoulder_press"]').inputValue(),'log_push_press');
  await page.reload();
  await page.waitForSelector('#app:not(.hidden)');
  await page.evaluate(()=>showSetup());
  await page.locator('#setup [data-bb2-preview]').click();
  await page.waitForSelector('#setup [data-bb2-template]');
  assert.equal(await page.locator('#setup [data-bb2-curls]').isChecked(),true,'saved curls survive complete reload');
  assert.equal(await page.locator('#setup [data-bb2-role="upper_a|shoulder_press"]').inputValue(),'log_push_press');
  assert.equal(await page.locator('#setup [data-bb2-day="upper_a"]').count(),1);
  const loads=page.locator('#setup [data-bb2-load]');
  const increments=page.locator('#setup [data-bb2-inc]');
  assert.equal(await loads.count(),4,'Upper A has four loaded movements');
  for(let i=0;i<4;i++){
   await loads.nth(i).fill('60');
   await increments.nth(i).fill('2.5');
  }
  await page.locator('#setup [data-bb2-start]').click();
  await page.waitForSelector('#workout [data-bb2-log="0|0"]');
  const started=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
  assert.ok(started.bb2.activeSessionId);
  assert.equal(started.bb2.events[0].type,'WORKOUT_STARTED');
  assert.equal(started.programMode,fixture.programMode);
  assert.equal(await page.evaluate(()=>bvomCloudWorkoutActive()),true);
  await page.locator('#workout [data-bb2-reps="0|0"]').fill('8');
  await page.locator('#workout [data-bb2-log="0|0"]').click();
  await page.waitForSelector('#workout .warmrow:has-text("8 reps")');
  const logged=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
  assert.equal(logged.bb2.events[1].type,'SET_RECORDED');
  assert.equal(logged.bb2.events[1].actualG,60000);
  assert.equal(await page.evaluate(()=>!!bvomCloudPayload().bb2),false);
  await page.reload();
  await page.waitForSelector('#workout .warmrow:has-text("8 reps")');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')).bb2.events.length),2);
  await page.locator('#workout [data-bb2-discard]').click();
  const discarded=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
  assert.equal(discarded.bb2.activeSessionId,null);
  assert.equal(discarded.bb2.events[0].type,'TOMBSTONE');
  assert.equal(discarded.bb2.events[1].type,'TOMBSTONE');
  assert.equal(discarded.history.length,fixture.history.length);
  await page.goto(origin+'/index.html');
  await page.waitForSelector('#app:not(.hidden)');
  await page.evaluate(()=>showSetup());
  assert.equal(await page.locator('#setup [data-bb2-preview]').count(),0,'stored preview does not expose BB2 in normal app');
  assert.deepEqual(errors,[],'no application JavaScript errors');
  console.log('PASS BB2 integrated setup preview: dev-only chooser, explicit shared save, reload, cloud exclusion, guarded Start/record/Discard');
  await context.close();
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
