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

 // Codex PR57 P1: an On-Ramp with only optional work must be finishable.
 // Exercise calibration is deliberately untouched and On-Ramp session count stays put.
 const emptyRamp=()=>{
  const h=H.boot(build);H.bbStart(h,{onramp:true});
  for(const id of Object.values(h.S().bodybuilding.selections)){
   const e=h.ctx.bvomBbOnRampEx(id);e.state='CONFIRMED';
   if(h.ctx.bvomBbNumericExercise(id)){e.load=H.BB_LOADS[id]||30;e.increment=2.5}
   else e.resistance='green band';
  }
  h.ev('save()');return h;
 };
 const recordAccessory=h=>{
  h.S().accessoryList=[{id:'m022acc',name:'Cable Curl',category:'Upper',
   assignment:'__BODYBUILDING__',hlmAssignment:'__BODYBUILDING__',
   fourDayAssignment:'__BODYBUILDING__',freeAssignment:'__BODYBUILDING__',
   bbAssignment:'Any',equipment:'machine',style:'straight',sets:2,reps:12,
   topReps:12,weight:15,increment:2.5}];
  // Seed the exact completed-set state created by the existing accessory UI.
  // The contract under test is On-Ramp Finish, not accessory entry.
  h.S().session['ACC:m022acc']={0:{index:0,reps:12,load:15,target:12}};
  h.S().workoutStartedAt=Date.now();
  h.ev('save()');
  return true;
 };
 const recordGpp=h=>{
  // Bodybuilding normalizes saved GPP templates to include this field.
  h.S().gppList.push({id:'m022gpp',name:'Light Conditioning',
   assignment:'Any',hlmAssignment:'Any',fourDayAssignment:'Any',bbAssignment:null,
   metrics:{sets:true,reps:true,load:false,distance:false,time:false,rounds:false},
   planned:{sets:1,reps:12}});
  // Seed the persisted result shape from a completed GPP set.
  h.S().gppSession.m022gpp={started:true,sets:[{completed:true,reps:12}]};
  h.S().workoutStartedAt=Date.now();
  h.ev('save()');
  return true;
 };
 test('BB-M022-ONRAMP-ACCESSORY-ONLY','DEFECT','Recorded optional set -> Finish confirmation -> incomplete History -> early handoff, without On-Ramp count increase',()=>{
  const h=emptyRamp();if(!recordAccessory(h))return ok(false,'Failed to record real optional accessory');
  const before=snapshot(h),sessions=h.S().bodybuilding.onramp.sessionsCompleted;
  h.ctx.finishWorkout();const confirm=h.lastOverlay(),shown=!!confirm?.querySelector('[data-accept]');
  const unchanged=snapshot(h)===before; if(shown)confirm.querySelector('[data-accept]').onclick();
  const archived=persisted(h),history=archived.history.at(-1);
  const saved=archived.history.length===1&&history?.incomplete===true&&
   history.session?.['ACC:m022acc']?.[0]?.reps===12&&
   archived.bodybuilding.onramp.sessionsCompleted===sessions&&
   archived.bodybuilding.onramp.status==='active'&&Object.keys(archived.session).length===0;
  if(saved)h.ctx.bvomBbOnRampHandoff(true);
  const after=persisted(h);
  return ok(shown&&unchanged&&saved&&after.bodybuilding.onramp.status==='handed_off'&&
   after.history.length===1,
   JSON.stringify({shown,unchanged,saved,after:after.bodybuilding.onramp.status,history:history?.session?.['ACC:m022acc']}));
 });
 test('BB-M022-ONRAMP-GPP-ONLY','DEFECT','GPP-only On-Ramp must archive actual GPP result and clear session without consuming calibration exposure',()=>{
  const h=emptyRamp();if(!recordGpp(h))return ok(false,'Failed to record real GPP set');
  const before=snapshot(h),sessions=h.S().bodybuilding.onramp.sessionsCompleted;
  h.ctx.bvomBbOnRampFinish(true);const d=persisted(h),last=d.history.at(-1);
  return ok(before!==snapshot(h)&&d.history.length===1&&last?.incomplete===true&&
   last.gpp?.[0]?.id==='m022gpp'&&last.gpp?.[0]?.sets?.[0]?.reps===12&&
   d.bodybuilding.onramp.sessionsCompleted===sessions&&
   Object.keys(d.gppSession).length===0&&d.bodybuilding.onramp.status==='active',
   JSON.stringify({history:d.history.length,gpp:last?.gpp,count:d.bodybuilding.onramp.sessionsCompleted}));
 });
 test('BB-M022-ONRAMP-OPTIONAL-ATOMIC-EMPTY','DEFECT','Empty Finish creates no History; rejected optional-work Finish retains real work, On-Ramp and durable state',()=>{
  const empty=emptyRamp(),start=snapshot(empty);
  empty.ctx.bvomBbOnRampFinish(true);
  const noPhantom=snapshot(empty)===start&&empty.S().history.length===0;
  const h=emptyRamp();if(!recordAccessory(h)||!recordGpp(h))return ok(false,'Could not stage mixed optional work');
  const before=snapshot(h),memory=JSON.stringify(h.S()),setItem=h.ls.setItem;
  let rejectedWrites=0;
  h.ls.setItem=(k,v)=>{if(k==='bvom_data'){rejectedWrites++;throw Error('synthetic quota')}return setItem(k,v)};
  h.ctx.bvomBbOnRampFinish(true);h.ls.setItem=setItem;
  const checks={
   sameRaw:before===snapshot(h),
   sameMemory:memory===JSON.stringify(h.S()),
   accessory:h.S().session['ACC:m022acc']?.[0]?.reps===12,
   gpp:h.S().gppSession.m022gpp?.sets?.[0]?.reps===12,
   active:h.S().bodybuilding.onramp.status==='active',
   history:h.S().history.length===0
  };
  const restored=Object.values(checks).every(Boolean);
  const original=JSON.parse(memory),current=h.S();
  const differingKeys=Object.keys({...original,...current})
   .filter(k=>JSON.stringify(original[k])!==JSON.stringify(current[k]))
   .map(k=>({key:k,before:JSON.stringify(original[k])?.slice(0,500),after:JSON.stringify(current[k])?.slice(0,500)}));
  return ok(noPhantom&&restored&&rejectedWrites>0,
   JSON.stringify({noPhantom,checks,rejectedWrites,storedHistory:persisted(h).history.length,differingKeys}));
 });

 // Monkey 023 P2: the existing GPP entry path is usable only when a real
 // workout card exposes it. Both Bodybuilding screens must display the
 // existing GPP + ADD control and currently assigned set-entry cards.
 for(const [mode,onramp] of [['ONRAMP',true],['BLOCK',false]]){
  test('BB-M023-GPP-'+mode+'-VISIBLE','DEFECT',
   'Bodybuilding '+(onramp?'On-Ramp':'block')+' screen exposes + ADD GPP and assigned GPP set controls without leaking the other day',()=>{
    const h=H.boot(build);H.bbStart(h,{onramp});
    h.S().gppList=[
     {id:'m023a',name:'Monkey 023 Rowing',assignment:'__BODYBUILDING__',
      hlmAssignment:'__BODYBUILDING__',fourDayAssignment:'__BODYBUILDING__',
      bbAssignment:'Any',metrics:{sets:true,reps:true,load:false,distance:false,time:false,rounds:false},
      planned:{sets:2,reps:10}},
     {id:'m023b',name:'Monkey 023 Day B Only',assignment:'__BODYBUILDING__',
      hlmAssignment:'__BODYBUILDING__',fourDayAssignment:'__BODYBUILDING__',
      bbAssignment:'B',metrics:{sets:true,reps:true,load:false,distance:false,time:false,rounds:false},
      planned:{sets:1,reps:10}}
    ];
    h.ev('save()');h.ctx.renderWorkout();
    const html=h.els['#workout'].innerHTML;
    const checks={
     correctScreen:html.includes(onramp?'BODYBUILDING ON-RAMP':'BODYBUILDING · WORKOUT'),
     header:html.includes('GPP / '),
     add:html.includes('onclick="openGppBuilder()"'),
     card:html.includes('Monkey 023 Rowing'),
     entry:html.includes("bvomGppSetModal('m023a',0)")&&html.includes("bvomGppSetModal('m023a',1)"),
     noWrongDay:!html.includes('Monkey 023 Day B Only'),
     existingAccessories:html.includes('ADD ACCESSORY')||html.includes('ADD')
    };
    if(checks.entry){
     h.ctx.bvomGppSetModal('m023a',0);
     checks.dialog=!!h.lastOverlay()?.innerHTML.includes('data-s');
    }else checks.dialog=false;
    return ok(Object.values(checks).every(Boolean),JSON.stringify(checks));
   });
 }

 // Monkey 023 follow-up: GPP must be scoped to the Bodybuilding program's own
 // A/B exposure, including On-Ramp (state.day may be stale), not LP/RPT days.
 const gppAssignmentFixture=()=>[
  {id:'m023-any',name:'M023 Any GPP',assignment:'B',hlmAssignment:'M',fourDayAssignment:'3',bbAssignment:'Any',
   metrics:{sets:true,reps:true},planned:{sets:2,reps:10}},
  {id:'m023-a',name:'M023 A GPP',assignment:'B',hlmAssignment:'L',fourDayAssignment:'2',bbAssignment:'A',
   metrics:{sets:true,reps:true},planned:{sets:2,reps:10}},
  {id:'m023-b',name:'M023 B GPP',assignment:'A',hlmAssignment:'H',fourDayAssignment:'1',bbAssignment:'B',
   metrics:{sets:true,reps:true},planned:{sets:1,reps:10}}
 ];
 for(const [tag,onramp] of [['ONRAMP',true],['BLOCK',false]]){
  test('BB-M023-GPP-'+tag+'-DAY-FILTER','DEFECT',
   'GPP Any/A/B assignment respects '+tag+' actual day, ignoring unrelated LP/RPT assignment and stale state.day',()=>{
    const h=H.boot(build);H.bbStart(h,{onramp});h.S().gppList=gppAssignmentFixture();
    h.S().day='A';h.ev('save()');h.ctx.renderWorkout();
    const a=h.els['#workout'].innerHTML,shown=(s,n)=>s.includes(n);
    const aCorrect=shown(a,'M023 Any GPP')&&shown(a,'M023 A GPP')&&!shown(a,'M023 B GPP');
    if(onramp)h.S().bodybuilding.onramp.sessionsCompleted=1;
    else h.S().bodybuilding.completedSessions=1;
    h.S().day='A';h.ev('save()');h.ctx.renderWorkout();
    const b=h.els['#workout'].innerHTML;
    const dayB=onramp?h.ctx.bvomBbOnRampDay():h.ctx.bvomBbDay();
    const bCorrect=shown(b,'M023 Any GPP')&&!shown(b,'M023 A GPP')&&shown(b,'M023 B GPP');
    return ok(aCorrect&&bCorrect&&dayB==='B',
     JSON.stringify({aCorrect,bCorrect,dayB,staleStateDay:h.S().day}));
   });

  test('BB-M023-GPP-'+tag+'-EDITOR','DEFECT',
   'GPP editor exposes Bodybuilding A/B/Any and preserves then updates independent assignment durably',()=>{
    const h=H.boot(build);H.bbStart(h,{onramp});h.S().gppList=gppAssignmentFixture();
    h.ev('save()');h.ctx.openGppBuilder('m023-a');
    let o=h.lastOverlay(),markup=o.innerHTML;
    const hasBb=markup.includes('data-bb'),options=['Any','A','B'].every(x=>markup.includes('value="'+x+'"'));
    const selected=hasBb&&/data-bb>[\s\S]*?<option value="A" selected/.test(markup);
    // Fake DOM only supplies element lookup: inject the user's ordinary modal
    // inputs and click the actual app SAVE callback, not a fabricated store write.
    const submit=(scope,name)=>{
     const box=h.lastOverlay(),vals=box.querySelector('[data-values]');
     box.querySelector('[data-name]').value=name;
     box.querySelector('[data-lp]').value='B';
     box.querySelector('[data-hlm]').value='L';
     box.querySelector('[data-fd]').value='2';
     box.querySelector('[data-bb]').value=scope;
     box.querySelectorAll=sel=>sel==='[data-metric]'?[
      {dataset:{metric:'sets'},checked:true},{dataset:{metric:'reps'},checked:true}
     ]:[];
     vals.querySelectorAll=sel=>sel==='[data-v]'?[
      {dataset:{v:'sets'},value:'2'},{dataset:{v:'reps'},value:'10'}
     ]:[];
     box.querySelector('[data-s]').onclick();
    };
    if(!hasBb)return ok(false,JSON.stringify({hasBb,options,selected}));
    submit('A','M023 A GPP');
    const unchanged=persisted(h).gppList.find(g=>g.id==='m023-a');
    const preserved=unchanged?.bbAssignment==='A'&&unchanged.assignment==='B'&&
     unchanged.hlmAssignment==='L'&&unchanged.fourDayAssignment==='2';
    h.ctx.openGppBuilder('m023-a');
    const second=h.lastOverlay(),preselect=/data-bb>[\s\S]*?<option value="A" selected/.test(second.innerHTML);
    submit('B','M023 Renamed GPP');
    const saved=persisted(h).gppList.find(g=>g.id==='m023-a');
    const changed=saved?.bbAssignment==='B'&&saved?.name==='M023 Renamed GPP'&&
     saved.assignment==='B'&&saved.hlmAssignment==='L'&&saved.fourDayAssignment==='2';
    const restored=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage,supabase:null,online:false});
    const retained=restored.S().gppList.find(g=>g.id==='m023-a')?.bbAssignment==='B';
    return ok(hasBb&&options&&selected&&preserved&&preselect&&changed&&retained,
     JSON.stringify({hasBb,options,selected,preserved,preselect,changed,retained}));
   });
 }
};
