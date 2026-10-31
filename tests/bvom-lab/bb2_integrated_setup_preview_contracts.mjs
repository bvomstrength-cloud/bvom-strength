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

function recordBB2Dialog(h,i,j,{reps=8,extra=false,actual}={}){
 const o=h.lastOverlay(),key=i+'|'+j;
 assert.match(o.innerHTML,/class="bvomModal"/,'BB2 uses the shared set modal');
 o.querySelector('[data-bb2-reps="'+key+'"]').value=String(reps);
 o.querySelector('[data-bb2-hard="'+key+'"]').checked=false;
 if(o.innerHTML.includes('data-bb2-actual="'+key+'"')){
  const bb=h.S().bb2,sessionId=bb.activeSessionId;
  const start=bb.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===sessionId);
  const slot=h.ctx.bvomBb2WorkingSlot(start.slots[i],bb.events,sessionId);
  const trial=h.ctx.bvomBb2SetActualDefault(slot,bb.events,sessionId,extra);
  o.querySelector('[data-bb2-actual="'+key+'"]').value=actual??h.ctx.bvomBb2DisplayLoad(trial.grams);
 }
 if(o.innerHTML.includes('data-bb2-bw-variation')){
  const start=h.S().bb2.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===h.S().bb2.activeSessionId);
  const slot=start.slots[i];
  o.querySelector('[data-bb2-bw-variation="'+key+'"]').value=slot.variation;
  o.querySelector('[data-bb2-bw-assist="'+key+'"]').value=slot.assistance;
  o.querySelector('[data-bb2-bw-added="'+key+'"]').value=slot.plannedG===undefined?'':String(slot.plannedG/1000);
 }
 o.querySelector('[data-save]').onclick();
 assert.equal(o.removed,true,'successful dialog recording closes');
 const type=extra?'EXTRA_SET_RECORDED':'SET_RECORDED';
 assert.equal(h.S().bb2.events.at(-1).type,type);
}

{
 const {h,row}=fixture();
 assert.doesNotMatch(h.ctx.bvomBb2CloudRestoreMessage(),/WARNING: BB2/,
  'ordinary cloud-restore warning is unchanged without BB2 local data');
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
 assert.equal(!!stored.bb2.selectedProgram,false,'saving setup alone does not switch programs');
 assert.equal(stored.programMode,'lprpt','BB2 setup does not switch the active program');
 assert.match(h.ctx.bvomBb2CloudRestoreMessage(),/BB2 setup and workout history will be kept unchanged/,
  'cloud restore explains that validated local-only BB2 history is preserved');
 h.ctx.location.origin='https://app.bvomstrength.com';
 assert.match(h.ctx.bvomBb2CloudRestoreMessage(),/BB2 setup and workout history will be kept unchanged/,
  'the BB2 preservation message is shown even outside the preview host');
 h.ctx.location.origin='http://localhost:8000';
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
 const {h}=fixture();
 const oldBackup=JSON.parse(h.ls.getItem('bvom_data'));
 assert.equal(h.ctx.bvomBb2BackupRestoreWarning(h.S(),oldBackup),'',
  'ordinary BVOM backups have no new warning when BB2 is absent');
 const owner='11111111-1111-4111-8111-111111111111';
 const bb2={setup:catalogue.createBB2Setup(),opening:catalogue.createBB2Opening({
  ownerId:owner,blockId:'bb2-backup-guard'}),events:[]};
 h.ctx.__bb2BackupFixture=bb2;
 h.ev('state.bb2=__bb2BackupFixture');
 const untouched=JSON.stringify(h.S()),raw=h.ls.getItem('bvom_data');
 assert.equal(h.ctx.bvomBb2BackupRestoreWarning(h.S(),{bb2}),'' ,
  'restoring identical BB2 data does not warn of a replacement');
 assert.match(h.ctx.bvomBb2BackupRestoreWarning(h.S(),oldBackup),/REPLACED or REMOVED/);
 assert.match(h.ctx.bvomBb2BackupRestoreWarning(h.S(),{bb2:{...bb2,events:[{type:'test'}]}}),
  /not yet saved in BVOM Cloud/,'different BB2 archive also warns');
 h.ev("state.language='ja'");
 assert.match(h.ctx.bvomBb2BackupRestoreWarning(h.S(),oldBackup),/ボディビルディング2/,
  'the same warning is available in Japanese');
 h.ev('delete state.language');
 let reader,prompt='',restore;
 h.ctx.FileReader=function(){reader=this;this.readAsText=()=>{}};
 h.ctx.bvomChoiceModal=(title,body,left,right,onLeft,onRight)=>{
  prompt=body;restore={onLeft,onRight};return restore};
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest');
 h.ctx.__bb2ImportOwner=owner;
 h.ev('window.__bvomAuthUserId=__bb2ImportOwner;'+
  'bvomCloud.user={id:__bb2ImportOwner};bvomSetLocalOwnerId(__bb2ImportOwner);'+
  'bvomEntitlementAccessDecision=()=>({allowed:true})');
 h.ctx.importBackupFile({files:[{name:'old-bvom.json'}]});
 reader.result=JSON.stringify({app:'BVOM',data:oldBackup});reader.onload();
 assert.match(prompt,/Bodybuilding 2 setup or workouts/,
  'existing Restore Backup UI names the local-only BB2 records at risk');
 assert.match(prompt,/Export a current BVOM backup/);
 restore.onLeft();
 assert.equal(h.ls.getItem('bvom_data'),raw,'cancelled BB2-risk restore performs no overwrite');
 assert.equal(JSON.stringify(h.S()),untouched,'cancelled restore preserves in-memory BB2 data');
 assert.equal(h.ls.getItem('bvom_pre_restore'),null,'cancel creates no recovery backup');
 h.ctx.importBackupFile({files:[{name:'same-bvom.json'}]});
 reader.result=JSON.stringify({app:'BVOM',data:{...oldBackup,bb2}});await reader.onload();
 assert.doesNotMatch(prompt,/Bodybuilding 2 setup or workouts/,
  'the same BB2 data does not create unnecessary warning prompts');
 h.ctx.importBackupFile({files:[{name:'old-bvom.json'}]});
 reader.result=JSON.stringify({app:'BVOM',data:oldBackup});reader.onload();
 restore.onRight();
 assert.equal(JSON.parse(h.ls.getItem('bvom_data')).bb2,undefined,
  'a deliberately confirmed legacy restore retains existing replacement semantics');
 assert.equal(JSON.parse(h.ls.getItem('bvom_pre_restore')).bb2.opening.blockId,
  'bb2-backup-guard','the existing pre-restore recovery snapshot contains old BB2 data');
 console.log('PASS: BB2 local-only backup restore warning, cancellation and pre-restore recovery');
}

{
 // Exercise the actual file reader and restore callback, not just the
 // standalone ledger: a backup from another device must prove the same owner.
 const {h}=fixture();
 const owner='11111111-1111-4111-8111-111111111111';
 const other='22222222-2222-4222-8222-222222222222';
 h.ctx.__bb2ImportOwner=owner;
 h.ev('window.__bvomAuthUserId=__bb2ImportOwner;'+
  'bvomCloud.user={id:__bb2ImportOwner};bvomSetLocalOwnerId(__bb2ImportOwner);'+
  'bvomEntitlementAccessDecision=()=>({allowed:true})');
 let reader,confirmRestore=null,refusals=0;
 h.ctx.FileReader=function(){reader=this;this.readAsText=()=>{}};
 h.ctx.bvomBeeModal=()=>{refusals++};
 h.ctx.bvomChoiceModal=(_title,_body,_cancel,_confirm,_left,right)=>{confirmRestore=right};
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest');
 const before=h.ls.getItem('bvom_data');
 const bb2={setup:catalogue.createBB2Setup(),opening:catalogue.createBB2Opening({
  ownerId:owner,blockId:'portable-bb2'}),events:[],sealedBlocks:[],selectedProgram:true};
 const upload=async candidate=>{
  confirmRestore=null;
  h.ctx.importBackupFile({files:[{name:'portable.json'}],value:'portable.json'});
  reader.result=JSON.stringify({app:'BVOM',data:{...JSON.parse(before),bb2:candidate}});
  await reader.onload();
 };
 await upload({...bb2,opening:catalogue.createBB2Opening({ownerId:other,blockId:'foreign'})});
 assert.equal(confirmRestore,null,'foreign-account BB2 cannot reach restore confirmation');
 assert.equal(refusals,1);
 assert.equal(h.ls.getItem('bvom_data'),before,'foreign-account import preserves existing data');
 await upload({...bb2,events:[{type:'FORGED'}]});
 assert.equal(confirmRestore,null,'forged BB2 events fail frozen-ledger validation');
 assert.equal(refusals,2);
 assert.equal(h.ls.getItem('bvom_data'),before);
 await upload({...bb2,activeSessionId:'unfinished'});
 assert.equal(confirmRestore,null,'active BB2 workout cannot be transplanted between devices');
 assert.equal(refusals,3);
 await upload(bb2);
 assert.equal(typeof confirmRestore,'function','valid same-owner BB2 reaches normal restore confirmation');
 confirmRestore();
 assert.deepEqual(JSON.parse(h.ls.getItem('bvom_data')).bb2,bb2,
  'same-account backup carries the complete verified BB2 journal onto this device');
 assert.equal(h.ls.getItem('bvom_pre_restore'),before,
  'successful cross-device import retains a local pre-restore recovery copy');
 console.log('PASS: cross-device BB2 backup import rejects foreign, forged and active data; same-owner restore succeeds');
}

