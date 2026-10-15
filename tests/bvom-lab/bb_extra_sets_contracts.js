'use strict';
// v2.9.15 — main-block Bodybuilding actual-only optional working sets.
// Tests run the production app's actual set entry / durable Finish functions.
module.exports=({test,ok,H,build})=>{
 const fixture=()=>{const h=H.boot(build);H.bbStart(h);return h};
 const persisted=h=>JSON.parse(h.ls.getItem('bvom_data'));
 const row='chest_supported_row';
 const recordExtra=(h,id,reps,load,hard=false)=>{
  if(!h.ctx.bvomBbAddExtraSet(id))return false;
  const dlg=h.lastOverlay(),html=dlg.innerHTML;
  if(html.includes('data-load'))dlg.querySelector('[data-load]').value=String(load);
  dlg.querySelector('[data-reps]').value=String(reps);
  dlg.querySelector('[data-hard]').checked=hard;
  if(html.includes('data-res'))dlg.querySelector('[data-res]').value='no assistance';
  if(html.includes('data-bw-inc'))dlg.querySelector('[data-bw-inc]').value='1.25';
  dlg.querySelector('[data-save]').onclick();
  return true;
 };
 test('BBEXTRA-UI-AND-DURABLE','DEFECT','Optional main-block row set records actuals and survives reload without changing default prescription',()=>{
  const h=fixture(),rx=h.ctx.bvomBbPrescription(row),start=rx.sets.length;
  h.ctx.renderWorkout();const shown=h.els['#workout'].innerHTML.includes('ADD EXTRA SET');
  if(typeof h.ctx.bvomBbAddExtraSet!=='function')return ok(false,'Missing add extra set action');
  const opened=recordExtra(h,row,11,47.5);
  if(!opened)return ok(false,'Add action rejected');
  const d=persisted(h),set=d.session['BB:'+row]?.[start],
    reopened=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
  reopened.ctx.renderWorkout();
  return ok(shown&&set?.extra===true&&set.load===47.5&&set.reps===11&&
   h.ctx.bvomBbPrescription(row).sets.length===2&&
   reopened.S().session['BB:'+row]?.[start]?.reps===11&&
   reopened.els['#workout'].innerHTML.includes('EXTRA'),
   JSON.stringify({shown,set,planned:rx.sets.length}));
 });
 test('BBEXTRA-PROGRESSION-ISOLATED','DEFECT','Extra failed/hard row set remains in History and volume but cannot veto earned prescribed-set progression',()=>{
  const h=fixture(),start=h.ctx.bvomBbPrescription(row).sets.length;
  h.ctx.bvomBbProgress(row).calibrated=true;h.ev('save()');
  for(const id of H.bbDayIds(h)){
   const rx=h.ctx.bvomBbPrescription(id);
   for(let i=0;i<rx.sets.length;i++)
    H.bbSet(h,id,i,{reps:id===row?(i===0?12:8):(rx.sets[i].type==='top'?7:rx.sets[i].maxReps)});
  }
  if(typeof h.ctx.bvomBbAddExtraSet!=='function')return ok(false,'Missing add extra set');
  recordExtra(h,row,3,40,true);const actualVolume=h.ctx.bvomWorkoutVolume();
  H.finish(h);
  const d=persisted(h),record=d.history.at(-1),decision=record?.bodybuilding?.decisions?.find(x=>x.id===row)?.decision;
  return ok(d.bodybuilding.completedSessions===1&&record?.incomplete===false&&
    record.session['BB:'+row]?.[start]?.extra===true&&
    record.session['BB:'+row]?.[start]?.reps===3&&record.volume===actualVolume&&decision?.action==='increase'&&
    d.bodybuilding.progression[row]?.load===52.5,
    JSON.stringify({sessions:d.bodybuilding.completedSessions,decision,extra:record?.session?.['BB:'+row]?.[start]}));
 });
 test('BBEXTRA-NO-ONRAMP','DEFECT','Additional main-block sets are unavailable in On-Ramp and cannot alter calibration',()=>{
  const h=H.boot(build);H.bbStart(h,{onramp:true});const raw=h.ls.getItem('bvom_data');
  const id=h.S().bodybuilding.selections.A3;
  const result=typeof h.ctx.bvomBbAddExtraSet==='function'?h.ctx.bvomBbAddExtraSet(id):'missing';
  return ok(result===false&&raw===h.ls.getItem('bvom_data')&&!h.els['#workout'].innerHTML.includes('work-bb-A3-extra'),
    JSON.stringify({result}));
 });
 test('BBEXTRA-SAVE-FAIL-ROLLBACK','DEFECT','Rejected extra-set durable save cannot invent a recorded extra or change stored session',()=>{
  const h=fixture(),n=h.ctx.bvomBbPrescription(row).sets.length;
  if(typeof h.ctx.bvomBbAddExtraSet!=='function')return ok(false,'Missing add extra set');
  const before=h.ls.getItem('bvom_data'),setItem=h.ls.setItem;
  h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('synthetic quota');return setItem(k,v)};
  try{recordExtra(h,row,12,50)}finally{h.ls.setItem=setItem}
  return ok(before===h.ls.getItem('bvom_data')&&
    !h.S().session['BB:'+row]?.[n]&&persisted(h).session['BB:'+row]?.[n]==null,
    JSON.stringify({memory:h.S().session['BB:'+row],stored:persisted(h).session['BB:'+row]}));
 });
};
