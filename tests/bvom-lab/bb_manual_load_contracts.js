'use strict';
// Issue #62, v2.9.16: manually adjust the NEXT Bodybuilding prescription
// after On-Ramp without contaminating LP, History, working logs or warm-up ticks.
module.exports=({test,ok,H,build})=>{
 const id='high_bar_squat';
 const fixture=()=>{
  const h=H.boot(build);H.bbStart(h);
  const s=h.S();
  s.bodybuilding.selections.A2=id;
  s.bodybuilding.progression[id]={load:100,topLoad:100,increment:2.5,
   calibrated:true,previousSuccessfulLoad:97.5};
  s.weights.Squat=145;h.ev('save()');h.ctx.renderAll();
  return h;
 };
 const disk=h=>JSON.parse(h.ls.getItem('bvom_data'));
 const open=h=>typeof h.ctx.bvomBbEditWorkingWeight==='function'&&h.ctx.bvomBbEditWorkingWeight(id);
 const saveEdit=(h,weight)=>{
  const o=h.lastOverlay();
  o.querySelector('[data-bb-weight]').value=String(weight);
  o.querySelector('[data-save]').onclick();
  return o;
 };
 test('BB62-MANUAL-LOAD-1025','DEFECT','100 -> 102.5 immediately adjusts ONLY Bodybuilding prescription, backoffs and warm-ups and survives reload',()=>{
  const h=fixture(),before=h.ctx.bvomBbPrescription(id),warmBefore=h.ctx.bvomBbWarmStageBPlan('A2',id);
  if(!open(h))return ok(false,'No manual Bodybuilding weight editor');
  const dlg=h.lastOverlay(),help=dlg.innerHTML.includes('102.5')||dlg.innerHTML.includes('100');
  saveEdit(h,102.5);
  const after=h.ctx.bvomBbPrescription(id),warmAfter=h.ctx.bvomBbWarmStageBPlan('A2',id),
   s=disk(h),r=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
  const workout=h.els['#workout'].innerHTML,warm=h.els['#warmup'].innerHTML;
  return ok(help&&before.sets[0].load===100&&after.sets[0].load===102.5&&
   after.sets[1].load!==before.sets[1].load&&
   JSON.stringify(warmBefore.sets)!==JSON.stringify(warmAfter.sets)&&
   workout.includes('102.5')&&warm.includes('102.5')&&
   s.bodybuilding.progression[id].load===102.5&&s.bodybuilding.progression[id].topLoad===102.5&&
   !('previousSuccessfulLoad' in s.bodybuilding.progression[id])&&
   s.weights.Squat===145&&s.bodybuilding.completedSessions===0&&s.history.length===0&&
   r.S().bodybuilding.progression[id].load===102.5,
   JSON.stringify({before:before.sets,after:after.sets,warmBefore:warmBefore.sets,warmAfter:warmAfter.sets}));
 });
 test('BB62-ISOLATED-SET-AND-ONRAMP','DEFECT','Edit blocked after actual same-exercise work; unavailable in On-Ramp and for bodyweight',()=>{
  const h=fixture();H.bbSet(h,id,0,{reps:7,load:100});
  const before=h.ls.getItem('bvom_data'),res=open(h);
  const a=H.boot(build);H.bbStart(a,{onramp:true});
  const onramp=typeof a.ctx.bvomBbEditWorkingWeight==='function'?a.ctx.bvomBbEditWorkingWeight('hack_squat'):null;
  const bw=typeof a.ctx.bvomBbEditWorkingWeight==='function'?a.ctx.bvomBbEditWorkingWeight('chin_up'):null;
  return ok(res===false&&before===h.ls.getItem('bvom_data')&&onramp===false&&bw===false,
   JSON.stringify({res,onramp,bw}));
 });
 test('BB62-WARMUP-TICK-BLOCK','DEFECT','Existing warm-up tick cannot silently be invalidated by weight adjustment',()=>{
  const h=fixture(),slot='A2',plan=h.ctx.bvomBbWarmStageBPlan(slot,id);
  const stamp=h.ctx.bvomBbWarmStageBFingerprint(slot,id,plan),
   token=h.ctx.bvomBbWarmStageBToken(stamp);
  const tick=h.ctx.bvomBbWarmStageBTap(slot,0,token),before=h.ls.getItem('bvom_data'),res=open(h);
  return ok(tick===true&&res===false&&before===h.ls.getItem('bvom_data')&&
   !!h.S().warmupDone[h.ctx.bvomBbWarmStageBKey(slot,id)]?.done?.[0],
   JSON.stringify({tick,res,marks:h.S().warmupDone}));
 });
 test('BB62-STALE-DIALOG-GUARD','DEFECT','Open dialog refuses to overwrite newer exercise work, changed selection or new counter',()=>{
  const h=fixture();if(!open(h))return ok(false,'No editor');
  const o=h.lastOverlay(),s=h.S();
  s.session['BB:'+id]={0:{index:0,reps:8,load:100}};h.ev('save()');
  const before=h.ls.getItem('bvom_data');
  saveEdit(h,102.5);
  return ok(before===h.ls.getItem('bvom_data')&&h.S().bodybuilding.progression[id].load===100&&
   !!h.S().session['BB:'+id]?.[0],
   JSON.stringify({load:h.S().bodybuilding.progression[id].load}));
 });
 test('BB62-REJECTED-SAVE-ROLLBACK','DEFECT','Failed durable save leaves authoritative Bodybuilding weights and LP/history bit-for-bit intact',()=>{
  const h=fixture();if(!open(h))return ok(false,'No editor');
  const before=h.ls.getItem('bvom_data'),mem=JSON.stringify(h.S()),setItem=h.ls.setItem;
  h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('synthetic quota');return setItem(k,v)};
  try{saveEdit(h,102.5)}finally{h.ls.setItem=setItem}
  return ok(h.ls.getItem('bvom_data')===before&&JSON.stringify(h.S())===mem&&
   h.S().bodybuilding.progression[id].load===100,'Rejected write rolled back');
 });
 test('BB62-EARNED-NEXT-PROGRESSION','DEFECT','Subsequent earned 8-rep top set advances from edited 102.5, never obsolete 100',()=>{
  const h=fixture();if(!open(h))return ok(false,'No editor');saveEdit(h,102.5);
  H.bbSession(h,(eid,i,q)=>eid===id&&i===0?{reps:8,load:102.5}:{});
  const p=h.S().bodybuilding.progression[id],history=h.S().history.at(-1);
  return ok(h.S().bodybuilding.completedSessions===1&&p.load===105&&
   history.session['BB:'+id][0].load===102.5&&
   history.bodybuilding.decisions.some(x=>x.id===id&&x.decision.action==='increase'),
   JSON.stringify({current:p.load,old:p.previousSuccessfulLoad}));
 });
};