{
 // A legacy cloud restore may replace normal training fields, but never drop
 // the verified BB2 block that is saved on this device. No real cloud access.
 const {h}=fixture();
 const owner='11111111-1111-4111-8111-111111111111';
 const bb2={setup:catalogue.createBB2Setup(),
  opening:catalogue.createBB2Opening({ownerId:owner,blockId:'cloud-preserve'}),
  events:[],sealedBlocks:[],selectedProgram:true,warmupTouched:{local:true}};
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ctx.__bvomBb2LocalForTest=bb2;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'state.bb2=__bvomBb2LocalForTest;window.__bvomAuthUserId="'+owner+'";'+
  'bvomSetLocalOwnerId("'+owner+'");save({durable:true,localOnly:true})');
 const remote=JSON.parse(h.ls.getItem('bvom_data'));delete remote.bb2;
 remote.weights.Squat=77;
 const prepared=await h.ctx.bvomBb2PrepareCloudRestore(remote,owner);
 assert.equal(prepared.weights.Squat,77,'normal BVOM cloud fields are still restored');
 assert.deepEqual(JSON.parse(JSON.stringify(prepared.bb2)),bb2,
  'every local BB2 field survives unchanged, including local warm-up state');
 assert.equal(remote.bb2,undefined,'the remote cloud object is not mutated');
 await assert.rejects(h.ctx.bvomBb2PrepareCloudRestore({...remote,bb2:{}},owner),
  /incompatible BB2/,'an unknown cloud BB2 subtree is never silently merged');
 await assert.rejects(h.ctx.bvomBb2PrepareCloudRestore(remote,
  '22222222-2222-4222-8222-222222222222'),/unsafe local owner/);
 h.ev('state.bb2={...state.bb2,events:[{type:"FORGED"}]}');
 await assert.rejects(h.ctx.bvomBb2PrepareCloudRestore(remote,owner),/BB2/,
  'corrupted local training events cannot be silently carried forward');
 const unclosed={type:'WORKOUT_STARTED',eventId:'cloud-unclosed',commitOrdinal:1,
  blockId:'cloud-preserve',sessionId:'unfinished',templateId:'upper_a',kind:'NORMAL',
  slots:[{roleSlotId:'flat_press',exerciseId:'bench_press',sets:1,floor:6,ceiling:10,
   equipment:'loaded',plannedG:60000,plannedOrigin:{value:'60',unit:'kg'},
   incrementG:2500,incrementOrigin:{value:'2.5',unit:'kg'}}]};
 h.ctx.__bb2UnclosedForTest=[unclosed];
 h.ev('state.bb2={...state.bb2,events:__bb2UnclosedForTest}');
 await assert.rejects(h.ctx.bvomBb2PrepareCloudRestore(remote,owner),/unfinished workout/,
  'an unclosed journal is refused even when activeSessionId was lost');
 h.ev('state.bb2=__bvomBb2LocalForTest');
 // Exercise the actual Settings > Restore from Cloud confirmation callback.
 let restore;
 h.ctx.bvomCloudClient=()=>({from:()=>({select(){return this},eq(){return this},
  order(){return this},async limit(){return {data:[{id:'cloud-row',data:remote}],error:null}}})});
 h.ev('bvomCloud.user={id:"'+owner+'"};bvomCloud.offlineLocalAccess=false');
 h.ctx.bvomChoiceModal=(_title,_body,_cancel,_confirm,_left,right)=>{restore=right};
 h.ev('bvomRestoreCommitAllowed=function(){return true}');
 await h.ctx.bvomCloudRestore();
 assert.equal(typeof restore,'function','valid cloud restore reaches user confirmation');
 restore();
 const persisted=JSON.parse(h.ls.getItem('bvom_data'));
 assert.equal(persisted.weights.Squat,77);
 assert.deepEqual(persisted.bb2,bb2,'real restore persists the original BB2 journal');
 assert.equal(h.ls.getItem('bvom_cloud_restore_baseline'),
  h.ctx.bvomCloudComparableFingerprint(remote),
  'the legacy cloud baseline excludes the locally preserved BB2 ledger');
 assert.deepEqual(JSON.parse(h.ls.getItem('bvom_pre_cloud_restore')).bb2,bb2,
  'the one-step recovery backup still contains BB2');
 console.log('PASS: verified local BB2 survives cloud restore; unknown remote, owner and invalid journals refuse');
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
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,
  /class="sets"><div class="setwrap"><button type="button" class="set /,
  'BB2 uses BB1 round set buttons, not always-visible input rows');
 assert.equal(h.ctx.bvomBb2SetModal(0,0),true,'tap opens BB1-style set entry dialog');
 const dialog=h.lastOverlay(),key='0|0';
 assert.match(dialog.innerHTML,/Actual load \(kg\)/,'BB2 records actual load in shared set dialog');
 dialog.querySelector('[data-bb2-actual="'+key+'"]').value='57.5';
 assert.equal(h.S().timerStart,null,'new working session has no running rest timer');
 dialog.querySelector('[data-bb2-reps="'+key+'"]').value='';
 dialog.querySelector('[data-save]').onclick();
 assert.equal(h.S().bb2.events.length,1,'empty modal input refuses a phantom set');
 assert.equal(h.S().timerStart,null,'rejected set does not start rest timer');
 assert.equal(dialog.removed,false,'invalid input keeps recording dialog open');
 dialog.querySelector('[data-bb2-reps="'+key+'"]').value='8';
 dialog.querySelector('[data-bb2-hard="'+key+'"]').checked=false;
 dialog.querySelector('[data-bb2-actual="'+key+'"]').value='';
 dialog.querySelector('[data-save]').onclick();
 assert.equal(dialog.removed,false,'blank actual load keeps the dialog open');
 assert.equal(h.S().bb2.events.length,1,'blank actual load cannot create a set');
 assert.equal(h.S().timerStart,null,'blank actual load cannot start the timer');
 dialog.querySelector('[data-bb2-actual="'+key+'"]').value='57.5';
 dialog.querySelector('[data-save]').onclick();
 assert.equal(dialog.removed,true,'durable save closes recording dialog');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-set="0\|0"/);
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/class="set done"/);
 assert.equal(h.S().bb2.events.length,2);
 assert.equal(h.S().bb2.events.at(-1).actualG,57500,'actual 57.5 kg preserved instead of 60 kg plan');
 assert.equal(h.S().bb2.events.at(-1).actualOrigin.value,'57.5');
 assert.ok(h.S().timerStart>0,'successful working set starts rest timer');
 assert.equal(JSON.parse(h.ls.getItem('bvom_data')).timerStart,h.S().timerStart,
  'working set and timer start share one durable local save');
 assert.equal(h.ctx.bvomBb2Log(0,0),false,'duplicate set refused');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined,'development record absent from cloud');
 const written=h.ls.getItem('bvom_data');
 h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.bvomBb2Log(0,1),false,'no work can save without owning document');
 assert.equal(h.ls.getItem('bvom_data'),written,'lock refusal leaves disk intact');
 h.ev('bvomWindowLockOwned=true');
 h.ev('delete state.bb2.selectedProgram'); // Older developer sessions predate program selection.
 const restarted=fixture({ls:h.ls});
 assert.equal(restarted.h.S().bb2.activeSessionId,active,'reload retains active BB2 session');
 assert.equal(restarted.h.S().bb2.events.length,2);
 assert.equal(restarted.h.S().bb2.events.at(-1).actualG,57500,
  'reloading preserves the actual off-plan physical weight');
 restarted.h.ctx.location.origin='http://localhost:8000';
 restarted.h.ctx.location.search='?bb2Preview=1';
 restarted.h.ctx.__bb2CatalogueForTest=catalogue;
 restarted.h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest');
 assert.equal(restarted.h.ctx.bvomBb2Discard(),false,'a second simulated tab cannot take over original workout ownership');
 assert.equal(restarted.h.S().bb2.events.length,2,'rejected secondary Discard preserves records');
 assert.equal(h.ctx.bvomBb2Discard(),true,'original owner can Discard with ledger tombstones');
 assert.equal(h.S().bb2.activeSessionId,null);
 assert.equal(h.S().timerStart,null,'Discard stops the rest timer in the same transaction');
 assert.equal(JSON.parse(h.ls.getItem('bvom_data')).timerStart,null,
  'discarded session cannot leave a persisted running timer');
 assert.equal(h.ctx.document.querySelector('#timerbar').classList.contains('idle'),true);
 assert.equal(h.S().bb2.events[0].type,'TOMBSTONE');
 assert.equal(h.S().bb2.events[1].type,'TOMBSTONE');
 assert.equal(h.S().bb2.events.at(-1).type,'WORKOUT_DISCARDED');
 assert.equal(h.S().bb2.selectedProgram,true,'Discard keeps BB2 as selected program');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-next-workout/,
  'after Discard, Workout displays the next BB2 session instead of old LP');
 assert.equal(h.S().history.length,JSON.parse(before).history.length);
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 Start, set, duplicate fence, reload, cloud guard, lock refusal and Discard');
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
  if(field)return field[1]==='hard'?{checked:false}:{value:field[1]==='load'?'60':
   field[1]==='inc'?'2.5':field[1]==='assist'?'none':'8'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 h.ev("state.unit='lb'");
 assert.equal(h.ctx.bvomBb2SetModal(0,0),true);
 const first=h.lastOverlay();
 assert.match(first.innerHTML,/Actual load \(lb\)/);
 first.querySelector('[data-bb2-actual="0|0"]').value=h.ctx.bvomBb2DisplayLoad(60000);
 first.querySelector('[data-bb2-reps="0|0"]').value='8';
 assert.equal(first.querySelector('[data-save]').onclick(),true);
 const inherited=h.S().bb2.events.at(-1);
 assert.equal(inherited.actualG,60000,'unchanged rounded pounds display retains 60,000 canonical grams');
 assert.equal(inherited.actualOrigin.unit,'kg','unchanged pounds input retains kg provenance');
 assert.equal(h.ctx.bvomBb2SetModal(0,1),true);
 recordBB2Dialog(h,0,1,{actual:'127'});
 const changed=h.S().bb2.events.at(-1);
 assert.equal(changed.actualG,catalogue.BB2_BROWSER_MODULES.ledger.canonicalGrams('127','lb'));
 assert.equal(changed.actualOrigin.unit,'lb','a genuinely different actual inherits the entry unit');
 assert.equal(changed.actualOrigin.value,'127');
 console.log('PASS: BB2 modal preserves rounded pounds provenance and records a different actual load');
}

