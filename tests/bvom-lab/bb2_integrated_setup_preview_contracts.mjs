// The real inline BVOM application, with a simulated DOM, composes the BB2
// catalogue in its existing chooser. No separate application or storage.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as catalogue from '../../bb2/browser-core.mjs';

const require=createRequire(import.meta.url);
const H=require('./lib/bvom_harness');
const path=require('node:path');
const root=path.resolve(import.meta.dirname,'../..');

function fixture({ls}={}){
 const h=H.boot(H.loadBuild(root),ls?{ls}:{});if(!ls)H.configureLP(h);
 const before=h.ls.getItem('bvom_data');
 const document=h.ctx.document,query=document.querySelector;
 const row={children:[],appendChild(el){this.children.push(el);return el},
  querySelector(selector){return this.children.find(el=>selector==='[data-bb2-preview]'&&el.dataset.bb2Preview)||null}};
 document.querySelector=selector=>{
  if(selector==='#setup [data-bb-program]')return {parentElement:row};
  // This harness does not parse innerHTML into input nodes. Mirror the
  // rendered bodyweight default fields; targeted cases override them below.
  const bw=selector.match(/^#workout \[data-bb2-bw-(variation|assist|added)="(\d+)\|\d+"\]$/);
  if(bw){
   const bb=h.S().bb2;
   const start=bb?.events?.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===bb.activeSessionId);
   const slot=start?.slots[Number(bw[2])];
   return {value:bw[1]==='variation'?slot?.variation??'':bw[1]==='assist'?slot?.assistance??'':
    slot?.plannedG!==undefined?String(slot.plannedG/1000):''};
  }
  return query(selector);
 };
 return {h,before,row};
}

{
 const {h,row}=fixture();
 h.ctx.bvomBb2InjectProgramChoice();
 assert.equal(row.children.length,0,'ordinary BVOM does not expose the dev preview');
 h.ctx.location.origin='https://bvomstrength.com';
 h.ctx.location.search='?bb2Preview=1';
 h.ctx.bvomBb2InjectProgramChoice();
 assert.equal(row.children.length,0,'even a URL flag cannot expose BB2 on production');
 h.ev("state.bb2={activeSessionId:'imported-developer-session'}");
 h.ctx.renderWarm();h.ctx.renderWorkout();
 assert.doesNotMatch(h.ctx.document.querySelector('#warmup').innerHTML,/BODYBUILDING 2/,
  'imported developer data cannot hijack the normal Warm-up tab');
 assert.doesNotMatch(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-log/,
  'imported developer data cannot hijack the normal Workout tab');
 console.log('PASS: BB2 development preview not visible on normal or production URLs');
}

{
 const {h,before,row}=fixture();
 h.ctx.location.origin='http://localhost:8000';
 h.ctx.location.search='?bb2Preview=1';
 h.ctx.bvomBb2InjectProgramChoice();
 h.ctx.bvomBb2InjectProgramChoice();
 assert.equal(row.children.length,1,'one BB2 button next to existing Bodybuilding program');
 assert.equal(row.children[0].dataset.bb2Preview,'1');
 // Browser import itself is covered separately by the browser-core bundle test.
 // Supply the exact generated module and run the actual application renderer.
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode;bvomBb2RenderPreview()');
 const html=()=>h.ctx.document.querySelector('#setup').innerHTML;
 assert.match(html(),/BODYBUILDING 2 · SETUP PREVIEW/);
 for(const template of ['upper_a','lower_a','upper_b','lower_b']){
  assert.match(html(),new RegExp(`data-bb2-template="${template}"`));
 }
 assert.doesNotMatch(html(),/data-bb2-role="upper_b\|biceps_curl"/,'no default optional curls');
 h.ctx.bvomBb2PreviewChoose('upper_a','shoulder_press','log_push_press');
 assert.match(html(),/2 × 4–6 reps/,'real specialist override from versioned catalogue');
 h.ctx.bvomBb2PreviewCurls(true);
 assert.match(html(),/data-bb2-role="upper_b\|biceps_curl"/);
 assert.equal(h.ls.getItem('bvom_data'),before,'editing the preview never writes BVOM state');
 const normalCloudBefore=JSON.stringify(h.ctx.bvomCloudPayload());
 h.ctx.__bvomCloudBooted=true;h.ctx.__bb2CloudSchedules=0;
 h.ev('bvomCloudMaybeScheduleFromSave=function(){globalThis.__bb2CloudSchedules++}');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true,'explicit save through existing BVOM persistence');
 assert.equal(h.ctx.__bb2CloudSchedules,0,'development-only setup save does not schedule a cloud upload');
 assert.equal(JSON.stringify(h.ctx.bvomCloudPayload()),normalCloudBefore,'ordinary cloud document is byte-identical');
 const stored=JSON.parse(h.ls.getItem('bvom_data'));
 assert.equal(stored.bb2.setup.selections['upper_a|shoulder_press'],'log_push_press');
 assert.equal(stored.bb2.setup.optionalUpperBCurls,true);
 assert.equal(stored.programMode,'lprpt','BB2 setup does not switch the active program');
 assert.equal(stored.history.length,JSON.parse(before).history.length,'no synthetic workout History');
 assert.match(html(),/SAVED ON THIS DEVICE/);
 assert.equal(h.ctx.bvomBb2SaveSetup(),true,'repeated save is idempotent');
 assert.equal(h.ls.getItem('bvom_data'),JSON.stringify(stored),'idempotent save does not touch storage');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined,'development state is excluded from cloud payloads');
 assert.notEqual(h.ctx.bvomCloudComparableFingerprint(stored),h.ctx.bvomCloudComparableFingerprint(h.ctx.bvomCloudPayload()),'cloud fingerprint retains unknown BB2 data for conflict detection');
 assert.equal(h.ev('save()'),true,'an ordinary BVOM save still succeeds');
 assert.equal(h.ctx.__bb2CloudSchedules,1,'normal BVOM saves still schedule cloud sync');
 h.ctx.bvomBb2ClosePreview();
 assert.equal(h.ls.getItem('bvom_data'),JSON.stringify(stored),'closing cannot write a workout');
 assert.equal(h.S().programMode,'lprpt','active program remains LP');
 const restarted=fixture({ls:h.ls});
 assert.deepEqual(JSON.parse(JSON.stringify(restarted.h.S().bb2.setup)),stored.bb2.setup,'normal app boot restores BB2 selections');
 restarted.h.ctx.location.origin='http://localhost:8000';
 restarted.h.ctx.location.search='?bb2Preview=1';
 restarted.h.ctx.__bb2CatalogueForTest=catalogue;
 restarted.h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest; bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup(state.bb2.setup); bvomBb2PreviewOpen=true; bvomBb2PreviewSaved=true; bvomBb2RenderPreview()');
 const reopened=restarted.h.ctx.document.querySelector('#setup').innerHTML;
 assert.match(reopened,/data-bb2-curls checked/,'reopened setup retains optional curls');
 assert.match(reopened,/option value="log_push_press" selected/,'reopened setup retains selected press');
 console.log('PASS: chooser entry, four days, explicit shared save, backup state, cloud exclusion, reload');
}

