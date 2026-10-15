'use strict';
// Monkey 019 RED/GREEN contracts: actual Bodybuilding and On-Ramp FINISH functions,
// real BVOM localStorage save guard in a synthetic, owner-held offline VM.
module.exports=({test,ok,H,build})=>{
 const failsave=h=>{
  const original=h.ls.setItem;
  h.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('Monkey 019: simulated quota error');return original(key,value)};
  return ()=>{h.ls.setItem=original};
 };
 const successDialogs=h=>h.overlays().filter(x=>/Workout saved!/.test(x.innerHTML||'')).length;
 const normalFixture=()=>{
  const h=H.boot(build);H.bbStart(h);
  for(const id of H.bbDayIds(h)){
   const rx=h.ctx.bvomBbPrescription(id);
   for(let i=0;i<rx.sets.length;i++)H.bbSet(h,id,i,{reps:rx.sets[i].type==='top'?8:rx.sets[i].maxReps});
  }
  return h;
 };
 const rampFixture=(session=1)=>{
  const h=H.boot(build);H.bbStart(h,{onramp:true});
  if(session===6){
   const o=h.ctx.bvomBbOnRampEnsure();o.sessionsCompleted=5;
   for(const id of Object.values(h.S().bodybuilding.selections)){
    const e=h.ctx.bvomBbOnRampEx(id);
    e.state='CONFIRMED';e.load=H.BB_LOADS[id]??40;e.increment=2.5;e.resistance='assistance set';
   }
   h.S().day='B';h.ev('save()');
  }
  const day=h.ctx.bvomBbOnRampDay();
  for(const id of H.bbDayIds(h)){
   const n=h.ctx.bvomBbOnRampSetCount(id),e=h.ctx.bvomBbOnRampEx(id),first=e.state==='UNSET';
   for(let i=0;i<n;i++){const r=h.ctx.bvomBbOnRampTarget(id);H.orSet(h,id,i,{load:first&&i===0?H.BB_LOADS[id]:undefined,reps:Math.min(r[1],r[0]+1)})}
  }
  return h;
 };
 const snapshot=h=>({memory:JSON.stringify(h.S()),persisted:h.ls.getItem('bvom_data'),dialogs:successDialogs(h)});
 const unchanged=(h,b)=>JSON.stringify(h.S())===b.memory&&h.ls.getItem('bvom_data')===b.persisted&&successDialogs(h)===b.dialogs;
 test('BB-M019-REJECT-NORMAL','CONTROL','Failed durable Bodybuilding FINISH preserves actual sets, counters and history; no success UI',()=>{
  const h=normalFixture(),before=snapshot(h),restore=failsave(h);
  try{h.ctx.bvomBbFinish()}finally{restore()}
  const s=h.S();return ok(unchanged(h,before)&&s.bodybuilding.completedSessions===0&&s.history.length===0&&Object.keys(s.session).length>0,{counter:s.bodybuilding.completedSessions,history:s.history.length,sets:Object.keys(s.session).length,dialogs:successDialogs(h)});
 });
 test('BB-M019-REJECT-ONRAMP','CONTROL','Failed durable first On-Ramp FINISH preserves recorded sets, sessionsCompleted and history',()=>{
  const h=rampFixture(),before=snapshot(h),restore=failsave(h);
  try{h.ctx.bvomBbOnRampFinish()}finally{restore()}
  const s=h.S();return ok(unchanged(h,before)&&s.bodybuilding.onramp.sessionsCompleted===0&&s.history.length===0&&Object.keys(s.session).length>0,{count:s.bodybuilding.onramp.sessionsCompleted,history:s.history.length,sets:Object.keys(s.session).length});
 });
 test('BB-M019-REJECT-SIXTH','CONTROL','Rejected sixth On-Ramp FINISH cannot consume final session or hand off to 8-week block',()=>{
  const h=rampFixture(6),before=snapshot(h),restore=failsave(h);
  try{h.ctx.bvomBbOnRampFinish()}finally{restore()}
  const s=h.S();return ok(unchanged(h,before)&&s.bodybuilding.onramp.sessionsCompleted===5&&s.bodybuilding.onramp.status==='active'&&s.history.length===0&&Object.keys(s.session).length>0,{count:s.bodybuilding.onramp.sessionsCompleted,status:s.bodybuilding.onramp.status,history:s.history.length});
 });
 test('BB-M019-SIXTH-HANDOFF-SUCCESS','CONTROL','Sixth On-Ramp finish commits exactly one History plus the full handoff, not a second save',()=>{
  const h=rampFixture(6);
  const before=h.S().history.length;
  h.ctx.bvomBbOnRampFinish();
  const a=h.S(),disk=JSON.parse(h.ls.getItem('bvom_data'));
  return ok(a.bodybuilding.onramp.status==='handed_off'&&a.bodybuilding.completedSessions===0&&a.bodybuilding.onramp.sessionsCompleted===6&&a.history.length===before+1&&disk.history.length===before+1&&disk.bodybuilding.onramp.status==='handed_off'&&Object.keys(a.session).length===0,{status:a.bodybuilding.onramp.status,count:a.bodybuilding.onramp.sessionsCompleted,history:a.history.length});
 });
 test('BB-M019-POSTCOMMIT-OWNER-FAIL','CONTROL','Owner-marker cleanup failing AFTER committed normal BB blob must not roll back durable History; window stops',()=>{
  const h=normalFixture(),owner=h.ev('bvomTabId()'),remove=h.ls.removeItem,prior=successDialogs(h);
  h.ls.setItem('bvom_workout_tab_owner',owner);
  h.ls.removeItem=key=>{if(key==='bvom_workout_tab_owner')throw Error('mock owner cleanup failed');return remove(key)};
  try{h.ctx.bvomBbFinish()}finally{h.ls.removeItem=remove}
  const a=h.S(),disk=JSON.parse(h.ls.getItem('bvom_data'));
  return ok(a.history.length===1&&disk.history.length===1&&a.bodybuilding.completedSessions===1&&disk.bodybuilding.completedSessions===1&&h.ev('bvomPersistenceBlocked()')&&successDialogs(h)===prior,{saved:a.history.length,ownerFailed:h.ev('bvomPersistenceBlocked()'),successDialogs:successDialogs(h)});
 });
 test('BB-M019-REJECT-DIRECT-HANDOFF','CONTROL','Rejected manual early On-Ramp handoff must preserve pending starting loads and workout session',()=>{
  const h=rampFixture(),before=snapshot(h),restore=failsave(h);
  try{h.ctx.bvomBbOnRampHandoff(true)}finally{restore()}
  const s=h.S();return ok(unchanged(h,before)&&s.bodybuilding.onramp.status==='active'&&Object.keys(s.session).length>0,{status:s.bodybuilding.onramp.status,sets:Object.keys(s.session).length});
 });

 // Owner Android field report (16 Oct): On-Ramp FINISH commits History but
 // leaves deferWorkoutCommit stuck, so KEEP THIS DEVICE says Finish first
 // until the tab reloads. Test real successful durable save and sync guard.
 const armCloud=h=>h.ev("bvomCloud.user={id:'fixture',email:'fixture@example.test'};bvomCloud.syncReady=true;bvomCloud.conflict=false;bvomCloud.deferWorkoutCommit=false;bvomCloud.pendingAuto=false;");
 test('BB-M031-ONRAMP-FINISH-CLOUD-UNBLOCK','DEFECT','Durably finished On-Ramp releases cloud write fence and schedules safe backup without reload',()=>{
  const h=rampFixture();armCloud(h);h.ctx.bvomBbOnRampFinish();
  const d=JSON.parse(h.ls.getItem('bvom_data')),defer=h.ev('bvomCloud.deferWorkoutCommit'),
    active=h.ev('bvomCloudWorkoutActive()'),pending=h.ev('bvomCloud.pendingAuto');
  return ok(d.history.length===1&&Object.keys(d.session).length===0&&!active&&!defer&&pending,
   JSON.stringify({saved:d.history.length,active,defer,pending}));
 });
 test('BB-M031-ONRAMP-SIXTH-CLOUD-UNBLOCK','DEFECT','Sixth On-Ramp session/handoff releases cloud fence after atomic durable save',()=>{
  const h=rampFixture(6);armCloud(h);h.ctx.bvomBbOnRampFinish();
  const d=JSON.parse(h.ls.getItem('bvom_data')),defer=h.ev('bvomCloud.deferWorkoutCommit'),
    pending=h.ev('bvomCloud.pendingAuto');
  return ok(d.history.length===1&&d.bodybuilding.onramp.status==='handed_off'&&!defer&&pending,
   JSON.stringify({saved:d.history.length,status:d.bodybuilding.onramp.status,defer,pending}));
 });
 test('BB-M031-ONRAMP-DIRECT-HANDOFF-CLOUD-UNBLOCK','DEFECT','Durable empty On-Ramp handoff releases cloud fence with no phantom workout',()=>{
  const h=H.boot(build);H.bbStart(h,{onramp:true});
  for(const id of Object.values(h.S().bodybuilding.selections)){
   const e=h.ctx.bvomBbOnRampEx(id);e.state='CONFIRMED';
   e.load=H.BB_LOADS[id]||40;e.increment=2.5;e.resistance='assistance set';
  }
  h.ev('save()');armCloud(h);h.ctx.bvomBbOnRampHandoff(true);
  const d=JSON.parse(h.ls.getItem('bvom_data')),defer=h.ev('bvomCloud.deferWorkoutCommit'),
    pending=h.ev('bvomCloud.pendingAuto');
  return ok(d.bodybuilding.onramp.status==='handed_off'&&d.history.length===0&&!defer&&pending,
   JSON.stringify({status:d.bodybuilding.onramp.status,history:d.history.length,defer,pending}));
 });
 test('BB-M031-ONRAMP-REJECT-CLOUD-SAFE','DEFECT','Rejected On-Ramp durable save never queues cloud upload nor discards workout',()=>{
  const h=rampFixture();armCloud(h);const before=h.ls.getItem('bvom_data'),restore=failsave(h);
  try{h.ctx.bvomBbOnRampFinish()}finally{restore()}
  const active=h.ev('bvomCloudWorkoutActive()'),defer=h.ev('bvomCloud.deferWorkoutCommit'),
    pending=h.ev('bvomCloud.pendingAuto');
  return ok(active&&!defer&&!pending&&h.ls.getItem('bvom_data')===before&&h.S().history.length===0,
   JSON.stringify({active,defer,pending,saved:h.S().history.length}));
 });

};