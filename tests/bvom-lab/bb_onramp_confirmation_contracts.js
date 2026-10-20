'use strict';
// Monkey 024 correction-path regression: a qualified prior confirmation may be
// restored by editing that same exposure, without bypassing first-exposure calibration.
module.exports=({test,ok,H,build})=>{
 const id='hack_squat',key='BBOR:'+id;
 const start=()=>{const h=H.boot(build);H.bbStart(h,{onramp:true});return h};
 const disk=h=>JSON.parse(h.ls.getItem('bvom_data'));
 const record=(h,i,reps)=>H.orSet(h,id,i,{load:100,reps,inc:'2.5'});
 const moveToFreshA=h=>{h.S().session={};h.S().workoutStartedAt=null;h.S().bodybuilding.onramp.sessionsCompleted=2;h.ev('save({durable:true})');h.ctx.renderWorkout()};
 test('BB-ONRAMP-FIRST-EXPOSURE-STAYS-PROVISIONAL','CONTROL',
  'First exposure and corrections to its existing record cannot silently bypass calibration',()=>{
   const h=start(),e=()=>h.ctx.bvomBbOnRampEx(id);
   record(h,0,8);const first=e().state==='PROVISIONAL'&&h.ctx.bvomBbOnRampSetCount(id)===1&&!h.S().session[key][0].previouslyConfirmedExposure;
   record(h,0,8);const edit=e().state==='PROVISIONAL'&&h.ctx.bvomBbOnRampSetCount(id)===1&&!h.S().session[key][0].confirmedExposure;
   moveToFreshA(h);record(h,0,8);const second=e().state==='CONFIRMED'&&h.ctx.bvomBbOnRampSetCount(id)===3&&h.S().session[key][0].confirmedExposure===true;
   return ok(first&&edit&&second,JSON.stringify({first,edit,second}));
  });
 test('BB-ONRAMP-CONFIRM-CORRECTION-RESTORES','DEFECT',
  'Editing a confirmed set below range and back can restore confirmation while previously logged secondary sets remain visible',()=>{
   const h=start();record(h,0,8);moveToFreshA(h);record(h,0,8);
   record(h,1,8);record(h,2,8);
   const before=disk(h),oldHistory=JSON.stringify(before.history),oldWeights=JSON.stringify(before.weights);
   record(h,0,5);
   const downgraded=h.ctx.bvomBbOnRampEx(id).state==='PROVISIONAL'&&h.ctx.bvomBbOnRampSetCount(id)===3&&
      h.S().session[key][0].previouslyConfirmedExposure===true&&Object.keys(h.S().session[key]).length===3;
   const r=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
   r.ctx.renderWorkout();const restoredVisibility=r.ctx.bvomBbOnRampSetCount(id)===3&&
      r.S().session[key][1].reps===8&&r.S().session[key][2].reps===8;
   record(r,0,8);
   const fixed=r.ctx.bvomBbOnRampEx(id).state==='CONFIRMED'&&r.ctx.bvomBbOnRampSetCount(id)===3&&
      r.S().session[key][0].confirmedExposure===true&&disk(r).bodybuilding.onramp.exercises[id].state==='CONFIRMED';
   const isolation=JSON.stringify(disk(r).weights)===oldWeights&&JSON.stringify(disk(r).history)===oldHistory&&r.S().bodybuilding.completedSessions===0;
   return ok(downgraded&&restoredVisibility&&fixed&&isolation,
    JSON.stringify({downgraded,restoredVisibility,fixed,isolation}));
  });
 test('BB-ONRAMP-CORRECTION-HANDOFF','DEFECT',
  'Recovered confirmation transfers calibrated true; skipped unrecovered provisional exposure remains uncalibrated',()=>{
   const a=start();record(a,0,8);moveToFreshA(a);record(a,0,8);record(a,1,8);record(a,2,8);record(a,0,5);record(a,0,8);
   const cp=JSON.parse(JSON.stringify(a.S()));cp.session={};cp.workoutStartedAt=null;
   for(const selected of Object.values(cp.bodybuilding.selections)){
    const ex=cp.bodybuilding.onramp.exercises[selected]||(cp.bodybuilding.onramp.exercises[selected]={state:'UNSET'});
    if(!(Number(ex.load)>0))ex.load=H.BB_LOADS[selected]||50;
    if(!(Number(ex.increment)>0))ex.increment=2.5;
   }
   const valid=a.ctx.bvomBbOnRampPrepareHandoff(cp)===null&&cp.bodybuilding.progression[id].calibrated===true;
   const provisional=JSON.parse(JSON.stringify(cp));
   provisional.bodybuilding.onramp.exercises[id].state='PROVISIONAL';
   const preserve=a.ctx.bvomBbOnRampPrepareHandoff(provisional)===null&&provisional.bodybuilding.progression[id].calibrated===false;
   return ok(valid&&preserve,JSON.stringify({valid,preserve}));
  });
};