{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 h.ctx.bvomBb2PreviewChoose('upper_a','shoulder_press','log_push_press');
 h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.bvomBb2SaveSetup(),false,'window lock rejection refuses setup');
 assert.equal(h.S().bb2,undefined,'rejected save rolls back state');
 assert.equal(h.ls.getItem('bvom_data'),before,'rejected save does not alter original blob');
 h.ev('bvomWindowLockOwned=true');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true,'retry after recovered guard succeeds');
 const first=h.S().bb2.setup;
 h.ctx.bvomBb2PreviewCurls(true);
 const raw=h.ls.getItem('bvom_data');
 h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.bvomBb2SaveSetup(),false,'second rejected save refuses replacement');
 assert.equal(h.S().bb2.setup,first,'previous persisted setup remains in memory');
 assert.equal(h.ls.getItem('bvom_data'),raw,'previous persisted setup remains on disk');
 console.log('PASS: rejected saves roll back without changing earlier valid setup');
}

{
 const {h,row}=fixture();
 h.ctx.location.origin='http://127.0.0.1:8080';
 h.ctx.location.search='?bb2Preview=1';
 h.ev('state.session={Squat:{0:{reps:5,load:60}}}');
 h.ctx.bvomBb2InjectProgramChoice();
 assert.equal(row.children.length,1,'chooser can still render during active workout');
 await h.ctx.bvomBb2OpenPreview();
 assert.equal(h.ctx.document.querySelector('#setup').innerHTML.includes('BODYBUILDING 2 · SETUP PREVIEW'),false);
 console.log('PASS: active workout cannot open BB2 preview');
}


{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode;bvomBb2RenderPreview()');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 assert.match(h.ctx.document.querySelector('#setup').innerHTML,/data-bb2-start/);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  let found=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(found){
   if(found[1]==='load')return {value:'60'};
   if(found[1]==='inc')return {value:'2.5'};
   if(found[1]==='assist')return {value:'none'};
   if(found[1]==='reps')return {value:'8'};
   if(found[1]==='hard')return {checked:false};
  }
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true,'Start uses shared BVOM local saving');
 const active=h.S().bb2.activeSessionId;
 assert.ok(active);
 assert.equal(h.S().programMode,'lprpt','legacy program unchanged');
 assert.equal(h.S().history.length,JSON.parse(before).history.length);
 assert.equal(h.S().bb2.events.length,1);
 assert.equal(h.ctx.bvomCloudWorkoutActive(),true,'BB2 active workout blocks normal cloud activity');
 assert.equal(h.ctx.bvomBb2Log(0,0),true,'prescribed on-plan set committed');
 assert.equal(h.S().bb2.events.length,2);
 assert.equal(h.ctx.bvomBb2Log(0,0),false,'duplicate set refused');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined,'development record absent from cloud');
 const written=h.ls.getItem('bvom_data');
 h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.bvomBb2Log(0,1),false,'no work can save without owning document');
 assert.equal(h.ls.getItem('bvom_data'),written,'lock refusal leaves disk intact');
 h.ev('bvomWindowLockOwned=true');
 const restarted=fixture({ls:h.ls});
 assert.equal(restarted.h.S().bb2.activeSessionId,active,'reload retains active BB2 session');
 assert.equal(restarted.h.S().bb2.events.length,2);
 restarted.h.ctx.location.origin='http://localhost:8000';
 restarted.h.ctx.location.search='?bb2Preview=1';
 restarted.h.ctx.__bb2CatalogueForTest=catalogue;
 restarted.h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest');
 assert.equal(restarted.h.ctx.bvomBb2Discard(),false,'a second simulated tab cannot take over original workout ownership');
 assert.equal(restarted.h.S().bb2.events.length,2,'rejected secondary Discard preserves records');
 assert.equal(h.ctx.bvomBb2Discard(),true,'original owner can Discard with ledger tombstones');
 assert.equal(h.S().bb2.activeSessionId,null);
 assert.equal(h.S().bb2.events[0].type,'TOMBSTONE');
 assert.equal(h.S().bb2.events[1].type,'TOMBSTONE');
 assert.equal(h.S().bb2.events.at(-1).type,'WORKOUT_DISCARDED');
 assert.equal(h.S().history.length,JSON.parse(before).history.length);
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 Start, set, duplicate fence, reload, cloud guard, lock refusal and Discard');
}


