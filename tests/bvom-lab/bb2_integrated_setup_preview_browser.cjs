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
const bb1=H.boot(H.loadBuild(root));H.bbStart(bb1);
const bb1Fixture=JSON.parse(bb1.ls.getItem('bvom_data'));
const mobile={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'};
const screenshots=path.resolve(process.env.RUNNER_TEMP||'/tmp','bb2-ui-parity');
async function recordBB2Set(page,key,reps,{opened=false,actual}={}){
 if(!opened)await page.locator('#workout [data-bb2-set="'+key+'"]').click();
 if(actual!==undefined)await page.locator('.bvomModalOverlay [data-bb2-actual="'+key+'"]').fill(actual);
 await page.locator('.bvomModalOverlay [data-bb2-reps="'+key+'"]').fill(String(reps));
 await page.locator('.bvomModalOverlay [data-save]').click();
 await page.locator('.bvomModalOverlay').waitFor({state:'detached'});
}
async function assertMobileCorrectionLayout(page,language){
 const bounds=await page.locator('#history .bb2HistoryCorrection').first().evaluate(row=>{
  const rect=el=>{const r=el.getBoundingClientRect();return {
   left:r.left,right:r.right,top:r.top,width:r.width,height:r.height};};
  return {row:rect(row),scrollWidth:row.scrollWidth,clientWidth:row.clientWidth,
   controls:[...row.querySelectorAll('label,input,button')].map(rect),
   buttons:[...row.querySelectorAll('button')].map(rect)};
 });
 assert.equal(bounds.buttons.length,2,language+' offers both History correction actions');
 assert.ok(bounds.scrollWidth<=bounds.clientWidth+1,
  language+' BB2 correction row has no horizontal overflow');
 assert.ok(bounds.controls.every(x=>x.left>=bounds.row.left-.5&&
  x.right<=Math.min(390,bounds.row.right)+.5),
 language+' BB2 History inputs/labels/buttons remain within their mobile card');
 assert.ok(bounds.buttons.every(x=>x.width>=120&&x.height>=34),
  language+' BB2 History correction actions have usable mobile hit targets');
 assert.ok(Math.abs(bounds.buttons[0].top-bounds.buttons[1].top)<1,
  language+' correction and remove actions align on one full-width button row');
}
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
  const context=await browser.newContext(mobile);
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
  await page.evaluate(()=>{changeLanguage('ja');showSetup()});
  assert.match(await page.locator('#setup [data-bb2-preview]').textContent(),
   /ボディビルディング2 · プレビュー/,'BB2 programme entry follows Japanese locale');
  await page.evaluate(()=>{changeLanguage('en');showSetup()});
  assert.match(await page.locator('#setup [data-bb2-preview]').textContent(),
   /BODYBUILDING 2 · PREVIEW/,'BB2 programme entry returns to English');
  const savedBefore=await page.evaluate(()=>localStorage.getItem('bvom_data'));
  await page.locator('#setup [data-bb2-preview]').click();
  await page.waitForSelector('#setup [data-bb2-template]');
  assert.equal(await page.locator('#setup [data-bb2-template]').count(),4,'four BB2 training days');
  assert.equal(await page.locator('#setup [data-bb2-role]').count(),20,'optional curl omitted initially');
  assert.equal(await page.locator('#setup button:has-text("START BODYBUILDING 2")').count(),0,'no active Start button');
  assert.match(await page.locator('#setup').textContent(),/setup and workouts are saved on this device/i);

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
  assert.equal(!!savedAfter.bb2.selectedProgram,false,'setup alone does not switch programs before Start');
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
  await page.waitForSelector('#workout [data-bb2-set="0|0"]');
  const started=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
  assert.ok(started.bb2.activeSessionId);
  assert.equal(started.bb2.events[0].type,'WORKOUT_STARTED');
  assert.equal(started.programMode,fixture.programMode);
  assert.equal(await page.evaluate(()=>bvomCloudWorkoutActive()),true);
  await page.evaluate(()=>changeLanguage('ja'));
  await page.waitForSelector('#workout [data-bb2-finish]');
  assert.match(await page.locator('#workout').textContent(),/予定セットを記録済み/,
   'BB2 Workout guidance follows Japanese locale on a real mobile viewport');
  assert.match(await page.locator('#workout [data-bb2-finish]').textContent(),/ワークアウトを終了/);
  assert.match(await page.locator('#workout [data-bb2-plan-save]').first().textContent(),/自重種目の設定を保存/);
  await page.evaluate(()=>activateTab('warmup'));
  assert.match(await page.locator('#warmup').textContent(),/ウォームアップのみ/,
   'BB2 Warm-up instructions and preparation labels are Japanese');
  assert.match(await page.locator('#warmup').textContent(),/使用重量/);
  await page.evaluate(()=>changeLanguage('en'));
  await page.evaluate(()=>activateTab('workout'));
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')).bb2.events),
   started.bb2.events,'language changes cannot rewrite the workout ledger');
  const beforeOrderCloud=await page.evaluate(()=>JSON.stringify(bvomCloudPayload()));
  const originalOrder=await page.locator('#workout > .exercise .exname').allTextContents();
  assert.equal(originalOrder.length,5,'five real Upper A workout cards are available for ordering');
  assert.equal(await page.locator('#workout > .exercise .bvomOrderArrow').count(),10,
   'BB2 reuses the same two ordering arrows per exercise as BB1');
  await page.locator('#workout > .exercise').first().locator('.bvomOrderArrow').nth(1).click();
  const movedOrder=await page.locator('#workout > .exercise .exname').allTextContents();
  assert.deepEqual(movedOrder,[originalOrder[1],originalOrder[0],...originalOrder.slice(2)],
   'down arrow changes only the visible workout order');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')).bb2.events),
   started.bb2.events,'drag-free arrow reorder cannot rewrite immutable Start or add a ledger event');
  assert.equal(await page.evaluate(()=>JSON.stringify(bvomCloudPayload())),beforeOrderCloud,
   'BB2-only reordering does not introduce cloud fields');
  await page.evaluate(()=>activateTab('warmup'));
  await page.waitForSelector('#warmup [data-bb2-warm-tick="0|0"]');
  assert.equal(await page.locator('#warmup [data-bb2-warm-card]').count(),5);
  assert.deepEqual(await page.locator('#warmup > .exercise .exname').allTextContents(),movedOrder,
   'Warm-up shows the same remembered view order with unchanged slot identities');
  await page.reload();
  await page.waitForSelector('#app:not(.hidden)');
  await page.evaluate(()=>activateTab('warmup'));
  assert.deepEqual(await page.locator('#warmup > .exercise .exname').allTextContents(),movedOrder,
   'reordered Warm-up and Workout survive a full app reload');
  await page.evaluate(()=>activateTab('workout'));
  await page.locator('#workout .bvomOrderReset button').click();
  assert.deepEqual(await page.locator('#workout > .exercise .exname').allTextContents(),originalOrder,
   'Reset Exercise Order restores the original workout display sequence');
  await page.evaluate(()=>activateTab('warmup'));
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
  await page.locator('#workout [data-bb2-set="0|0"]').click();
  assert.equal(await page.locator('.bvomModalOverlay [data-bb2-actual="0|0"]').inputValue(),'60',
   'actual load defaults to prescribed weight in the BB1-style set modal');
  await page.locator('.bvomModalOverlay [data-bb2-actual="0|0"]').fill('');
  await page.locator('.bvomModalOverlay [data-save]').click();
  assert.equal(await page.locator('.bvomModalOverlay').count(),1,
   'blank actual load refuses recording without closing the dialog');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')).bb2.events.length),1,
   'invalid actual load cannot create a recorded working set');
  await page.locator('.bvomModalOverlay [data-bb2-actual="0|0"]').fill('60');
  await recordBB2Set(page,'0|0',8,{opened:true});
  await page.waitForSelector('#workout [data-bb2-set="0|0"].done');
  const logged=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
  assert.equal(logged.bb2.events[1].type,'SET_RECORDED');
  assert.equal(logged.bb2.events[1].actualG,60000);
  assert.ok(logged.timerStart>0,'durably recorded working set starts the BVOM rest clock');
  assert.equal(await page.locator('#timerbar.idle').count(),0,'rest timer becomes visible after save');
  assert.equal(await page.evaluate(()=>!!bvomCloudPayload().bb2),false);
  await page.reload();
  await page.waitForSelector('#workout [data-bb2-set="0|0"].done');
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
  await recordBB2Set(page,'0|1',8);
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   const rows=b.events.filter(e=>e.type==='SET_RECORDED');
   return rows[0].actualG===60000&&rows[1].actualG===67500;
  }),true,'reload and trial change only subsequent actual sets');
  await page.locator('#workout [data-bb2-extra-add="0"]').click();
  assert.equal(await page.locator('.bvomModalOverlay [data-bb2-actual="0|3"]').inputValue(),'67.5',
   'BB2 extra set preloads the previous actual, matching BB1 instead of reverting to 60 kg');
  await page.locator('.bvomModalOverlay [data-cancel]').click();
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
  await page.locator('#workout [data-bb2-set="'+bwKey+'"]').click();
  assert.equal(await page.locator('.bvomModalOverlay [data-bb2-bw-variation="'+bwKey+'"]').inputValue(),'assisted pullup');
  assert.equal(await page.locator('.bvomModalOverlay [data-bb2-bw-assist="'+bwKey+'"]').inputValue(),'light band');
  await recordBB2Set(page,bwKey,8,{opened:true});
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   const e=b.events.at(-1);
   return e.type==='SET_RECORDED'&&e.variation==='assisted pullup'&&
    e.assistance==='light band'&&e.actualG===2500&&e.actualOrigin.unit==='kg';
  }),true,'real BVOM saves explicit bodyweight variation, assistance and added mass');
  await page.locator('#workout [data-bb2-discard]').click();
  const discarded=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
  assert.equal(discarded.bb2.activeSessionId,null);
  assert.equal(discarded.timerStart,null,'Discard atomically stops the working-set rest timer');
  assert.equal(discarded.bb2.events[0].type,'TOMBSTONE');
  assert.equal(discarded.bb2.events[1].type,'TOMBSTONE');
  assert.equal(discarded.bb2.events[2].type,'TOMBSTONE','Discard removes session-only calibration trial');
  assert.equal(discarded.bb2.events[4].type,'VARIATION_EDITED','Discard retains explicit future bodyweight identity');
  assert.equal(discarded.bb2.events[5].type,'PRESCRIPTION_EDITED','Discard retains explicit future BW+load');
  assert.equal(discarded.bb2.events[6].type,'TOMBSTONE','Discard removes bodyweight actual while keeping legacy History');
  assert.equal(discarded.history.length,fixture.history.length);
  assert.equal(discarded.bb2.selectedProgram,true,'Discard keeps BB2 selected');
  await page.waitForSelector('#workout [data-bb2-next-workout]');
  // Continue from the same BVOM Workout tab even after a complete reload.
  await page.reload();
  await page.waitForSelector('#app:not(.hidden)');
  await page.evaluate(()=>activateTab('workout'));
  await page.locator('#workout [data-bb2-next-workout]').click();
  await page.waitForSelector('#setup [data-bb2-start]');
  await page.locator('#setup [data-bb2-back]').click();
  await page.waitForSelector('#app:not(.hidden)');
  assert.equal(await page.locator('#workout [data-bb2-next-workout]').count(),1,
   'Back from preparing the next workout returns to the existing Workout tab');
  await page.locator('#workout [data-bb2-next-workout]').click();
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
   await recordBB2Set(page,k,8,i===0?{actual:'57.5'}:{});
  }
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   return b.events.filter(e=>e.type==='SET_RECORDED'&&e.roleSlotId===b.events.find(x=>x.type==='WORKOUT_STARTED'&&x.sessionId===b.activeSessionId).slots[0].roleSlotId)
    .filter(e=>e.sessionId===b.activeSessionId).every(e=>e.actualG===57500&&e.actualOrigin.value==='57.5');
  }),true,'all three off-plan 57.5 kg sets record the actual load, not prescribed 60 kg');
  await page.waitForSelector('#workout [data-bb2-finish]:not([disabled])');
  await page.locator('#workout [data-bb2-finish]').click();
  await page.waitForSelector('#history [data-bb2-history]',{state:'attached'});
  const finished=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
  assert.equal(finished.bb2.activeSessionId,null);
  assert.equal(finished.timerStart,null,'Finish atomically stops the running rest clock');
  assert.equal(finished.bb2.events.filter(e=>e.type==='WORKOUT_FINISHED').length,1);
  assert.equal(finished.bb2.events.filter(e=>e.type==='CREDIT_GRANTED').length,1,'single credit on real Finish');
  assert.equal(finished.bb2.selectedProgram,true,'Finish keeps BB2 selected');
  assert.equal(await page.locator('#workout [data-bb2-next-workout]').count(),1,
   'after Finish, the normal Workout tab offers the next BB2 workout');
  assert.equal(finished.history.length,fixture.history.length,'legacy History unchanged after BB2 Finish');
  assert.equal(await page.evaluate(()=>bvomBb2End('FINISH')),false,'repeat Finish is idempotent');
  assert.match(await page.locator('#history').textContent(),/Credit awarded/);
  await page.evaluate(()=>activateTab('history'));
  await page.evaluate(()=>changeLanguage('ja'));
  await page.waitForSelector('#history [data-bb2-history]');
  const jaHistory=await page.locator('#history [data-bb2-history]').first().textContent();
  assert.match(jaHistory,/クレジット獲得/,'BB2 History credit and status show Japanese labels');
  assert.match(jaHistory,/セットを修正/,'BB2 History correction controls localise');
  assert.match(jaHistory,/実際の重量を修正/,'BB2 actual-load corrections localise');
  await assertMobileCorrectionLayout(page,'Japanese 390px');
  assert.match(jaHistory,/ワークアウトを削除/,'BB2 History removal controls localise');
  assert.match(await page.locator('#history').textContent(),/BB2の現在の使用重量と設定/);
  const japaneseHistoryWidth=await page.locator('#history [data-bb2-history]').first().boundingBox();
  assert.ok(japaneseHistoryWidth&&japaneseHistoryWidth.x>=0&&
   japaneseHistoryWidth.x+japaneseHistoryWidth.width<=391,
   'Japanese BB2 History fits the existing 390px mobile viewport');
  await page.evaluate(()=>changeLanguage('en'));
  await page.evaluate(()=>activateTab('history'));
  await assertMobileCorrectionLayout(page,'English 390px');
  const correction=page.locator('#history [data-bb2-correct-reps="0|0"]');
  await correction.fill('7');
  await page.locator('#history [data-bb2-correct-hard="0|0"]').check();
  await page.locator('#history [data-bb2-correct-save="0|0"]').click();
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   const e=b.events.at(-1);
   return e.type==='SET_CORRECTED'&&e.reps===7&&e.harderThanIntended&&
    e.actualG===undefined&&b.events.filter(x=>x.type==='CREDIT_GRANTED').length===1;
  }),true,'real History correction is one ledger event and cannot duplicate credit');
  const actual=page.locator('#history [data-bb2-correct-actual="0|0"]');
  const priorActual=Number(await actual.inputValue());
  await actual.fill(String(priorActual+1));
  await page.locator('#history [data-bb2-correct-save="0|0"]').click();
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   const e=b.events.at(-1);
   const p=bvomBb2PreviewModule.foldBB2Block(b.opening,b.events);
   return e.type==='SET_CORRECTED'&&e.actualOrigin?.unit==='kg'&&
    e.actualOrigin?.value===String(e.actualG/1000)&&
    p.history[0].sets[0].actualG===e.actualG&&
    b.events.filter(x=>x.type==='CREDIT_GRANTED').length===1;
  }),true,'real actual-load History correction preserves audit provenance and credit');
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
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   const p=bvomBb2PreviewModule.foldBB2Block(b.opening,b.events);
   return p.history[0].sets[0].actualG===b.events.at(-1).actualG;
  }),true,'corrected actual load survives browser reload');
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
  await page.locator('#workout [data-bb2-edit-save="0"]').click();
  await page.waitForSelector('.bvomModalOverlay [data-bb-increment]');
  assert.equal(await page.locator('.bvomModalOverlay input').count(),2,
   'BB2 uses the same two-field Edit Weight popup as BB1');
  await page.locator('.bvomModalOverlay [data-bb-weight]').fill('65');
  await page.locator('.bvomModalOverlay [data-bb-increment]').fill('1');
  fs.mkdirSync(screenshots,{recursive:true});
  await page.screenshot({path:path.join(screenshots,'bb2-edit-en-mobile.png')});
  await page.locator('.bvomModalOverlay [data-save]').click();
  assert.equal(await page.evaluate(()=>{
   const b=JSON.parse(localStorage.getItem('bvom_data')).bb2;
   return b.events.at(-2).type==='PRESCRIPTION_EDITED'&&b.events.at(-2).loadG===65000&&
    b.events.at(-1).type==='INCREMENT_EDITED'&&b.events.at(-1).incrementG===1000;
  }),true,'one popup atomically commits both canonical weight and increment');
  await page.evaluate(()=>changeLanguage('ja'));
  await page.locator('#workout [data-bb2-edit-save="0"]').click();
  assert.match(await page.locator('.bvomModalOverlay').textContent(),/進行時の増量幅/,
   'BB2 Edit Weight fields follow the BVOM Japanese language setting');
  await page.screenshot({path:path.join(screenshots,'bb2-edit-ja-mobile.png')});
  await page.locator('.bvomModalOverlay [data-cancel]').click();
  await page.evaluate(()=>changeLanguage('en'));
  const bb1Context=await browser.newContext(mobile);
  await bb1Context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await bb1Context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const bb1Page=await bb1Context.newPage();
  await bb1Page.goto(origin+'/seed');
  await bb1Page.evaluate(data=>{
   localStorage.setItem('bvom_data',JSON.stringify(data));
   localStorage.setItem('bvom_data_owner','bb2-preview-owner');
   localStorage.setItem('bvom_entitlement_cache_bb2-preview-owner',JSON.stringify({
    userId:'bb2-preview-owner',verifiedAt:new Date().toISOString(),
    record:{user_id:'bb2-preview-owner',status:'complimentary'}
   }));
  },bb1Fixture);
  await bb1Page.goto(origin+'/index.html');
  await bb1Page.waitForSelector('#workout [data-bb-edit-weight]');
  await bb1Page.locator('#workout [data-bb-edit-weight]').first().click();
  assert.equal(await bb1Page.locator('.bvomModalOverlay input').count(),2);
  await bb1Page.screenshot({path:path.join(screenshots,'bb1-edit-en-mobile.png')});
  for(const p of [page,bb1Page]){
   if(p===page)await p.locator('#workout [data-bb2-edit-save="0"]').click();
   const bounds=await p.locator('.bvomModal').boundingBox();
   assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=391,
    'the shared editor fits a 390px mobile Chromium viewport');
  }
  await page.locator('.bvomModalOverlay [data-cancel]').click();
  await bb1Page.locator('.bvomModalOverlay [data-cancel]').click();
  await bb1Page.evaluate(()=>changeLanguage('ja'));
  await bb1Page.locator('#workout [data-bb-edit-weight]').first().click();
  assert.match(await bb1Page.locator('.bvomModalOverlay').textContent(),/進行時の増量幅/);
  await bb1Page.screenshot({path:path.join(screenshots,'bb1-edit-ja-mobile.png')});
  await bb1Page.locator('.bvomModalOverlay [data-cancel]').click();
  await bb1Page.evaluate(()=>changeLanguage('en'));
  await bb1Page.locator('#workout .setwrap button.set').first().click();
  await page.locator('#workout [data-bb2-set="0|0"]').click();
  assert.equal(await page.locator('.bvomModalOverlay [data-bb2-reps="0|0"]').count(),1,
   'BB2 round set opens the same modal interaction as BB1');
  for(const p of [page,bb1Page]){
   const bounds=await p.locator('.bvomModal').boundingBox();
   assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=391,
    'set recording dialog fits the real 390px mobile viewport');
  }
  await page.screenshot({path:path.join(screenshots,'bb2-set-en-mobile.png')});
  await bb1Page.screenshot({path:path.join(screenshots,'bb1-set-en-mobile.png')});
  await page.locator('.bvomModalOverlay [data-cancel]').click();
  await bb1Page.locator('.bvomModalOverlay [data-cancel]').click();
  await page.evaluate(()=>changeLanguage('ja'));
  await bb1Page.evaluate(()=>changeLanguage('ja'));
  await page.locator('#workout [data-bb2-set="0|0"]').click();
  await bb1Page.locator('#workout .setwrap button.set').first().click();
  assert.match(await page.locator('.bvomModalOverlay').textContent(),/回数/,
   'BB2 set recording modal localises to Japanese');
  assert.match(await page.locator('.bvomModalOverlay').textContent(),/実際の使用重量/,
   'actual load field also localises to Japanese');
  await page.screenshot({path:path.join(screenshots,'bb2-set-ja-mobile.png')});
  await bb1Page.screenshot({path:path.join(screenshots,'bb1-set-ja-mobile.png')});
  await page.locator('.bvomModalOverlay [data-cancel]').click();
  await page.evaluate(()=>changeLanguage('en'));
  await bb1Context.close();
  await page.evaluate(()=>activateTab('warmup'));
  assert.match(await page.locator('#warmup').textContent(),/Working: 65 kg/);
  await page.locator('#warmup [data-bb2-warm-tick="0|0"]').click();
  await page.locator('#warmup [data-bb2-warm-tick="0|0"]').click();
  await page.evaluate(()=>activateTab('workout'));
  assert.equal(await page.locator('#workout [data-bb2-edit-save="0"]').isDisabled(),true,
   'unticking preparation does not reopen the working-weight editor');
  await recordBB2Set(page,'0|0',8);
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
  await page.waitForSelector('#workout [data-bb2-set="0|0"]');
  assert.match(await page.locator('#workout').textContent(),/LOW-STRESS RECOVERY/);
  await recordBB2Set(page,'0|0',7);
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
  await page.waitForSelector('#app:not(.hidden)');
  await page.evaluate(()=>activateTab('history'));
  await page.waitForSelector('#history [data-bb2-history]');
  assert.match(await page.locator('#history [data-bb2-history]').first().textContent(),/LOW_STRESS_RECOVERY/);
  // A genuine browser reload must reacquire the existing BVOM document owner
  // and load the BB2 module before converting a stale session to INCOMPLETE.
  await page.evaluate(()=>activateTab('workout'));
  await page.locator('#workout [data-bb2-next-workout]').click();
  await page.waitForSelector('#setup [data-bb2-start]');
  for(const input of await page.locator('#setup [data-bb2-load]').all()){
   if(await input.isEnabled()&&!(await input.inputValue()))await input.fill('60');
  }
  for(const input of await page.locator('#setup [data-bb2-inc]').all()){
   if(await input.isEnabled()&&!(await input.inputValue()))await input.fill('2.5');
  }
  await page.locator('#setup [data-bb2-start]').click();
  await page.waitForSelector('#workout [data-bb2-set="0|0"]');
  await recordBB2Set(page,'0|0',8);
  await page.locator('#workout [data-bb2-extra-add="0"]').click();
  await recordBB2Set(page,'0|3',11,{opened:true});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')).bb2.events
   .filter(e=>e.type==='EXTRA_SET_RECORDED'&&!e.prescribed).length),1,
   'actual extra-set button logs non-gating work in the shared BVOM document');
  assert.equal(await page.locator('#workout [data-bb2-extra-done="0|3"]').count(),1);
  const beforeAbandon=await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
  assert.equal(typeof beforeAbandon.workoutLastActivityAt,'number',
   'the actual BB2 working set records an inactivity timestamp');
  const cloudBeforeAbandon=await page.evaluate(()=>JSON.stringify(bvomCloudPayload()));
  await page.reload();
  await page.waitForSelector('#app:not(.hidden)');
  await page.evaluate(()=>activateTab('workout'));
  await page.waitForSelector('#workout [data-bb2-set="0|1"]');
  assert.equal(await page.locator('#workout [data-bb2-extra-done="0|3"]').count(),1,
   'the additional recorded set survives a real PWA tab reload');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')).bb2.activeSessionId!==null),true,
   'a normal reload recovers the interrupted BB2 working sets');
  assert.equal(await page.evaluate(()=>{
   const originalNow=Date.now;Date.now=()=>originalNow()+3600001;
   return bvomRecoveryCheck();
  }),true,'60-minute abandoned BB2 session closes through existing recovery');
  const abandoned=await page.evaluate(async()=>{
   const d=JSON.parse(localStorage.getItem('bvom_data')),
    core=await import('./bb2/browser-core.mjs');
   return {active:d.bb2.activeSessionId,events:d.bb2.events,
    recent:core.foldBB2Block(d.bb2.opening,d.bb2.events).history.at(-1),
    quotas:core.foldBB2Block(d.bb2.opening,d.bb2.events).quotas,
    legacyCount:d.history.length,cloud:JSON.stringify(bvomCloudPayload())};
  });
  assert.equal(abandoned.active,null);
  assert.equal(abandoned.recent.status,'INCOMPLETE');
  assert.equal(abandoned.recent.sets.length,2,'prescribed and extra sets survive automatic incomplete close');
  assert.equal(abandoned.recent.validCount,1,'extra sets do not count toward Finish eligibility');
  assert.equal(abandoned.recent.creditId,null);
  assert.equal(abandoned.quotas.upper_a,0);
  assert.equal(abandoned.legacyCount,fixture.history.length,'legacy History is untouched');
  assert.equal(abandoned.cloud,cloudBeforeAbandon,'automatic recovery stays local-only');
  await page.waitForSelector('#workout [data-bb2-next-workout]');
  // Program selection remains in BVOM's existing Starting Setup, including
  // HLM confirmation and BB1's otherwise standalone exercise editor.
  await page.evaluate(()=>showSetup());
  await page.waitForSelector('#setup [data-bb2-preview].on');
  assert.equal(await page.locator('#setup button[onclick="completeSetup()"]:has-text("CONTINUE BODYBUILDING 2")').count(),1,
   'Starting Setup offers a truthful return to selected BB2 instead of silently starting LP');
  await page.locator('#setup button[onclick="completeSetup()"]:has-text("CONTINUE BODYBUILDING 2")').click();
  await page.waitForSelector('#app:not(.hidden)');
  assert.equal(await page.locator('#workout [data-bb2-next-workout]').count(),1);
  await page.evaluate(()=>showSetup());
  await page.locator('#setup button[onclick="chooseProgramMode(\'hlm\')"]').click();
  assert.equal(await page.locator('.bvomModalOverlay [data-r]').count(),1,
   'existing HLM confirmation is still presented');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')).bb2.selectedProgram),true,
   'opening HLM confirmation does not yet discard BB2 selection');
  await page.locator('.bvomModalOverlay [data-r]').click();
  assert.equal(await page.evaluate(()=>{
   const d=JSON.parse(localStorage.getItem('bvom_data'));
   return d.programMode==='hlm'&&d.bb2.selectedProgram===false&&!!d.bb2.events.length;
  }),true,'confirming HLM switches program but retains the full BB2 ledger');
  assert.equal(await page.evaluate(()=>!!bvomCloudPayload().bb2),false);
  await page.evaluate(()=>showSetup());
  await page.locator('#setup [data-bb-program]').click();
  await page.waitForSelector('#setup [data-bb2-preview]');
  assert.match(await page.locator('#setup').textContent(),/BODYBUILDING · 24 WORKOUTS/,
   'BB1 keeps its original setup editor');
  await page.locator('#setup [data-bb2-preview]').click();
  await page.waitForSelector('#setup [data-bb2-template]');
  assert.equal(await page.locator('#setup [data-bb2-template]').count(),4,
   'BB2 is selectable directly from the BB1 setup editor');
  await page.locator('#setup [data-bb2-back]').click();
  await page.waitForSelector('#setup [data-bb2-preview]');
  await page.evaluate(()=>chooseProgramMode('free'));
  assert.equal(await page.locator('#setup [data-bb2-preview]').count(),1,
   'Custom Training chooser also contains BB2');
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