{
 // BB1's remembered ↑/↓ display order now also applies to the four BB2 days.
 // Display order is never a Start event, set identity, progression or cloud edit.
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const f=selector.match(/data-bb2-(load|inc|assist)="[^"]+"/);
  if(f)return {value:f[1]==='load'?'60':f[1]==='inc'?'2.5':'none'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const initial=h.ctx.bvomOrderEffective(),start=h.S().bb2.events[0];
 assert.equal(h.ctx.bvomOrderDayKey(),'bb2:upper_a');
 assert.deepEqual([...initial],start.slots.map(s=>s.roleSlotId),
  'the frozen Start slot order remains the default display sequence');
 const originalJournal=JSON.stringify(h.S().bb2.events),originalCloud=JSON.stringify(h.ctx.bvomCloudPayload());
 const clock=h.S().workoutLastActivityAt,legacyOrder=JSON.stringify(h.S().exerciseDisplayOrder);
 assert.equal(h.ctx.bvomOrderChange(initial[0],-1),false,'first arrow cannot move above top');
 assert.equal(h.ctx.bvomOrderChange(initial[0],1),true,'move first exercise down one position');
 const changed=h.ctx.bvomOrderEffective();
 assert.equal(changed[0],initial[1]);assert.equal(changed[1],initial[0]);
 assert.deepEqual([...h.S().bb2.exerciseDisplayOrder['bb2:upper_a']],[...changed],
  'preference is saved in BB2 state, scoped to Upper A');
 assert.equal(JSON.stringify(h.S().bb2.events),originalJournal,
  'changing the view does not add or edit any frozen ledger events');
 assert.equal(JSON.stringify(h.ctx.bvomCloudPayload()),originalCloud,'display preference is never uploaded');
 assert.equal(JSON.stringify(h.S().exerciseDisplayOrder),legacyOrder,'BB1 order preference is untouched');
 assert.equal(h.S().workoutLastActivityAt,clock,'moving an exercise does not reset the inactivity timer');
 const reopened=fixture({ls:h.ls});
 reopened.h.ctx.location.origin='http://localhost:8000';reopened.h.ctx.location.search='?bb2Preview=1';
 assert.deepEqual([...reopened.h.ctx.bvomOrderEffective()],[...changed],'reload remembers Upper A display order');
 assert.equal(h.ctx.bvomOrderReset(),true,'reset uses the existing BVOM ordering control');
 assert.deepEqual([...h.ctx.bvomOrderEffective()],[...initial],'reset restores canonical Start order');
 assert.equal(JSON.stringify(h.S().bb2.events),originalJournal,'reset has no training effect');
 assert.equal(h.ctx.bvomOrderChange(initial[0],1),true,'custom order can be restored');
 const saved=h.ls.getItem('bvom_data');
 h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.bvomOrderChange(changed[0],1),false,'unowned tab cannot change saved order');
 assert.equal(h.ls.getItem('bvom_data'),saved);
 h.ev('bvomWindowLockOwned=true');
 const oldWrite=h.ls.setItem;
 h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('simulated order-save quota failure');return oldWrite(k,v)};
 assert.equal(h.ctx.bvomOrderChange(changed[0],1),false,'failed local save refuses to move exercise');
 h.ls.setItem=oldWrite;
 assert.deepEqual([...h.ctx.bvomOrderEffective()],[...changed],'failed save rolls memory back');
 assert.equal(h.ls.getItem('bvom_data'),saved,'failed save preserves durable preference');
 h.ev('state.bb2.exerciseDisplayOrder={"bb2:upper_a":["duplicate","duplicate"]}');
 assert.deepEqual([...h.ctx.bvomOrderEffective()],[...initial],'malformed stored order is ignored safely');
 console.log('PASS: BB2 ↑/↓ display order, owner/save rollback, reload, reset and ledger isolation');
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
  if(field)return field[1]==='hard'?{checked:false}:{value:field[1]==='load'?'60':
   field[1]==='inc'?'2.5':field[1]==='assist'?'none':'8'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const sessionId=h.S().bb2.activeSessionId;
 assert.equal(h.ctx.bvomBb2OpenExtra(0),false,'no extra-set entry before any prescribed work');
 assert.equal(h.ctx.bvomBb2Log(0,0),true);
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-extra-add="0"/);
 assert.equal(h.ctx.bvomBb2Log(0,3,true),false,'extra cannot bypass the Add button');
 assert.equal(h.ctx.bvomBb2OpenExtra(0),true);
 assert.match(h.lastOverlay().innerHTML,/data-bb2-reps="0\|3"/);
 const timerBeforeExtra=h.S().timerStart;
 h.ev('state.timerStart=123');
 recordBB2Dialog(h,0,3,{reps:11,extra:true,actual:'56'});
 const extra=h.S().bb2.events.find(e=>e.type==='EXTRA_SET_RECORDED');
 assert.equal(extra.setIndex,3);assert.equal(extra.prescribed,false);
 assert.equal(extra.sessionId,sessionId);
 assert.equal(extra.actualG,56000,'extra set retains its separately entered actual load');
 assert.ok(h.S().timerStart>123&&h.S().timerStart>=timerBeforeExtra,
  'extra set also resets the rest clock');
 assert.equal(h.ctx.bvomBb2Log(0,3,true),false,'duplicate extra ordinal refused');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-extra-done="0\|3"/);
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/1\/12 prescribed sets recorded/,
  'an extra set cannot satisfy the 70% gate');
 const bwSlot=h.S().bb2.events.find(e=>e.type==='WORKOUT_STARTED').slots.findIndex(
  s=>s.equipment==='bodyweight');
 assert.ok(bwSlot>=0,'default BB2 upper template has a qualitative bodyweight option');
 assert.equal(h.ctx.bvomBb2Log(bwSlot,0),true);
 assert.equal(h.ctx.bvomBb2OpenExtra(bwSlot),true);
 const bwStart=h.S().bb2.events.find(e=>e.type==='WORKOUT_STARTED').slots[bwSlot];
 recordBB2Dialog(h,bwSlot,bwStart.sets,{extra:true});
 const bwExtra=h.S().bb2.events.filter(e=>e.type==='EXTRA_SET_RECORDED').at(-1);
 assert.equal(bwExtra.prescribed,false);assert.equal(bwExtra.variation,bwStart.variation);
 assert.equal(bwExtra.assistance,bwStart.assistance);
 for(let n=1;n<30;n++){
  assert.equal(h.ctx.bvomBb2OpenExtra(0),true);
  if(n===1)assert.match(h.lastOverlay().innerHTML,/data-bb2-actual="0\|4" value="56"/,
   'next extra defaults to the previous actual load rather than the 60 kg plan');
  recordBB2Dialog(h,0,3+n,{extra:true});
 }
 assert.equal(h.ctx.bvomBb2OpenExtra(0),false,'BB1-style 30-extra-set limit');
 assert.doesNotMatch(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-extra-add="0"/);
 const reloaded=fixture({ls:h.ls});
 assert.equal(reloaded.h.S().bb2.events.filter(e=>e.type==='EXTRA_SET_RECORDED').length,31,
  'extra numeric and bodyweight sets survive a BVOM document reload');
 assert.equal(h.ctx.bvomBb2End('FINISH'),false,'extras cannot make a below-gate Finish eligible');
 assert.equal(h.ctx.bvomBb2End('INCOMPLETE'),true);
 assert.equal(h.S().timerStart,null,'incomplete Finish clears the rest timer');
 assert.equal(JSON.parse(h.ls.getItem('bvom_data')).timerStart,null);
 const p=catalogue.foldBB2Block(h.S().bb2.opening,h.S().bb2.events);
 assert.equal(p.quotas.upper_a,0);
 assert.equal(p.history[0].validCount,2,'only prescribed sets count');
 assert.equal(p.history[0].sets.filter(s=>!s.prescribed).length,31,
  'all permitted extra sets remain in History');
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/EXTRA SET/,
  'the shared History labels logged extra work');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 numeric/BW extras, 70% isolation, reload and History');
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
  if(field)return field[1]==='hard'?{checked:false}:{value:field[1]==='load'?'60':
   field[1]==='inc'?'2.5':field[1]==='assist'?'none':'8'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 assert.equal(h.ctx.bvomBb2Log(0,0),true);
 assert.equal(h.ctx.bvomBb2OpenExtra(0),true);
 const before=h.S().bb2,raw=h.ls.getItem('bvom_data'),setItem=h.ls.setItem;
 const timerBeforeFailure=h.S().timerStart;
 h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('simulated full local storage');return setItem(k,v)};
 assert.equal(h.ctx.bvomBb2Log(0,3,true),false,'failed extra-set persistence rolls back');
 h.ls.setItem=setItem;
 assert.equal(h.S().timerStart,timerBeforeFailure,'failed durable save cannot start a rest timer');
 assert.equal(h.S().bb2,before);
 assert.equal(h.ls.getItem('bvom_data'),raw);
 assert.equal(h.S().bb2.events.some(e=>e.type==='EXTRA_SET_RECORDED'),false);
 console.log('PASS: failed BB2 extra-set save never creates a phantom set or credit');
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
 const timerBeforeRejectedFinish=h.S().timerStart;
 assert.equal(h.ctx.bvomBb2End('FINISH'),false,'below-70%-threshold Finish is refused');
 assert.equal(h.S().timerStart,timerBeforeRejectedFinish,'rejected Finish cannot cancel rest time');
 assert.equal(h.S().bb2.activeSessionId,id,'failed Finish keeps original active session');
 assert.equal(h.S().bb2.events.length,2,'failed Finish cannot append credit or outcome');
 // Nine distinct prescribed working sets meet the 70% threshold for Upper A (9/12).
 for(const [slot,set] of [[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[3,0]]){
  assert.equal(h.ctx.bvomBb2Log(slot,set),true,'recorded required set '+slot+'/'+set);
 }
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/9\/12 prescribed sets recorded/);
 h.ev('delete state.bb2.selectedProgram'); // Finishing a pre-upgrade BB2 session also selects BB2.
 assert.equal(h.ctx.bvomBb2End('FINISH'),true,'70% Finish succeeds with credit transaction');
 const state=h.S(),bb=state.bb2;
 assert.equal(bb.activeSessionId,null,'active BB2 session closed');
 assert.equal(state.timerStart,null,'successful 70% Finish stops rest clock atomically');
 assert.equal(JSON.parse(h.ls.getItem('bvom_data')).timerStart,null,
  'credited workout and timer clear share one durable local save');
 assert.equal(h.ctx.document.querySelector('#timerbar').classList.contains('idle'),true);
 assert.equal(bb.events.filter(e=>e.type==='WORKOUT_FINISHED').length,1);
 assert.equal(bb.events.filter(e=>e.type==='CREDIT_GRANTED').length,1,'exactly one credit earned');
 assert.equal(bb.selectedProgram,true,'Finish preserves the BB2 selected program');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-next-workout/,
  'after Finish, Workout remains on BB2 next-workout entry');
 assert.match(h.ctx.document.querySelector('#warmup').innerHTML,/BODYBUILDING 2 · WARM-UP/,
  'after Finish, Warm-up does not accidentally show previous-program lifts');
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
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 const editSaveButton={disabled:false};
 h.ctx.document.querySelector=selector=>{
  if(selector==='#workout [data-bb2-edit-save="0"]')return editSaveButton;
  const hit=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(hit){
   if(hit[1]==='hard')return {checked:false};
   return {value:hit[1]==='load'?'60':hit[1]==='inc'?'2.5':hit[1]==='reps'?'8':'none'};
  }
  return query(selector);
 };
 const edit=(weight,increment)=>{
  if(!h.ctx.bvomBb2EditWorkingLoad(0))return false;
  const dlg=h.lastOverlay();
  for(const [field,value] of [['weight',weight],['increment',increment]]){
   const input=dlg.querySelector('[data-bb-'+field+']');
   if(value!==undefined)input.value=String(value);
   else input.value=dlg.innerHTML.match(new RegExp('data-bb-'+field+'[^>]*value="([^"]*)"'))?.[1]??'';
  }
  dlg.querySelector('[data-save]').onclick();return true;
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const id=h.S().bb2.activeSessionId;
 const first=h.S().bb2.events[0].slots[0];
 assert.equal(first.plannedG,60000);
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/First eligible exposure calibrates/);
 assert.equal(edit('65'),true,'untouched working weight can be edited');
 let events=h.S().bb2.events;
 assert.equal(events.length,2);
 assert.equal(events[1].type,'PRESCRIPTION_EDITED');
 assert.equal(events[1].scope,'GLOBAL','pre-lock edit survives session Discard');
 assert.equal(events[1].loadG,65000);
 assert.equal(events[0].slots[0].plannedG,60000,'immutable Start plan survives edit');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/65 kg/);
 assert.match(h.ctx.document.querySelector('#warmup').innerHTML,/Working: 65 kg/);
 const started=h.S().bb2.events[0],role=catalogue.getBB2TemplatePrescription(h.S().bb2.setup,started.templateId).slots[0];
 const current=h.ctx.bvomBb2WorkingSlot(started.slots[0],h.S().bb2.events,id);
 const prep=h.ctx.bvomBb2WarmupPlan(current,role),warmKey=h.ctx.bvomBb2WarmupKey(id,current,prep);
 const historyBefore=JSON.stringify(h.S().history),cloudBefore=JSON.stringify(h.ctx.bvomCloudPayload());
 assert.equal(edit(undefined,'1'),true,'same Edit Weight dialog can change only the increment');
 events=h.S().bb2.events;
 assert.equal(events.length,3);
 assert.equal(events[2].type,'INCREMENT_EDITED');
 assert.equal(events[2].incrementG,1000);
 assert.equal(events[2].scope,'GLOBAL');
 assert.equal(h.ctx.bvomBb2WorkingSlot(started.slots[0],events,id).plannedG,65000);
 assert.equal(JSON.stringify(h.S().history),historyBefore,'increment edit retains History');
 assert.equal(JSON.stringify(h.ctx.bvomCloudPayload()),cloudBefore,'BB2 edits do not reach cloud');
 const currentAfter=h.ctx.bvomBb2WorkingSlot(started.slots[0],events,id);
 assert.deepEqual(h.ctx.bvomBb2WarmupPlan(currentAfter,role),prep);
 assert.equal(h.ctx.bvomBb2WarmupKey(id,currentAfter,prep),warmKey,
  'increment-only change preserves the warm-up plan and tick identity');
 const feederStart=started.slots[1],feederRole=catalogue.getBB2TemplatePrescription(h.S().bb2.setup,started.templateId).slots[1];
 const feederBefore=h.ctx.bvomBb2WarmupPlan(feederStart,feederRole);
 assert.deepEqual(h.ctx.bvomBb2WarmupPlan({...feederStart,incrementG:1000},feederRole),feederBefore,
  'BB2 FEEDER preparation also retains its original in-block rounding grid');
 assert.equal(h.ctx.bvomBb2DisplayLoad(33500),'33.5','canonical 32.5 + 1 displays exactly 33.5 kg');
 const rawBeforeValidation=h.ls.getItem('bvom_data');
 assert.equal(h.ctx.bvomBb2EditWorkingLoad(0),true);
 const invalidDialog=h.lastOverlay(),weightInput=invalidDialog.querySelector('[data-bb-weight]'),
  incInput=invalidDialog.querySelector('[data-bb-increment]');
 weightInput.value='65';
 for(const invalid of ['', '0', '0.001', '10.001', '11']){
  incInput.value=invalid;invalidDialog.querySelector('[data-save]').onclick();
  assert.equal(h.ls.getItem('bvom_data'),rawBeforeValidation,'invalid increment must not save: '+invalid);
 }
 invalidDialog.querySelector('[data-cancel]').onclick();
 assert.equal(edit(),true,'unchanged edit is an idempotent no-op');
 assert.equal(h.S().bb2.events.length,3);
 h.ev("state.unit='lb'");
 assert.equal(edit(),true,
  'resubmitting unchanged rounded pounds cannot create a false load change');
 assert.equal(h.S().bb2.events.length,3,'unit display round-trip preserves grams and epoch');
 h.ev("state.unit='kg'");
 const saved=h.ls.getItem('bvom_data');
 h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.bvomBb2EditWorkingLoad(0),false,'non-owner edit refused');
 assert.equal(h.ls.getItem('bvom_data'),saved);
 h.ev('bvomWindowLockOwned=true');
 assert.equal(h.ctx.bvomBb2WarmupMark(0,0),true);
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
 assert.ok(h.S().bb2.events.some(e=>e.type==='INCREMENT_EDITED'&&e.incrementG===1000),
  'independent increment edit also survives discarded session');
 assert.equal(h.S().history.length,JSON.parse(before).history.length);
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 pre-lock load edit, warm-up refresh, actual inheritance, lock and discard');
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
  const hit=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(hit)return hit[1]==='hard'?{checked:false}:
   {value:hit[1]==='load'?'60':hit[1]==='inc'?'2.5':hit[1]==='assist'?'none':'8'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 const dialog=(i,weight,increment)=>{
  assert.equal(h.ctx.bvomBb2EditWorkingLoad(i),true);
  const o=h.lastOverlay();
  o.querySelector('[data-bb-weight]').value=weight;
  o.querySelector('[data-bb-increment]').value=increment;
  return o;
 };
 const combined=dialog(0,'62.5','1');combined.querySelector('[data-save]').onclick();
 const b=h.S().bb2,sid=b.activeSessionId,events=b.events;
 assert.equal(events.at(-2).type,'PRESCRIPTION_EDITED');
 assert.equal(events.at(-2).loadG,62500);
 assert.equal(events.at(-1).type,'INCREMENT_EDITED');
 assert.equal(events.at(-1).incrementG,1000);
 assert.equal(events.at(-1).commitOrdinal,events.at(-2).commitOrdinal+1);
 const reload=fixture({ls:h.ls});
 const start=events[0],savedSlot=h.ctx.bvomBb2WorkingSlot(start.slots[0],events,sid);
 assert.equal(savedSlot.plannedG,62500);
 assert.equal(savedSlot.incrementG,1000);
 assert.equal(reload.h.S().bb2.events.at(-1).incrementG,1000,'combined edit survives reload');
 const stale=dialog(1,'65','1');
 assert.equal(h.ctx.bvomBb2Log(1,0),true,'another working-set action advances the journal');
 const saved=h.ls.getItem('bvom_data');
 stale.querySelector('[data-save]').onclick();
 assert.equal(h.ls.getItem('bvom_data'),saved,'stale modal cannot overwrite newer sets');
 stale.querySelector('[data-cancel]').onclick();
 const refused=dialog(2,'65','1'),raw=h.ls.getItem('bvom_data'),memory=JSON.stringify(h.S());
 const write=h.ls.setItem;
 h.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('simulated full local storage');return write(key,value)};
 try{refused.querySelector('[data-save]').onclick()}finally{h.ls.setItem=write}
 assert.equal(h.ls.getItem('bvom_data'),raw,'failed two-field save is not partially persisted');
 assert.equal(JSON.stringify(h.S()),memory,'failed save rolls back the in-memory document');
 assert.equal(h.S().history.length,JSON.parse(before).history.length,'legacy History unchanged');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined,'no draft data reaches normal cloud payload');
 console.log('PASS: BB2 combined Edit Weight save, stale dialog and quota-failure rollback');
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
  if(hit)return {value:hit[1]==='load'?'60':hit[1]==='inc'?'12.5':'none'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true,'older BB2 setup can use an increment above 10');
 assert.equal(h.ctx.bvomBb2EditWorkingLoad(0),true);
 const dlg=h.lastOverlay();
 dlg.querySelector('[data-bb-weight]').value='65';
 dlg.querySelector('[data-bb-increment]').value='12.50';
 dlg.querySelector('[data-save]').onclick();
 const b=h.S().bb2,start=b.events[0],slot=h.ctx.bvomBb2WorkingSlot(start.slots[0],b.events,b.activeSessionId);
 assert.equal(slot.plannedG,65000,'weight-only editing still works with an unchanged inherited increment');
 assert.equal(slot.incrementG,12500,'unchanged increment retains canonical grams');
 assert.equal(b.events.length,2,'weight edit does not emit a phantom increment event');
 assert.equal(b.events[1].type,'PRESCRIPTION_EDITED');
 console.log('PASS: BB2 weight-only edit preserves inherited increments outside the new edit range');
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
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-set="3\|0"/);
 assert.equal(h.ctx.bvomBb2SetModal(i,0),true);
 assert.match(h.lastOverlay().innerHTML,/Actual variation/);
 assert.match(h.lastOverlay().innerHTML,/Added weight \(optional\)/);
 h.lastOverlay().querySelector('[data-cancel]').onclick();
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