{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';
 h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const hit=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(hit)return hit[1]==='hard'?{checked:false}:{value:hit[1]==='load'?'60':hit[1]==='inc'?'2.5':hit[1]==='assist'?'none':'8'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const id=h.S().bb2.activeSessionId;
 assert.equal(h.ctx.bvomBb2Log(0,0),true);
 assert.equal(h.ctx.bvomBb2End('FINISH'),false,'below-70%-threshold Finish is refused');
 assert.equal(h.S().bb2.activeSessionId,id,'failed Finish keeps original active session');
 assert.equal(h.S().bb2.events.length,2,'failed Finish cannot append credit or outcome');
 // Nine distinct prescribed working sets meet the 70% threshold for Upper A (9/12).
 for(const [slot,set] of [[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[3,0]]){
  assert.equal(h.ctx.bvomBb2Log(slot,set),true,'recorded required set '+slot+'/'+set);
 }
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/9\/12 prescribed sets recorded/);
 assert.equal(h.ctx.bvomBb2End('FINISH'),true,'70% Finish succeeds with credit transaction');
 const state=h.S(),bb=state.bb2;
 assert.equal(bb.activeSessionId,null,'active BB2 session closed');
 assert.equal(bb.events.filter(e=>e.type==='WORKOUT_FINISHED').length,1);
 assert.equal(bb.events.filter(e=>e.type==='CREDIT_GRANTED').length,1,'exactly one credit earned');
 const proj=catalogue.foldBB2Block(bb.opening,bb.events);
 assert.equal(proj.quotas.upper_a,1);
 assert.equal(proj.history[0].status,'COMPLETED_NORMAL');
 assert.equal(proj.history[0].validCount,9);
 assert.equal(state.history.length,JSON.parse(before).history.length,'legacy History stays byte-level separate');
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/data-bb2-history-section/);
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/Credit awarded/);
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/CURRENT BB2 WORKING PLANS/);
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/Bench Press: 60 kg/,
  'History shows the folded current plan rather than guessing an increase from calibration');
 const saved=h.ls.getItem('bvom_data');
 assert.equal(h.ctx.bvomBb2End('FINISH'),false,'second Finish cannot award duplicate');
 assert.equal(h.ls.getItem('bvom_data'),saved,'second Finish leaves bytes untouched');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined,'cloud payload excludes completed BB2');
 console.log('PASS: BB2 70% gate, atomic Finish/credit, integrated History, idempotence and cloud exclusion');
}
{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const hit=selector.match(/data-bb2-(load|inc|assist)="([^"]+)"/);
  if(hit)return {value:hit[1]==='load'?'60':hit[1]==='inc'?'2.5':'none'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const prior=h.ls.getItem('bvom_data');
 h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.bvomBb2End('INCOMPLETE'),false,'lost lock blocks incomplete Finish');
 assert.equal(h.ls.getItem('bvom_data'),prior,'failed Finish leaves saved stream intact');
 h.ev('bvomWindowLockOwned=true');
 assert.equal(h.ctx.bvomBb2End('INCOMPLETE'),true,'explicit incomplete record closes session');
 assert.equal(h.S().bb2.events.filter(e=>e.type==='CREDIT_GRANTED').length,0);
 assert.equal(catalogue.foldBB2Block(h.S().bb2.opening,h.S().bb2.events).history[0].status,'INCOMPLETE');
 assert.equal(h.S().history.length,JSON.parse(before).history.length);
 console.log('PASS: rejected Finish and incomplete session preserve legacy data and never award credit');
}


