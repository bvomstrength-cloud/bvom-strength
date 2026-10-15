'use strict';
// Monkey 022: protect partial On-Ramp sets and close the Bodybuilding
// bodyweight directional progression loop. No outside services.
module.exports=({test,ok,H,build})=>{
 const persisted=h=>JSON.parse(h.ls.getItem('bvom_data'));
 const snapshot=h=>h.ls.getItem('bvom_data');
 const preppedRamp=()=>{
  const h=H.boot(build);H.bbStart(h,{onramp:true});
  const selections=Object.values(h.S().bodybuilding.selections);
  for(const id of selections){
   const e=h.ctx.bvomBbOnRampEx(id);e.state='CONFIRMED';
   if(h.ctx.bvomBbNumericExercise(id)){e.load=H.BB_LOADS[id]||30;e.increment=2.5}
   else e.resistance='green band';
  }
  h.ev('save()');
  const first=h.S().bodybuilding.selections.A1;
  H.orSet(h,first,0,{reps:7,load:H.BB_LOADS[first]||60});
  return {h,first};
 };
 function bodyweight(dir='harder',lang='en'){
  const h=H.boot(build);H.bbStart(h);
  const b=h.S().bodybuilding;
  b.selections.B1='chin_up';b.completedSessions=1;
  b.progression.chin_up={calibrated:true,resistance:'green band',assistance:'green band',addedLoad:0,pendingDifficulty:dir,lastDecision:dir};
  h.S().language=lang;h.S().day='B';h.ev('save()');h.ctx.renderWorkout();
  return h;
 }
 test('BB-M022-ONRAMP-HANDOFF-PRESERVES-SETS','DEFECT','Direct early handoff and SKIP cannot erase recorded calibration; Finish retains History before handoff',()=>{
  const {h,first}=preppedRamp(),before=snapshot(h),history=h.S().history.length,rec=h.S().session['BBOR:'+first]?.[0];
  h.ctx.bvomBbOnRampHandoff(true);
  const blocked=snapshot(h)===before&&h.S().bodybuilding.onramp.status==='active'&&
   h.S().session['BBOR:'+first]?.[0]?.reps===rec?.reps&&h.S().history.length===history;
  h.ctx.bvomBbOnRampSkip();
  const skipBlocked=snapshot(h)===before&&h.S().history.length===history;
  h.ctx.bvomBbOnRampFinish(true);
  const finished=persisted(h),archived=finished.history.length===history+1&&
   finished.history.at(-1)?.incomplete===true&&
   finished.history.at(-1)?.session?.['BBOR:'+first]?.[0]?.reps===rec.reps&&
   Object.keys(finished.session||{}).length===0;
  h.ctx.bvomBbOnRampHandoff(true);const after=persisted(h);
  return ok(blocked&&skipBlocked&&archived&&after.bodybuilding.onramp.status==='handed_off'&&
   after.history.length===history+1&&after.history.at(-1)?.session?.['BBOR:'+first]?.[0]?.reps===rec.reps,
   JSON.stringify({blocked,skipBlocked,archived,handoff:after.bodybuilding.onramp.status,
    historyBefore:history,historyAfter:after.history.length,recorded:rec?.reps}));
 });
 test('BB-M022-ONRAMP-EMPTY-HANDOFF','CONTROL','Handoff remains available without any started/recorded training; no phantom History or session',()=>{
  const h=H.boot(build);H.bbStart(h,{onramp:true});
  for(const id of Object.values(h.S().bodybuilding.selections)){
   const e=h.ctx.bvomBbOnRampEx(id);e.state='CONFIRMED';
   if(h.ctx.bvomBbNumericExercise(id)){e.load=H.BB_LOADS[id]||30;e.increment=2.5}else e.resistance='green band';
  }
  h.ev('save()');h.ctx.bvomBbOnRampHandoff(true);const v=persisted(h);
  return ok(v.bodybuilding.onramp.status==='handed_off'&&v.history.length===0&&Object.keys(v.session).length===0);
 });
 test('BB-M022-BODYWEIGHT-HOLD','DEFECT','Next B exposure presents explicit harder decision; HOLD remains durable and retains resistance',()=>{
  const h=bodyweight('harder'),before=h.els['#workout'].innerHTML,count=h.S().bodybuilding.completedSessions;
  h.ctx.bvomBbSetModal('chin_up',0);
  const prevented=!h.S().session['BB:chin_up']?.[0];
  const held=h.ctx.bvomBbDifficultyHold('chin_up'),d=persisted(h),q=h.ctx.bvomBbPrescription('chin_up');
  const reload=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
  reload.ctx.renderWorkout();
  return ok(before.includes('HARDER DIFFICULTY EARNED')&&before.includes('ACCEPT')&&before.includes('HOLD')&&
    prevented&&held&&d.bodybuilding.progression.chin_up.pendingDifficulty==null&&
    d.bodybuilding.progression.chin_up.lastDifficultyResolution==='hold'&&
    q.sets[0].assistance==='green band'&&
    !reload.els['#workout'].innerHTML.includes('HARDER DIFFICULTY EARNED')&&
    d.bodybuilding.completedSessions===count&&d.history.length===0,
   JSON.stringify({prompt:before.includes('HARDER DIFFICULTY EARNED'),prevented,held,resistance:q.sets[0].assistance}));
 });
 test('BB-M022-BODYWEIGHT-ACCEPT','DEFECT','ACCEPT requires explicit changed band/variation, persists new assistance and next prescription',()=>{
  const h=bodyweight('harder');
  const opened=h.ctx.bvomBbDifficultyAccept('chin_up'),o=h.lastOverlay();
  const input=o.querySelector('[data-difficulty-value]');input.value='red band';
  o.querySelector('[data-accept]').onclick();
  const d=persisted(h),p=d.bodybuilding.progression.chin_up,rx=h.ctx.bvomBbPrescription('chin_up');
  const reload=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
  reload.ctx.renderWorkout();
  return ok(opened&&p.pendingDifficulty==null&&p.lastDifficultyResolution==='accept'&&
   p.resistance==='red band'&&p.assistance==='red band'&&rx.sets[0].assistance==='red band'&&
   reload.els['#workout'].innerHTML.includes('red band')&&
   d.bodybuilding.completedSessions===1&&d.history.length===0,
   JSON.stringify({opened,decision:p.lastDifficultyResolution,newResistance:p.resistance,prescription:rx.sets[0]}));
 });
 test('BB-M022-BODYWEIGHT-EASIER','DEFECT','Easier direction also offers ACCEPT; no invented numeric assistance, saved guidance changes',()=>{
  const h=bodyweight('easier','ja'),html=h.els['#workout'].innerHTML;
  const opened=h.ctx.bvomBbDifficultyAccept('chin_up'),o=h.lastOverlay();
  o.querySelector('[data-difficulty-value]').value='blue band';
  o.querySelector('[data-accept]').onclick();
  const d=persisted(h),q=h.ctx.bvomBbPrescription('chin_up');
  return ok(opened&&html.includes('難易度を下げることを推奨')&&
   d.bodybuilding.progression.chin_up.resistance==='blue band'&&
   q.sets[0].assistance==='blue band'&&q.sets[0].load===0&&
   d.bodybuilding.progression.chin_up.pendingDifficulty==null,
   JSON.stringify({opened,resistance:q.sets[0].assistance,load:q.sets[0].load}));
 });
 test('BB-M022-BODYWEIGHT-FAIL-SAVE','DEFECT','Quota failure rolls back HOLD and ACCEPT progress; pending choice stays earned for recovery',()=>{
  const h=bodyweight('harder'),raw=snapshot(h),original=h.ls.setItem;
  h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('synthetic disk full');return original(k,v)};
  const choice=h.ctx.bvomBbDifficultyHold('chin_up');
  h.ls.setItem=original;
  return ok(choice===false&&snapshot(h)===raw&&
   h.S().bodybuilding.progression.chin_up.pendingDifficulty==='harder'&&
   h.S().bodybuilding.progression.chin_up.resistance==='green band'&&
   persisted(h).bodybuilding.progression.chin_up.pendingDifficulty==='harder',
   JSON.stringify({choice,pending:h.S().bodybuilding.progression.chin_up.pendingDifficulty}));
 });
};