{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;h.ctx.__bb2Correction={reps:'7',hard:true,actual:'60'};
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  if(selector==='#history [data-bb2-correct-reps="0|0"]')return {value:h.ctx.__bb2Correction.reps};
  if(selector==='#history [data-bb2-correct-hard="0|0"]')return {checked:h.ctx.__bb2Correction.hard};
  if(selector==='#history [data-bb2-correct-actual="0|0"]')return {value:h.ctx.__bb2Correction.actual};
  const field=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(field)return {value:field[1]==='load'?'60':field[1]==='inc'?'2.5':
   field[1]==='assist'?'none':'8',checked:false};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 for(const [i,j] of [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[3,0]]){
  assert.equal(h.ctx.bvomBb2Log(i,j),true);
 }
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),false,'active BB2 workout cannot retrospectively correct');
 assert.equal(h.ctx.bvomBb2End('FINISH'),true);
 const original=h.S().bb2.events.find(e=>e.type==='SET_RECORDED');
 const persisted=h.ls.getItem('bvom_data');
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/data-bb2-correct-save="0\|0"/);
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/data-bb2-correct-actual="0\|0"/);
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/class="warmrow bb2HistoryCorrection"/,
  'BB2 History correction uses its own responsive row instead of generic warm-up grid');
 h.ctx.__bb2Correction.reps='0';
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),false,'invalid zero-rep edit refused');
 assert.equal(h.ls.getItem('bvom_data'),persisted,'invalid edit cannot write');
 h.ctx.__bb2Correction.reps='7';
 h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),false,'non-owner refused');
 assert.equal(h.ls.getItem('bvom_data'),persisted);
 h.ev('bvomWindowLockOwned=true');
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),true,'post-Finish correction committed');
 let bb=h.S().bb2,correct=bb.events.at(-1),projection=catalogue.foldBB2Block(bb.opening,bb.events);
 assert.equal(correct.type,'SET_CORRECTED');
 assert.equal(correct.targetEventId,original.eventId,'targets immutable original event ID');
 assert.equal(correct.reps,7);assert.equal(correct.harderThanIntended,true);
 assert.equal(projection.history[0].sets[0].reps,7);
 assert.equal(projection.history[0].sets[0].actualG,original.actualG,'original mass retained');
 assert.equal(projection.history[0].sets[0].actualOrigin.value,original.actualOrigin.value);
 assert.equal(projection.quotas.upper_a,1,'credit never silently moved');
 assert.equal(bb.events.filter(e=>e.type==='CREDIT_GRANTED').length,1);
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),true,'unchanged input is idempotent');
 assert.equal(h.S().bb2.events.length,correct.commitOrdinal);
 h.ctx.__bb2Correction.actual='61.5';
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),true,'actual-only History correction committed');
 bb=h.S().bb2;correct=bb.events.at(-1);projection=catalogue.foldBB2Block(bb.opening,bb.events);
 assert.equal(correct.reps,7);
 assert.equal(correct.actualG,61500);
 assert.deepEqual(JSON.parse(JSON.stringify(correct.actualOrigin)),{value:'61.5',unit:'kg'});
 assert.equal(projection.history[0].sets[0].actualG,61500);
 assert.equal(projection.history[0].sets[0].variation,undefined,'load correction does not invent a variation');
 assert.equal(projection.quotas.upper_a,1,'load correction cannot silently change quota');
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),true,'same corrected mass does not append');
 assert.equal(h.S().bb2.events.length,correct.commitOrdinal);
 h.ev("state.unit='lb'");
 const displayLb=h.ctx.bvomBb2DisplayLoad(61500);
 h.ctx.__bb2Correction.actual=displayLb;
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),true,'rounded unchanged lb display is a no-op');
 assert.equal(h.S().bb2.events.length,correct.commitOrdinal,'rounded lb input retains exact kg provenance');
 h.ctx.__bb2Correction.actual=String(Number(displayLb)+1);
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),true,'real pound-unit actual correction commits');
 bb=h.S().bb2;correct=bb.events.at(-1);
 assert.equal(correct.actualOrigin.unit,'lb');
 assert.equal(correct.actualOrigin.value,h.ctx.__bb2Correction.actual);
 assert.equal(correct.actualG,catalogue.BB2_BROWSER_MODULES.ledger.canonicalGrams(correct.actualOrigin.value,'lb'));
 assert.equal(catalogue.foldBB2Block(bb.opening,bb.events).history[0].sets[0].actualG,correct.actualG);
 h.ev("state.unit='kg'");
 h.ctx.__bb2Correction.actual=h.ctx.bvomBb2DisplayLoad(correct.actualG);
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),true,'rounded kg display retains original lb provenance');
 assert.equal(h.S().bb2.events.length,correct.commitOrdinal,'round-trip display is a no-op');
 h.ctx.__bb2Correction.actual='-2';
 const beforeInvalid=h.ls.getItem('bvom_data');
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),false,'negative actual refused');
 h.ctx.__bb2Correction.actual='';
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),false,'blank actual refused');
 assert.equal(h.ls.getItem('bvom_data'),beforeInvalid,'invalid mass cannot write');
 h.ctx.__bb2Correction.actual=h.ctx.bvomBb2DisplayLoad(correct.actualG);
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/7 reps/,'History rerenders corrected set');
 h.ctx.__bb2Correction.reps='6';
 const success=h.ls.getItem('bvom_data'),setItem=h.ls.setItem;
 h.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('simulated disk full');return setItem(key,value)};
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),false,'failed durable History correction refused');
 h.ls.setItem=setItem;
 assert.equal(h.ls.getItem('bvom_data'),success,'failed correction leaves disk intact');
 assert.equal(h.S().bb2.events.at(-1).type,'SET_CORRECTED','failed correction rolls back memory');
 const reboot=fixture({ls:h.ls});
 const restored=catalogue.foldBB2Block(reboot.h.S().bb2.opening,reboot.h.S().bb2.events).history[0].sets[0];
 assert.equal(restored.reps,7,'rep correction survives reload/replay');
 assert.equal(restored.actualG,correct.actualG,'actual mass correction survives reload/replay');
 assert.equal(restored.actualOrigin.unit,'lb','pound-origin evidence survives reload/replay');
 assert.equal(h.S().history.length,JSON.parse(before).history.length,'BB1 and legacy History untouched');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined,'no BB2 correction cloud upload');
 console.log('PASS: BB2 post-Finish History correction, replay, idempotence, lock and failed-save rollback');
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
  const field=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(field)return {value:field[1]==='load'?'60':field[1]==='inc'?'2.5':
   field[1]==='assist'?'none':'8',checked:false};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 for(const [i,j] of [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[3,0]])
  assert.equal(h.ctx.bvomBb2Log(i,j),true);
 assert.equal(h.ctx.bvomBb2VoidSet(0,8),false,'cannot void an active workout set');
 assert.equal(h.ctx.bvomBb2End('FINISH'),true);
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/data-bb2-void-save="0\|8"/);
 const beforeVoid=h.ls.getItem('bvom_data'),events=h.S().bb2.events;
 h.ctx.confirm=()=>false;
 assert.equal(h.ctx.bvomBb2VoidSet(0,8),false,'cancelled destructive action does not write');
 assert.equal(h.ls.getItem('bvom_data'),beforeVoid);
 h.ctx.confirm=()=>true;
 h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.bvomBb2VoidSet(0,8),false,'non-owner cannot void credit-bearing set');
 assert.equal(h.ls.getItem('bvom_data'),beforeVoid);
 h.ev('bvomWindowLockOwned=true');
 assert.equal(h.ctx.bvomBb2VoidSet(0,8),true,'void and revoke in a single durable transaction');
 const bb=h.S().bb2,projection=catalogue.foldBB2Block(bb.opening,bb.events);
 assert.equal(bb.events.length,events.length+2,'void and credit revoke are paired');
 assert.deepEqual(bb.events.slice(-2).map(e=>e.type),['SET_VOIDED','CREDIT_REVOKED']);
 assert.equal(bb.events.at(-2).targetEventId,events.filter(e=>e.type==='SET_RECORDED').at(-1).eventId);
 assert.equal(bb.events.at(-1).creditId,events.find(e=>e.type==='CREDIT_GRANTED').creditId);
 assert.equal(projection.history[0].status,'INCOMPLETE_CORRECTED');
 assert.equal(projection.history[0].validCount,8);
 assert.equal(projection.history[0].creditId,null);
 assert.equal(projection.quotas.upper_a,0,'quota is revised, never left as unearned credit');
 const first=events.find(e=>e.type==='WORKOUT_STARTED').slots[0];
 assert.equal(projection.progress['upper_a|'+first.roleSlotId+'|'+first.exerciseId]?.calibrated??false,false,
  'credit-revoking correction also retracts its progression and calibration evidence');
 assert.equal(h.ctx.bvomBb2VoidSet(0,8),false,'removed set cannot be voided twice');
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/8\/12 prescribed sets/);
 assert.doesNotMatch(h.ctx.document.querySelector('#history').innerHTML,/Credit awarded/);
 const persisted=h.ls.getItem('bvom_data'),setItem=h.ls.setItem;
 h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('simulated failed History write');return setItem(k,v)};
 assert.equal(h.ctx.bvomBb2VoidSet(0,7),false,'failed subsequent void leaves the ledger intact');
 h.ls.setItem=setItem;
 assert.equal(h.ls.getItem('bvom_data'),persisted);
 assert.equal(h.S().bb2.events.length,bb.events.length);
 const reboot=fixture({ls:h.ls});
 assert.equal(catalogue.foldBB2Block(reboot.h.S().bb2.opening,reboot.h.S().bb2.events).quotas.upper_a,0);
 assert.equal(h.S().history.length,JSON.parse(before).history.length,'legacy History is untouched');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined,'BB2 void remains local-only');
 console.log('PASS: BB2 credit-revoking set void, confirmation, rollback, reload and ownership');
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
 for(const [i,j] of [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[3,0],[3,1]])
  assert.equal(h.ctx.bvomBb2Log(i,j),true);
 assert.equal(h.ctx.bvomBb2End('FINISH'),true);
 const initial=h.S().bb2.events.length;
 assert.equal(h.ctx.bvomBb2VoidSet(0,9),true,'void above 70% is allowed without credit revocation');
 const b=h.S().bb2,p=catalogue.foldBB2Block(b.opening,b.events);
 assert.equal(b.events.length,initial+1);
 assert.equal(b.events.at(-1).type,'SET_VOIDED');
 assert.equal(p.quotas.upper_a,1);
 assert.equal(p.history[0].status,'COMPLETED_NORMAL');
 assert.equal(p.history[0].validCount,9);
 console.log('PASS: BB2 above-threshold set void retains exactly one earned credit');
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
  const field=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(field)return {value:field[1]==='load'?'60':field[1]==='inc'?'2.5':
   field[1]==='assist'?'none':'8',checked:false};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 for(const [i,j] of [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[3,0]])
  assert.equal(h.ctx.bvomBb2Log(i,j),true);
 assert.equal(h.ctx.bvomBb2VoidSession(0),false,'cannot retrospectively void while a workout is active');
 assert.equal(h.ctx.bvomBb2End('FINISH'),true);
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/data-bb2-void-session="0"/);
 const original=h.S().bb2,raw=h.ls.getItem('bvom_data');
 h.ctx.confirm=()=>false;
 assert.equal(h.ctx.bvomBb2VoidSession(0),false,'cancelled workout removal writes nothing');
 assert.equal(h.ls.getItem('bvom_data'),raw);
 h.ctx.confirm=()=>{h.ev('bvomWindowLockOwned=false');return true};
 assert.equal(h.ctx.bvomBb2VoidSession(0),false,'window-owner change during confirmation aborts removal');
 h.ev('bvomWindowLockOwned=true');
 assert.equal(h.ls.getItem('bvom_data'),raw);
 h.ctx.confirm=()=>true;
 assert.equal(h.ctx.bvomBb2VoidSession(0),true,'credited workout removal atomically revokes its credit');
 const bb=h.S().bb2,p=catalogue.foldBB2Block(bb.opening,bb.events);
 assert.deepEqual(bb.events.slice(-2).map(e=>e.type),['SESSION_VOIDED','CREDIT_REVOKED']);
 assert.equal(bb.events.at(-1).creditId,original.events.find(e=>e.type==='CREDIT_GRANTED').creditId);
 assert.equal(p.history[0].status,'VOID');
 assert.equal(p.history[0].creditId,null);
 assert.equal(p.quotas.upper_a,0);
 assert.deepEqual(p.progress,{},'voided only qualifying workout retracts its progression evidence');
 assert.equal(h.ctx.bvomBb2VoidSession(0),false,'already removed session is not offered twice');
 assert.doesNotMatch(h.ctx.document.querySelector('#history').innerHTML,/data-bb2-history=/);
 const reboot=fixture({ls:h.ls}),replay=catalogue.foldBB2Block(reboot.h.S().bb2.opening,reboot.h.S().bb2.events);
 assert.equal(replay.history[0].status,'VOID');assert.equal(replay.quotas.upper_a,0);
 assert.equal(h.S().history.length,JSON.parse(before).history.length,'BB1 and ordinary History remain untouched');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: credited BB2 workout removal revokes quota atomically, replays and guards ownership/save');
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
  const field=selector.match(/data-bb2-(load|inc|assist)="([^"]+)"/);
  if(field)return {value:field[1]==='load'?'60':field[1]==='inc'?'2.5':'none'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 assert.equal(h.ctx.bvomBb2End('INCOMPLETE'),true);
 const initial=h.S().bb2.events.length;
 h.ctx.confirm=()=>true;
 assert.equal(h.ctx.bvomBb2VoidSession(0),true,'saved incomplete workout can be removed without a credit');
 assert.equal(h.S().bb2.events.length,initial+1);
 assert.equal(h.S().bb2.events.at(-1).type,'SESSION_VOIDED');
 const p=catalogue.foldBB2Block(h.S().bb2.opening,h.S().bb2.events);
 assert.equal(p.history[0].status,'VOID');assert.equal(p.quotas.upper_a,0);
 console.log('PASS: incomplete BB2 workout removal has no fabricated quota revocation');
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
  const field=selector.match(/data-bb2-(load|inc|assist)="([^"]+)"/);
  if(field)return {value:field[1]==='load'?'60':field[1]==='inc'?'2.5':'none'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 assert.equal(h.ctx.bvomBb2End('INCOMPLETE'),true);
 const old=h.S().bb2,raw=h.ls.getItem('bvom_data'),setItem=h.ls.setItem;
 h.ctx.confirm=()=>true;
 h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('simulated failed workout void');return setItem(k,v)};
 assert.equal(h.ctx.bvomBb2VoidSession(0),false,'failed local storage blocks historical workout void');
 h.ls.setItem=setItem;
 assert.equal(h.ls.getItem('bvom_data'),raw,'persisted incomplete workout is untouched');
 assert.equal(h.S().bb2,old,'in-memory journal rolls back to the last durable BB2 state');
 assert.equal(catalogue.foldBB2Block(old.opening,old.events).history[0].status,'INCOMPLETE');
 console.log('PASS: BB2 workout removal failed-save rollback keeps the complete journal');
}