{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';
 h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const hit=selector.match(/data-bb2-(load|inc|assist)="([^"]+)"/);
  if(hit)return {value:hit[1]==='load'?'60':hit[1]==='inc'?'2.5':'none'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const saved=h.S().bb2,started=saved.events.find(e=>e.type==='WORKOUT_STARTED');
 const prescription=catalogue.getBB2TemplatePrescription(saved.setup,started.templateId);
 const roles=started.slots.map(slot=>prescription.slots.find(p=>p.roleSlotId===slot.roleSlotId&&p.exerciseId===slot.exerciseId));
 const plans=started.slots.map((slot,i)=>h.ctx.bvomBb2WarmupPlan(slot,roles[i]));
 assert.equal(plans[0].kind,'FULL');
 assert.ok(plans[0].sets.length>0,'free-bar bench uses established warmup calculations');
 assert.ok(plans[0].sets.every(([weight,reps])=>weight>0&&weight<60&&reps>0));
 assert.equal(plans.find(x=>x.kind==='FEEDER').sets.length>0,true,'FEEDER provides lighter prep');
 assert.equal(plans.find(x=>x.kind==='QUALITATIVE').sets.length,0,'bodyweight advice has no fake weights');
 assert.equal(plans.find(x=>x.kind==='NONE').sets.length,0,'isolation work has no dedicated prep');
 const dumbbell={...started.slots[0],exerciseId:'dumbbell_flat_press'};
 const dbPlan=h.ctx.bvomBb2WarmupPlan(dumbbell,{warmup:'FULL'});
 assert.match(dbPlan.note,/per hand/,'dumbbells describe per-hand load');
 assert.ok(dbPlan.sets.length>0&&dbPlan.sets.every(([weight])=>weight<60));
 assert.ok(!dbPlan.sets.some(([weight])=>weight===20),'dumbbell ramps do not invent a bar weight');
 const machine={...started.slots[0],exerciseId:'machine_chest_press'};
 const machinePlan=h.ctx.bvomBb2WarmupPlan(machine,{warmup:'FULL'});
 assert.match(machinePlan.note,/no assumed bar or stack weight/);
 assert.ok(machinePlan.sets.length>0);
 const logPlan=h.ctx.bvomBb2WarmupPlan({...started.slots[0],exerciseId:'log_push_press'},
  {warmup:'FULL'});
 assert.equal(logPlan.kind,'FULL','log push press keeps specialist warm-up class');
 assert.ok(logPlan.sets.length>0);
 const unloaded=h.ctx.bvomBb2WarmupPlan({...dumbbell,plannedG:undefined},
  {warmup:'FULL'});
 assert.equal(unloaded.sets.length,0,'missing reliable working load never creates kg advice');
 const rendered=h.ctx.document.querySelector('#warmup').innerHTML;
 assert.match(rendered,/BODYBUILDING 2 · WARM-UP/);
 assert.match(rendered,/data-bb2-warm-tick="0\|0"/);
 assert.match(rendered,/Preparation only/);
 const beforeTick=h.ls.getItem('bvom_data');
 const legacySession=JSON.stringify(h.S().session);
 assert.equal(h.ctx.bvomBb2WarmupMark(0,999),false,'unprescribed warmup index rejected');
 assert.equal(h.ls.getItem('bvom_data'),beforeTick);
 assert.equal(h.ctx.bvomBb2WarmupMark(0,0),true,'warmup tick saved through shared BVOM document');
 const key=h.ctx.bvomBb2WarmupKey(started.sessionId,started.slots[0],plans[0]);
 assert.equal(h.S().warmupDone[key][0],true);
 const changedLoad={...started.slots[0],plannedG:started.slots[0].plannedG+2500};
 const revised=h.ctx.bvomBb2WarmupPlan(changedLoad,roles[0]);
 assert.notEqual(key,h.ctx.bvomBb2WarmupKey(started.sessionId,changedLoad,revised),
  'changing an upcoming working load cannot reuse previous warm-up ticks');
 assert.notEqual(key,h.ctx.bvomBb2WarmupKey(started.sessionId,started.slots[0],
  {...plans[0],sets:plans[0].sets.slice(1)}),'different preparation plans cannot reuse ticks');
 assert.equal(h.S().bb2.events.length,1,'preparation does not create a working-set event');
 assert.equal(JSON.stringify(h.S().session),legacySession,'no legacy working-set session changed');
 assert.equal(h.S().history.length,JSON.parse(before).history.length,'History is unchanged');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined,'BB2 data still cloud-excluded');
 assert.match(h.ctx.document.querySelector('#warmup').innerHTML,/data-bb2-warm-tick="0\|0"/);
 assert.equal(h.ctx.bvomBb2WarmupMark(0,0),true,'warmup tick can be toggled off');
 assert.equal(h.S().warmupDone[key],undefined);
 assert.equal(h.ctx.bvomBb2WarmupMark(0,0),true);
 const written=h.ls.getItem('bvom_data');
 h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.bvomBb2WarmupMark(0,0),false,'lost exclusive lock rejects warmup');
 assert.equal(h.ls.getItem('bvom_data'),written,'rejected tick leaves disk unchanged');
 h.ev('bvomWindowLockOwned=true');
 const reloaded=fixture({ls:h.ls});
 assert.equal(reloaded.h.S().warmupDone[key][0],true,'namespaced tick survives reload');
 assert.equal(reloaded.h.S().bb2.events.length,1);
 assert.equal(h.ctx.bvomBb2WarmupMark(4,0),false,'NONE never stores fictitious warmup tick');
 assert.equal(h.ctx.bvomBb2Discard(),true);
 assert.equal(h.S().bb2.activeSessionId,null);
 assert.equal(h.S().history.length,JSON.parse(before).history.length);
 console.log('PASS: BB2 FULL/FEEDER/QUALITATIVE/NONE, durable ticks, reload, rollback and ledger separation');
}

{
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const hit=selector.match(/data-bb2-(load|inc|assist)="([^"]+)"/);
  if(hit)return {value:hit[1]==='load'?'60':hit[1]==='inc'?'2.5':'none'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const before=h.ls.getItem('bvom_data');
 const priorWarm=JSON.stringify(h.S().warmupDone);
 const originalSet=h.ls.setItem;
 h.ls.setItem=(key,value)=>{
  if(key==='bvom_data')throw Error('simulated storage quota failure');
  return originalSet(key,value);
 };
 assert.equal(h.ctx.bvomBb2WarmupMark(0,0),false,'failed durable save refuses the tick');
 assert.equal(h.ls.getItem('bvom_data'),before,'failure cannot alter persisted BVOM data');
 assert.equal(JSON.stringify(h.S().warmupDone),priorWarm,'in-memory warm-up ticks roll back');
 assert.equal(h.S().bb2.warmupTouched,undefined,'failed tick cannot leave a phantom edit lock');
 assert.equal(h.S().bb2.events.length,1,'no ledger events created by a failed warm-up save');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined,'failed write cannot send BB2 to cloud');
 console.log('PASS: BB2 warm-up storage failure rolls back ticks and preserves ledger');
}

