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
 const openFor=(h,exercise=id)=>{
  if(typeof h.ctx.bvomBbEditWorkingWeight!=='function'||!h.ctx.bvomBbEditWorkingWeight(exercise))return false;
  // The Node DOM stub does not hydrate input.value from assigned innerHTML.
  // Mirror the browser's initial field values for the real modal callbacks.
  const o=h.lastOverlay();
  for(const field of ['weight','increment']){
   const match=o.innerHTML.match(new RegExp('data-bb-'+field+'[^>]*value="([^"]*)"'));
   if(match)o.querySelector('[data-bb-'+field+']').value=match[1];
  }
  return true;
 };
 const open=h=>openFor(h,id);
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
  const trials=['','0','-1','banana','0.001','0.123','25','1000000'];let all=true;
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
 test('BB62-AUDIT-PERFORMANCE-REF-REACHABLE','DEFECT','Increment-only change retains warnings from old step-keyed performance references after reload',()=>{
  const h=fixture(),s=h.S(),p=s.bodybuilding.progression[id];p.load=32.5;p.topLoad=32.5;
  s.bodybuilding.performanceRefs[id]={'high_bar_squat|32.5':{load:32.5,reps:10,updatedAt:'2026-01-01'}};
  h.ev('save()');const old=h.ctx.bvomBbPerformanceDrop(id,32.5,6);
  if(!open(h))return ok(false,'No editor');
  const o=h.lastOverlay();o.querySelector('[data-bb-increment]').value='1';o.querySelector('[data-save]').onclick();
  const warning=h.ctx.bvomBbPerformanceDrop(id,32.5,6),reload=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage}),again=reload.ctx.bvomBbPerformanceDrop(id,32.5,6);
  reload.ctx.bvomBbRecordPerformanceRef(id,32.5,9);
  const refs=reload.S().bodybuilding.performanceRefs[id];
  return ok(old?.triggered===true&&warning?.triggered===true&&again?.triggered===true&&
   refs['high_bar_squat|32.5']?.reps===10&&Object.keys(refs).length===1&&
   reload.S().bodybuilding.progression[id].load===32.5&&
   JSON.stringify(reload.S().history)===JSON.stringify(s.history),JSON.stringify({old,warning,again,refs}));
 });
 test('BB62-AUDIT-PERFORMANCE-REF-DISTINCT','DEFECT','Distinct 33.5 and 34 kg loads never share references, including legacy rounded keys',()=>{
  const h=fixture(),s=h.S(),refs=s.bodybuilding.performanceRefs[id]={
   'high_bar_squat|34':{load:33.5,reps:12,updatedAt:'2026-01-01'}};
  const at335=h.ctx.bvomBbPerformanceDrop(id,33.5,7),at34=h.ctx.bvomBbPerformanceDrop(id,34,7);
  h.ctx.bvomBbRecordPerformanceRef(id,34,8);
  const withBoth=Object.values(refs).some(x=>x.load===33.5&&x.reps===12)&&
   Object.values(refs).some(x=>x.load===34&&x.reps===8);
  h.ctx.bvomBbRecordPerformanceRef(id,33.5,9);
  return ok(at335?.triggered===true&&at34===null&&withBoth&&
   refs['high_bar_squat|33.5']?.reps===12&&refs['high_bar_squat|34']?.reps===8,
   JSON.stringify({at335,at34,refs}));
 });
 test('BB62-AUDIT-PERFORMANCE-REF-UNIT-COLLISION','DEFECT','Fine-step kg/lb/kg conversion preserves two distinct historical performance references',()=>{
  const h=fixture(),s=h.S(),p=s.bodybuilding.progression[id];p.increment=1;
  s.bodybuilding.performanceRefs[id]={
   'high_bar_squat|34':{load:33.5,reps:12,updatedAt:'2026-01-01'},
   'high_bar_squat|34-old':{load:34,reps:8,updatedAt:'2026-01-02'}
  };
  h.ev('save()');h.ctx.changeUnits('lb',true);
  const lb=Object.values(h.S().bodybuilding.performanceRefs[id]).map(x=>({load:x.load,reps:x.reps})).sort((a,b)=>a.load-b.load);
  h.ctx.changeUnits('kg',true);
  const kg=Object.values(h.S().bodybuilding.performanceRefs[id]).map(x=>({load:x.load,reps:x.reps})).sort((a,b)=>a.load-b.load),
   first=h.ctx.bvomBbPerformanceDrop(id,33.5,7),second=h.ctx.bvomBbPerformanceDrop(id,34,5),
   reload=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
  const persisted=Object.values(reload.S().bodybuilding.performanceRefs[id]).map(x=>({load:x.load,reps:x.reps})).sort((a,b)=>a.load-b.load);
  return ok(lb.length===2&&lb[0].load===73.8549&&lb[0].reps===12&&lb[1].load===74.9572&&lb[1].reps===8&&
   JSON.stringify(kg)===JSON.stringify([{load:33.5,reps:12},{load:34,reps:8}])&&
   JSON.stringify(persisted)===JSON.stringify(kg)&&first?.triggered===true&&second?.triggered===true,
   JSON.stringify({lb,kg,persisted,first,second}));
 });
 test('BB62-AUDIT-HUNDREDTH-LB-ROUNDTRIP','DEFECT','Historical loads only 0.01 lb apart remain distinct after lb/kg/lb conversion and reload',()=>{
  const h=fixture();h.ctx.changeUnits('lb',true);
  const s=h.S(),p=s.bodybuilding.progression[id];p.increment=.01;p.load=75;p.topLoad=75;
  s.bodybuilding.performanceRefs[id]={
   older:{load:75,reps:12,updatedAt:'2026-01-01'},
   newer:{load:75.01,reps:8,updatedAt:'2026-01-02'}
  };h.ev('save()');h.ctx.changeUnits('kg',true);
  const kg=Object.values(h.S().bodybuilding.performanceRefs[id]).map(x=>({load:x.load,reps:x.reps})).sort((a,b)=>a.load-b.load);
  h.ctx.changeUnits('lb',true);
  const lb=Object.values(h.S().bodybuilding.performanceRefs[id]).map(x=>({load:x.load,reps:x.reps})).sort((a,b)=>a.load-b.load),
   first=h.ctx.bvomBbPerformanceDrop(id,75,7),second=h.ctx.bvomBbPerformanceDrop(id,75.01,5),
   reload=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
  const persisted=Object.values(reload.S().bodybuilding.performanceRefs[id]).map(x=>({load:x.load,reps:x.reps})).sort((a,b)=>a.load-b.load);
  return ok(JSON.stringify(kg)===JSON.stringify([{load:34.0194,reps:12},{load:34.024,reps:8}])&&
   JSON.stringify(lb)===JSON.stringify([{load:75,reps:12},{load:75.01,reps:8}])&&
   JSON.stringify(persisted)===JSON.stringify(lb)&&first?.triggered===true&&second?.triggered===true,
   JSON.stringify({kg,lb,persisted,first,second}));
 });
 test('BB62-AUDIT-SNAPPED-UNIT-REF-LOOKUP','DEFECT','A practical converted working load still finds its exact pre-conversion performance origin, without merging other references',()=>{
  const h=fixture(),s=h.S(),p=s.bodybuilding.progression[id];p.load=33.5;p.topLoad=33.5;
  s.bodybuilding.performanceRefs[id]={
   old:{load:33.5,reps:12,updatedAt:'2026-01-01'},
   nearby:{load:34,reps:8,updatedAt:'2026-01-02'}
  };h.ev('save()');h.ctx.changeUnits('lb',true);
  const working=h.S().bodybuilding.progression[id].load,
   refs=Object.values(h.S().bodybuilding.performanceRefs[id]),
   warning=h.ctx.bvomBbPerformanceDrop(id,working,7),
   notice=h.ctx.bvomBbPerformanceDropNotice([{id,drop:warning}]),
   reload=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage}),
   afterReload=reload.ctx.bvomBbPerformanceDrop(id,working,7);
  reload.ctx.bvomBbRecordPerformanceRef(id,working,10);
  const exact=reload.ctx.bvomBbPerformanceDrop(id,working,7),
   preserved=Object.values(reload.S().bodybuilding.performanceRefs[id]);
  reload.ctx.changeUnits('kg',true);
  const restored=Object.values(reload.S().bodybuilding.performanceRefs[id]);
  return ok(working===75&&refs.length===2&&refs[0].load===73.8549&&refs[1].load===74.9572&&
   warning?.triggered===true&&warning?.referenceReps===12&&warning?.convertedEquivalent===true&&
   notice.includes('equivalent load before changing units')&&afterReload?.triggered===true&&
   exact?.referenceReps===10&&exact?.convertedEquivalent===false&&preserved.length===3&&
   restored.some(r=>r.load===33.5&&r.reps===12)&&restored.some(r=>r.load===34&&r.reps===8),
   JSON.stringify({working,refs,warning,afterReload,exact,preserved,restored}));
 });
 test('BB62-AUDIT-SETUP-LOCK-LIFECYCLE','DEFECT','Mid-block setup preserves preparations while a completed block starts fresh with the newly chosen grid',()=>{
  const h=fixture(),machine='machine_chest_press',p=h.S().bodybuilding.progression[machine];
  p.load=100;p.topLoad=100;p.increment=2.5;h.ev('save()');h.ctx.renderAll();
  if(!openFor(h,machine))return ok(false,'No weight editor');
  const o=h.lastOverlay();o.querySelector('[data-bb-increment]').value='5';o.querySelector('[data-save]').onclick();
  const locked=h.ctx.bvomBbPrescription(machine).sets[1].load;
  h.ctx.bvomBbSetupDraft();h.ctx.bvomBbCommitSetup();
  const active=h.S().bodybuilding.progression[machine],midBlock=h.ctx.bvomBbPrescription(machine).sets[1].load;
  h.S().bodybuilding.status='completed';h.S().bodybuilding.completedSessions=24;
  h.ctx.__bvomBbSetupDraft=null;
  const draft=h.ctx.bvomBbSetupDraft(),fresh=!Object.prototype.hasOwnProperty.call(draft.progression[machine],'preparationStep'),
   unchanged=h.S().bodybuilding.progression[machine].preparationStep===2.5;
  h.ctx.bvomBbCommitSetup();
  const newBlock=h.S().bodybuilding.progression[machine],newBack=h.ctx.bvomBbPrescription(machine).sets[1].load;
  return ok(locked===92.5&&midBlock===92.5&&active.preparationStep===2.5&&
   fresh&&unchanged&&newBlock.preparationStep===undefined&&newBack===90&&
   h.S().bodybuilding.status==='active'&&h.S().bodybuilding.completedSessions===0,
   JSON.stringify({locked,midBlock,fresh,unchanged,newBack,status:h.S().bodybuilding.status,count:h.S().bodybuilding.completedSessions}));
 });
 test('BB62-AUDIT-MID-WORKOUT-UNIT-LOCK','DEFECT','An active recorded BB1 set retains its exact load across unit round-trip while unrecorded preparations retain their locked grid',()=>{
  const h=fixture(),machine='machine_chest_press',p=h.S().bodybuilding.progression[machine];
  p.load=100;p.topLoad=100;p.increment=2.5;h.ev('save()');h.ctx.renderAll();
  if(!openFor(h,machine))return ok(false,'No weight editor');
  const dlg=h.lastOverlay();dlg.querySelector('[data-bb-increment]').value='5';dlg.querySelector('[data-save]').onclick();
  H.bbSet(h,machine,0,{reps:7,load:100});
  const before=h.ctx.bvomBbPrescription(machine).sets[1].load;
  h.ctx.changeUnits('lb',true);
  const during={recorded:h.S().session['BB:'+machine]?.[0]?.load,backoff:h.ctx.bvomBbPrescription(machine).sets[1].load};
  h.ctx.changeUnits('kg',true);
  const after=h.ctx.bvomBbPrescription(machine).sets[1].load,
   recorded=h.S().session['BB:'+machine]?.[0]?.load,
   reload=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
  return ok(before===92.5&&Number.isFinite(during.recorded)&&Number.isFinite(during.backoff)&&
   recorded===100&&after===92.5&&reload.S().session['BB:'+machine]?.[0]?.load===100&&
   reload.S().bodybuilding.progression[machine].preparationStep===2.5,
   JSON.stringify({before,during,after,recorded}));
 });
 test('BB62-AUDIT-PREPARATION-NEUTRAL','DEFECT','Increment-only edit preserves existing back-offs and machine warm-ups; weight edit recalculates them',()=>{
  const h=fixture(),s=h.S(),p=s.bodybuilding.progression[id];p.load=32.5;p.topLoad=32.5;
  s.bodybuilding.selections.A1='machine_chest_press';
  s.bodybuilding.progression.machine_chest_press={load:32.5,topLoad:32.5,increment:2.5,calibrated:true};
  h.ev('save()');h.ctx.renderAll();
  const backBefore=h.ctx.bvomBbPrescription(id).sets.slice(1).map(x=>x.load),
   warmBefore=h.ctx.bvomBbWarmStageBPlan('A1','machine_chest_press').sets;
  const editStep=(exercise)=>{if(!openFor(h,exercise))return false;const o=h.lastOverlay();o.querySelector('[data-bb-increment]').value='1';o.querySelector('[data-save]').onclick();return true};
  if(!editStep(id)||!editStep('machine_chest_press'))return ok(false,'Cannot edit steps');
  const afterBack=h.ctx.bvomBbPrescription(id).sets.slice(1).map(x=>x.load),
   afterWarm=h.ctx.bvomBbWarmStageBPlan('A1','machine_chest_press').sets;
  const reloaded=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
  const persistedBack=reloaded.ctx.bvomBbPrescription(id).sets.slice(1).map(x=>x.load),
   persistedWarm=reloaded.ctx.bvomBbWarmStageBPlan('A1','machine_chest_press').sets;
  if(!open(h))return ok(false,'Cannot reopen');
  saveEdit(h,35);const changed=h.ctx.bvomBbPrescription(id).sets.slice(1).map(x=>x.load);
  return ok(backBefore[0]===30&&JSON.stringify(backBefore)===JSON.stringify(afterBack)&&
   JSON.stringify(afterBack)===JSON.stringify(persistedBack)&&
   JSON.stringify(warmBefore)===JSON.stringify(afterWarm)&&
   JSON.stringify(afterWarm)===JSON.stringify(persistedWarm)&&
   JSON.stringify(changed)!==JSON.stringify(afterBack),
   JSON.stringify({backBefore,afterBack,warmBefore,afterWarm,changed}));
 });
 test('BB62-AUDIT-FIRST-INCREMENT-PREPARATION','DEFECT','Entering the first increment with no previous rounding step preserves machine back-offs and warm-ups through reload',()=>{
  const machine='machine_chest_press',h=fixture(),s=h.S();s.bodybuilding.selections.A1=machine;
  s.bodybuilding.progression[machine]={load:32.5,topLoad:32.5,calibrated:true};
  h.ev('save()');h.ctx.renderAll();
  const rxBefore=h.ctx.bvomBbPrescription(machine).sets.slice(1).map(x=>x.load),
   warmBefore=h.ctx.bvomBbStageAWarmupPlan(machine,32.5).sets,
   stageBBefore=h.ctx.bvomBbWarmStageBPlan('A1',machine).sets;
  if(!openFor(h,machine))return ok(false,'Cannot open first-increment editor');
  const dlg=h.lastOverlay();dlg.querySelector('[data-bb-increment]').value='1';dlg.querySelector('[data-save]').onclick();
  const rxAfter=h.ctx.bvomBbPrescription(machine).sets.slice(1).map(x=>x.load),
   warmAfter=h.ctx.bvomBbStageAWarmupPlan(machine,32.5).sets,
   stageBAfter=h.ctx.bvomBbWarmStageBPlan('A1',machine).sets,
   reload=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage}),p=reload.S().bodybuilding.progression[machine];
  return ok(rxBefore[0]===29.9&&p.increment===1&&p.preparationStep===null&&p.load===32.5&&
   JSON.stringify(rxBefore)===JSON.stringify(rxAfter)&&
   JSON.stringify(warmBefore)===JSON.stringify(warmAfter)&&
   JSON.stringify(stageBBefore)===JSON.stringify(stageBAfter)&&
   JSON.stringify(rxAfter)===JSON.stringify(reload.ctx.bvomBbPrescription(machine).sets.slice(1).map(x=>x.load))&&
   JSON.stringify(warmAfter)===JSON.stringify(reload.ctx.bvomBbStageAWarmupPlan(machine,32.5).sets),
   JSON.stringify({rxBefore,rxAfter,warmBefore,warmAfter,stageBBefore,stageBAfter,p}));
 });
 test('BB62-AUDIT-EXACT-REDUCTIONS','DEFECT','Non-grid reductions subtract exactly one increment, or use previous successful load where present',()=>{
  const h=fixture(),p=h.S().bodybuilding.progression[id],cases=[];
  for(const load of [32.5,33.5]){p.load=load;p.topLoad=load;p.increment=1;delete p.previousSuccessfulLoad;
   cases.push({load,reduced:h.ctx.bvomBbReductionLoad(id),cal:h.ctx.bvomBbCalibrationDecision(id,'too_hard',{load,reps:5}).nextLoad});
   p.previousSuccessfulLoad=load-1.5;cases.push({load,previous:h.ctx.bvomBbReductionLoad(id)})}
  const clean=cases.every(x=>'reduced' in x?x.reduced===x.load-1&&x.cal===x.load-1:x.previous===x.load-1.5);
  return ok(clean,JSON.stringify(cases));
 });
 test('BB62-AUDIT-INCREMENT-ROUNDTRIP','DEFECT','A custom 1.25 increment and preparation step survive an unchanged kg/lb/kg cycle',()=>{
  const h=fixture();if(!open(h))return ok(false,'No editor');const o=h.lastOverlay();o.querySelector('[data-bb-increment]').value='1.25';o.querySelector('[data-save]').onclick();
  const before=h.S().bodybuilding.progression[id],initial={load:before.load,increment:before.increment,preparationStep:before.preparationStep};
  h.ctx.changeUnits('lb',true);h.ctx.changeUnits('kg',true);
  const p=h.S().bodybuilding.progression[id];
  return ok(p.load===initial.load&&p.increment===initial.increment&&p.preparationStep===initial.preparationStep&&
   h.ctx.bvomBbNextIncrementLoad(19.8,.1)===19.9,
   JSON.stringify({initial,after:{load:p.load,increment:p.increment,preparationStep:p.preparationStep}}));
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
 test('BB62-MONKEY029-TRICEPS-STEP','DEFECT','Monkey: a 1 kg increment from 32.5 kg triceps becomes exactly 33.5 kg after a completed A workout',()=>{
  const tri='lying_barbell_triceps_extension',h=H.boot(build);H.bbStart(h);
  const s=h.S();s.bodybuilding.selections.A6=tri;
  s.bodybuilding.progression[tri]={load:32.5,topLoad:32.5,increment:2.5,
   calibrated:true,previousSuccessfulLoad:30};h.ev('save()');h.ctx.renderAll();
  if(!openFor(h,tri))return ok(false,'Cannot open triceps editor');
  const o=h.lastOverlay();o.querySelector('[data-bb-increment]').value='1';
  o.querySelector('[data-save]').onclick();
  H.bbSession(h,(exercise,i)=>exercise===tri?{reps:15}:{});
  const p=h.S().bodybuilding.progression[tri],hist=h.S().history.at(-1),
   tricepsSets=hist.session['BB:'+tri];
  return ok(p.load===33.5&&p.increment===1&&p.previousSuccessfulLoad===32.5&&
   Object.values(tricepsSets).every(q=>q.load===32.5&&q.reps===15)&&h.S().bodybuilding.completedSessions===1,
   JSON.stringify({nextLoad:p.load,increment:p.increment,previous:p.previousSuccessfulLoad,
    sets:tricepsSets}));
 });
 test('BB62-MONKEY029-24-WORKOUTS','DEFECT','Monkey: 24 A/B workouts, three mid-block triceps step edits, successes/holds, reloads, all History retained',()=>{
  const tri='lying_barbell_triceps_extension';let h=H.boot(build);H.bbStart(h);
  const s=h.S();s.bodybuilding.selections.A6=tri;
  s.bodybuilding.progression[tri]={load:32.5,topLoad:32.5,increment:2.5,
   calibrated:true,previousSuccessfulLoad:30};s.weights['Bench Press']=95;
  h.ev('save()');h.ctx.renderAll();
  let expected=32.5,step=2.5,exposures=0,edits=0,good=true;
  const failures=[];
  for(let workout=0;workout<24;workout++){
   const a=h.ctx.bvomBbDay()==='A',before=h.S().bodybuilding.progression[tri].load;
   if(a){
    if([0,4,8].includes(exposures)){
     const wanted=exposures===4?2.5:1;
     if(!openFor(h,tri)){good=false;failures.push('editor unavailable at '+workout);break}
     const o=h.lastOverlay();o.querySelector('[data-bb-increment]').value=String(wanted);
     o.querySelector('[data-save]').onclick();step=wanted;edits++;
     if(h.S().bodybuilding.progression[tri].load!==before){good=false;failures.push('edit changed weight '+workout)}
    }
    const earned=exposures%3!==1;
    H.bbSession(h,(eid)=>eid===tri?{reps:earned?15:13}:{});
    if(earned)expected=Math.round((expected+step)*100)/100;
    exposures++;
   }else H.bbSession(h);
   const p=h.S().bodybuilding.progression[tri],latest=h.S().history.at(-1),saved=disk(h);
   if(p.load!==expected||p.increment!==step||(!a&&before!==p.load)){
    good=false;failures.push('unexpected load/step at '+workout+': '+p.load+'/'+step+'/'+expected)
   }
   if(saved.bodybuilding.completedSessions!==workout+1||saved.history.length!==workout+1){
    good=false;failures.push('counter/history at '+workout)}
   if(a){const sets=latest.session['BB:'+tri];
    if(!sets||Object.values(sets).some(x=>x.load!==before)){good=false;failures.push('triceps log at '+workout)}
   }
   if(workout%4===3&&workout<23){h=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
    if(h.S().bodybuilding.progression[tri].load!==expected){good=false;failures.push('reload '+workout)}}
   if(!good)break;
  }
  const end=h.S();
  return ok(good&&exposures===12&&edits===3&&end.bodybuilding.completedSessions===24&&
   end.history.length===24&&end.weights['Bench Press']===95,
   JSON.stringify({good,exposures,edits,expected,actual:end.bodybuilding.progression[tri].load,
    completed:end.bodybuilding.completedSessions,history:end.history.length,failures}));
 });
};
