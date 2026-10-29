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
 const open=h=>{
  if(typeof h.ctx.bvomBbEditWorkingWeight!=='function'||!h.ctx.bvomBbEditWorkingWeight(id))return false;
  // The Node DOM stub does not hydrate input.value from assigned innerHTML.
  // Mirror the browser's initial field values for the real modal callbacks.
  const o=h.lastOverlay();
  for(const field of ['weight','increment']){
   const match=o.innerHTML.match(new RegExp('data-bb-'+field+'[^>]*value="([^"]*)"'));
   if(match)o.querySelector('[data-bb-'+field+']').value=match[1];
  }
  return true;
 };
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
 test('BB62-INCREMENT-ONLY','DEFECT','Edit Weight modal changes only the exercise increment; weight, successful-load evidence and History stay intact',()=>{
  const h=fixture();if(!open(h))return ok(false,'No editor');
  const dlg=h.lastOverlay(),inc=dlg.querySelector('[data-bb-increment]');
  if(!inc)return ok(false,'Missing progression increment field');
  const displayed=Number(inc.value),before=JSON.stringify(h.S().history);
  inc.value='1';dlg.querySelector('[data-save]').onclick();
  const p=h.S().bodybuilding.progression[id],saved=disk(h),reloaded=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
  return ok(displayed===2.5&&p.increment===1&&p.load===100&&p.topLoad===100&&
   p.previousSuccessfulLoad===97.5&&saved.bodybuilding.completedSessions===0&&
   JSON.stringify(h.S().history)===before&&h.S().weights.Squat===145&&
   reloaded.S().bodybuilding.progression[id].increment===1,
   JSON.stringify({displayed,progress:p}));
 });
 test('BB62-INCREMENT-COMBINED','DEFECT','One save updates weight and increment together, resets only weight-specific evidence',()=>{
  const h=fixture();if(!open(h))return ok(false,'No editor');
  const dlg=h.lastOverlay();dlg.querySelector('[data-bb-weight]').value='102.5';
  dlg.querySelector('[data-bb-increment]').value='1';dlg.querySelector('[data-save]').onclick();
  const p=disk(h).bodybuilding.progression[id];
  return ok(p.load===102.5&&p.topLoad===102.5&&p.increment===1&&
   !('previousSuccessfulLoad' in p)&&h.S().weights.Squat===145,
   JSON.stringify(p));
 });
 test('BB62-INCREMENT-VALIDATION','DEFECT','Invalid, empty and zero increments cannot change persisted weight or progression',()=>{
  const h=fixture();if(!open(h))return ok(false,'No editor');
  const dlg=h.lastOverlay(),entry=dlg.querySelector('[data-bb-increment]'),before=h.ls.getItem('bvom_data');
  const trials=['','0','-1','banana'];let all=true;
  for(const raw of trials){entry.value=raw;dlg.querySelector('[data-save]').onclick();
   all=all&&h.ls.getItem('bvom_data')===before&&h.S().bodybuilding.progression[id].increment===2.5}
  return ok(all,JSON.stringify({trials,increment:h.S().bodybuilding.progression[id].increment}));
 });
 test('BB62-INCREMENT-STALE','DEFECT','An open Edit Weight dialog cannot overwrite a newer increment change',()=>{
  const h=fixture();if(!open(h))return ok(false,'No editor');
  const dlg=h.lastOverlay();dlg.querySelector('[data-bb-increment]').value='1';
  h.S().bodybuilding.progression[id].increment=1.5;h.ev('save()');
  const before=h.ls.getItem('bvom_data');dlg.querySelector('[data-save]').onclick();
  return ok(h.ls.getItem('bvom_data')===before&&
   h.S().bodybuilding.progression[id].increment===1.5,'Stale dialog cannot overwrite newer step');
 });
 test('BB62-INCREMENT-SAVE-ROLLBACK','DEFECT','A failed increment-only durable save preserves local weight, increment and history',()=>{
  const h=fixture();if(!open(h))return ok(false,'No editor');
  const dlg=h.lastOverlay(),raw=h.ls.getItem('bvom_data'),mem=JSON.stringify(h.S()),write=h.ls.setItem;
  dlg.querySelector('[data-bb-increment]').value='1';
  h.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('synthetic storage quota');return write(key,value)};
  try{dlg.querySelector('[data-save]').onclick()}finally{h.ls.setItem=write}
  return ok(h.ls.getItem('bvom_data')===raw&&JSON.stringify(h.S())===mem,
   'Rejected increment save rolls back');
 });
 test('BB62-INCREMENT-EARNED','DEFECT','The next earned Bodybuilding increase uses the new 1 kg step, not the old 2.5 kg step',()=>{
  const h=fixture();if(!open(h))return ok(false,'No editor');
  const dlg=h.lastOverlay();dlg.querySelector('[data-bb-increment]').value='1';
  dlg.querySelector('[data-save]').onclick();
  H.bbSession(h,(eid,i,q)=>eid===id&&i===0?{reps:8,load:100}:{});
  const p=h.S().bodybuilding.progression[id],history=h.S().history.at(-1);
  return ok(h.S().bodybuilding.completedSessions===1&&p.load===101&&p.increment===1&&
   history.session['BB:'+id][0].load===100&&
   history.bodybuilding.decisions.some(x=>x.id===id&&x.decision.action==='increase'),
   JSON.stringify({nextLoad:p.load,increment:p.increment}));
 });
};