{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;h.ctx.__bb2EditLoad='65';
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 const editField={get value(){return h.ctx.__bb2EditLoad},disabled:false};
 const editSaveButton={disabled:false};
 h.ctx.document.querySelector=selector=>{
  if(selector==='#workout [data-bb2-edit="0"]')return editField;
  if(selector==='#workout [data-bb2-edit-save="0"]')return editSaveButton;
  const hit=selector.match(/data-bb2-(load|inc|assist|edit|reps|hard)="([^"]+)"/);
  if(hit){
   if(hit[1]==='hard')return {checked:false};
   return {value:hit[1]==='edit'?h.ctx.__bb2EditLoad:
    hit[1]==='load'?'60':hit[1]==='inc'?'2.5':hit[1]==='reps'?'8':'none'};
  }
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const id=h.S().bb2.activeSessionId;
 const first=h.S().bb2.events[0].slots[0];
 assert.equal(first.plannedG,60000);
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/First eligible exposure calibrates/);
 assert.equal(h.ctx.bvomBb2EditWorkingLoad(0),true,'untouched working weight can be edited');
 let events=h.S().bb2.events;
 assert.equal(events.length,2);
 assert.equal(events[1].type,'PRESCRIPTION_EDITED');
 assert.equal(events[1].scope,'GLOBAL','pre-lock edit survives session Discard');
 assert.equal(events[1].loadG,65000);
 assert.equal(events[0].slots[0].plannedG,60000,'immutable Start plan survives edit');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/65 kg/);
 assert.match(h.ctx.document.querySelector('#warmup').innerHTML,/Working: 65 kg/);
 assert.equal(h.ctx.bvomBb2EditWorkingLoad(0),true,'unchanged edit is an idempotent no-op');
 assert.equal(h.S().bb2.events.length,2);
 h.ev("state.unit='lb'");
 h.ctx.__bb2EditLoad=h.ctx.bvomBb2DisplayLoad(65000);
 assert.equal(h.ctx.bvomBb2EditWorkingLoad(0),true,
  'resubmitting unchanged rounded pounds cannot create a false load change');
 assert.equal(h.S().bb2.events.length,2,'unit display round-trip preserves grams and epoch');
 h.ev("state.unit='kg'");
 const saved=h.ls.getItem('bvom_data');
 h.ev('bvomWindowLockOwned=false');h.ctx.__bb2EditLoad='67.5';
 assert.equal(h.ctx.bvomBb2EditWorkingLoad(0),false,'non-owner edit refused');
 assert.equal(h.ls.getItem('bvom_data'),saved);
 h.ev('bvomWindowLockOwned=true');
 assert.equal(h.ctx.bvomBb2WarmupMark(0,0),true);
 assert.equal(editField.disabled,true,'warm-up immediately disables stale Workout weight input');
 assert.equal(editSaveButton.disabled,true,'warm-up immediately disables stale save control');
 assert.equal(h.ctx.bvomBb2EditWorkingLoad(0),false,'warm-up tick locks ordinary edit');
 assert.equal(h.ctx.bvomBb2WarmupMark(0,0),true,'user may untick optional preparation');
 assert.equal(h.ctx.bvomBb2EditWorkingLoad(0),false,
  'unticking preparation cannot erase the durable active-workout edit boundary');
 const savedTouch=JSON.parse(h.ls.getItem('bvom_data'));
 assert.equal(Object.values(savedTouch.bb2.warmupTouched).filter(Boolean).length,1);
 assert.equal(h.ctx.bvomBb2WarmupMark(0,0),true);
 assert.equal(h.ctx.bvomBb2Log(0,0),true);
 const set=h.S().bb2.events.find(e=>e.type==='SET_RECORDED');
 assert.equal(set.actualG,65000,'working set inherits edited canonical load');
 assert.equal(h.ctx.bvomBb2EditWorkingLoad(0),false,'recorded work locks ordinary edit');
 assert.equal(h.ctx.bvomBb2Discard(),true);
 assert.ok(h.S().bb2.events.some(e=>e.type==='PRESCRIPTION_EDITED'&&e.loadG===65000),
  'independent global edit survives discarded session');
 assert.equal(h.S().history.length,JSON.parse(before).history.length);
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 pre-lock load edit, warm-up refresh, actual inheritance, lock and discard');
}

