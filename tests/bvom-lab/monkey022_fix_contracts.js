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
    // Emulate real document.querySelectorAll so the Bodybuilding wrapper
    // actually installs its SAVE callback (VM default returns an empty list).
    h.ctx.document.querySelectorAll=sel=>sel==='.bvomModalOverlay'?
     h.overlays().filter(o=>o.className==='bvomModalOverlay'&&!o.removed):[];
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
 
  test('BB-M023-GPP-'+tag+'-NEW-ASSIGNMENT','DEFECT',
   'Create B-only GPP from the '+tag+' editor without leaking it into LP/RPT, HLM, 4-Day or day A',()=>{
    const h=H.boot(build);H.bbStart(h,{onramp});
    h.ctx.document.querySelectorAll=sel=>sel==='.bvomModalOverlay'?
     h.overlays().filter(o=>o.className==='bvomModalOverlay'&&!o.removed):[];
    const previousSessions=onramp?h.S().bodybuilding.onramp.sessionsCompleted:h.S().bodybuilding.completedSessions;
    h.ctx.openGppBuilder();
    const o=h.lastOverlay(),visible=o.innerHTML.includes('data-bb');
    if(!visible)return ok(false,'No Bodybuilding GPP assignment selector');
    o.querySelector('[data-name]').value='M023 Created B GPP';
    o.querySelector('[data-lp]').value='Any';o.querySelector('[data-hlm]').value='Any';
    o.querySelector('[data-fd]').value='Any';o.querySelector('[data-bb]').value='B';
    o.querySelectorAll=sel=>sel==='[data-metric]'?[{dataset:{metric:'sets'},checked:true}]:[];
    o.querySelector('[data-values]').querySelectorAll=sel=>sel==='[data-v]'?[{dataset:{v:'sets'},value:'2'}]:[];
    o.querySelector('[data-s]').onclick();
    const g=persisted(h).gppList.find(x=>x.name==='M023 Created B GPP');
    const hiddenElsewhere=g?.assignment==='__BODYBUILDING__'&&g?.hlmAssignment==='__BODYBUILDING__'&&
     g?.fourDayAssignment==='__BODYBUILDING__'&&g?.freeAssignment==='__BODYBUILDING__';
    h.ctx.renderWorkout();const onA=!h.els['#workout'].innerHTML.includes('M023 Created B GPP');
    if(onramp)h.S().bodybuilding.onramp.sessionsCompleted=1;else h.S().bodybuilding.completedSessions=1;
    h.ev('save()');h.ctx.renderWorkout();
    const onB=h.els['#workout'].innerHTML.includes('M023 Created B GPP');
    const count=onramp?h.S().bodybuilding.onramp.sessionsCompleted:h.S().bodybuilding.completedSessions;
    return ok(visible&&g?.bbAssignment==='B'&&hiddenElsewhere&&onA&&onB&&count===previousSessions+1,
     JSON.stringify({visible,assignment:g?.bbAssignment,hiddenElsewhere,onA,onB,count}));
   });
 }

 // Codex PR57 P1 (Monkey 023): a delayed owner change *after the single blob
 // commit* must not leave persisted programMode LP/RPT or unsaved A/B scope.
 function m023GppOwnerFinish(h,{edit=false,scope='B',injectFailure=false}={}){
  h.ctx.document.querySelectorAll=sel=>sel==='.bvomModalOverlay'?
   h.overlays().filter(o=>o.className==='bvomModalOverlay'&&!o.removed):[];
  const beforeRaw=h.ls.getItem('bvom_data'),owner=h.ls.getItem('bvom_workout_tab_owner');
  h.ctx.openGppBuilder(edit?'m023-owner':null);
  const o=h.lastOverlay();
  if(!o?.innerHTML?.includes('data-bb'))return {error:'No BB selector'};
  o.querySelector('[data-name]').value=edit?'M023 Edited':'M023 Created';
  o.querySelector('[data-lp]').value='B';
  o.querySelector('[data-hlm]').value='M';
  o.querySelector('[data-fd]').value='3';
  o.querySelector('[data-bb]').value=scope;
  o.querySelectorAll=sel=>sel==='[data-metric]'?[
   {dataset:{metric:'sets'},checked:true},{dataset:{metric:'reps'},checked:true}
  ]:[];
  o.querySelector('[data-values]').querySelectorAll=sel=>sel==='[data-v]'?[
   {dataset:{v:'sets'},value:'2'},{dataset:{v:'reps'},value:'10'}
  ]:[];
  const put=h.ls.setItem;let blobWrites=0;
  h.ls.setItem=(k,v)=>{
   if(k==='bvom_data'){
    blobWrites++;
    if(injectFailure)throw Error('synthetic full disk');
    put(k,v);h.ls._map.set('bvom_workout_tab_owner','new-owner');
    return;
   }
   return put(k,v);
  };
  try{o.querySelector('[data-s]').onclick()}finally{h.ls.setItem=put}
  const raw=h.ls.getItem('bvom_data'),saved=JSON.parse(raw),item=saved.gppList.find(x=>x.id==='m023-owner'||x.name==='M023 Created');
  return {beforeRaw,raw,owner,blobWrites,saved,item,visibleModal:!o.removed};
 }
 for(const [mode,onramp] of [['ONRAMP',true],['BLOCK',false]])for(const edit of [false,true]){
  const suffix=edit?'EDIT':'CREATE';
  test('BB-M023-GPP-'+mode+'-POSTCOMMIT-'+suffix,'DEFECT',
   'Owner change immediately after GPP blob write cannot persist LP/RPT or lose Bodybuilding A/B scope',()=>{
    const h=H.boot(build);H.bbStart(h,{onramp});
    if(edit)h.S().gppList=[{
     id:'m023-owner',name:'M023 Original',assignment:'A',hlmAssignment:'H',
     fourDayAssignment:'4',freeAssignment:'__FREE__',bbAssignment:'A',
     metrics:{sets:true,reps:true},planned:{sets:2,reps:10}
    }];
    h.S().workoutStartedAt=Date.now();h.ev('save()');
    const prior=JSON.parse(h.ls.getItem('bvom_data'));
    const result=m023GppOwnerFinish(h,{edit,scope:'B'}),d=result.saved,item=result.item;
    const scoped=edit?(item?.assignment==='A'&&item?.hlmAssignment==='H'&&
     item?.fourDayAssignment==='4'&&item?.freeAssignment==='__FREE__'):
     (item?.assignment==='__BODYBUILDING__'&&item?.hlmAssignment==='__BODYBUILDING__'&&
      item?.fourDayAssignment==='__BODYBUILDING__'&&item?.freeAssignment==='__BODYBUILDING__');
    const check={
     once:result.blobWrites===1,
     program:d?.programMode==='bodybuilding',
     scope:item?.bbAssignment==='B'&&scoped,
     noSetLoss:JSON.stringify(d?.session)===JSON.stringify(prior.session),
     noHistoryLoss:JSON.stringify(d?.history)===JSON.stringify(prior.history),
     owner:h.ls.getItem('bvom_workout_tab_owner')==='new-owner',
     active:d?.workoutStartedAt===prior.workoutStartedAt
    };
    return ok(Object.values(check).every(Boolean),JSON.stringify(check));
   });
 }
 for(const mode of ['ONRAMP','BLOCK']){
  test('BB-M023-GPP-'+mode+'-REJECT-ATOMIC','DEFECT',
   'Rejected durable GPP add never widens assignments, loses training state or creates a phantom GPP',()=>{
    const h=H.boot(build);H.bbStart(h,{onramp:mode==='ONRAMP'});
    h.S().workoutStartedAt=Date.now();h.ev('save()');
    const before=h.ls.getItem('bvom_data'),memory=JSON.stringify(h.S());
    const result=m023GppOwnerFinish(h,{scope:'A',injectFailure:true});
    const same=h.ls.getItem('bvom_data')===before;
    return ok(result.blobWrites===1&&same&&JSON.stringify(h.S())===memory&&
     result.saved.gppList.length===JSON.parse(before).gppList.length&&result.visibleModal,
     JSON.stringify({writes:result.blobWrites,blob:same,memory:JSON.stringify(h.S())===memory,
      modalOpen:result.visibleModal}));
   });
 }

 // Monkey 024: in-app validation, never Chrome/Android's native "site says"
 // alert, on both Bodybuilding and On-Ramp bodyweight set forms.
 for(const [tag,onramp] of [['ONRAMP',true],['BLOCK',false]]){
  test('BB-M024-BW-INLINE-ERROR-'+tag,'DEFECT',
   'Invalid Nordic Curl bodyweight fields stay in the set modal with a readable inline notice and no native alert',()=>{
    const failures=[];
    for(const [field,value] of [
      ['[data-load]',''],
      ['[data-bw-estimate]','-1'],
      ['[data-bw-inc]','0'],
      ['[data-reps]','-1']
    ]){
      const h=H.boot(build);H.bbStart(h,{onramp});
      h.S().bodybuilding.selections.A4='nordic_curl';h.ev('save()');
      if(onramp)h.ctx.bvomBbOnRampSetModal('nordic_curl',1);
      else h.ctx.bvomBbSetModal('nordic_curl',1);
      const o=h.lastOverlay(),start=h.ls.getItem('bvom_data');
      const html=o.innerHTML,notice=o.querySelector('[data-bb-validation]');
      o.querySelector('[data-load]').value='0';
      o.querySelector('[data-bw-estimate]').value='';
      o.querySelector('[data-bw-inc]').value='2.5';
      o.querySelector('[data-reps]').value='8';
      o.querySelector(field).value=value;
      o.querySelector('[data-save]').onclick();
      const pass=html.includes('data-bb-validation')&&
       notice.hidden===false&&String(notice.textContent||'').length>10&&
       o.removed===false&&!h.log.some(row=>row[0]==='alert')&&
       h.ls.getItem('bvom_data')===start;
      failures.push({field,pass,inline:html.includes('data-bb-validation'),notice:notice.textContent,
       hidden:notice.hidden,alerts:h.log.filter(row=>row[0]==='alert')});
    }
    return ok(failures.every(x=>x.pass),JSON.stringify(failures));
   });
 }

 // Field-test UI microcopy: the explanation belongs directly under the
 // estimated weight field, never below Assistance / variation.
 for(const lang of ['en','ja']){
  test('BB-M025-ESTIMATED-WEIGHT-HELP-'+lang.toUpperCase(),'DEFECT',
   'Bodyweight accessory builder shows localized volume-only explanation immediately after estimate field',()=>{
    const h=H.boot(build);h.S().language=lang;h.ev('save()');
    h.ctx.openAccessoryBuilder();
    const o=h.lastOverlay(),html=o?.innerHTML||'',label=h.ctx.bvomT('bodyweight.estimateHelp');
    const estimate=html.indexOf('id="accBwEstimate"'),help=html.indexOf(label),
     assistance=html.indexOf('id="accBwResistance"');
    const checks={
     builder:estimate>=0&&assistance>estimate,
     helperPresent:help>estimate&&help<assistance,
     explanation:lang==='en'?
      /chin-ups/i.test(label)&&/push-ups/i.test(label)&&/Nordic curls/i.test(label)&&
       /volume/i.test(label)&&/progression/i.test(label)&&/blank/i.test(label):
      /懸垂/.test(label)&&/腕立て/.test(label)&&/ノルディック/.test(label)&&
       /ボリューム/.test(label)&&/進行/.test(label)&&/空欄/.test(label),
     once:html.split(label).length===2
    };
    return ok(Object.values(checks).every(Boolean),JSON.stringify(checks));
   });
 }

 // Monkey 029: the builder explanation is not enough. The real Nordic
 // Curl FIND/Bodybuilding set-entry modals are generated by bvomBwFields().
 // In both languages, show the same volume-only guidance DIRECTLY below
 // Estimated weight moved without touching calculation or set recording.
 for(const [phase,onramp] of [['FIND',true],['BLOCK',false]])
  for(const lang of ['en','ja']){
   test('BB-M029-BW-SET-ESTIMATE-HELP-'+phase+'-'+lang.toUpperCase(),'DEFECT',
    'Nordic Curl bodyweight set dialog explains estimated weight moved immediately below input',()=>{
     const h=H.boot(build);H.bbStart(h,{onramp});h.S().language=lang;
     h.S().bodybuilding.selections.A4='nordic_curl';h.ev('save()');
     if(onramp)h.ctx.bvomBbOnRampSetModal('nordic_curl',0);
     else h.ctx.bvomBbSetModal('nordic_curl',0);
     const overlay=h.lastOverlay(),html=overlay?.innerHTML||'',
       localized=h.ctx.bvomT('bodyweight.estimateHelp');
     const estimate=html.indexOf('data-bw-estimate'),hint=html.indexOf(localized),
       next=html.indexOf('data-bw-inc');
     const checks={phase,lang,modal:!!overlay,estimate:estimate>=0,
       helpDirectlyAfter:hint>estimate&&hint<next,
       once:html.split(localized).length===2,
       meaning:lang==='en'?/Nordic curls/i.test(localized)&&/volume/i.test(localized)&&
        /progression/i.test(localized)&&/blank/i.test(localized):
        /ノルディック/.test(localized)&&/ボリューム/.test(localized)&&/進行/.test(localized),
       noWork:JSON.stringify(h.S().session)==='{}'};
     return ok(Object.values(checks).every(x=>x===true||x===phase||x===lang),JSON.stringify(checks));
    });
  }
 // Monkey 026: screenshot field test exposed canonical A1-A6 still used as
 // visible defaults despite the established Squat-first, Triceps-before-Laterals
 // Workout A user preference. Only visual order may change, never slots/sets.
 for(const [mode,onramp] of [['ONRAMP',true],['BLOCK',false]]){
  test('BB-M026-DEFAULT-A-'+mode,'DEFECT',
   'Fresh Bodybuilding A display puts quad before chest, triceps before lateral delt; saved manual override and reset retain semantics',()=>{
    const h=H.boot(build);H.bbStart(h,{onramp});
    const canonical=h.ctx.bvomOrderEntries().map(x=>x.key);
    const expected=['A2','A1','A3','A4','A6','A5'];
    const beforeData=JSON.stringify(h.S().bodybuilding),beforeSession=JSON.stringify(h.S().session),beforeHistory=JSON.stringify(h.S().history);
    const preferred=h.ctx.bvomOrderEffective();
    const swapped=h.ctx.bvomOrderChange('A2',1),manual=h.ctx.bvomOrderEffective();
    const saved=h.S().exerciseDisplayOrder?.['bodybuilding:A']?.join('|')===manual.join('|');
    const unchangedB=h.ctx.bvomOrderEffective(
     ['B1','B2','B3','B4','B5','B6'].map(key=>({key,label:key})),'bodybuilding:B'
    ).join('|')==='B2|B1|B3|B4|B5|B6';
    const reopened=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage,online:false,supabase:null});
    const reloadMatches=reopened.ctx.bvomOrderEffective().join('|')===manual.join('|');
    const reset=reopened.ctx.bvomOrderReset(),restored=reopened.ctx.bvomOrderEffective().join('|')===expected.join('|');
    const changesOnlyOrder=beforeData===JSON.stringify(h.S().bodybuilding)&&
     beforeSession===JSON.stringify(h.S().session)&&beforeHistory===JSON.stringify(h.S().history);
    const assertions={default:preferred.join('|')===expected.join('|'),canonicalSlots:canonical.join('|')==='A1|A2|A3|A4|A5|A6',
     swapped,custom:manual[0]==='A1'&&manual[1]==='A2'&&saved,unchangedB,reloadMatches,reset,restored,changesOnlyOrder};
    return ok(Object.values(assertions).every(Boolean),JSON.stringify(assertions));
   });
 }

 // Monkey 027: the ordering decision is about getting meaningful compound
 // warm-ups first, not sorting fixed Bodybuilding slot numbers.
 for(const [phase,onramp] of [['ONRAMP',true],['BLOCK',false]]){
  test('BB-M027-ADAPTIVE-B-'+phase,'DEFECT',
   'Selected heavy hinge opens Workout B; back extension cannot steal heavy first place',()=>{
    const h=H.boot(build);H.bbStart(h,{onramp});
    const b=h.S().bodybuilding;
    if(onramp)b.onramp.sessionsCompleted=1;else b.completedSessions=1;
    b.selections.B1='lat_pulldown';b.selections.B2='romanian_deadlift';
    b.selections.B3='incline_dumbbell_press';b.selections.B4='bulgarian_split_squat';
    h.ev('save()');
    const get=()=>h.ctx.bvomOrderEffective().join('|');
    const primary=get(),expectedHeavy='B2|B1|B3|B4|B5|B6';
    b.selections.B2='back_extension_45';h.ev('save()');
    const replacement=get(),expectedBack='B1|B3|B4|B2|B5|B6';
    b.selections.B4='leg_extension';h.ev('save()');
    const plain=get(),expectedPlain='B1|B3|B2|B4|B5|B6';
    b.selections.B1='chin_up';b.selections.B2='romanian_deadlift';h.ev('save()');
    const chinWithRdl=get(),expectedChin='B2|B1|B3|B4|B5|B6';
    const pass=primary===expectedHeavy&&replacement===expectedBack&&
      plain===expectedPlain&&chinWithRdl===expectedChin;
    return ok(pass,JSON.stringify({primary,replacement,plain,chinWithRdl,phase}));
   });
  test('BB-M027-OVERRIDE-B-'+phase,'DEFECT',
   'Manual B preference wins over changing exercise selection; reload and reset recompute actual warm-up roles',()=>{
    const h=H.boot(build);H.bbStart(h,{onramp});const b=h.S().bodybuilding;
    if(onramp)b.onramp.sessionsCompleted=1;else b.completedSessions=1;
    b.selections.B2='romanian_deadlift';h.ev('save()');
    const original=h.ctx.bvomOrderEffective().join('|');
    const before=JSON.stringify({history:h.S().history,session:h.S().session});
    const changed=h.ctx.bvomOrderChange('B2',1),custom=h.ctx.bvomOrderEffective().join('|');
    b.selections.B2='back_extension_45';h.ev('save()');
    const afterChange=h.ctx.bvomOrderEffective().join('|');
    const reopened=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage,supabase:null,online:false});
    const reopenedCustom=reopened.ctx.bvomOrderEffective().join('|');
    const cleared=reopened.ctx.bvomOrderReset(),adaptive=reopened.ctx.bvomOrderEffective().join('|');
    const expected='B1|B3|B2|B4|B5|B6';
    const stored=JSON.parse(reopened.ls.getItem('bvom_data'));
    const durable=stored.bodybuilding?.selections?.B2==='back_extension_45'&&
      !stored.exerciseDisplayOrder?.['bodybuilding:B'];
    const unchanged=before===JSON.stringify({history:h.S().history,session:h.S().session});
    return ok(original==='B2|B1|B3|B4|B5|B6'&&changed&&custom==='B1|B2|B3|B4|B5|B6'&&
      afterChange===custom&&reopenedCustom===custom&&cleared&&adaptive===expected&&durable&&unchanged,
      JSON.stringify({original,custom,afterChange,reopenedCustom,adaptive,durable,unchanged}));
   });
 }

 test('BB-M027-ACTIVE-ONRAMP-SWAP-STABLE','DEFECT',
  'Changing unstarted hinge during an active B workout cannot silently move existing recorded work',()=>{
   const h=H.boot(build);H.bbStart(h,{onramp:true});
   const b=h.S().bodybuilding;b.onramp.sessionsCompleted=1;b.selections.B2='romanian_deadlift';
   h.ev('save()');const beforeOrder=h.ctx.bvomOrderEffective().join('|');
   const first=b.selections.B1;
   H.orSet(h,first,0,{reps:8,load:50});
   const beforeHistory=JSON.stringify(h.S().history),beforeSet=JSON.stringify(h.S().session);
   const opts=h.ctx.bvomBbExerciseOptions('B2').filter(o=>o.id!=='romanian_deadlift');
   const n=opts.findIndex(x=>x.id==='back_extension_45')+1;
   h.ctx.bvomBbOnRampSwap('B2');const dlg=h.lastOverlay();
   dlg.querySelector('[data-number]').value=String(n);dlg.querySelector('[data-accept]').onclick();
   const afterOrder=h.ctx.bvomOrderEffective().join('|');
   const stored=JSON.parse(h.ls.getItem('bvom_data'));
   const stable=stored.exerciseDisplayOrder?.['bodybuilding:B']?.join('|')===beforeOrder;
   return ok(n>0&&beforeOrder==='B2|B1|B3|B4|B5|B6'&&
    b.selections.B2==='back_extension_45'&&stable&&afterOrder===beforeOrder&&
    JSON.stringify(h.S().session)===beforeSet&&JSON.stringify(h.S().history)===beforeHistory,
    JSON.stringify({beforeOrder,afterOrder,stable,swapped:b.selections.B2,
     setsPreserved:JSON.stringify(h.S().session)===beforeSet}));
  });

 // Codex P2: a truthy but invalid stored preference is already ignored by
 // bvomOrderEffective. It must not prevent pinning the visible order during a
 // live On-Ramp swap, otherwise cards jump around already-recorded work.
 for(const [kind,bad] of [['STRING','B1|B2|B3'],['DUPLICATE',['B2','B2','B1','B3','B4','B5']],['PARTIAL',['B2','B1']]]){
  test('BB-M028-MALFORMED-ACTIVE-SWAP-'+kind,'DEFECT',
   'Malformed truthy saved B order cannot defeat active On-Ramp order pinning',()=>{
    const h=H.boot(build);H.bbStart(h,{onramp:true});
    const b=h.S().bodybuilding;b.onramp.sessionsCompleted=1;b.selections.B2='romanian_deadlift';
    h.S().exerciseDisplayOrder={'bodybuilding:B':bad};h.ev('save()');
    const beforeOrder=h.ctx.bvomOrderEffective().join('|'),first=b.selections.B1;
    H.orSet(h,first,0,{reps:8,load:50});
    const beforeSet=JSON.stringify(h.S().session),beforeHistory=JSON.stringify(h.S().history);
    const opts=h.ctx.bvomBbExerciseOptions('B2').filter(o=>o.id!=='romanian_deadlift');
    const n=opts.findIndex(x=>x.id==='back_extension_45')+1;
    h.ctx.bvomBbOnRampSwap('B2');const dlg=h.lastOverlay();
    if(!dlg)return ok(false,'Replacement modal missing');
    dlg.querySelector('[data-number]').value=String(n);dlg.querySelector('[data-accept]').onclick();
    const order=h.ctx.bvomOrderEffective().join('|'),stored=JSON.parse(h.ls.getItem('bvom_data'));
    const frozen=stored.exerciseDisplayOrder?.['bodybuilding:B'];
    const stable=Array.isArray(frozen)&&frozen.join('|')===beforeOrder;
    const correct=stored.bodybuilding?.selections?.B2==='back_extension_45';
    const untouched=JSON.stringify(h.S().session)===beforeSet&&JSON.stringify(h.S().history)===beforeHistory;
    const reread=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage,supabase:null,online:false});
    return ok(n>0&&beforeOrder==='B2|B1|B3|B4|B5|B6'&&correct&&stable&&
     order===beforeOrder&&untouched&&reread.ctx.bvomOrderEffective().join('|')===beforeOrder,
     JSON.stringify({kind,beforeOrder,order,correct,stable,untouched,frozen}));
   });
 }

 // Monkey 030: approved phone screenshot explicitly ranks exercises by
 // *real progressive warm-up need*, not by a broad "compound" label.
 for(const [phase,onramp] of [['ONRAMP',true],['BLOCK',false]]){
  test('BB-M030-WARMUP-FIRST-B-'+phase,'DEFECT',
   'RDL and split squat and incline press all prepare before qualitative Chin-Up; curls before rear delts',()=>{
    const h=H.boot(build);H.bbStart(h,{onramp});
    const b=h.S().bodybuilding;
    if(onramp)b.onramp.sessionsCompleted=1;else b.completedSessions=1;
    Object.assign(b.selections,{B1:'chin_up',B2:'romanian_deadlift',
     B3:'incline_dumbbell_press',B4:'bulgarian_split_squat',
     B5:'dumbbell_rear_delt_raise',B6:'dumbbell_curl'});
    h.ev('save()');
    const preferred=h.ctx.bvomOrderEffective().join('|'),want='B2|B4|B3|B1|B6|B5';
    const catalog=h.ev('BVOM_BB_WARMUP_STAGE_A_PROFILES');
    const profiles=['B2','B4','B3','B1','B6','B5'].map(slot=>({
     slot,kind:catalog[b.selections[slot]]?.kind
    }));
    const chinPlan=h.ctx.bvomBbStageAWarmupPlan('chin_up',80,onramp);
    return ok(preferred===want&&
     profiles.map(x=>x.kind).join('|')==='compound|compound|compound|qualitative|none|none'&&
     chinPlan.kind==='guidance'&&chinPlan.sets.length===0,
     JSON.stringify({preferred,want,profiles,chinPlan:chinPlan.kind,phase}));
  });
 }
};
