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
 assert.equal(restarted.h.ctx.bvomBb2Discard(),true,'Discard makes session tombstones');
 assert.equal(restarted.h.S().bb2.activeSessionId,null);
 assert.equal(restarted.h.S().bb2.events[0].type,'TOMBSTONE');
 assert.equal(restarted.h.S().bb2.events[1].type,'TOMBSTONE');
 assert.equal(restarted.h.S().bb2.events.at(-1).type,'WORKOUT_DISCARDED');
 assert.equal(restarted.h.S().history.length,JSON.parse(before).history.length);
 assert.equal(restarted.h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 Start, set, duplicate fence, reload, cloud guard, lock refusal and Discard');
}

console.log('BB2 BVOM integrated setup preview: 5/5 PASS');