{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;h.ctx.__bb2TrialLoad='65';
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const hit=selector.match(/data-bb2-(load|inc|assist|reps|hard|trial)="([^"]+)"/);
  if(hit){
   if(hit[1]==='hard')return {checked:false};
   return {value:hit[1]==='load'?'60':hit[1]==='inc'?'2.5':
    hit[1]==='reps'?'8':hit[1]==='trial'?h.ctx.__bb2TrialLoad:'none'};
  }
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const original=h.S().bb2.events[0].slots[0];
 assert.equal(h.ctx.bvomBb2ReviseTrial(0),false,'cannot revise trial before recorded work');
 assert.equal(h.ctx.bvomBb2AcceptTrial(0),false,'cannot accept untested weight');
 assert.equal(h.ctx.bvomBb2Log(0,0),true);
 assert.equal(h.ctx.bvomBb2AcceptTrial(0),false,'acceptance waits for prescribed sets');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-trial-save="0"/);
 assert.equal(h.ctx.bvomBb2ReviseTrial(0),true);
 let events=h.S().bb2.events;
 assert.equal(events.at(-1).type,'CALIBRATION_PLAN_REVISED');
 assert.equal(events.at(-1).plannedG,65000);
 assert.equal(events[0].slots[0].plannedG,60000,'immutable Start weight retained');
 assert.equal(events[1].actualG,60000,'first actual load retained');
 assert.equal(h.ctx.bvomBb2ReviseTrial(0),true,'unchanged trial is idempotent');
 assert.equal(h.S().bb2.events.length,3);
 h.ev("state.unit='lb'");
 h.ctx.__bb2TrialLoad=h.ctx.bvomBb2DisplayLoad(65000);
 assert.equal(h.ctx.bvomBb2ReviseTrial(0),true,'rounded pounds are a no-op trial');
 assert.equal(h.S().bb2.events.length,3,'unit round-trip preserves original grams');
 h.ev("state.unit='kg'");
 h.ctx.__bb2TrialLoad='67.5';
 assert.equal(h.ctx.bvomBb2ReviseTrial(0),true);
 assert.equal(h.ctx.bvomBb2Log(0,1),true);
 events=h.S().bb2.events;
 assert.equal(events.find(e=>e.type==='SET_RECORDED'&&e.setIndex===1).actualG,67500,
  'subsequent set uses session trial rather than rewriting first set');
 h.ev('bvomWindowLockOwned=false');h.ctx.__bb2TrialLoad='70';
 assert.equal(h.ctx.bvomBb2ReviseTrial(0),false,'non-owner cannot change trial');
 h.ev('bvomWindowLockOwned=true');
 assert.equal(h.ctx.bvomBb2Log(0,2),true);
 assert.equal(h.ctx.bvomBb2ReviseTrial(0),false,'no trial after all planned sets');
 assert.equal(h.ctx.bvomBb2AcceptTrial(0),true,'first exposure may accept tested load');
 assert.equal(h.ctx.bvomBb2AcceptTrial(0),false,'acceptance is one-time');
 assert.equal(h.S().bb2.events.at(-1).loadG,67500);
 assert.equal(h.S().bb2.events.at(-1).type,'CALIBRATION_ACCEPTED');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/Calibration load accepted/);
 const reloaded=fixture({ls:h.ls});
 reloaded.h.ctx.location.origin='http://localhost:8000';
 reloaded.h.ctx.location.search='?bb2Preview=1';
 reloaded.h.ctx.__bb2CatalogueForTest=catalogue;
 reloaded.h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest');
 const next=reloaded.h.S().bb2;
 assert.equal(reloaded.h.ctx.bvomBb2SessionTrial(next.events[0].slots[0],next.events,next.activeSessionId).grams,
  67500,'trial load survives offline app reload');
 const more=h.S().bb2.events.find(e=>e.type==='WORKOUT_STARTED').slots.flatMap((slot,i)=>
  i===0?[]:Array.from({length:slot.sets},(_,j)=>[i,j])).slice(0,6);
 assert.equal(more.length,6);
 for(const [i,j] of more)assert.equal(h.ctx.bvomBb2Log(i,j),true,`BB2 remaining prescribed set ${i}|${j}`);
 assert.equal(h.ctx.bvomBb2End('FINISH'),true);
 const b=h.S().bb2,projection=catalogue.foldBB2Block(b.opening,b.events);
 const id='upper_a|'+original.roleSlotId+'|'+original.exerciseId;
 assert.equal(projection.progress[id].calibrated,true);
 assert.equal(projection.progress[id].loadG,67500,'accepted calibration becomes future working plan');
 assert.equal(b.events[0].slots[0].plannedG,60000,'historical Start unaffected');
 assert.equal(JSON.stringify(h.S().warmupDone),'{}','calibration events never create warm-up ticks');
 assert.equal(h.S().history.length,JSON.parse(before).history.length,'BB1 History untouched');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 session-only calibration trials, actual isolation, acceptance, reload and Finish');
}

{
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const hit=selector.match(/data-bb2-(load|inc|assist|reps|hard|trial)="([^"]+)"/);
  if(hit)return {value:hit[1]==='trial'?'67.5':hit[1]==='inc'?'2.5':
   hit[1]==='reps'?'8':hit[1]==='assist'?'none':'60',checked:false};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 assert.equal(h.ctx.bvomBb2Log(0,0),true);
 const saved=h.ls.getItem('bvom_data'),priorCount=h.S().bb2.events.length;
 const originalSet=h.ls.setItem;
 h.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('simulated storage quota failure');return originalSet(key,value)};
 assert.equal(h.ctx.bvomBb2ReviseTrial(0),false,'failed calibration trial refuses write');
 h.ls.setItem=originalSet;
 assert.equal(h.ls.getItem('bvom_data'),saved,'failed trial cannot alter persisted data');
 assert.equal(h.S().bb2.events.length,priorCount,'failed trial rolls back memory');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 calibration trial storage failure leaves document unchanged');
}