{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 let query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  if(/data-bb2-bw-variation="\d+"/.test(selector))return {value:'pullup'};
  const field=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(field)return {value:field[1]==='load'?'60':field[1]==='inc'?'2.5':
   field[1]==='assist'?'none':'8',checked:false};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 for(const [i,j] of [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[3,0]])
  assert.equal(h.ctx.bvomBb2Log(i,j),true);
 assert.equal(h.ctx.bvomBb2End('FINISH'),true);
 const credited=h.S().bb2,initial=catalogue.foldBB2Block(credited.opening,credited.events);
 h.ev('bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup(state.bb2.setup);'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewSaved=true;bvomBb2PreviewOriginalMode=state.programMode');
 h.ctx.bvomBb2ChooseKind('RECOVERY');
 const startHtml=h.ctx.document.querySelector('#setup').innerHTML;
 assert.match(startHtml,/data-bb2-kind="RECOVERY"/);
 assert.match(startHtml,/data-bb2-load="0" value="55"/,'90% load rounds to the established 2.5 kg increment');
 assert.match(startHtml,/2 × 6–10 reps/,'half working sets preserve exercise rep range');
 assert.equal(h.ctx.bvomBb2Begin(),true,'recovery can start explicitly');
 const b=h.S().bb2,start=b.events.find(e=>e.sessionId===b.activeSessionId&&e.type==='WORKOUT_STARTED');
 assert.equal(start.kind,'RECOVERY');
 assert.deepEqual(start.slots.map(s=>s.sets),[2,2,1,1,1], '3→2 and 2→1 recovery counts');
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/LOW-STRESS RECOVERY/);
 assert.doesNotMatch(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-trial-save/,
  'recovery does not offer first-exposure calibration');
 assert.equal(h.ctx.bvomBb2Log(0,0),true);
 assert.equal(h.ctx.bvomBb2End('FINISH'),true);
 const after=catalogue.foldBB2Block(h.S().bb2.opening,h.S().bb2.events);
 assert.equal(after.history.at(-1).status,'LOW_STRESS_RECOVERY');
 assert.equal(after.history.at(-1).creditId,null);
 assert.deepEqual(after.quotas,initial.quotas,'recovery never earns quota');
 assert.deepEqual(after.progress,initial.progress,'recovery never changes normal progression');
 assert.deepEqual(after.pending,initial.pending,'recovery does not consume normal decisions');
 assert.equal(h.S().history.length,JSON.parse(before).history.length);
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: optional half-volume recovery preserves normal prescription, quota and calibration');
}

{
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const opening=catalogue.createBB2Opening({ownerId:'bb2-test-owner',blockId:'bb2-pending-test',
  progress:{'upper_a|flat_press|bench_press':{loadG:60000,loadOrigin:{value:'60',unit:'kg'},
   incrementG:2500,incrementOrigin:{value:'2.5',unit:'kg'},calibrated:true,bestReps:7}}});
 const slots=[{roleSlotId:'flat_press',exerciseId:'bench_press',sets:1,floor:6,ceiling:10,
  equipment:'loaded',plannedG:60000,plannedOrigin:{value:'60',unit:'kg'},
  incrementG:2500,incrementOrigin:{value:'2.5',unit:'kg'}}];
 const events=[
  {type:'WORKOUT_STARTED',eventId:'p-start',commitOrdinal:1,blockId:opening.blockId,
   sessionId:'p-session',templateId:'upper_a',kind:'NORMAL',slots},
  {type:'SET_RECORDED',eventId:'p-set',commitOrdinal:2,blockId:opening.blockId,
   sessionId:'p-session',roleSlotId:'flat_press',exerciseId:'bench_press',setIndex:0,
   reps:8,prescribed:true,actualG:55000,actualOrigin:{value:'55',unit:'kg'}},
  {type:'WORKOUT_FINISHED',eventId:'p-finish',commitOrdinal:3,blockId:opening.blockId,sessionId:'p-session'},
  {type:'CREDIT_GRANTED',eventId:'p-credit',commitOrdinal:4,blockId:opening.blockId,sessionId:'p-session',creditId:'p-credit-id'}
 ];
 const initial=catalogue.foldBB2Block(opening,events);
 assert.equal(initial.pending['upper_a|flat_press|bench_press'].kind,'OFF_PLAN');
 h.ctx.__seedOpening=opening;h.ctx.__seedEvents=events;
 h.ev('state.bb2={...state.bb2,opening:__seedOpening,events:__seedEvents};'+
  'bvomBb2PreviewSaved=true;bvomBb2RenderPreview()');
 assert.match(h.ctx.document.querySelector('#setup').innerHTML,/data-bb2-choice-accept="0"/);
 assert.equal(h.ctx.bvomBb2ResolveChoice(0,'ACCEPT'),true,'explicit off-plan acceptance uses actual 55 kg origin');
 const committed=h.S().bb2,replay=catalogue.foldBB2Block(committed.opening,committed.events);
 assert.equal(committed.events.at(-1).type,'CHOICE_RESOLVED');
 assert.equal(committed.events.at(-1).loadG,55000);
 assert.deepEqual(committed.events.at(-1).loadOrigin,{value:'55',unit:'kg'});
 assert.deepEqual(replay.pending,{});
 assert.equal(replay.progress['upper_a|flat_press|bench_press'].loadG,55000);
 assert.equal(h.ctx.bvomBb2ResolveChoice(0,'ACCEPT'),false,'resolved choice cannot be repeated');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 // Correcting the source of a later ACCEPT cannot silently preserve or erase
 // that choice. The explicit KEEP consent and correction commit in one save.
 const lookup=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  if(/data-bb2-correct-reps="0\|0"/.test(selector))return {value:'8'};
  if(/data-bb2-correct-hard="0\|0"/.test(selector))return {checked:true};
  if(/data-bb2-correct-actual="0\|0"/.test(selector))return {value:'55'};
  return lookup(selector);
 };
 h.ev('bvomChoiceModal=function(title,body,left,right,onLeft,onRight){'+
  'globalThis.__bb2CorrectionDialog={title,body,onLeft,onRight};'+
  'return {querySelector:selector=>({value:selector.includes("consent-mode")?"KEEP_AS_MANUAL":""})}}');
 const uncorrected=h.ls.getItem('bvom_data');
 assert.equal(h.ctx.bvomBb2CorrectSet(0,0),true,'correction requiring consent opens decision UI');
 assert.match(h.ctx.__bb2CorrectionDialog.body,/Keep previous choice as a manual setting/);
 assert.equal(h.ls.getItem('bvom_data'),uncorrected,'no correction or consent written before explicit confirmation');
 assert.equal(h.ctx.__bb2CorrectionDialog.onLeft(),true,'cancel has no side effects');
 assert.equal(h.ls.getItem('bvom_data'),uncorrected);
 h.ev('bvomWindowLockOwned=false');
 assert.equal(h.ctx.__bb2CorrectionDialog.onRight(),false,'stale ownership refuses consent');
 h.ev('bvomWindowLockOwned=true');
 assert.equal(h.ls.getItem('bvom_data'),uncorrected);
 assert.equal(h.ctx.__bb2CorrectionDialog.onRight(),true);
 const corrected=h.S().bb2,afterCorrection=catalogue.foldBB2Block(corrected.opening,corrected.events);
 assert.deepEqual(corrected.events.slice(-2).map(e=>e.type),['SET_CORRECTED','CHOICE_RECLASSIFIED']);
 assert.equal(corrected.events.at(-1).targetEventId,committed.events.at(-1).eventId);
 assert.equal(corrected.events.at(-1).decision,'KEEP_AS_MANUAL');
 assert.deepEqual(afterCorrection.requiredConsent,[]);
 assert.equal(afterCorrection.quotas.upper_a,1,'explicit historical consent cannot fabricate quota');
 console.log('PASS: actual-load choice is explicit, one-shot, saved and retains canonical origin');
}

