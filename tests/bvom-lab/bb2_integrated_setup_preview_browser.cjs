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
  await page.evaluate(()=>activateTab('warmup'));
  await page.waitForSelector('#warmup [data-bb2-warm-tick="0|0"]');
  assert.equal(await page.locator('#warmup [data-bb2-warm-card]').count(),5);
  assert.match(await page.locator('#warmup').textContent(),/Preparation only/);
  const beforeWarm=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')).bb2.events.length);
  await page.locator('#warmup [data-bb2-warm-tick="0|0"]').click();
  assert.equal(await page.locator('#warmup [data-bb2-warm-tick="0|0"].done').count(),1,
   'preparation tick is visible and saved');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')).bb2.events.length),
   beforeWarm,'warm-up cannot create BB2 working-set events');
  await page.reload();
  await page.waitForSelector('#app:not(.hidden)');
  await page.evaluate(()=>activateTab('warmup'));
  await page.waitForSelector('#warmup [data-bb2-warm-tick="0|0"].done',
   {state:'visible'});
  assert.equal(await page.evaluate(()=>!!bvomCloudPayload().bb2),false);
  await page.evaluate(()=>activateTab('workout'));
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
  // This is the first eligible exposure. A between-set trial must remain
  // session-scoped, survive reload and preserve the earlier 60 kg actual.
  await page.waitForSelector('#workout [data-bb2-trial-save="0"]');
  await page.locator('#workout [data-bb2-trial="0"]').fill('67.5');
  await page.locator('#workout [data-bb2-trial-save="0"]').click();
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   return b.events.at(-1).type==='CALIBRATION_PLAN_REVISED'&&b.events.at(-1).plannedG===67500;
  }),true,'first-exposure calibration trial is a session-only ledger event');
  await page.reload();
  await page.waitForSelector('#workout [data-bb2-trial="0"]');
  assert.equal(await page.locator('#workout [data-bb2-trial="0"]').inputValue(),'67.5');
  await page.locator('#workout [data-bb2-reps="0|1"]').fill('8');
  await page.locator('#workout [data-bb2-log="0|1"]').click();
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   const rows=b.events.filter(e=>e.type==='SET_RECORDED');
   return rows[0].actualG===60000&&rows[1].actualG===67500;
  }),true,'reload and trial change only subsequent actual sets');
  const bodyweightIndex=await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   return b.events.find(e=>e.type==='WORKOUT_STARTED').slots.findIndex(x=>x.equipment==='bodyweight');
  });
  assert.ok(bodyweightIndex>=0,'real Upper A has a bodyweight slot');
  const bwKey=bodyweightIndex+'|0';
  await page.locator('#workout [data-bb2-plan-variation="'+bodyweightIndex+'"]').fill('assisted pullup');
  await page.locator('#workout [data-bb2-plan-assist="'+bodyweightIndex+'"]').fill('light band');
  await page.locator('#workout [data-bb2-plan-added="'+bodyweightIndex+'"]').fill('2.5');
  await page.locator('#workout [data-bb2-plan-save="'+bodyweightIndex+'"]').click();
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   return b.events.at(-2).type==='VARIATION_EDITED'&&b.events.at(-1).type==='PRESCRIPTION_EDITED'&&
    b.events.at(-1).loadG===2500;
  }),true,'one pre-lock save persists bodyweight variation and external weight');
  assert.equal(await page.locator('#workout [data-bb2-bw-variation="'+bwKey+'"]').inputValue(),'assisted pullup');
  assert.equal(await page.locator('#workout [data-bb2-bw-assist="'+bwKey+'"]').inputValue(),'light band');
  await page.locator('#workout [data-bb2-reps="'+bwKey+'"]').fill('8');
  await page.locator('#workout [data-bb2-log="'+bwKey+'"]').click();
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   const e=b.events.at(-1);
   return e.type==='SET_RECORDED'&&e.variation==='assisted pullup'&&
    e.assistance==='light band'&&e.actualG===2500&&e.actualOrigin.unit==='kg';
  }),true,'real BVOM saves explicit bodyweight variation, assistance and added mass');
  await page.locator('#workout [data-bb2-discard]').click();
  const discarded=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
  assert.equal(discarded.bb2.activeSessionId,null);
  assert.equal(discarded.bb2.events[0].type,'TOMBSTONE');
  assert.equal(discarded.bb2.events[1].type,'TOMBSTONE');
  assert.equal(discarded.bb2.events[2].type,'TOMBSTONE','Discard removes session-only calibration trial');
  assert.equal(discarded.bb2.events[4].type,'VARIATION_EDITED','Discard retains explicit future bodyweight identity');
  assert.equal(discarded.bb2.events[5].type,'PRESCRIPTION_EDITED','Discard retains explicit future BW+load');
  assert.equal(discarded.bb2.events[6].type,'TOMBSTONE','Discard removes bodyweight actual while keeping legacy History');
  assert.equal(discarded.history.length,fixture.history.length);
  // The same shared Workout/History surfaces now exercise the true Finish gate.
  await page.evaluate(()=>showSetup());
  await page.locator('#setup [data-bb2-preview]').click();
  await page.waitForSelector('#setup [data-bb2-start]');
  const nextLoads=page.locator('#setup [data-bb2-load]');
  const nextIncrements=page.locator('#setup [data-bb2-inc]');
  for(let i=0;i<4;i++){await nextLoads.nth(i).fill('60');await nextIncrements.nth(i).fill('2.5')}
  await page.locator('#setup [data-bb2-start]').click();
  await page.waitForSelector('#workout [data-bb2-finish]');
  assert.equal(await page.locator('#workout [data-bb2-finish]').isDisabled(),true,'Finish disabled under 70%');
  // Specialist overrides (e.g. log push press) alter set counts and order.
  // Choose the first nine genuine prescribed indices from the immutable Start.
  const prescribedPairs=await page.evaluate(()=>{
   const d=JSON.parse(localStorage.getItem('bvom_data'));
   const start=d.bb2.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===d.bb2.activeSessionId);
   return start.slots.flatMap((slot,i)=>Array.from({length:slot.sets},(_,j)=>[i,j]));
  });
  assert.equal(prescribedPairs.length,12,'upper A has twelve prescribed sets');
  for(const [i,j] of prescribedPairs.slice(0,9)){
   const k=i+'|'+j;
   await page.locator('#workout [data-bb2-reps="'+k+'"]').fill('8');
   await page.locator('#workout [data-bb2-log="'+k+'"]').click();
  }
  await page.waitForSelector('#workout [data-bb2-finish]:not([disabled])');
  await page.locator('#workout [data-bb2-finish]').click();
  await page.waitForSelector('#history [data-bb2-history]',{state:'attached'});
  const finished=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
  assert.equal(finished.bb2.activeSessionId,null);
  assert.equal(finished.bb2.events.filter(e=>e.type==='WORKOUT_FINISHED').length,1);
  assert.equal(finished.bb2.events.filter(e=>e.type==='CREDIT_GRANTED').length,1,'single credit on real Finish');
  assert.equal(finished.history.length,fixture.history.length,'legacy History unchanged after BB2 Finish');
  assert.equal(await page.evaluate(()=>bvomBb2End('FINISH')),false,'repeat Finish is idempotent');
  assert.match(await page.locator('#history').textContent(),/Credit awarded/);
  await page.evaluate(()=>activateTab('history'));
  const correction=page.locator('#history [data-bb2-correct-reps="0|0"]');
  await correction.fill('7');
  await page.locator('#history [data-bb2-correct-hard="0|0"]').check();
  await page.locator('#history [data-bb2-correct-save="0|0"]').click();
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   const e=b.events.at(-1);
   return e.type==='SET_CORRECTED'&&e.reps===7&&e.harderThanIntended&&
    b.events.filter(x=>x.type==='CREDIT_GRANTED').length===1;
  }),true,'real History correction is one ledger event and cannot duplicate credit');
  assert.match(await page.locator('#history [data-bb2-history]').first().textContent(),/7 reps/);
  const correctedRaw=await page.evaluate(()=>localStorage.getItem('bvom_data'));
  await page.locator('#history [data-bb2-correct-save="0|0"]').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('bvom_data')),correctedRaw,
   'unchanged History correction writes nothing');
  assert.equal(await page.evaluate(()=>!!bvomCloudPayload().bb2),false);
  await page.reload();
  await page.waitForSelector('#history [data-bb2-history]',{state:'attached'});
  assert.match(await page.locator('#history').textContent(),/Credit awarded/);
  assert.match(await page.locator('#history [data-bb2-history]').first().textContent(),/7 reps/,
   'completed History corrections survive actual browser reload');
  assert.match(await page.locator('#history').textContent(),/CURRENT BB2 WORKING PLANS/);
  assert.equal(await page.evaluate(()=>!!bvomCloudPayload().bb2),false);
  await page.evaluate(()=>activateTab('history'));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#history [data-bb2-void-save="0|8"]').click();
  assert.equal(await page.evaluate(async()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   const tail=b.events.slice(-2);
   const ledger=await import('./bb2/browser-core.mjs');
   const projection=ledger.foldBB2Block(b.opening,b.events);
   return tail[0].type==='SET_VOIDED'&&tail[1].type==='CREDIT_REVOKED'&&
    projection.quotas.upper_a===0&&projection.history[0].validCount===8&&
    projection.history[0].status==='INCOMPLETE_CORRECTED';
  }),true,'real History set removal atomically revokes the now-unearned credit');
  assert.match(await page.locator('#history [data-bb2-history]').first().textContent(),/8\/12 prescribed sets/);
  assert.match(await page.locator('#history [data-bb2-history]').first().textContent(),/No credit/);
  await page.reload();
  await page.waitForSelector('#history [data-bb2-history]',{state:'attached'});
  assert.match(await page.locator('#history [data-bb2-history]').first().textContent(),/No credit/,
   'void and revocation survive full app reload');
  await page.evaluate(()=>activateTab('history'));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#history [data-bb2-void-session="0"]').click();
  assert.equal(await page.evaluate(async()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   const ledger=await import('./bb2/browser-core.mjs');
   const projection=ledger.foldBB2Block(b.opening,b.events);
   return b.events.at(-1).type==='SESSION_VOIDED'&&
    projection.history[0].status==='VOID'&&projection.quotas.upper_a===0;
  }),true,'real History Remove Workout voids previously credit-revoked session without duplicate credit events');
  assert.equal(await page.locator('#history [data-bb2-history]').count(),0,
   'a voided BB2 workout disappears from shared History');
  await page.reload();
  await page.waitForSelector('#app:not(.hidden)');
  await page.evaluate(()=>activateTab('history'));
  assert.equal(await page.locator('#history [data-bb2-history]').count(),0,
   'removed workout stays absent from shared History after reload');
  // Exercise the new pre-lock editor against the actual existing Workout and
  // Warm-up tabs, then ensure its independent event survives Discard.
  await page.evaluate(()=>showSetup());
  await page.locator('#setup [data-bb2-preview]').click();
  await page.waitForSelector('#setup [data-bb2-start]');
  const editLoads=page.locator('#setup [data-bb2-load]');
  const editIncrements=page.locator('#setup [data-bb2-inc]');
  for(let i=0;i<4;i++){
   await editLoads.nth(i).fill('60');await editIncrements.nth(i).fill('2.5');
  }
  await page.locator('#setup [data-bb2-start]').click();
  await page.evaluate(()=>activateTab('workout'));
  await page.waitForSelector('#workout [data-bb2-edit-save="0"]');
  await page.locator('#workout [data-bb2-edit="0"]').fill('65');
  await page.locator('#workout [data-bb2-edit-save="0"]').click();
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   return b.events.at(-1).type==='PRESCRIPTION_EDITED'&&b.events.at(-1).loadG===65000;
  }),true,'the shared Workout editor commits a canonical pre-lock edit');
  await page.evaluate(()=>activateTab('warmup'));
  assert.match(await page.locator('#warmup').textContent(),/Working: 65 kg/);
  await page.locator('#warmup [data-bb2-warm-tick="0|0"]').click();
  await page.locator('#warmup [data-bb2-warm-tick="0|0"]').click();
  await page.evaluate(()=>activateTab('workout'));
  assert.equal(await page.locator('#workout [data-bb2-edit-save="0"]').isDisabled(),true,
   'unticking preparation does not reopen the working-weight editor');
  await page.locator('#workout [data-bb2-reps="0|0"]').fill('8');
  await page.locator('#workout [data-bb2-log="0|0"]').click();
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   return b.events.at(-1).actualG;
  }),65000,'working actual inherits the edited canonical load');
  assert.equal(await page.locator('#workout [data-bb2-edit-save="0"]').isDisabled(),true);
  assert.equal(await page.locator('#workout [data-bb2-trial-save="0"]').count(),1,
   'revoked qualifying session withdraws calibration evidence, reopening first-exposure trial');
  await page.locator('#workout [data-bb2-discard]').click();
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   return !b.activeSessionId&&b.events.some(e=>e.type==='PRESCRIPTION_EDITED'&&e.loadG===65000);
  }),true,'discard keeps the independent working-weight edit');
  // A low-stress workout is a normal BVOM session with reduced sets, not a
  // progression or quota event. Exercise choices remain in the same chooser.
  await page.evaluate(()=>showSetup());
  await page.locator('#setup [data-bb2-preview]').click();
  await page.waitForSelector('#setup [data-bb2-kind="RECOVERY"]');
  await page.locator('#setup [data-bb2-kind="RECOVERY"]').click();
  assert.match(await page.locator('#setup').textContent(),/easy effort, at least 4 reps in reserve/);
  const recoveryLoads=page.locator('#setup [data-bb2-load]');
  const recoveryInc=page.locator('#setup [data-bb2-inc]');
  for(let i=0;i<await recoveryLoads.count();i++){
   if(!(await recoveryLoads.nth(i).inputValue()))await recoveryLoads.nth(i).fill('60');
  }
  for(let i=0;i<await recoveryInc.count();i++)await recoveryInc.nth(i).fill('2.5');
  await page.locator('#setup [data-bb2-start]').click();
  await page.evaluate(()=>activateTab('workout'));
  await page.waitForSelector('#workout [data-bb2-reps="0|0"]');
  assert.match(await page.locator('#workout').textContent(),/LOW-STRESS RECOVERY/);
  await page.locator('#workout [data-bb2-reps="0|0"]').fill('7');
  await page.locator('#workout [data-bb2-log="0|0"]').click();
  await page.locator('#workout [data-bb2-finish]').click();
  assert.equal(await page.evaluate(async()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   const ledger=await import('./bb2/browser-core.mjs');
   const p=ledger.foldBB2Block(b.opening,b.events);
   const recovery=p.history.at(-1);
   return recovery.status==='LOW_STRESS_RECOVERY'&&recovery.creditId===null&&
    p.quotas.upper_a===0&&b.events.at(-1).type==='WORKOUT_FINISHED';
  }),true,'real recovery Finish is History-only, without quota or new progression');
  await page.reload();
  await page.waitForSelector('#history [data-bb2-history]');
  assert.match(await page.locator('#history [data-bb2-history]').first().textContent(),/LOW_STRESS_RECOVERY/);
  await page.goto(origin+'/index.html');
  await page.waitForSelector('#app:not(.hidden)');
  await page.evaluate(()=>showSetup());
  assert.equal(await page.locator('#setup [data-bb2-preview]').count(),0,'stored preview does not expose BB2 in normal app');
  assert.deepEqual(errors,[],'no application JavaScript errors');
  console.log('PASS BB2 integrated setup preview: dev-only chooser, shared save, reload, cloud exclusion, Start/Record/Discard/Finish, History, warm-up, pre-lock edit and first-exposure calibration trial');
  await context.close();
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