{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ctx.__bb2Actual={variation:'pullup',assistance:'medium band',added:'5'};
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const bw=selector.match(/data-bb2-bw-(variation|assist|added)="(\d+)\|(\d+)"/);
  if(bw)return {value:h.ctx.__bb2Actual[bw[1]==='assist'?'assistance':bw[1]]};
  const field=selector.match(/data-bb2-(bw-load|load|inc|assist|reps|hard)="([^"]+)"/);
  if(field){
   if(field[1]==='hard')return {checked:false};
   return {value:field[1]==='bw-load'?'5':field[1]==='load'?'60':
    field[1]==='inc'?'2.5':field[1]==='assist'?'medium band':'8'};
  }
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const b=h.S().bb2,start=b.events[0],i=start.slots.findIndex(s=>s.equipment==='bodyweight');
 assert.ok(i>=0,'Upper A includes actual bodyweight vertical pull');
 const slot=start.slots[i],key='upper_a|'+slot.roleSlotId+'|'+slot.exerciseId;
 assert.equal(slot.plannedG,5000,'starting numeric BW is only explicitly entered added load');
 assert.equal(slot.assistance,'medium band');
 assert.equal(h.ctx.bvomBb2DisplayLoad(5000),'5');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/Actual variation/);
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/Added kg \(optional\)/);
 h.ctx.__bb2Actual.variation='';
 assert.equal(h.ctx.bvomBb2Log(i,0),false,'blank bodyweight variation refused');
 h.ctx.__bb2Actual.variation='pullup';h.ctx.__bb2Actual.assistance='';
 assert.equal(h.ctx.bvomBb2Log(i,0),false,'missing explicit assistance refused');
 h.ctx.__bb2Actual.assistance='medium band';h.ctx.__bb2Actual.added='-3';
 assert.equal(h.ctx.bvomBb2Log(i,0),false,'negative added load refused');
 assert.equal(b.events.length,1,'invalid bodyweight entries leave ledger unchanged');
 h.ev("state.unit='lb'");h.ctx.__bb2Actual.added=h.ctx.bvomBb2DisplayLoad(5000);
 assert.equal(h.ctx.bvomBb2Log(i,0),true,'record BW after kg-to-lb display conversion');
 let actual=h.S().bb2.events.at(-1);
 assert.equal(actual.actualG,5000,'rounded lb display preserves entered 5 kg exactly');
 assert.equal(actual.actualOrigin.unit,'kg','reversible original load metadata retained');
 assert.equal(actual.variation,'pullup');assert.equal(actual.assistance,'medium band');
 h.ev("state.unit='kg'");h.ctx.__bb2Actual.assistance='light band';h.ctx.__bb2Actual.added='7.5';
 const saved=h.ls.getItem('bvom_data');h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.bvomBb2Log(i,1),false,'bodyweight actual cannot bypass owner lock');
 assert.equal(h.ls.getItem('bvom_data'),saved);
 h.ev('bvomWindowLockOwned=true');
 assert.equal(h.ctx.bvomBb2Log(i,1),true);
 actual=h.S().bb2.events.at(-1);
 assert.equal(actual.actualG,7500);
 assert.equal(actual.assistance,'light band');
 assert.equal(start.slots[i].assistance,'medium band','actual variation cannot rewrite immutable prescription');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/light band/);
 const reloaded=fixture({ls:h.ls});
 assert.equal(reloaded.h.S().bb2.events.at(-1).assistance,'light band','bodyweight actual survives reload');
 const remaining=start.slots.flatMap((s,j)=>j===i?[]:Array.from({length:s.sets},(_,k)=>[j,k])).slice(0,7);
 assert.equal(remaining.length,7);
 for(const [j,k] of remaining)assert.equal(h.ctx.bvomBb2Log(j,k),true,`required set ${j}|${k}`);
 assert.equal(h.ctx.bvomBb2End('FINISH'),true);
 const projection=catalogue.foldBB2Block(h.S().bb2.opening,h.S().bb2.events);
 assert.equal(projection.progress[key].calibrated,true);
 assert.equal(projection.progress[key].bestReps,null,'mixed variation/assistance/added load creates no comparable BW baseline');
 assert.equal(projection.progress[key].loadG,5000,'mixed actuals do not silently adopt 7.5 kg');
 assert.equal(projection.progress[key].assistance,'medium band');
 assert.equal(h.S().history.length,JSON.parse(before).history.length);
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 bodyweight explicit added weight, variation, assistance, units, mixed calibration and owner guard');
}

{
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const field=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(field)return {value:field[1]==='load'?'60':field[1]==='inc'?'2.5':
   field[1]==='assist'?'none':'8',checked:false};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const i=h.S().bb2.events[0].slots.findIndex(s=>s.equipment==='bodyweight');
 const old=h.ls.getItem('bvom_data'),prior=h.S().bb2.events.length;
 const setItem=h.ls.setItem;
 h.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('simulated storage full');return setItem(key,value)};
 assert.equal(h.ctx.bvomBb2Log(i,0),false,'failed BW actual save cannot commit event');
 h.ls.setItem=setItem;
 assert.equal(h.ls.getItem('bvom_data'),old,'failed BW write cannot change disk');
 assert.equal(h.S().bb2.events.length,prior,'failed BW write rolls back in-memory event');
 console.log('PASS: BB2 bodyweight storage failure is atomic');
}

{
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  if(/data-bb2-bw-added=/.test(selector))return {value:''};
  const field=selector.match(/data-bb2-(bw-load|load|inc|assist|reps|hard)="([^"]+)"/);
  if(field)return {value:field[1]==='bw-load'?'5':field[1]==='load'?'60':
   field[1]==='inc'?'2.5':field[1]==='assist'?'none':'8',checked:false};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const start=h.S().bb2.events[0],i=start.slots.findIndex(s=>s.equipment==='bodyweight');
 assert.equal(start.slots[i].plannedG,5000);
 assert.equal(h.ctx.bvomBb2Log(i,0),true,'clearing added weight means a bodyweight-only actual');
 const row=h.S().bb2.events.at(-1);
 assert.equal(row.actualG,0,'BW-only actual is explicit zero external kilograms');
 assert.equal(row.actualOrigin.value,'0');
 assert.equal(row.variation,start.slots[i].variation);
 assert.equal(row.assistance,'none');
 assert.equal(start.slots[i].plannedG,5000,'removing load from one set does not rewrite prescription');
 console.log('PASS: BB2 bodyweight-only actual after a planned BW+load prescription');
}