{
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const owner=h.ls.getItem('bvom_data_owner')||'bb2-test-owner',opening={
  ...catalogue.createBB2Opening({ownerId:owner,blockId:'bb2-complete-block',
   progress:{'upper_a|flat_press|bench_press':{
    loadG:100000,loadOrigin:{value:'100',unit:'kg'},incrementG:2500,
    incrementOrigin:{value:'2.5',unit:'kg'},calibrated:true,bestReps:8,
    stallCount:0,epochId:'carry-forward'}}}),
  selections:{...h.S().bb2.setup.selections}},events=[];
 const days=['upper_a','lower_a','upper_b','lower_b'];
 for(const day of days)for(let i=0;i<8;i++){
  const sessionId=day+'-'+i;
  const add=(type,fields)=>events.push({type,eventId:'event-'+(events.length+1),
   commitOrdinal:events.length+1,blockId:opening.blockId,...fields});
  const slot={roleSlotId:'synthetic_role',exerciseId:'synthetic_lift',sets:1,floor:6,ceiling:10,
   equipment:'loaded',plannedG:60000,plannedOrigin:{value:'60',unit:'kg'},
   incrementG:2500,incrementOrigin:{value:'2.5',unit:'kg'}};
  add('WORKOUT_STARTED',{sessionId,templateId:day,kind:'NORMAL',slots:[slot]});
  add('SET_RECORDED',{sessionId,roleSlotId:slot.roleSlotId,exerciseId:slot.exerciseId,
   setIndex:0,reps:6,prescribed:true,actualG:60000,actualOrigin:{value:'60',unit:'kg'}});
  add('WORKOUT_FINISHED',{sessionId});add('CREDIT_GRANTED',{sessionId,creditId:'credit-'+sessionId});
 }
 const before=catalogue.foldBB2Block(opening,events);
 assert.deepEqual(Object.values(before.quotas),[8,8,8,8]);
 h.ctx.__seedOpening=opening;h.ctx.__seedEvents=events;
 h.ev('state.bb2={...state.bb2,opening:__seedOpening,events:__seedEvents};'+
  'bvomBb2PreviewSaved=true;bvomBb2RenderPreview()');
 assert.match(h.ctx.document.querySelector('#setup').innerHTML,/data-bb2-next-block/);
 const raw=h.ls.getItem('bvom_data');
 const oldChoice=h.S().bb2.setup.selections['upper_a|shoulder_press'];
 h.ctx.bvomBb2PreviewChoose('upper_a','shoulder_press','log_push_press');
 assert.equal(h.S().bb2.setup.selections['upper_a|shoulder_press'],oldChoice,
  'full block chooser cannot silently rewrite the completed setup');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true,'unchanged completed setup is an idempotent no-op');
 assert.equal(h.ls.getItem('bvom_data'),raw,'ordinary Save cannot rewrite the finished block');
 assert.equal(h.ctx.bvomBb2NextBlock(),true,'full quota opens next-block review, not a seal');
 const reviewMarkup=h.ctx.document.querySelector('#setup').innerHTML;
 assert.match(reviewMarkup,/data-bb2-next-commit/);
 assert.match(reviewMarkup,/data-bb2-next-load="upper_a\|flat_press\|bench_press" value="100"/,
  'completed block working load is prefilled in the existing setup screen');
 assert.match(reviewMarkup,/data-bb2-next-increment="upper_a\|flat_press\|bench_press" value="2.5"/,
  'completed block increment is prefilled without rounding');
 assert.equal(h.S().bb2.sealedBlocks?.length||0,0,'review cannot seal or replace the old block');
 assert.equal(h.ls.getItem('bvom_data'),raw,'review has no persistence side effects');
 assert.equal(h.ctx.bvomBb2SaveSetup(),false,'old-block Save is disabled during next review');
 assert.equal(h.ctx.bvomBb2CancelNextBlock(),true,'cancel returns to completed block');
 assert.equal(h.S().bb2.sealedBlocks?.length||0,0);
 assert.equal(h.ls.getItem('bvom_data'),raw);
 assert.equal(h.ctx.bvomBb2NextBlock(),true);
 h.ctx.bvomBb2PreviewChoose('upper_a','shoulder_press','log_push_press');
 const nextSetup=catalogue.BB2_BROWSER_MODULES.catalogue.chooseBB2Exercise(h.S().bb2.setup,
  'upper_a','shoulder_press','log_push_press');
 for(const day of days)for(const slot of catalogue.getBB2TemplatePrescription(nextSetup,day).slots){
  if(slot.equipment!=='loaded')continue;
  const identity=day+'|'+slot.roleSlotId+'|'+slot.exerciseId;
  assert.equal(h.ctx.bvomBb2NextBlockChange(identity,'load',
   identity==='upper_a|flat_press|bench_press'?'65':'60'),true);
  assert.equal(h.ctx.bvomBb2NextBlockChange(identity,'increment',
   identity==='upper_a|flat_press|bench_press'?'5':'2.5'),true);
 }
 h.ctx.confirm=()=>false;
 assert.equal(h.ctx.bvomBb2CommitNextBlock(),false,'cancel confirmation retains old evidence');
 assert.equal(h.ls.getItem('bvom_data'),raw);
 assert.equal(h.S().bb2.sealedBlocks?.length||0,0);
 h.ctx.confirm=()=>true;
 assert.equal(h.ctx.bvomBb2NextBlockChange('upper_a|flat_press|bench_press','load',''),true);
 assert.equal(h.ctx.bvomBb2CommitNextBlock(),false,'required next load cannot be omitted');
 assert.equal(h.ls.getItem('bvom_data'),raw);
 h.ctx.bvomBb2NextBlockChange('upper_a|flat_press|bench_press','load','65');
 const beforeCommit=JSON.parse(JSON.stringify(h.S().bb2));
 assert.equal(h.ctx.bvomBb2CommitNextBlock(),true,'one confirmed save seals and begins next block');
 const b=h.S().bb2,newProjection=catalogue.foldBB2Block(b.opening,b.events);
 assert.equal(b.sealedBlocks.length,1);
 assert.equal(catalogue.foldBB2Block(b.sealedBlocks[0].opening,b.sealedBlocks[0].events).sealed,true);
 assert.deepEqual(Object.values(newProjection.quotas),[0,0,0,0]);
 assert.equal(b.opening.previousBlockId,opening.blockId);
 assert.equal(newProjection.history.length,0,'new block starts fresh, without losing archive');
 assert.equal(b.setup.selections['upper_a|shoulder_press'],'log_push_press');
 assert.equal(newProjection.selections['upper_a|shoulder_press'],'log_push_press',
  'next-block exercise choice is a new-block event, not a prior-block revision');
 assert.equal(newProjection.progress['upper_a|flat_press|bench_press'].loadG,65000);
 assert.equal(newProjection.progress['upper_a|flat_press|bench_press'].incrementG,5000);
 assert.equal(catalogue.foldBB2Block(b.sealedBlocks[0].opening,b.sealedBlocks[0].events)
  .progress['upper_a|flat_press|bench_press'].loadG,100000,
  'editing next-block working weights never changes sealed prior progression');
 assert.equal(catalogue.foldBB2Block(b.sealedBlocks[0].opening,b.sealedBlocks[0].events)
  .selections['upper_a|shoulder_press'],'overhead_press',
  'sealed previous choices stay intact');
 h.ctx.renderHistory();
 assert.match(h.ctx.document.querySelector('#history').innerHTML,/data-bb2-archived="1"/,
  'sealed workouts remain in the shared History');
 assert.doesNotMatch(h.ctx.document.querySelector('#history').innerHTML,/data-bb2-correct-save/,
  'sealed block records are read-only');
 const persisted=JSON.parse(h.ls.getItem('bvom_data')).bb2;
 assert.equal(persisted.sealedBlocks.length,1);
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const field=selector.match(/data-bb2-(load|inc|assist)="([^"]+)"/);
  if(field)return {value:field[1]==='load'?'60':field[1]==='inc'?'2.5':'none'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true,'next block may Start using genuine sealed ancestry');
 const restarted=h.S().bb2;
 assert.ok(restarted.events.some(e=>e.type==='WORKOUT_STARTED'));
 assert.equal(restarted.opening.previousBlockId,opening.blockId);
 assert.equal(restarted.sealedBlocks.length,1,'starting new block never mutates archived records');
 assert.equal(h.ctx.bvomBb2Discard(),true);
 const afterReload=fixture({ls:h.ls}).h.S().bb2;
 assert.equal(afterReload.sealedBlocks.length,1,'archived block survives app reload');
 assert.equal(afterReload.opening.previousBlockId,opening.blockId);
 assert.equal(afterReload.setup.selections['upper_a|shoulder_press'],'log_push_press');
 const failed=fixture().h;
 failed.ctx.location.origin='http://localhost:8000';failed.ctx.location.search='?bb2Preview=1';
 failed.ctx.__bb2CatalogueForTest=catalogue;failed.ctx.__oldCompleteBlock=beforeCommit;
 failed.ev('state.bb2=__oldCompleteBlock;bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup(state.bb2.setup);'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewSaved=true;'+
  'bvomBb2PreviewOriginalMode=state.programMode;bvomBb2RenderPreview()');
 assert.equal(failed.ctx.bvomBb2NextBlock(),true);
 const failedPlan=catalogue.getBB2TemplatePrescription(beforeCommit.setup,'upper_a');
 const failIdentity=failedPlan.slots.find(s=>s.equipment==='loaded');
 assert.equal(failed.ctx.bvomBb2NextBlockChange('upper_a|'+failIdentity.roleSlotId+'|'+failIdentity.exerciseId,
  'load','67.5'),true);
 // The inherited slot needs no new values; all other previously uncalibrated
 // slots still require explicit starting loads before the atomic save.
 for(const day of days)for(const slot of catalogue.getBB2TemplatePrescription(beforeCommit.setup,day).slots){
  if(slot.equipment!=='loaded')continue;
  const id=day+'|'+slot.roleSlotId+'|'+slot.exerciseId;
  if(id==='upper_a|'+failIdentity.roleSlotId+'|'+failIdentity.exerciseId)continue;
  failed.ctx.bvomBb2NextBlockChange(id,'load','60');
  failed.ctx.bvomBb2NextBlockChange(id,'increment','2.5');
 }
 failed.ctx.confirm=()=>true;
 const failedRaw=failed.ls.getItem('bvom_data'),write=failed.ls.setItem.bind(failed.ls);
 failed.ev('bvomWindowLockOwned=false');
 assert.equal(failed.ctx.bvomBb2CommitNextBlock(),false,'stale workout window cannot seal the block');
 assert.equal(failed.ls.getItem('bvom_data'),failedRaw);
 failed.ev('bvomWindowLockOwned=true');
 failed.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('simulated next-block save failure');return write(key,value)};
 assert.equal(failed.ctx.bvomBb2CommitNextBlock(),false,'failed next-block save cannot seal prior evidence');
 assert.equal(failed.ls.getItem('bvom_data'),failedRaw);
 assert.equal(failed.S().bb2.sealedBlocks?.length||0,0);
 assert.equal(failed.S().bb2.opening.blockId,opening.blockId);
 console.log('PASS: atomic 32-credit seal, next opening, retained read-only History and backup');
}

