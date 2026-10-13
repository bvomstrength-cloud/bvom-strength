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
  const day=h.ctx.bvomBbOnRampDay();
  for(const id of H.bbDayIds(h)){
   const n=h.ctx.bvomBbOnRampSetCount(id),e=h.ctx.bvomBbOnRampEx(id),first=e.state==='UNSET';
   for(let i=0;i<n;i++){const r=h.ctx.bvomBbOnRampTarget(id);H.orSet(h,id,i,{load:first&&i===0?H.BB_LOADS[id]:undefined,reps:Math.min(r[1],r[0]+1)})}
  }
  if(session===6){
   const o=h.ctx.bvomBbOnRampEnsure();
   o.sessionsCompleted=5;
   h.S().day='B';
   h.ev('save()');
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
 test('BB-M019-REJECT-DIRECT-HANDOFF','CONTROL','Rejected manual early On-Ramp handoff must preserve pending starting loads and workout session',()=>{
  const h=rampFixture(),before=snapshot(h),restore=failsave(h);
  try{h.ctx.bvomBbOnRampHandoff(true)}finally{restore()}
  const s=h.S();return ok(unchanged(h,before)&&s.bodybuilding.onramp.status==='active'&&Object.keys(s.session).length>0,{status:s.bodybuilding.onramp.status,sets:Object.keys(s.session).length});
 });
};