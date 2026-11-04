'use strict';
module.exports=({test,ok,H,build})=>{
 const clone=x=>JSON.parse(JSON.stringify(x));
 function boot(){const h=H.boot(build,{supabase:null,online:false});H.configureLP(h);h.S().accessoryList=[];h.S().gppList=[];h.ev('save()');return h}
 function open(h){h.ev("bvomCloud.user={id:'lifecycle-owner'};window.__bvomAuthUserId='lifecycle-owner';bvomEntitlement.record={status:'complimentary',user_id:'lifecycle-owner'}");h.ls.setItem('bvom_data_owner','lifecycle-owner');h.ctx.showApp()}
 function orphan(h){h.S().workoutStartedAt=Date.now();h.S().workoutOwnershipVersion=1;h.ev('save({durable:true,recovery:true})')}
 test('LC01-EMPTY-ALLOWLIST','DEFECT','Only known empty session rows, Custom shells and identical drafts qualify',()=>{
  const h=boot();orphan(h);const base=clone(h.S()),checks=[];
  for(const patch of [{},{session:{Squat:{}}},{session:{Squat:{0:null}}},{freeTrainingSession:{Squat:{sets:[null],single:null}}}])checks.push(h.ctx.bvomEmptyTimestampSession({...clone(base),...patch}));
  const bad=[{session:{Squat:{0:{reps:0}}}},{session:{Squat:{0:{}}}},{session:{Squat:{0:false}}},{session:[]},{freeTrainingSession:{Squat:{sets:[{reps:0}]}}},{freeTrainingSession:{Squat:{sets:[],single:{reps:0}}}},{freeTrainingSession:{Squat:{sets:[],future:true}}},{gppSession:{erg:{}}},{gppSession:{erg:{started:true}}},{processed:{Squat:false}},{processedSnapshots:{Squat:{}}},{sessionOverrides:{Squat:60}},{warmupDone:{x:{0:true}}},{pendingCloseMissChoice:{}},{hlm:{pendingRepChoice:{}}},{hlmActiveWorkoutSettings:{} ,setupAfterFinish:{}},{freeTrainingDraft:[{lift:'Squat'}]},{workoutNote:'unsaved'},{bodybuilding:{progression:{chinup:{pendingDifficulty:'harder'}}}},{bodybuilding:{onramp:{exercises:{chinup:{pendingDifficulty:'easier'}}}}},{accessoryList:[{_bvomFtDeleteAfterFinish:true}]},{workoutOwnershipVersion:undefined},{workoutStartedAt:'yesterday'},{programMode:'unknown'},{bb2:{activeSessionId:'s'}},{bb2:{events:[{type:'WORKOUT_STARTED',sessionId:'s'}]}}];
  for(const patch of bad)checks.push(!h.ctx.bvomEmptyTimestampSession({...clone(base),...patch}));
  const ft={...clone(base),programMode:'free',freeTraining:{selectedDay:1,days:[{compounds:[{lift:'Squat',weight:60}]}]},freeTrainingDraft:[{lift:'Squat',weight:60}]};checks.push(h.ctx.bvomEmptyTimestampSession(ft));ft.freeTrainingDraft[0].weight=61;checks.push(!h.ctx.bvomEmptyTimestampSession(ft));
  return ok(checks.every(Boolean),JSON.stringify(checks));
 });
 test('LC02-RECOVERY-ALL-PROGRAMMES','DEFECT','Owned orphan recovery is immediate, history/progression/cloud-baseline neutral across all modes',()=>{
  const checks=[];for(const mode of ['lprpt','hlm','fourday','free','bodybuilding','onramp','bb2']){
   const h=boot();if(['bodybuilding','onramp'].includes(mode))H.bbStart(h,{onramp:mode==='onramp'});else if(mode!=='bb2')h.S().programMode=mode;
   if(mode==='bb2')h.S().bb2={selectedProgram:true,events:[],activeSessionId:null};
   orphan(h);const raw=h.ls.getItem('bvom_data'),old=clone(h.S()),fingerprint=h.ctx.bvomCloudComparableFingerprint(old);
   h.ev("bvomCloud.workoutBaselineFingerprint='baseline-proof';bvomCloud.conflict=true");open(h);
   const d=JSON.parse(h.ls.getItem('bvom_data'));checks.push(!d.workoutStartedAt&&!h.ctx.bvomStateWorkoutActive(d)&&JSON.stringify(d.history)===JSON.stringify(old.history)&&JSON.stringify(d.weights)===JSON.stringify(old.weights)&&JSON.stringify(d.bodybuilding)===JSON.stringify(old.bodybuilding)&&JSON.stringify(d.bb2)===JSON.stringify(old.bb2)&&h.ctx.bvomCloudComparableFingerprint(d)===fingerprint&&h.ev("bvomCloud.workoutBaselineFingerprint==='baseline-proof'&&bvomCloud.conflict")&&raw!==h.ls.getItem('bvom_data'));
  }return ok(checks.every(Boolean),JSON.stringify(checks));
 });
 test('LC03-RECOVERY-FAIL-CLOSED','NEGATIVE','Pending decisions, snapshots, drafts, GPP, actuals and legacy protocol never auto-clean',()=>{
  const checks=[];for(const patch of [{pendingCloseMissChoice:{}},{processedSnapshots:{Squat:{weight:60}}},{freeTrainingDraft:[{lift:'Squat',weight:999}]},{gppSession:{walk:{status:'paused'}}},{session:{Squat:{0:{reps:0,load:60}}}},{freeTrainingSession:{Squat:{sets:[],single:{reps:1,load:60}}}},{workoutOwnershipVersion:undefined}]){
   const h=boot();orphan(h);Object.assign(h.S(),patch);const raw=JSON.stringify(h.S());h.ls.setItem('bvom_data',raw);h.ev('bvomLastPersistedRaw=JSON.stringify(state)');open(h);checks.push(!!h.S().workoutStartedAt&&JSON.parse(h.ls.getItem('bvom_data')).workoutStartedAt===h.S().workoutStartedAt);
  }return ok(checks.every(Boolean),JSON.stringify(checks));
 });
 test('LC04-REMOVE-ATOMIC','DEFECT','Final-set removal clears metadata in one write; one of two and zero/single records stay protected',()=>{
  const checks=[];for(const count of [1,2]){
   const h=boot();open(h);h.S().programMode='free';h.ev('bvomFtEnsure()');h.S().freeTrainingSession={Squat:{sets:Array.from({length:count},()=>({reps:0,load:60}))}};h.S().workoutStartedAt=Date.now();h.ev('save()');const raw=h.ls.getItem('bvom_data');let writes=0;const put=h.ls.setItem;h.ls.setItem=(k,v)=>{if(k==='bvom_data')writes++;put(k,v)};
   h.ctx.bvomFtRemoveActual('Squat',0);const d=JSON.parse(h.ls.getItem('bvom_data'));checks.push(writes===1&&!!d.workoutStartedAt===(count===2)&&h.ctx.bvomStateWorkoutActive(d)===(count===2)&&raw!==h.ls.getItem('bvom_data'));
  }
  const h=boot();H.bbStart(h);open(h);H.bbSet(h,H.bbDayIds(h)[0],0);const before=clone(h.S()),raw=h.ls.getItem('bvom_data'),put=h.ls.setItem;h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('quota');put(k,v)};
  h.ctx.bvomBbSetModal(H.bbDayIds(h)[0],0);h.lastOverlay().querySelector('[data-remove]').onclick();checks.push(raw===h.ls.getItem('bvom_data')&&JSON.stringify(h.S())===JSON.stringify(before));
  return ok(checks.every(Boolean),JSON.stringify(checks));
 });
 test('LC05-RECOVERY-RAW-AND-OWNER','NEGATIVE','Secondary tabs, changed durable data and in-memory actuals cannot clean another session',()=>{
  const checks=[];for(const change of ['lock','marker','raw','memory','account']){
   const h=boot();open(h);orphan(h);
   if(change==='lock')h.ev('bvomWindowLockOwned=false');
   if(change==='marker')h.ls.setItem('bvom_workout_tab_owner','other');
   if(change==='raw'){const d=clone(h.S());d.session={Squat:{0:{reps:0,load:60}}};h.ls.setItem('bvom_data',JSON.stringify(d))}
   if(change==='memory')h.S().session={Squat:{0:{reps:0,load:60}}};
   if(change==='account')h.ev("bvomCloud.user={id:'other'}");
   const raw=h.ls.getItem('bvom_data');checks.push(!h.ctx.bvomRecoveryCheck()&&h.ls.getItem('bvom_data')===raw&&!!h.S().workoutStartedAt);
  }return ok(checks.every(Boolean),JSON.stringify(checks));
 });
 test('LC06-RECOVERY-QUOTA','NEGATIVE','Failed orphan cleanup rolls back exact memory and bytes without releasing owner',()=>{
  const h=boot();open(h);orphan(h);const raw=h.ls.getItem('bvom_data'),before=clone(h.S()),put=h.ls.setItem;h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('quota');put(k,v)};h.ctx.bvomRecoveryCheck();
  return ok(h.ls.getItem('bvom_data')===raw&&JSON.stringify(h.S())===JSON.stringify(before)&&h.ls.getItem('bvom_workout_tab_owner')===h.ctx.bvomTabId(),'durable failure retains original orphan');
 });
};