{
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const opening=catalogue.createBB2Opening({ownerId:'bb2-test-owner',blockId:'bb2-stall-test',
  progress:{'upper_a|flat_press|bench_press':{loadG:100000,loadOrigin:{value:'100',unit:'kg'},
   incrementG:2500,incrementOrigin:{value:'2.5',unit:'kg'},
   calibrated:true,bestReps:21,stallCount:4,epochId:'stall-epoch'}}});
 h.ctx.__seedOpening=opening;
 h.ev('state.bb2={...state.bb2,opening:__seedOpening,events:[]};'+
  'bvomBb2PreviewSaved=true;bvomBb2RenderPreview()');
 const signal=catalogue.foldBB2Block(opening,[]).stallSignals['upper_a|flat_press|bench_press'];
 assert.equal(signal.kind,'OFFER');
 assert.match(h.ctx.document.querySelector('#setup').innerHTML,/data-bb2-stall-reduce="0"/);
 assert.equal(h.ctx.bvomBb2ReviewStall(0,'REDUCE'),true,'user explicitly accepts 10% load reduction');
 const b=h.S().bb2,after=catalogue.foldBB2Block(b.opening,b.events);
 assert.equal(b.events[0].type,'STALL_REDUCTION_ACCEPTED');
 assert.equal(b.events[0].loadG,90000);
 assert.equal(after.progress['upper_a|flat_press|bench_press'].loadG,90000);
 assert.equal(after.progress['upper_a|flat_press|bench_press'].stallCount,0);
 assert.deepEqual(after.quotas,{upper_a:0,lower_a:0,upper_b:0,lower_b:0});
 assert.equal(h.ctx.bvomBb2ReviewStall(0,'REDUCE'),false,'an accepted offer is no longer actionable');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: explicit 10% stall response resets epoch without creating quota');
}

{
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const opening=catalogue.createBB2Opening({ownerId:'bb2-test-owner',blockId:'bb2-swap-test'});
 h.ctx.__seedOpening=opening;
 h.ev('state.bb2={...state.bb2,opening:__seedOpening,events:[]};'+
  'bvomBb2PreviewSaved=true;bvomBb2RenderPreview()');
 h.ctx.bvomBb2PreviewChoose('upper_a','shoulder_press','log_push_press');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true,'a changed workout choice has a durable ledger swap');
 const b=h.S().bb2;
 assert.equal(b.events.length,1);
 assert.deepEqual([b.events[0].type,b.events[0].templateId,b.events[0].roleSlotId,b.events[0].exerciseId],
  ['EXERCISE_SWAPPED','upper_a','shoulder_press','log_push_press']);
 assert.equal(catalogue.foldBB2Block(b.opening,b.events).selections['upper_a|shoulder_press'],'log_push_press');
 assert.equal(b.setup.selections['upper_a|shoulder_press'],'log_push_press');
 const original=h.ls.getItem('bvom_data');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true,'identical saved swap is idempotent');
 assert.equal(h.ls.getItem('bvom_data'),original);
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: exercise choice and exact ledger swap commit together, without BB1 or cloud edits');
}

{
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const opening=catalogue.createBB2Opening({ownerId:'bb2-test-owner',blockId:'bb2-extra-credit-test'});
 const events=[];
 for(let i=0;i<8;i++){
  const sessionId='upper-a-'+i,add=(type,fields)=>events.push({type,
   eventId:'extra-seed-'+(events.length+1),commitOrdinal:events.length+1,
   blockId:opening.blockId,...fields});
  add('WORKOUT_STARTED',{sessionId,templateId:'upper_a',kind:'NORMAL',
   slots:[{roleSlotId:'seed_role',exerciseId:'seed_lift',sets:1,floor:6,ceiling:10,
    equipment:'loaded',plannedG:60000,plannedOrigin:{value:'60',unit:'kg'},
    incrementG:2500,incrementOrigin:{value:'2.5',unit:'kg'}}]});
  add('SET_RECORDED',{sessionId,roleSlotId:'seed_role',exerciseId:'seed_lift',
   setIndex:0,reps:8,prescribed:true,actualG:60000,actualOrigin:{value:'60',unit:'kg'}});
  add('WORKOUT_FINISHED',{sessionId});add('CREDIT_GRANTED',{sessionId,creditId:'credit-'+sessionId});
 }
 h.ctx.__seedOpening=opening;h.ctx.__seedEvents=events;
 h.ev('state.bb2={...state.bb2,opening:__seedOpening,events:__seedEvents};'+
  'bvomBb2PreviewSaved=true;bvomBb2RenderPreview()');
 const form=h.ctx.document.querySelector('#setup').innerHTML;
 assert.match(form,/data-bb2-kind="EXTRA_NORMAL"/);
 assert.doesNotMatch(form,/data-bb2-kind="NORMAL"/,'a filled day cannot earn another counted slot');
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const field=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(field)return {value:field[1]==='load'?'60':field[1]==='inc'?'2.5':
   field[1]==='assist'?'none':'8',checked:false};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true,'filled template starts extra workout, never a ninth credit');
 const b=h.S().bb2,start=b.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===b.activeSessionId);
 assert.equal(start.kind,'EXTRA_NORMAL');
 const positions=start.slots.flatMap((slot,i)=>Array.from({length:slot.sets},(_,j)=>[i,j]));
 for(const [i,j] of positions.slice(0,9))assert.equal(h.ctx.bvomBb2Log(i,j),true);
 assert.equal(h.ctx.bvomBb2End('FINISH'),true);
 const result=catalogue.foldBB2Block(h.S().bb2.opening,h.S().bb2.events);
 assert.equal(result.quotas.upper_a,8,'extra workout never adds quota credit');
 assert.equal(result.history.at(-1).status,'COMPLETED_EXTRA_NORMAL');
 assert.equal(result.history.at(-1).creditId,null);
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: quota-full Extra Normal finishes in shared Workout and History without a ninth credit');
}

{
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 const opening=catalogue.createBB2Opening({ownerId:'bb2-test-owner',blockId:'bb2-replace-choice-test',
  progress:{'upper_a|flat_press|bench_press':{loadG:60000,loadOrigin:{value:'60',unit:'kg'},
   incrementG:2500,incrementOrigin:{value:'2.5',unit:'kg'},calibrated:true,bestReps:7}}});
 const slot={roleSlotId:'flat_press',exerciseId:'bench_press',sets:1,floor:6,ceiling:10,
  equipment:'loaded',plannedG:60000,plannedOrigin:{value:'60',unit:'kg'},
  incrementG:2500,incrementOrigin:{value:'2.5',unit:'kg'}};
 const events=[
  {type:'WORKOUT_STARTED',eventId:'r-start',commitOrdinal:1,blockId:opening.blockId,
   sessionId:'r-session',templateId:'upper_a',kind:'NORMAL',slots:[slot]},
  {type:'SET_RECORDED',eventId:'r-set',commitOrdinal:2,blockId:opening.blockId,
   sessionId:'r-session',roleSlotId:'flat_press',exerciseId:'bench_press',setIndex:0,
   reps:8,prescribed:true,actualG:55000,actualOrigin:{value:'55',unit:'kg'}},
  {type:'WORKOUT_FINISHED',eventId:'r-finish',commitOrdinal:3,blockId:opening.blockId,sessionId:'r-session'},
  {type:'CREDIT_GRANTED',eventId:'r-credit',commitOrdinal:4,blockId:opening.blockId,
   sessionId:'r-session',creditId:'r-credit-id'},
  {type:'CHOICE_RESOLVED',eventId:'r-accept',commitOrdinal:5,blockId:opening.blockId,
   sourceSessionId:'r-session',sourceBlockId:opening.blockId,
   roleSlotId:'flat_press',exerciseId:'bench_press',decision:'ACCEPT',
   loadG:55000,loadOrigin:{value:'55',unit:'kg'}}
 ];
 h.ctx.__seedOpening=opening;h.ctx.__seedEvents=events;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'state.bb2={opening:__seedOpening,events:__seedEvents};');
 const before=catalogue.foldBB2Block(opening,events);
 const correction={type:'SET_CORRECTED',eventId:'r-correct',commitOrdinal:6,
  blockId:opening.blockId,sessionId:'r-session',targetEventId:'r-set',
  roleSlotId:'flat_press',exerciseId:'bench_press',setIndex:0,reps:8,harderThanIntended:true};
 h.ctx.__replaceLoad='';
 h.ev('bvomChoiceModal=function(title,body,left,right,onLeft,onRight){'+
  'globalThis.__bb2ReplacementDialog={body,onLeft,onRight};'+
  'return {querySelector:selector=>({value:selector.includes("consent-mode")?"REPLACE":'+
  'selector.includes("consent-load")?globalThis.__replaceLoad:""})}}');
 const raw=h.ls.getItem('bvom_data');
 assert.equal(h.ctx.bvomBb2CommitHistoryRevision(h.S().bb2,before,[correction],p=>p.quotas.upper_a===1),true);
 assert.match(h.ctx.__bb2ReplacementDialog.body,/Replace with a chosen setting/);
 assert.equal(h.ctx.__bb2ReplacementDialog.onRight(),false,'a loaded replacement requires an explicit weight');
 assert.equal(h.ls.getItem('bvom_data'),raw);
 h.ctx.__replaceLoad='50';
 assert.equal(h.ctx.__bb2ReplacementDialog.onRight(),true);
 const persisted=h.S().bb2,p=catalogue.foldBB2Block(persisted.opening,persisted.events);
 assert.deepEqual(persisted.events.slice(-2).map(e=>e.type),['SET_CORRECTED','CHOICE_REPLACED']);
 assert.equal(persisted.events.at(-1).targetEventId,'r-accept');
 assert.equal(p.progress['upper_a|flat_press|bench_press'].loadG,50000);
 assert.deepEqual(p.requiredConsent,[]);
 assert.equal(p.quotas.upper_a,1);
 console.log('PASS: retrospective correction can explicitly replace an invalidated load in one durable transaction');
}

{
 for(const mode of ['KEEP_AS_MANUAL','REPLACE']){
  const {h}=fixture();
  h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
  h.ctx.__bb2CatalogueForTest=catalogue;
  const opening=catalogue.createBB2Opening({ownerId:'bb2-test-owner',blockId:'bb2-bw-consent-'+mode});
  const events=[],append=(type,fields)=>events.push({type,eventId:'bw-'+mode+'-'+(events.length+1),
   commitOrdinal:events.length+1,blockId:opening.blockId,...fields});
  const slot={roleSlotId:'vertical-pull',exerciseId:'chin-up',equipment:'bodyweight',
   sets:3,floor:6,ceiling:8,variation:'chin-up',assistance:'light-band',
   plannedG:5000,plannedOrigin:{value:'5',unit:'kg'},
   incrementG:1000,incrementOrigin:{value:'1',unit:'kg'}};
  for(const [sessionId,reps] of [['bw-first',[6,7,7]],['bw-earned',[8,8,8]]]){
   append('WORKOUT_STARTED',{sessionId,templateId:'upper_a',kind:'NORMAL',slots:[slot]});
   for(let i=0;i<3;i++)append('SET_RECORDED',{sessionId,roleSlotId:'vertical-pull',
    exerciseId:'chin-up',setIndex:i,reps:reps[i],actualG:5000,
    actualOrigin:{value:'5',unit:'kg'},variation:'chin-up',assistance:'light-band',prescribed:true});
   append('WORKOUT_FINISHED',{sessionId});
   append('CREDIT_GRANTED',{sessionId,creditId:'credit-'+sessionId});
  }
  append('CHOICE_RESOLVED',{sourceSessionId:'bw-earned',roleSlotId:'vertical-pull',
   exerciseId:'chin-up',decision:'DIFFICULTY_ACCEPT',variation:'weighted-chin',
   assistance:'light-band',addedWeightG:7500,addedWeightOrigin:{value:'7.5',unit:'kg'}});
  const before=catalogue.foldBB2Block(opening,events);
  assert.deepEqual(before.requiredConsent,[]);
  const original=events.find(e=>e.type==='SET_RECORDED'&&e.sessionId==='bw-earned');
  const correction={type:'SET_CORRECTED',eventId:'bw-correct-'+mode,
   commitOrdinal:events.length+1,blockId:opening.blockId,
   sessionId:'bw-earned',targetEventId:original.eventId,roleSlotId:'vertical-pull',
   exerciseId:'chin-up',setIndex:0,reps:7,
   actualG:5000,actualOrigin:{value:'5',unit:'kg'}};
  assert.equal(catalogue.foldBB2Block(opening,[...events,correction]).requiredConsent.length,1);
  h.ctx.__seedOpening=opening;h.ctx.__seedEvents=events;
  h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
   'state.bb2={opening:__seedOpening,events:__seedEvents};');
  h.ctx.__bwConsentMode=mode;
  h.ev('bvomChoiceModal=function(title,body,left,right,onLeft,onRight){'+
   'globalThis.__bwConsentDialog={body,onRight};return {querySelector:selector=>({value:'+
   'selector.includes("consent-mode")?globalThis.__bwConsentMode:'+
   'selector.includes("consent-variation")?"assisted-chin":'+
   'selector.includes("consent-assist")?"medium-band":""})}}');
  const raw=h.ls.getItem('bvom_data');
  assert.equal(h.ctx.bvomBb2CommitHistoryRevision(h.S().bb2,before,[correction],p=>p.quotas.upper_a===2),true);
  assert.equal(h.ls.getItem('bvom_data'),raw,'bodyweight consent requires user confirmation');
  assert.equal(h.ctx.__bwConsentDialog.onRight(),true);
  const result=h.S().bb2,projected=catalogue.foldBB2Block(result.opening,result.events);
  assert.equal(projected.requiredConsent.length,0);
  assert.equal(projected.quotas.upper_a,2);
  assert.deepEqual(result.events.slice(-2).map(e=>e.type),
   ['SET_CORRECTED',mode==='REPLACE'?'CHOICE_REPLACED':'CHOICE_RECLASSIFIED']);
  const progress=projected.progress['upper_a|vertical-pull|chin-up'];
  assert.equal(progress.variation,mode==='REPLACE'?'assisted-chin':'weighted-chin');
  assert.equal(progress.assistance,mode==='REPLACE'?'medium-band':'light-band');
  assert.equal(progress.loadG,mode==='REPLACE'?null:7500);
 }
 console.log('PASS: bodyweight correction consent keeps manual identity or replaces it qualitatively without invented weight');
}