{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ctx.__bb2Plan={variation:'assisted pullup',assistance:'light band',added:'2.5'};
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const plan=selector.match(/data-bb2-plan-(variation|assist|added)="(\d+)"/);
  if(plan)return {value:h.ctx.__bb2Plan[plan[1]==='assist'?'assistance':plan[1]],disabled:false};
  const bw=selector.match(/data-bb2-bw-(variation|assist|added)="(\d+)\|(\d+)"/);
  if(bw){const b=h.S().bb2,start=b.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===b.activeSessionId);
   const slot=h.ctx.bvomBb2WorkingSlot(start.slots[Number(bw[2])],b.events,b.activeSessionId);
   return {value:bw[1]==='variation'?slot.variation:bw[1]==='assist'?slot.assistance:
    slot.plannedG===undefined?'':h.ctx.bvomBb2DisplayLoad(slot.plannedG)};}
  const field=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(field)return {value:field[1]==='load'?'60':field[1]==='inc'?'2.5':
   field[1]==='assist'?'none':'8',checked:false};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const start=h.S().bb2.events[0],i=start.slots.findIndex(s=>s.equipment==='bodyweight'),slot=start.slots[i];
 assert.equal(slot.plannedG,undefined);assert.equal(slot.assistance,'none');
 assert.equal(h.ctx.bvomBb2EditBodyweightPlan(i),true,'bodyweight prescription can be edited before work');
 let ev=h.S().bb2.events;
 assert.deepEqual(ev.slice(1).map(x=>x.type),['VARIATION_EDITED','PRESCRIPTION_EDITED']);
 assert.ok(ev.slice(1).every(x=>x.scope==='GLOBAL'),'independent edits survive Discard');
 assert.equal(ev[1].variation,'assisted pullup');assert.equal(ev[1].assistance,'light band');
 assert.equal(ev[2].loadG,2500);
 assert.equal(start.slots[i].variation,'pullup','Start snapshot stays immutable');
 assert.equal(h.ctx.bvomBb2WorkingSlot(slot,ev,h.S().bb2.activeSessionId).assistance,'light band');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/SAVE BW PLAN/);
 assert.equal(h.ctx.bvomBb2EditBodyweightPlan(i),true,'unchanged BW plan is idempotent');
 assert.equal(h.S().bb2.events.length,3);
 h.ev("state.unit='lb'");h.ctx.__bb2Plan.added=h.ctx.bvomBb2DisplayLoad(2500);
 assert.equal(h.ctx.bvomBb2EditBodyweightPlan(i),true,'rounded pounds resubmission is a no-op');
 assert.equal(h.S().bb2.events.length,3);
 h.ev("state.unit='kg'");
 const saved=h.ls.getItem('bvom_data');h.ev('bvomWindowLockOwned=false');
 h.ctx.__bb2Plan.assistance='strong band';
 assert.equal(h.ctx.bvomBb2EditBodyweightPlan(i),false,'non-owner cannot edit BW plan');
 assert.equal(h.ls.getItem('bvom_data'),saved);
 h.ev('bvomWindowLockOwned=true');h.ctx.__bb2Plan.assistance='light band';
 assert.equal(h.ctx.bvomBb2Log(i,0),true);
 ev=h.S().bb2.events;const actual=ev.at(-1);
 assert.equal(actual.actualG,2500);assert.equal(actual.variation,'assisted pullup');
 assert.equal(actual.assistance,'light band');
 assert.equal(h.ctx.bvomBb2EditBodyweightPlan(i),false,'recorded set locks BW future prescription');
 assert.equal(h.ctx.bvomBb2Discard(),true);
 ev=h.S().bb2.events;
 assert.equal(ev[0].type,'TOMBSTONE','discard removes Start');
 assert.equal(ev[1].type,'VARIATION_EDITED');assert.equal(ev[2].type,'PRESCRIPTION_EDITED');
 assert.equal(ev.at(-2).type,'TOMBSTONE','discard removes session-only actual');
 const projection=catalogue.foldBB2Block(h.S().bb2.opening,ev);
 const id='upper_a|'+slot.roleSlotId+'|'+slot.exerciseId;
 assert.equal(projection.progress[id].loadG,2500,'accepted global BW weight survives Discard');
 assert.equal(projection.progress[id].assistance,'light band');
 assert.equal(h.S().history.length,JSON.parse(before).history.length);
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 pre-lock bodyweight prescription, unit no-op, actual inheritance and Discard');
}

{
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const plan=selector.match(/data-bb2-plan-(variation|assist|added)="\d+"/);
  if(plan)return {value:plan[1]==='variation'?'assisted pullup':
   plan[1]==='assist'?'light band':'2.5'};
  const field=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(field)return {value:field[1]==='load'?'60':field[1]==='inc'?'2.5':
   field[1]==='assist'?'none':'8',checked:false};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const i=h.S().bb2.events[0].slots.findIndex(s=>s.equipment==='bodyweight');
 const saved=h.ls.getItem('bvom_data'),old=h.S().bb2.events.length;
 const setItem=h.ls.setItem;
 h.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('simulated disk quota');return setItem(key,value)};
 assert.equal(h.ctx.bvomBb2EditBodyweightPlan(i),false,
  'joint BW variation/load edit cannot partially commit on write failure');
 h.ls.setItem=setItem;
 assert.equal(h.S().bb2.events.length,old,'both failed edit events rolled back');
 assert.equal(h.ls.getItem('bvom_data'),saved,'joint edit failure leaves durable document unchanged');
 console.log('PASS: BB2 atomic two-event bodyweight plan edit rollback');
}

console.log('BB2 BVOM integrated setup preview: 17/17 PASS');
