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
 document.querySelector=selector=>selector==='#setup [data-bb-program]'?{parentElement:row}:query(selector);
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
 assert.equal(h.S().bb2.events.length,1,'no ledger events created by a failed warm-up save');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined,'failed write cannot send BB2 to cloud');
 console.log('PASS: BB2 warm-up storage failure rolls back ticks and preserves ledger');
}

console.log('BB2 BVOM integrated setup preview: 9/9 PASS');