{
 const {h,before}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 const cloudBefore=JSON.stringify(h.ctx.bvomCloudPayload());
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const hit=selector.match(/data-bb2-(load|inc|assist)="([^"]+)"/);
  if(hit)return {value:hit[1]==='load'?'60':hit[1]==='inc'?'2.5':'none'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true,'starting BB2 selects it as current local training program');
 assert.equal(h.ctx.bvomBb2Discard(),true,'Discard leaves the selected program in place');
 h.ctx.showApp();
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-next-workout/);
 const firstDisk=h.ls.getItem('bvom_data');
 assert.equal(JSON.stringify(h.ctx.bvomCloudPayload()),cloudBefore,
  'BB2 selection is excluded without changing legacy cloud programMode');
 const restarted=fixture({ls:h.ls});
 restarted.h.ctx.location.origin='http://localhost:8000';
 restarted.h.ctx.location.search='?bb2Preview=1';
 restarted.h.ctx.__bb2CatalogueForTest=catalogue;
 restarted.h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest');
 restarted.h.ctx.renderWorkout();restarted.h.ctx.renderWarm();
 assert.match(restarted.h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-next-workout/,
  'reloading preserves the BB2 next-workout entry');
 assert.match(restarted.h.ctx.document.querySelector('#warmup').innerHTML,/BODYBUILDING 2/);
 restarted.h.ctx.showApp();
 await restarted.h.ctx.bvomBb2OpenPreview();
 assert.match(restarted.h.ctx.document.querySelector('#setup').innerHTML,/BODYBUILDING 2 · SETUP PREVIEW/,
  'BB2 next-workout button opens the existing setup and Start UI');
 restarted.h.ctx.bvomBb2ClosePreview();
 assert.equal(restarted.h.ctx.document.querySelector('#app').classList.contains('hidden'),false,
  'Back from next-workout preparation returns to BVOM Workout');
 assert.match(restarted.h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-next-workout/);
 restarted.h.ev('bvomWindowLockOwned=false');
 assert.equal(restarted.h.ctx.bvomBb2LeaveProgram(),false,'program exit respects window ownership');
 assert.equal(restarted.h.S().bb2.selectedProgram,true,'failed exit retains BB2 selection');
 restarted.h.ev('bvomWindowLockOwned=true');
 assert.equal(restarted.h.ctx.bvomBb2LeaveProgram(),true,'explicit switch leaves BB2 safely');
 assert.equal(restarted.h.S().bb2.selectedProgram,false);
 assert.equal(restarted.h.S().programMode,'lprpt','switch does not overwrite legacy program settings');
 restarted.h.ctx.renderWorkout();
 assert.doesNotMatch(restarted.h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-next-workout/,
  'legacy Workout is restored after explicit program switch');
 assert.equal(restarted.h.S().history.length,JSON.parse(before).history.length);
 assert.equal(restarted.h.ctx.bvomCloudPayload().bb2,undefined);
 assert.notEqual(restarted.h.ls.getItem('bvom_data'),firstDisk,'program selection is durably changed');
 console.log('PASS: BB2 next-workout selection, reload, preparation return, guarded switch and cloud isolation');
}

function bb2RecoveryFixture(){
 const {h}=fixture();
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev("bvomCloud.user={id:'dummy'};window.__bvomAuthUserId='dummy';"+
  "bvomEntitlement.record={status:'complimentary',user_id:'dummy'}");
 h.ls.setItem('bvom_data_owner','dummy');h.ctx.showApp();
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const hit=selector.match(/data-bb2-(load|inc|assist|reps)="([^"]+)"/);
  if(hit)return {value:hit[1]==='load'?'60':hit[1]==='inc'?'2.5':hit[1]==='assist'?'none':'8'};
  return query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);
 assert.equal(h.ev('bvomRecoveryAccount'),'dummy','same account owns recovery');
 return h;
}

H.withClock(c=>{
 const h=bb2RecoveryFixture();
 assert.equal(h.ctx.bvomBb2Log(0,0),true,'real working set is committed');
 const saved=JSON.parse(h.ls.getItem('bvom_data'));
 assert.equal(saved.workoutLastActivityAt,c.now(),'BB2 working set refreshes existing durable inactivity clock');
 const cloudBefore=JSON.stringify(h.ctx.bvomCloudPayload());
 c.advance(1000);
 h.ctx.renderAll();h.ev('save({durable:true,localOnly:true,passive:true})');
 assert.equal(h.S().workoutLastActivityAt,saved.workoutLastActivityAt,
  'rendering and passive saves never extend the abandoned-workout clock');
 c.advance(3598000);
 const beforeBoundary=h.ls.getItem('bvom_data');
 assert.equal(h.ctx.bvomRecoveryCheck(),false,'59m59s after work cannot auto-finish');
 assert.equal(h.ls.getItem('bvom_data'),beforeBoundary,'pre-boundary check does not write');
 c.advance(1000);
 assert.equal(h.ctx.bvomRecoveryCheck(),true,'60-minute idle BB2 workout closes atomically as incomplete');
 const b=h.S().bb2,projection=catalogue.foldBB2Block(b.opening,b.events);
 assert.equal(b.activeSessionId,null);
 assert.equal(h.S().timerStart,null,'automatic recovery clears rest clock with incomplete archive');
 assert.equal(JSON.parse(h.ls.getItem('bvom_data')).timerStart,null,
  'recovered session persists a stopped timer in its one durable commit');
 assert.equal(b.events.filter(e=>e.type==='WORKOUT_INCOMPLETE').length,1);
 assert.equal(b.events.filter(e=>e.type==='CREDIT_GRANTED').length,0);
 assert.equal(projection.history[0].status,'INCOMPLETE');
 assert.equal(projection.quotas.upper_a,0,'abandonment never awards quota');
 assert.equal(projection.history[0].sets.length,1,'working set is visible in the folded BB2 History');
 assert.equal(h.S().history.length,0,'legacy History is not populated with a fake LP record');
 assert.equal(h.S().bb2.selectedProgram,true);
 assert.match(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-next-workout/);
 assert.equal(JSON.stringify(h.ctx.bvomCloudPayload()),cloudBefore,
  'BB2 recovery never modifies the cloud-compatible BVOM document');
 const final=h.ls.getItem('bvom_data');
 assert.equal(h.ctx.bvomRecoveryCheck(),false,'recovery cannot close the same session twice');
 assert.equal(h.ls.getItem('bvom_data'),final);
 console.log('PASS: BB2 meaningful activity, passive saves, 60-minute boundary, local incomplete History and idempotence');
});

H.withClock(c=>{
 const h=bb2RecoveryFixture();
 assert.equal(h.ctx.bvomBb2Log(0,0),true);
 h.ev('delete state.workoutLastActivityAt;save({durable:true,localOnly:true,recovery:true})');
 c.advance(3700000);
 assert.equal(h.ctx.bvomRecoveryCheck(),false,'missing BB2 clock receives fresh grace');
 assert.equal(h.S().workoutLastActivityAt,c.now());
 assert.equal(h.S().bb2.activeSessionId!==null,true,'invalid clock never instantly expires training');
 const raw=h.ls.getItem('bvom_data');
 const original=h.ls.setItem;
 h.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('simulated storage quota');return original(key,value)};
 c.advance(3600000);
 assert.equal(h.ctx.bvomRecoveryCheck(),false,'failed durable recovery leaves session active');
 h.ls.setItem=original;
 assert.equal(h.ls.getItem('bvom_data'),raw,'failed recovery did not partially write');
 assert.equal(h.S().bb2.activeSessionId!==null,true);
 assert.equal(h.S().bb2.events.filter(e=>e.type==='WORKOUT_INCOMPLETE').length,0);
 assert.ok(h.S().timerStart>0,'rejected recovery keeps original active rest timer');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 missing-clock grace, recovery write failure rollback and no phantom credit');
});

{
 const h=bb2RecoveryFixture();
 assert.equal(h.ctx.bvomBb2Discard(),true);
 const oldCloud=JSON.stringify(h.ctx.bvomCloudPayload());
 const originalEvents=JSON.stringify(h.S().bb2.events);
 h.ctx.bvomChoiceModal=()=>{}; // User closes the HLM confirmation without choosing.
 h.ctx.chooseProgramMode('hlm');
 assert.equal(h.S().bb2.selectedProgram,true,'cancelled HLM choice must not deselect BB2');
 assert.equal(h.S().programMode,'lprpt');
 h.ctx.bvomChoiceModal=(title,body,left,right,onLeft,onRight)=>onRight();
 h.ctx.chooseProgramMode('hlm');
 assert.equal(h.S().programMode,'hlm','confirmed choice uses existing HLM transition');
 assert.equal(h.S().bb2.selectedProgram,false,'confirmed HLM choice deselects BB2');
 assert.equal(JSON.stringify(h.S().bb2.events),originalEvents,'training ledger survives switch');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 h.ctx.renderWorkout();
 assert.doesNotMatch(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-next-workout/);
 const j=bb2RecoveryFixture();
 assert.equal(j.ctx.bvomBb2Discard(),true);
 j.ctx.chooseProgramMode('lprpt');
 assert.equal(j.S().bb2.selectedProgram,false,'reselecting the same underlying legacy LP mode exits BB2');
 assert.equal(j.S().programMode,'lprpt');
 assert.equal(JSON.stringify(j.ctx.bvomCloudPayload()),oldCloud,
  'switching out of BB2 to unchanged LP does not alter the cloud payload');
 const k=bb2RecoveryFixture();
 assert.equal(k.ctx.bvomBb2Discard(),true);
 k.ctx.chooseProgramMode('free');
 assert.equal(k.S().programMode,'free','Custom Training switch uses the existing chooser');
 assert.equal(k.S().bb2.selectedProgram,false);
 const n=bb2RecoveryFixture();
 assert.equal(n.ctx.bvomBb2Discard(),true);
 n.ctx.chooseProgramMode('bodybuilding');
 assert.equal(n.S().programMode,'bodybuilding','BB1 switch uses its original setup');
 assert.equal(n.S().bb2.selectedProgram,false);
 assert.equal(n.ctx.bvomCloudPayload().bb2,undefined);
 console.log('PASS: BB2 chooser cancel, HLM, LP, Custom and BB1 switches preserve history and cloud isolation');
}

console.log('BB2 BVOM integrated setup preview: 41/41 PASS');
