'use strict';
// Issue #55 Stage B — live warm-up renderer and durable interaction contracts.
module.exports=({test,ok,H,build})=>{
 const fresh=()=>{const h=H.boot(build);H.bbStart(h);return h};
 function selectSquat(h){
  h.S().bodybuilding.selections.A2='high_bar_squat';
  h.S().bodybuilding.progression.high_bar_squat={load:100,topLoad:100,increment:2.5,calibrated:true};
  h.ev('save()');h.ctx.renderWarm();h.ctx.renderWorkout();return h;
 }
 function spec(h,slot='A2'){
  const id=h.S().bodybuilding.selections[slot],p=h.ctx.bvomBbWarmStageBPlan(slot,id);
  const fingerprint=h.ctx.bvomBbWarmStageBFingerprint(slot,id,p);
  return {id,p,token:h.ctx.bvomBbWarmStageBToken(fingerprint),key:h.ctx.bvomBbWarmStageBKey(slot,id),fingerprint};
 }
 test('BB-STAGE-B-RENDER','CONTROL','Bodybuilding Warm-up screen uses strength ramp, includes accessible taps and workout anchors',()=>{
  const h=selectSquat(fresh()),html=h.els['#warmup'].innerHTML,work=h.els['#workout'].innerHTML;
  return ok(html.includes('High-Bar Squat')&&html.includes('20 kg × 5')&&html.includes('40 kg × 5')&&
   html.includes('bvomBbWarmStageBTap')&&html.includes('aria-label=')&&
   html.includes('warm-bb-A2')&&work.includes('work-bb-A2')&&
   !html.includes('50 kg × 5')&&h.ctx.bvomBbWarmStageBPlan('A2','high_bar_squat').sets.length===6,
   JSON.stringify({ramp:h.ctx.bvomBbWarmStageBPlan('A2','high_bar_squat').sets,anchors:work.includes('work-bb-A2')}));
 });
 test('BB-STAGE-B-TAP-ATOMIC','CONTROL','Warm-up tap saves mark and rest timer together; no actual training or On-Ramp calibration',()=>{
  const h=selectSquat(fresh()),v=spec(h),historyBefore=h.S().history.length,sessionBefore=JSON.stringify(h.S().session),n=h.S().bodybuilding.completedSessions;
  const accepted=h.ctx.bvomBbWarmStageBTap('A2',0,v.token),s=h.S(),saved=JSON.parse(h.ls.getItem('bvom_data'));
  return ok(accepted===true&&!!s.warmupDone[v.key]?.done?.[0]&&!!saved.warmupDone?.[v.key]?.done?.[0]&&
   Number(s.timerStart)>0&&saved.timerStart===s.timerStart&&
   s.history.length===historyBefore&&s.bodybuilding.completedSessions===n&&
   JSON.stringify(s.session)===sessionBefore&&!s.workoutStartedAt,
   JSON.stringify({persisted:!!saved.warmupDone?.[v.key]?.done?.[0],clock:s.timerStart,workoutStartedAt:s.workoutStartedAt}));
 });
 test('BB-STAGE-B-UNDO-AND-LAST','CONTROL','Unticking is durable without restarting timer; last tick navigates to matching workout exercise',()=>{
  const h=selectSquat(fresh()),v=spec(h);h.ctx.bvomBbWarmStageBTap('A2',0,v.token);
  const t=h.S().timerStart,undone=h.ctx.bvomBbWarmStageBTap('A2',0,v.token);
  const cleared=!h.S().warmupDone?.[v.key]&&h.S().timerStart===t;
  const last=h.ctx.bvomBbWarmStageBTap('A2',v.p.sets.length-1,v.token);
  return ok(undone===true&&cleared&&last===true&&!!h.S().warmupDone?.[v.key]?.done?.[v.p.sets.length-1]&&
   h.els['#workout'].classList.contains('hidden')===false,JSON.stringify({cleared,last,actual:h.S().session}));
 });
 test('BB-STAGE-B-RELOAD-FINGERPRINT','CONTROL','Marks survive local reload and invalidate if the selected exercise or prescribed load changes',()=>{
  const h=selectSquat(fresh()),v=spec(h);h.ctx.bvomBbWarmStageBTap('A2',0,v.token);
  const re=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage}),persisted=spec(re),resumed=!!re.S().warmupDone?.[v.key]?.done?.[0];
  re.S().bodybuilding.progression.high_bar_squat.load=110;
  const changed=spec(re),stale=re.ctx.bvomBbWarmStageBTap('A2',1,v.token);
  return ok(resumed&&persisted.token===v.token&&changed.token!==v.token&&stale===false,
   JSON.stringify({resumed,changed:changed.token!==v.token,stale}));
 });
 test('BB-STAGE-B-FAILED-SAVE','CONTROL','Quota rejection rolls back marks and timer and never starts rest clock',()=>{
  const h=selectSquat(fresh()),v=spec(h),raw=h.ls.getItem('bvom_data'),before=JSON.stringify(h.S().warmupDone),t=h.S().timerStart,orig=h.ls.setItem;
  h.ls.setItem=(k,val)=>{if(k==='bvom_data')throw Error('simulated disk full');return orig(k,val)};
  const accepted=h.ctx.bvomBbWarmStageBTap('A2',0,v.token);
  h.ls.setItem=orig;
  return ok(accepted===false&&raw===h.ls.getItem('bvom_data')&&JSON.stringify(h.S().warmupDone)===before&&
   h.S().timerStart===t&&h.ctx.bvomPersistenceBlocked(),JSON.stringify({accepted,markSame:JSON.stringify(h.S().warmupDone)===before,timerSame:h.S().timerStart===t}));
 });
 test('BB-STAGE-B-SECONDARY','CONTROL','A second tab cannot tick a warm-up, steal ownership or change recorded training',()=>{
  const h=selectSquat(fresh()),id=h.S().bodybuilding.selections.A1;
  H.bbSet(h,id,0,{load:60,reps:8}); // actual work creates exclusive workout ownership
  const second=H.boot(build,{ls:h.ls,ss:H.memStore({bvom_tab_id:'stageB-secondary'}),supabase:null,online:false}),v=spec(second);
  const raw=h.ls.getItem('bvom_data'),memory=JSON.stringify(second.S()),owner=h.ls.getItem('bvom_workout_tab_owner');
  const result=second.ctx.bvomBbWarmStageBTap('A2',0,v.token);
  return ok(result===false&&raw===h.ls.getItem('bvom_data')&&memory===JSON.stringify(second.S())&&
   owner===h.ls.getItem('bvom_workout_tab_owner'),JSON.stringify({result,owner}));
 });
 test('BB-STAGE-B-ONRAMP-GUIDANCE','CONTROL','On-Ramp never guesses a numeric ramp and offers an optional rest timer without calibration work',()=>{
  const h=H.boot(build);H.bbStart(h,{onramp:true});
  const id=h.S().bodybuilding.selections.A1,e=h.ctx.bvomBbOnRampEx(id);
  e.state='CONFIRMED';e.load=60;h.ctx.renderWarm();
  const html=h.els['#warmup'].innerHTML,before=JSON.stringify(h.S().session),n=h.S().bodybuilding.onramp.sessionsCompleted;
  const rejected=h.ctx.bvomBbWarmStageBTap('A1',0,'madeup'),rest=h.ctx.bvomBbWarmStageBRest(),s=h.S();
  return ok(html.includes('START REST TIMER')&&!html.includes('60 kg ×')&&
   rejected===false&&rest===true&&Number(s.timerStart)>0&&
   JSON.stringify(s.session)===before&&s.bodybuilding.onramp.sessionsCompleted===n&&!s.workoutStartedAt,
   JSON.stringify({rest,timer:s.timerStart,calibration:s.bodybuilding.onramp.sessionsCompleted,hadNumeric:html.includes('60 kg ×')}));
 });
 test('BB-STAGE-B-ORDER-COMPAT','CONTROL','Existing day slots match warm-up and workout cards; arrow preferences remain untouched',()=>{
  const h=selectSquat(fresh()),before=JSON.stringify(h.S().exerciseDisplayOrder||null);
  const warm=h.els['#warmup'].innerHTML,work=h.els['#workout'].innerHTML,slots=['A1','A2','A3','A4','A5','A6'];
  return ok(slots.every(slot=>warm.includes('warm-bb-'+slot)&&work.includes('work-bb-'+slot))&&
   before===JSON.stringify(h.S().exerciseDisplayOrder||null),JSON.stringify({slots:slots.length,orderingUnchanged:true}));
 });
};
