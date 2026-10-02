#!/usr/bin/env node
'use strict';
// BVOM behavioural regression gate (AUTHORITATIVE tier).
// Usage: node behaviour_guard.js <extracted-build-dir> [--only=ID,ID] [--json]
const H=require('./lib/bvom_harness');
const args=process.argv.slice(2),dir=args.find(a=>!a.startsWith('--'));
if(!dir){console.error('Usage: node behaviour_guard.js <extracted-build-dir> [--only=ID,ID] [--json]');process.exit(2)}
const only=(args.find(a=>a.startsWith('--only='))||'').slice(7).split(',').filter(Boolean),asJson=args.includes('--json');
const build=H.loadBuild(dir);
const T=[];
// kind: CONTROL = established behaviour that must keep working; DEFECT = Pass One defect contract (fails on v2.8.0);
// NEGATIVE = must-remain-blocked access control.
const test=(id,kind,title,fn)=>T.push({id,kind,title,fn});
const ok=(cond,detail)=>({pass:!!cond,detail});
const {text,finish,configureLP,bbStart,bbSet,orSet,bbSession,orSession,withClock}=H;

/* ======================= CONTROLS: core programs ======================= */
test('LP-RESCUE-LIVE','CONTROL','LP/RPT live rescue: 100×3 → 90×4 → 80×6+ (plus 4/2/1 first-set misses)',()=>{
  const out=[];let pass=true;
  for(const [miss,want] of [[3,['90×4','80×6+']],[4,['90×5','80×7+']],[2,['90×3','80×5+']],[1,['90×2','80×4+']]]){
    const h=H.boot(build);configureLP(h);h.S().core.Squat.mode='rpt';
    h.reps.push(miss);h.ctx.tapSet('Squat',0);                     // real tap → real modal callback → save → render
    h.ctx.renderWorkout();
    const sq=text(h.els['#workout'].innerHTML.split('work-Squat')[1].split('work-BenchPress')[0]);
    const plan=h.ctx.getSetPlan('Squat').map(q=>`${q.load}×${q.target}${q.amrap?'+':''}`);
    const good=want.every(w=>sq.includes(w))&&plan.slice(1).join()===want.join();
    if(miss===3){h.reps.push(4);h.ctx.tapSet('Squat',1);const p2=h.ctx.getSetPlan('Squat');if(!(p2[2].load===80&&p2[2].target===6&&p2[2].amrap))pass=false;}
    if(!good)pass=false;out.push(`100×${miss} → ${plan.slice(1).join(' ')}`);
  }
  return ok(pass,out.join(' | '));
});
test('LP-PROGRESSION','CONTROL','LP success progresses only the lifts of the day performed',()=>{
  const h=H.boot(build);configureLP(h);for(const n of ['Squat','Bench Press','Prone Row'])for(let i=0;i<3;i++)h.ctx.tapSet(n,i);finish(h);
  const w=h.S().weights;return ok(w.Squat===102.5&&w['Bench Press']===72.5&&w['Prone Row']===62.5&&w['Overhead Press']===45&&w.Deadlift===120&&h.S().history.length===1,JSON.stringify(w));
});
test('HLM-ENTRY-LIVE','CONTROL','HLM entry via live (wrapped) chooseProgramMode seeds drivers; re-entry preserves them',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:100,'Bench Press':80});
  h.choices.push('R');h.ctx.chooseProgramMode('hlm');const S=h.S();
  const seeded=S.programMode==='hlm'&&S.day==='H'&&S.hlm.driver.Squat===100&&S.hlm.driver['Bench Press']===80;
  h.ctx.chooseProgramMode('lprpt');S.weights.Squat=110;h.choices.push('R');h.ctx.chooseProgramMode('hlm');
  return ok(seeded&&h.S().programMode==='hlm'&&h.S().hlm.driver.Squat===100,`seeded=${seeded} mode=${h.S().programMode} driver=${h.S().hlm.driver.Squat}`);
});
test('HLM-HEAVY-DRIVER','CONTROL','HLM Heavy success sets nextHeavy; a Medium miss next day neither counts as failure nor blocks it',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:140,'Bench Press':100});h.choices.push('R');h.ctx.chooseProgramMode('hlm');
  for(let i=0;i<5;i++)h.ctx.tapSet('Squat',i);finish(h);                       // Heavy squat done; rest left incomplete
  h.ctx.switchDay('M');h.reps.push(3);h.ctx.tapSet('Squat',0);h.ctx.tapSet('Squat',1);finish(h);
  const S=h.S();return ok(S.hlm.nextHeavy.Squat===142.5&&S.hlm.failCount.Squat===0,`nextHeavy=${S.hlm.nextHeavy.Squat} failCount=${S.hlm.failCount.Squat}`);
});
test('FOURDAY-DRIVERS','CONTROL','4-Day: Day 1 bench drives; Day 3 medium miss does not; days rotate 1→2→3→4',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,'Bench Press':55});h.choices.push('R');h.ctx.chooseProgramMode('fourday');
  for(let i=0;i<5;i++)h.ctx.tapSet('Bench Press',i);for(let i=0;i<3;i++)h.ctx.tapSet('Prone Row',i);finish(h);const d2=h.S().day;
  for(let i=0;i<5;i++)h.ctx.tapSet('Squat',i);finish(h);const d3=h.S().day;
  h.reps.push(3);h.ctx.tapSet('Bench Press',0);h.ctx.tapSet('Bench Press',1);for(let i=0;i<5;i++)h.ctx.tapSet('Overhead Press',i);finish(h);
  const S=h.S();return ok(S.hlm.nextHeavy['Bench Press']===57.5&&S.hlm.failCount['Bench Press']===0&&d2==='2'&&d3==='3'&&S.day==='4',`nextHeavy=${S.hlm.nextHeavy['Bench Press']} fail=${S.hlm.failCount['Bench Press']} days=${d2},${d3},${S.day}`);
});
test('WARMUP-DISPLAY-ONLY','CONTROL','Completing LP warm-ups never changes working state',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:140});const W=h.ctx.getWarmupPlan('Squat');
  const before=JSON.stringify([h.S().session,h.S().weights,h.S().attempts]);for(let i=0;i<W.sets.length;i++)h.ctx.completeWarmup('Squat',i,W.sets.length,{classList:{add(){},remove(){}}});
  return ok(W.sets.length>0&&before===JSON.stringify([h.S().session,h.S().weights,h.S().attempts])&&!h.ctx.bvomSessionHasActivity(),`warm-up sets=${W.sets.length}`);
});

/* ======================= CONTROLS: Bodybuilding ======================= */
test('BB-CORE-DECISIONS','CONTROL','BB decisions: top 8→increase, 7→hold, 8 hard→hold, 5→reduce to previous; back-offs do not drive; DP 15+8 hold, 15+12 increase',()=>{
  const h=H.boot(build);bbStart(h);const P=()=>h.S().bodybuilding.progression;const r=[];
  bbSession(h);bbSession(h);                                                       // calibration exposures (hold)
  bbSession(h,(id,i)=>id==='machine_chest_press'?{reps:i===0?8:3}:id==='seated_leg_curl'?{reps:i===0?15:8}:{});r.push(P().machine_chest_press.load===62.5,P().seated_leg_curl.load===40);
  bbSession(h);
  bbSession(h,(id,i)=>id==='machine_chest_press'&&i===0?{reps:8,hard:true}:id==='seated_leg_curl'?{reps:i===0?15:12}:{});r.push(P().machine_chest_press.load===62.5,P().seated_leg_curl.load===42.5);
  bbSession(h);
  bbSession(h,(id,i)=>id==='machine_chest_press'&&i===0?{reps:5}:{});r.push(P().machine_chest_press.load===60);
  return ok(r.every(Boolean),`checks=${r.map(x=>x?1:0).join('')} chest=${P().machine_chest_press.load} legcurl=${P().seated_leg_curl.load}`);
});
test('BB-INCOMPLETE-NOT-CONSUMED','CONTROL','Incomplete BB workout is saved but does not consume one of the 24',()=>{
  const h=H.boot(build);bbStart(h);const id=H.bbDayIds(h)[0];bbSet(h,id,0,{reps:7});finish(h);
  const S=h.S();return ok(S.bodybuilding.completedSessions===0&&S.history.length===1&&S.history[0].incomplete===true&&S.day==='A',`completed=${S.bodybuilding.completedSessions} history=${S.history.length}`);
});
test('BB-24-COMPLETION','CONTROL','24 completed sessions complete the block; completion screen rendered',()=>{
  const h=H.boot(build);bbStart(h);for(let k=0;k<24;k++)bbSession(h);h.ctx.renderWorkout();
  const S=h.S();return ok(S.bodybuilding.completedSessions===24&&S.bodybuilding.status==='completed'&&S.day===null&&/24 of 24/.test(text(h.els['#workout'].innerHTML)),`completed=${S.bodybuilding.completedSessions} status=${S.bodybuilding.status}`);
});
test('BB-ONRAMP-HANDOFF','CONTROL','On-Ramp UNSET→PROVISIONAL→CONFIRMED; handoff calibrated; existing performance refs preserved; On-Ramp writes none',()=>{
  const h=H.boot(build);h.S().bodybuilding=h.S().bodybuilding||{};h.ctx.bvomBbEnsure();h.S().bodybuilding.performanceRefs={machine_chest_press:{'machine_chest_press|60':{load:60,reps:8}}};
  bbStart(h,{onramp:true});const st=[];orSession(h);st.push(h.ctx.bvomBbOnRampEx('machine_chest_press').state);orSession(h);orSession(h);st.push(h.ctx.bvomBbOnRampEx('machine_chest_press').state);orSession(h);h.flush();
  const b=h.S().bodybuilding,refs=Object.keys(b.performanceRefs||{});
  return ok(st.join()==='PROVISIONAL,CONFIRMED'&&b.onramp.status==='handed_off'&&b.completedSessions===0&&b.progression.machine_chest_press.calibrated===true&&refs.join()==='machine_chest_press'&&h.S().day==='A',`states=${st} onramp=${b.onramp.status} refs=${refs}`);
});
test('BB-REF-RESET-SUPPRESSION','CONTROL','After a reduction, first exposure at the reduced load raises no ≥30% drop and writes a fresh reference',()=>{
  const h=H.boot(build);bbStart(h);const top=r=>(id,i)=>id==='hack_squat'&&i===0?{reps:r}:{};
  bbSession(h,top(12));bbSession(h);bbSession(h,top(8));bbSession(h);bbSession(h,top(4));bbSession(h);  // 100 cal → 102.5 → reduce to 100
  bbSession(h,top(7));const d=h.S().history.at(-1).bodybuilding.decisions.find(x=>x.id==='hack_squat');const ref=h.S().bodybuilding.performanceRefs.hack_squat['hack_squat|100'];
  return ok(d.drop==null&&ref.reps===7,`drop=${JSON.stringify(d.drop)} ref100=${ref.reps}`);
});
test('BB-UNITS-CONVERTED','CONTROL','Changing units converts BB loads (kg→lb magnitude)',()=>{
  const h=H.boot(build);bbStart(h);h.ctx.changeUnits('lb',true);const l=h.S().bodybuilding.progression.hack_squat.load;
  return ok(h.S().unit==='lb'&&Math.abs(l-220.46)<=5,`hack squat 100 kg → ${l} lb`);
});
test('BB-ACCESSORY-NEUTRAL','CONTROL','BB accessory records sets without progression; no sentinel/i18n keys rendered; share says Bodybuilding',()=>{
  const h=H.boot(build);bbStart(h);const S=h.S();S.accessoryList=[{id:'bbacc',name:'Curls',category:'Upper',assignment:'__BODYBUILDING__',hlmAssignment:'__BODYBUILDING__',fourDayAssignment:'__BODYBUILDING__',freeAssignment:'__BODYBUILDING__',bbAssignment:'Any',style:'straight',sets:2,reps:12,topReps:12,weight:15,increment:2.5,equipment:'dumbbell',plateMode:'standard',drop:5}];
  h.ctx.tapAccessory('bbacc',0);h.ctx.tapAccessory('bbacc',1);h.ctx.renderWorkout();const html=h.els['#workout'].innerHTML;
  bbSession(h);const share=h.ctx.bvomShareWorkoutText(h.S().history.at(-1));
  return ok(h.S().accessoryList[0].weight===15&&!/__BODYBUILDING__|accessories\.assignment/i.test(text(html))&&/Bodybuilding/.test(share)&&!/LP\s*\/\s*RPT/.test(share),`weight=${h.S().accessoryList[0].weight} share="${share.split('\n')[0]}"`);
});
test('CUSTOM-NO-LEAK','CONTROL','Custom Training records sets without touching structured-program state',()=>{
  const h=H.boot(build);configureLP(h);const S=h.S();S.programMode='free';h.ctx.bvomFtEnsure();S.freeTraining.days=[{id:'ft1',compounds:[{lift:'Squat',style:'straight',weight:80,sets:2,reps:8}]}];S.freeTraining.selectedDay=1;S.day='1';h.ctx.bvomFtEnsure();h.ev('save()');
  for(let i=0;i<2;i++){h.ctx.bvomFtSetModal('Squat',i);h.lastOverlay().querySelector('[data-load]').value='80';h.lastOverlay().querySelector('[data-s]').onclick();}
  const before=JSON.stringify([S.weights,S.core,S.attempts]);finish(h);const hist=h.S().history.at(-1);
  return ok(hist?.program==='free'&&Object.keys(hist.session.Squat||{}).length===2&&before===JSON.stringify([h.S().weights,h.S().core,h.S().attempts]),`history=${hist?.program} squatSets=${Object.keys(hist?.session?.Squat||{}).length}`);
});
test('GPP-PAUSE-RESUME','CONTROL','GPP pause freezes elapsed time; resume continues; survives reload while paused',()=>withClock(clock=>{
  const ls=H.memStore();let h=H.boot(build,{ls});configureLP(h);h.ctx.bvomGppEnsure();h.S().gppList.push({id:'g1',name:'Row erg',assignment:'Both',hlmAssignment:'Any',fourDayAssignment:'Any',bbAssignment:null,metrics:{time:true},planned:{timeSeconds:600}});h.ev('save()');
  h.ctx.bvomStartGppTimer('g1');clock.advance(120e3);h.ctx.bvomPauseGppTimer('g1');clock.advance(300e3);
  h=H.boot(build,{ls});const t=()=>h.S().gppSession.g1.timing;const paused=h.ctx.bvomGppElapsed(t());h.ctx.bvomResumeGppTimer('g1');clock.advance(60e3);
  return ok(paused===120e3&&h.ctx.bvomGppElapsed(t())===180e3,`paused=${paused/1000}s resumed=${h.ctx.bvomGppElapsed(t())/1000}s`);
}));
test('F6-STOP-THEN-FINISH','CONTROL','A stopped timed GPP activity is recorded by Finish',()=>withClock(clock=>{
  const h=H.boot(build);configureLP(h);h.ctx.bvomGppEnsure();h.S().gppList.push({id:'g3',name:'Intervals',assignment:'Both',hlmAssignment:'Any',fourDayAssignment:'Any',bbAssignment:null,metrics:{time:true,rounds:true},planned:{rounds:5,workSeconds:30,restSeconds:30}});
  h.ctx.bvomStartGppTimer('g3');clock.advance(95e3);h.ctx.bvomStopGppTimer('g3');finish(h);const g=(h.S().history.at(-1)?.gpp||[]).find(x=>x.id==='g3');
  return ok(g&&g.actual.elapsedSeconds===95,`recorded=${JSON.stringify(g?.actual)}`);
}));

test('BB-RESUME-AFTER-RELOAD','CONTROL','An in-progress BB workout survives app relaunch and finishes as one completed session',()=>{
  const ls=H.memStore();let h=H.boot(build,{ls});bbStart(h);const ids=H.bbDayIds(h);bbSet(h,ids[0],0,{reps:8});bbSet(h,ids[0],1,{reps:10});
  h=H.boot(build,{ls});const kept=Object.keys(h.S().session['BB:'+ids[0]]||{}).length;
  for(const id of H.bbDayIds(h)){const rx=h.ctx.bvomBbPrescription(id);for(let i=0;i<rx.sets.length;i++)if(!h.S().session['BB:'+id]?.[i])bbSet(h,id,i,{reps:rx.sets[i].type==='top'?7:rx.sets[i].maxReps})}finish(h);
  const S=h.S();return ok(kept===2&&S.bodybuilding.completedSessions===1&&S.history.length===1&&S.day==='B',`kept sets=${kept} completed=${S.bodybuilding.completedSessions} day=${S.day}`);
});
test('CLOUD-FINGERPRINT','CONTROL','Comparable cloud fingerprint ignores unsaved mid-workout data, changes on real progress, is stable across relaunch, and normalises pre-BB saves',()=>{
  const ls=H.memStore();let h=H.boot(build,{ls});bbStart(h);bbSession(h);const fp=()=>h.ctx.bvomCloudComparableFingerprint(h.ctx.bvomCloudPayload());
  const f0=fp();bbSet(h,H.bbDayIds(h)[0],0,{reps:8});const fMid=h.ctx.bvomCloudComparableFingerprint(JSON.parse(JSON.stringify(h.S())));  // raw state incl. unsaved workout, as a stored/remote blob would carry it
  h.S().session={};h.S().workoutStartedAt=null;h.ev('save()');
  h=H.boot(build,{ls});h.ctx.renderAll();const fReload=fp();bbSession(h,(id,i,q)=>({reps:q.type==='top'?8:q.maxReps}));const fAfter=fp();
  const legacy=JSON.parse(ls.getItem('bvom_data'));delete legacy.bodybuilding;let legacyOk=true;try{legacyOk=typeof h.ctx.bvomCloudComparableFingerprint(legacy)==='string'&&h.ctx.bvomCloudComparableFingerprint(legacy).length>0}catch(e){legacyOk=false}
  return ok(f0===fMid&&f0===fReload&&fAfter!==f0&&legacyOk,`mid-workout same=${f0===fMid} reload same=${f0===fReload} progress changes=${fAfter!==f0} legacy ok=${legacyOk}`);
});
/* ======================= DEFECT CONTRACTS F1–F12 (fail on v2.8.0) ======================= */
test('F1-MICROPLATES','DEFECT','Per-lift Microplates saved via real Settings save; Press +1 kg progresses 40→41→42',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,'Overhead Press':40});const S=h.S();S.enabledMicro=[1,.75,.5,.25];S.day='B';
  const set=(k,v)=>h.ctx.document.getElementById(k+'OverheadPress').value=v;
  set('plateMode','micro');set('mode','straight');set('inc','1');set('drop','5');set('level','0');set('weight','40');set('bar','20');
  h.ctx.saveLiftSettings('Overhead Press');const w=[];
  for(let k=0;k<2;k++){h.S().session={};h.S().processed={};h.S().processedSnapshots={};for(let i=0;i<5;i++)h.ctx.tapSet('Overhead Press',i);w.push(h.S().weights['Overhead Press'])}
  return ok(h.S().plateMode['Overhead Press']==='micro'&&w.join()==='41,42',`plateMode=${h.S().plateMode['Overhead Press']} weights=${w}`);
});
test('F2-COMPLETED-SET-LABELS','DEFECT','Completed LP sets keep displaying the load lifted; future prescription 102.5',()=>{
  const h=H.boot(build);configureLP(h);for(let i=0;i<3;i++)h.ctx.tapSet('Squat',i);h.ctx.renderWorkout();
  const sq=text(h.els['#workout'].innerHTML.split('work-Squat')[1].split('work-BenchPress')[0]);
  return ok((sq.match(/100×5/g)||[]).length===3&&!/102\.5×5/.test(sq)&&h.S().weights.Squat===102.5,sq.slice(0,80));
});
function f3Scenario(h){bbStart(h);const leg=r=>(id,i)=>id==='seated_leg_curl'?{reps:i===0?r:10}:{};
  bbSession(h,leg(15));bbSession(h);bbSession(h,leg(12));bbSession(h);const mark=h.overlays().length,logMark=h.log.length;
  bbSession(h,leg(9));h.ctx.renderAll();h.flush();
  const ui=[...h.overlays()].slice(mark).map(o=>text(o.innerHTML)).join(' ')+' '+h.log.slice(logMark).map(x=>x.slice(1).join(' ')).join(' ')+' '+text(h.els['#workout'].innerHTML)+' '+text(h.els['#history'].innerHTML);
  return {ui,d:h.S().history.at(-1).bodybuilding.decisions.find(x=>x.id==='seated_leg_curl')};}
const DROP_WORDS=/performance drop|dropped|drop of|well below|lower than (?:usual|your|last)|≥?\s*30\s*%/i;
test('F3-DROP-VISIBLE','DEFECT','≥30% comparable-load drop is presented to the user (and not for a normal session)',()=>{
  const h=H.boot(build);const {ui,d}=f3Scenario(h);
  const h2=H.boot(build);bbStart(h2);bbSession(h2);const mark=h2.overlays().length;bbSession(h2);h2.ctx.renderAll();const quiet=[...h2.overlays()].slice(mark).map(o=>text(o.innerHTML)).join(' ')+text(h2.els['#workout'].innerHTML);
  return ok(d.drop?.triggered===true&&DROP_WORDS.test(ui)&&/Seated Leg Curl/i.test(ui)&&!DROP_WORDS.test(quiet),`internal=${d.drop?.triggered} visible=${DROP_WORDS.test(ui)} normal-session-quiet=${!DROP_WORDS.test(quiet)}`);
});
test('F3-DECISION-UNCHANGED','CONTROL','The drop safeguard does not itself alter the normal progression decision (9 < 10 floor → reduce)',()=>{
  const h=H.boot(build);const {d}=f3Scenario(h);
  return ok(d.decision.action==='reduce'&&h.S().bodybuilding.progression.seated_leg_curl.load===37.5,`decision=${d.decision.action} next=${h.S().bodybuilding.progression.seated_leg_curl.load}`);
});
test('F4-EDITED-LOAD-REDUCTION','DEFECT','After manual edit to 140 (real edit/commit), 140×5 reduces to 137.5 — never the obsolete 100',()=>{
  const h=H.boot(build);bbStart(h);const hs=r=>(id,i)=>id==='hack_squat'&&i===0?{reps:r}:{};
  bbSession(h);bbSession(h);bbSession(h,hs(8));bbSession(h);
  h.ctx.bvomBbOpenFoundationSetup();h.ctx.bvomBbSetupValue('hack_squat','load','140');h.ctx.bvomBbCommitSetup();
  bbSession(h,hs(5));const p=h.S().bodybuilding.progression.hack_squat;
  return ok(p.load===137.5,`100→${'102.5'} then edit 140, 140×5 → ${p.load}`);
});
const q4=x=>Math.abs(x*4-Math.round(x*4))<1e-9;
const INC_OPTIONS={kg:[.5,1,1.5,2,2.5,5],lb:[1,2.5,5,10]};
const convRaw=(x,from,to)=>from===to?Number(x):(from==='kg'?Number(x)*2.2046226218487757:Number(x)/2.2046226218487757);
const nearest=(x,opts)=>opts.reduce((a,b)=>Math.abs(b-x)<Math.abs(a-x)?b:a,opts[0]);
const contractInc=(x,from,to)=>nearest(convRaw(x,from,to),INC_OPTIONS[to]);
const onGrid=(x,step)=>step>0&&Math.abs(x/step-Math.round(x/step))<1e-9;
const contractLoad=(x,from,to,step)=>Math.max(step,Math.round(convRaw(x,from,to)/step)*step);
function f5Block(h){bbStart(h,{incs:{cable_lateral_raise:1.25,incline_dumbbell_press:1,cable_curl:1.25}});
  for(let k=0;k<6;k++)bbSession(h,(id,i,q)=>({reps:q.type==='top'?8:q.maxReps}));}
test('F5-LB-PRACTICAL','DEFECT','kg→lb mid-block uses BVOM practical increment policy; loads/refs/prescriptions stay on that grid, including On-Ramp',()=>{
  const h=H.boot(build);f5Block(h);const before={};for(const id of Object.values(h.S().bodybuilding.selections)){if(!h.ctx.bvomBbNumericExercise(id))continue;const p=h.S().bodybuilding.progression[id];before[id]={load:p.load,inc:p.increment}}
  h.ctx.changeUnits('lb',true);const b=h.S().bodybuilding,bad=[];
  for(const id of Object.values(b.selections)){const p=b.progression[id];if(!h.ctx.bvomBbNumericExercise(id))continue;
    const expInc=contractInc(before[id].inc,'kg','lb'),expLoad=contractLoad(before[id].load,'kg','lb',expInc);
    if(Math.abs(p.increment-expInc)>1e-9)bad.push(`${id}.inc=${p.increment} expected ${expInc}`);
    if(Math.abs(p.load-expLoad)>1e-9)bad.push(`${id}.load=${p.load} expected ${expLoad}`);
    if(!onGrid(p.load,p.increment))bad.push(`${id}.load off grid ${p.load}/${p.increment}`);
    for(const [k,r] of Object.entries(b.performanceRefs[id]||{}))if(k!==h.ctx.bvomBbComparableKey(id,r.load)||!onGrid(r.load,p.increment))bad.push(`ref ${k} load ${r.load} off ${p.increment} grid`)}
  bbSession(h,(id,i,q)=>({reps:q.type==='top'?8:q.maxReps}));bbSession(h,(id,i,q)=>({reps:q.type==='top'?8:q.maxReps}));
  for(const id of Object.values(b.selections)){const p=b.progression[id];if(!h.ctx.bvomBbNumericExercise(id))continue;for(const s of h.ctx.bvomBbPrescription(id).sets)if(s.load!=null&&!onGrid(s.load,p.increment))bad.push(`rx ${id}=${s.load} off ${p.increment} grid`)}
  const o=H.boot(build);bbStart(o,{onramp:true});const e=o.ctx.bvomBbOnRampEx('cable_lateral_raise');e.load=10;e.increment=2.5;o.ctx.changeUnits('lb',true);const expOi=contractInc(2.5,'kg','lb'),expOl=contractLoad(10,'kg','lb',expOi);if(e.increment!==expOi||e.load!==expOl)bad.push(`onramp lateral=${e.load}/+${e.increment} expected ${expOl}/+${expOi}`);
  return ok(!bad.length,bad.slice(0,8).join('; ')+(bad.length>8?` (+${bad.length-8} more)`:''));
});
test('F5-ROUNDTRIP-DRIFT','DEFECT','kg→lb uses the practical target-unit grid, while kg→lb→kg with no training restores the original legitimate Bodybuilding load/increment exactly',()=>{
  const h=H.boot(build);f5Block(h);const b=h.S().bodybuilding,before={};for(const id of Object.values(b.selections))if(h.ctx.bvomBbNumericExercise(id))before[id]=[b.progression[id].load,b.progression[id].increment];
  h.ctx.changeUnits('lb',true);const mid={};for(const id of Object.keys(before)){const p=b.progression[id];mid[id]=[p.load,p.increment]}h.ctx.changeUnits('kg',true);const bad=[];
  for(const [id,[l,inc]] of Object.entries(before)){const [ml,mi]=mid[id],p=b.progression[id];if(!INC_OPTIONS.lb.includes(mi))bad.push(`${id} lb increment ${mi} not policy grid`);if(!onGrid(ml,mi))bad.push(`${id} lb load ${ml} off +${mi} grid`);if(Math.abs(p.load-l)>1e-9)bad.push(`${id} load ${l}→${p.load}`);if(Math.abs(p.increment-inc)>1e-9)bad.push(`${id} increment ${inc}→${p.increment}`)}
  return ok(!bad.length,bad.join('; '));
});
function gppLP(h){configureLP(h);h.ctx.bvomGppEnsure();h.S().gppList.push({id:'g3',name:'Intervals',assignment:'Both',hlmAssignment:'Any',fourDayAssignment:'Any',bbAssignment:null,metrics:{time:true,rounds:true},planned:{rounds:5,workSeconds:30,restSeconds:30}})}
for(const mode of ['RUNNING','PAUSED'])test(`F6-FINISH-REFUSED-${mode}`,'DEFECT',`Finish is refused while a timed GPP activity is ${mode.toLowerCase()}; timer/session intact; Stop then Finish records it`,()=>withClock(clock=>{
  const h=H.boot(build);gppLP(h);if(mode==='RUNNING')h.ctx.tapSet('Squat',0);
  h.ctx.bvomStartGppTimer('g3');clock.advance(95e3);if(mode==='PAUSED')h.ctx.bvomPauseGppTimer('g3');
  const hist0=h.S().history.length,status0=h.S().gppSession.g3?.timing?.status,sets0=JSON.stringify(h.S().session.Squat||{});finish(h);
  const S=h.S(),histDelta=S.history.length-hist0,kept=!!S.gppSession.g3,refused=histDelta===0&&S.gppSession.g3?.timing?.status===status0&&JSON.stringify(S.session.Squat||{})===sets0;
  let recorded=false;if(refused){h.ctx.bvomStopGppTimer('g3');finish(h);recorded=(h.S().history.at(-1)?.gpp||[]).some(x=>x.id==='g3')}
  return ok(refused&&recorded,`on Finish: history +${histDelta}, timer kept=${kept}; after Stop+Finish recorded=${recorded}`);
}));
test('F7-ONRAMP-ABOVE-RANGE','DEFECT','On-Ramp 100×14 (target 6–8) with About right does not stay unchanged at 100 across exposures',()=>{
  const h=H.boot(build);bbStart(h,{onramp:true});const hs=id=>id==='hack_squat'?{reps:14,feel:'about_right'}:{};
  for(let k=0;k<5;k++){if(h.S().bodybuilding.onramp.status!=='active')break;orSession(h,hs)}
  const e=h.ctx.bvomBbOnRampEx('hack_squat');return ok(Number(e.load)>100,`after 3 exposures: ${e.state} @ ${e.load}`);
});
test('F8-ACTUAL-LOAD','DEFECT','Recorded Actual 55×8 (prescribed 60) → next 57.5; refs and progression agree on 55',()=>{
  const h=H.boot(build);bbStart(h);bbSession(h);bbSession(h);
  bbSession(h,(id,i)=>id==='machine_chest_press'?(i===0?{reps:8,load:55}:{reps:10,load:50}):{});
  const b=h.S().bodybuilding;return ok(b.progression.machine_chest_press.load===57.5&&!!b.performanceRefs.machine_chest_press['machine_chest_press|55'],`next=${b.progression.machine_chest_press.load}`);
});
test('F9-SAME-EXPOSURE-EDIT','DEFECT','Correcting set 1 in the same On-Ramp exposure (70×4 → 70×7) does not confirm or add sets',()=>{
  const h=H.boot(build);bbStart(h,{onramp:true});orSet(h,'machine_chest_press',0,{load:70,reps:4});orSet(h,'machine_chest_press',0,{load:70,reps:7});
  const e=h.ctx.bvomBbOnRampEx('machine_chest_press');return ok(e.state!=='CONFIRMED'&&h.ctx.bvomBbOnRampSetCount('machine_chest_press')===1,`${e.state}, set count ${h.ctx.bvomBbOnRampSetCount('machine_chest_press')}`);
});
test('F10-SKIP-KEEPS-CONFIRMED','DEFECT','Skip via missing-load/manual path keeps CONFIRMED; first main 8-rep top set progresses normally',()=>{
  const h=H.boot(build);bbStart(h,{onramp:true});orSession(h);orSession(h);orSession(h);h.flush();
  const conf=h.ctx.bvomBbOnRampEx('machine_chest_press').state;h.ctx.prompt=()=> '1';h.ctx.bvomBbOnRampSwap('B6');h.ctx.bvomBbOnRampSkip();
  const nb=h.S().bodybuilding.selections.B6;h.ctx.bvomBbSetupValue(nb,'load','15');h.ctx.bvomBbSetupValue(nb,'increment','2.5');h.ctx.bvomBbCommitSetup();
  bbSession(h,(id,i)=>id==='machine_chest_press'&&i===0?{reps:8}:{});const d=h.S().history.at(-1).bodybuilding.decisions.find(x=>x.id==='machine_chest_press');
  return ok(conf==='CONFIRMED'&&!d.calibration&&d.decision.action==='increase',`on-ramp=${conf}; first main: ${d.decision.action}${d.calibration?' (calibration path)':''}`);
});
test('F11-BARBELL-WARMUP-FLOOR','DEFECT','Rendered BB barbell warm-ups never go below the 20 kg bar (Barbell Bench 25 kg)',()=>{
  const h=H.boot(build);bbStart(h);h.ctx.bvomBbOpenFoundationSetup();h.ctx.bvomBbSetupSelect('A1','barbell_bench_press');h.ctx.bvomBbSetupValue('barbell_bench_press','load','25');h.ctx.bvomBbSetupValue('barbell_bench_press','increment','2.5');h.ctx.bvomBbCommitSetup();
  h.ctx.renderWarm();const t=text(h.els['#warmup'].innerHTML),i=t.indexOf('Barbell Bench Press'),seg=t.slice(i,t.indexOf('Hack Squat',i));
  const loads=[...seg.matchAll(/([\d.]+) kg ×/g)].map(m=>+m[1]);return ok(i>=0&&loads.length>0&&loads.every(x=>x>=20),seg.slice(0,110));
});
async function establish({status='subscriber',verifyOnline=true,signIn=true}={}){
  const ls=H.memStore(),net={online:true},mk=o=>H.mockSupabase({net,entitlement:[{status,user_id:'user-1',trial_ends_at:null}],session:signIn,...o});
  if(signIn&&verifyOnline){const h=await H.launch(build,{ls,net,supabase:mk()});configureLP(h);}
  else if(signIn){ls.setItem('bvom_data_owner','user-1');const h=H.boot(build,{ls});configureLP(h);}
  net.online=false;return {ls,net,mk};
}
const appUsable=h=>h.visible('#app')&&!h.visible('#authgate');
test('F12-OFFLINE-SUBSCRIBER','DEFECT','Verified subscriber relaunching offline: local training visible in A) RPC unavailable B) refresh impossible C) Supabase client unavailable',async()=>{
  const r=[];{const {ls,net,mk}=await establish();r.push(['A',appUsable(await H.launch(build,{ls,net,supabase:mk()}))]);}
  {const {ls,net,mk}=await establish();r.push(['B',appUsable(await H.launch(build,{ls,net,supabase:mk({refreshImpossibleOffline:true})}))]);}
  {const {ls,net}=await establish();r.push(['C',appUsable(await H.launch(build,{ls,net,supabase:null}))]);}
  return ok(r.every(x=>x[1]),r.map(x=>x.join(':')).join(' '));
});
test('F12-OFFLINE-COMPLIMENTARY','DEFECT','Verified complimentary user relaunching offline (A and C): local training visible',async()=>{
  const r=[];{const {ls,net,mk}=await establish({status:'complimentary'});r.push(['A',appUsable(await H.launch(build,{ls,net,supabase:mk()}))]);}
  {const {ls,net}=await establish({status:'complimentary'});r.push(['C',appUsable(await H.launch(build,{ls,net,supabase:null}))]);}
  return ok(r.every(x=>x[1]),r.map(x=>x.join(':')).join(' '));
});
test('F12-ONLINE-CONTROL','CONTROL','Verified subscriber relaunching online sees the app',async()=>{const {ls,net,mk}=await establish();net.online=true;return ok(appUsable(await H.launch(build,{ls,net,supabase:mk()})),'')});
test('F12-NEG-NEVER-AUTHENTICATED','NEGATIVE','Never-authenticated first launch offline stays blocked',async()=>{const ls=H.memStore(),net={online:false};
  const a=await H.launch(build,{ls,net,supabase:H.mockSupabase({net,session:false})}),b=await H.launch(build,{ls:H.memStore(),net,supabase:null});return ok(!appUsable(a)&&!appUsable(b),`with client=${appUsable(a)} no client=${appUsable(b)}`)});
test('F12-NEG-NEVER-VERIFIED','NEGATIVE','Signed-in owner whose entitlement was never verified stays blocked offline',async()=>{const {ls,net,mk}=await establish({verifyOnline:false});const a=await H.launch(build,{ls,net,supabase:mk()});return ok(!appUsable(a),`app usable=${appUsable(a)}`)});
test('F12-NEG-EXPIRED','NEGATIVE','Known-expired entitlement stays blocked (online and offline)',async()=>{const {ls,net,mk}=await establish({status:'expired'});
  const off=await H.launch(build,{ls,net,supabase:mk()}),offC=await H.launch(build,{ls,net,supabase:null});net.online=true;const on=await H.launch(build,{ls,net,supabase:mk()});
  return ok(!appUsable(off)&&!appUsable(offC)&&!appUsable(on)&&/EXPIRED/.test(text(on.els['#authgate'].innerHTML)),`offline=${appUsable(off)} offlineNoClient=${appUsable(offC)} online=${appUsable(on)}`)});
test('F12-NEG-SIGNED-OUT','NEGATIVE','Explicit sign-out revokes offline relaunch eligibility without deleting local training data',async()=>{
  const ls=H.memStore(),net={online:true},mk=()=>H.mockSupabase({net,entitlement:[{status:'subscriber',user_id:'user-1'}],session:true});
  const h=await H.launch(build,{ls,net,supabase:mk()});H.configureLP(h);await h.ctx.bvomCloudSignOut();net.online=false;
  const off=await H.launch(build,{ls,net,supabase:null});return ok(!appUsable(off)&&off.S().configured===true,`app usable=${appUsable(off)} configured=${off.S().configured}`);
});
test('F12-NEG-SIGNOUT-OFFLINE','NEGATIVE','Choosing Sign Out while offline revokes offline relaunch eligibility even if the server call fails or the Supabase client is unavailable',async()=>{
  const r=[];
  {const ls=H.memStore(),net={online:true},sup=H.mockSupabase({net,entitlement:[{status:'subscriber',user_id:'user-1'}],session:true,signOutFailsOffline:true});const h=await H.launch(build,{ls,net,supabase:sup});H.configureLP(h);net.online=false;h.ctx.navigator.onLine=false;await h.ctx.bvomCloudSignOut();const off=await H.launch(build,{ls,net,supabase:null});r.push(['server-fail',!appUsable(off)&&off.S().configured===true]);}
  {const {ls,net}=await establish();const h=await H.launch(build,{ls,net,supabase:null});if(!appUsable(h))r.push(['no-client','N/A']);else{await h.ctx.bvomCloudSignOut();const off=await H.launch(build,{ls,net,supabase:null});r.push(['no-client',!appUsable(off)&&off.S().configured===true]);}}
  return ok(r.every(x=>x[1]===true||x[1]==='N/A'),r.map(x=>x.join(':')).join(' '));
});
test('F12-NEG-SIGNED-OUT-EVENT','NEGATIVE','A SIGNED_OUT auth event revokes cached offline eligibility so a later offline relaunch stays gated',async()=>{
  const ls=H.memStore(),net={online:true},sup=H.mockSupabase({net,entitlement:[{status:'subscriber',user_id:'user-1'}],session:true});const h=await H.launch(build,{ls,net,supabase:sup});H.configureLP(h);
  sup._emitAuth('SIGNED_OUT',null);h.flush();net.online=false;h.ctx.navigator.onLine=false;const off=await H.launch(build,{ls,net,supabase:null});
  return ok(!appUsable(off)&&off.S().configured===true,`app usable=${appUsable(off)} configured=${off.S().configured}`);
});
test('F12-NEG-OWNER-MISMATCH','NEGATIVE','Cached entitlement cannot unlock a different local data owner',async()=>{
  const {ls,net}=await establish();ls.setItem('bvom_data_owner','user-2');const off=await H.launch(build,{ls,net,supabase:null});return ok(!appUsable(off),`app usable=${appUsable(off)}`);
});
test('F12-NEG-GRACE-EXPIRED','NEGATIVE','Offline entitlement older than the 7-day grace cannot unlock training',async()=>{
  const {ls,net}=await establish();const k='bvom_entitlement_cache_user-1',x=JSON.parse(ls.getItem(k));x.verifiedAt=new Date(Date.now()-8*24*60*60*1000).toISOString();ls.setItem(k,JSON.stringify(x));const off=await H.launch(build,{ls,net,supabase:null});return ok(!appUsable(off),`app usable=${appUsable(off)}`);
});
test('F12-OFFLINE-NO-CLOUD-WITHOUT-SESSION','CONTROL','Offline local-owner access never assesses or enables cloud sync until a real Supabase session exists',async()=>{
  const {ls,net,mk}=await establish();const h=await H.launch(build,{ls,net,supabase:null});if(!appUsable(h))return ok(true,'N/A on builds without verified-owner offline access');
  net.online=true;h.ctx.navigator.onLine=true;h.ctx.supabase=mk();await h.ctx.bvomCloudAssessSync();h.flush();return ok(h.ev('bvomCloud.syncReady')===false&&h.ev('bvomCloud.pendingAuto')===false,`syncReady=${h.ev('bvomCloud.syncReady')} pendingAuto=${h.ev('bvomCloud.pendingAuto')}`);
});


/* ======================= COLD-AUDIT FOLLOW-UPS: F13–F16 ======================= */
test('F13-BB-UNIT-CHANGE-ATOMIC','DEFECT','Active Bodybuilding unit change is atomic: rendered prescription, logged set and progression stay on the same physical/grid load',()=>{
  const out=[];let pass=true;
  // Display path: 100 lb must not remain visibly "100 kg" after conversion.
  {const h=H.boot(build);h.ctx.changeUnits('lb',true);bbStart(h,{loads:{...H.BB_LOADS,machine_chest_press:100},incs:{machine_chest_press:5}});h.ctx.renderWorkout();h.ctx.changeUnits('kg',true);
   const p=h.S().bodybuilding.progression.machine_chest_press,ui=text(h.els['#workout'].innerHTML),i=ui.indexOf('Machine Chest Press'),seg=ui.slice(i,i+220),want=`${p.load} kg`;
   const good=i>=0&&seg.includes(want)&&!seg.includes('100 kg × 6–8');pass=pass&&good;out.push(`display next=${p.load}kg segment="${seg.slice(0,100)}"`)}
  // State path: a logged 22 kg top set must convert to the same 47.5 lb prescription grid; finishing must match finish-then-convert (50 lb next).
  {const h=H.boot(build);bbStart(h,{loads:{...H.BB_LOADS,machine_chest_press:22},incs:{machine_chest_press:1}});h.S().bodybuilding.progression.machine_chest_press.calibrated=true;bbSet(h,'machine_chest_press',0,{reps:8,load:22});h.ctx.changeUnits('lb',true);
   const p=h.S().bodybuilding.progression.machine_chest_press,logged=h.S().session['BB:machine_chest_press']?.[0]?.load,top=h.ctx.bvomBbPrescription('machine_chest_press').sets[0].load;
   const aligned=logged===top&&top===p.load;pass=pass&&aligned;out.push(`active logged=${logged} rx=${top} prog=${p.load}`);
   for(const id of H.bbDayIds(h)){const rx=h.ctx.bvomBbPrescription(id);for(let j=0;j<rx.sets.length;j++){if(id==='machine_chest_press'&&j===0)continue;bbSet(h,id,j,{reps:rx.sets[j].type==='top'?7:rx.sets[j].maxReps})}}finish(h);
   const next=h.S().bodybuilding.progression.machine_chest_press.load;pass=pass&&next===50;out.push(`finish next=${next}`)}
  return ok(pass,out.join(' | '));
});
test('F13-ONRAMP-UNIT-CHANGE-ATOMIC','DEFECT','On-Ramp unit change rerenders the converted load instead of relabelling the old number',()=>{
  const h=H.boot(build);h.ctx.changeUnits('lb',true);bbStart(h,{onramp:true});const e=h.ctx.bvomBbOnRampEx('machine_chest_press');e.state='PROVISIONAL';e.load=100;e.increment=5;h.ctx.renderWorkout();h.ctx.changeUnits('kg',true);
  const ui=text(h.els['#workout'].innerHTML),i=ui.indexOf('Machine Chest Press'),seg=ui.slice(i,i+220),want=`${e.load} kg`;
  return ok(i>=0&&seg.includes(want)&&!seg.includes('100 kg × 6–8'),`state=${e.load}kg/+${e.increment}; segment="${seg.slice(0,120)}"`);
});
test('F14-INCREMENT-ROUNDTRIP','DEFECT','A no-training kg→lb→kg round trip preserves valid 1.5 kg and 2 kg progression increments',()=>{
  const bad=[];
  for(const inc0 of [1.5,2]){
    const h=H.boot(build);configureLP(h);h.S().core['Overhead Press'].increment=inc0;h.ctx.changeUnits('lb',true);const mid=h.S().core['Overhead Press'].increment;h.ctx.changeUnits('kg',true);const back=h.S().core['Overhead Press'].increment;if(back!==inc0)bad.push(`core ${inc0}→${mid}→${back}`);
    const b=H.boot(build);bbStart(b,{loads:{...H.BB_LOADS},incs:{machine_chest_press:inc0}});const p=b.S().bodybuilding.progression.machine_chest_press;b.ctx.changeUnits('lb',true);const bmid=p.increment;b.ctx.changeUnits('kg',true);if(p.increment!==inc0)bad.push(`BB ${inc0}→${bmid}→${p.increment}`);
  }
  return ok(!bad.length,bad.join('; '));
});
test('F15-NONBARBELL-ACCESSORY-INCREMENTS','DEFECT','Dumbbell/machine accessories progress by the selected increment, not the barbell plate grid',()=>{
  const bad=[];
  for(const equipment of ['dumbbell','machine'])for(const inc0 of [.5,1,1.5,2,2.5,5]){
    const h=H.boot(build);configureLP(h);const a={id:'a1',name:'Test '+equipment,category:'Upper',assignment:'A',hlmAssignment:'Any',fourDayAssignment:'Any',freeAssignment:null,bbAssignment:null,equipment,plateMode:'standard',style:'straight',sets:1,reps:8,topReps:8,weight:10,increment:inc0,drop:5};h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:10,attempts:0}};h.reps.push(8);h.ctx.tapAccessory('a1',0);const want=10+inc0;if(Math.abs(a.weight-want)>1e-9)bad.push(`${equipment} +${inc0}: ${a.weight} (want ${want})`)
  }
  return ok(!bad.length,bad.join('; '));
});
function gppMetricStopScenario(){return withClock(clock=>{const ls=H.memStore(),h=H.boot(build,{ls});configureLP(h);h.ctx.bvomGppEnsure();h.S().gppList.push({id:'gstop',name:'Intervals',assignment:'Both',hlmAssignment:'Any',fourDayAssignment:'Any',bbAssignment:null,metrics:{time:true,reps:true,load:true},planned:{rounds:5,workSeconds:30,restSeconds:30,reps:10,load:20}});h.ctx.bvomStartGppTimer('gstop');clock.advance(10e3);h.ctx.bvomStopGppTimer('gstop');return {h,ls,mem:h.S().gppSession.gstop};})}
test('F16-GPP-STOP-PERSISTS','DEFECT','Stopping timed GPP with extra result metrics persists stopped status/elapsed before the result modal is saved',()=>{
  const {ls,mem}=gppMetricStopScenario(),r=H.boot(build,{ls}),x=r.S().gppSession.gstop;
  return ok(mem?.timing?.status==='stopped'&&x?.timing?.status==='stopped'&&x?.actual?.elapsedSeconds===10,`memory=${mem?.timing?.status}/${mem?.actual?.elapsedSeconds}s reload=${x?.timing?.status}/${x?.actual?.elapsedSeconds}s`);
});
test('F16-GPP-RESULT-RECOVERY','DEFECT','After reload of a stopped GPP activity with unsaved extra metrics, the user can resume/complete result entry',()=>{
  const {ls}=gppMetricStopScenario(),r=H.boot(build,{ls});r.ctx.renderWorkout();
  const overlays=r.overlays().map(o=>text(o.innerHTML)).join(' '),ui=text(r.els['#workout'].innerHTML),route=/SAVE RESULT|ENTER RESULT|COMPLETE RESULT|RECORD RESULT/i.test(overlays+' '+ui),x=r.S().gppSession.gstop;
  return ok(x?.timing?.status==='stopped'&&route,`status=${x?.timing?.status}; recovery=${route}; ui="${ui.match(/Intervals.{0,160}/)?.[0]||''}"`);
});



/* ======================= SECOND COLD-AUDIT FOLLOW-UPS: F17–F19 ======================= */
function setLiftSettingsFields(h,n,{weight,increment,drop=10,mode='straight',level=0,rep=5,bar=20}={}){
  const id=n.replace(/\W/g,''),d=h.ctx.document;
  const vals={['plateMode'+id]:'standard',['mode'+id]:mode,['inc'+id]:String(increment),['drop'+id]:String(drop),['level'+id]:String(level),['weight'+id]:String(weight),['bar'+id]:String(bar),['hlmRep'+id]:String(rep)};
  for(const [k,v] of Object.entries(vals))d.getElementById(k).value=v;
}
test('F17-POSTCOMPLETE-SETTINGS-SURVIVE-CORRECTION','DEFECT','Explicit Advanced Lift Settings saved after a completed lift remain authoritative when an earlier set is corrected (LP/RPT, HLM Heavy, 4-Day driver)',()=>{
  const out=[];let pass=true;
  // LP/RPT
  {const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:40});for(let i=0;i<3;i++)h.ctx.tapSet('Squat',i);
   setLiftSettingsFields(h,'Squat',{weight:50,increment:1});h.ctx.saveLiftSettings('Squat');const saved=h.S().weights.Squat===50&&h.S().core.Squat.increment===1;
   h.ctx.tapSet('Squat',0);const kept=h.S().weights.Squat===50&&h.S().core.Squat.increment===1;pass=pass&&saved&&kept;out.push(`LP saved=${saved} after-correction=${h.S().weights.Squat}/+${h.S().core.Squat.increment}`)}
  // HLM Heavy driver
  {const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:100,'Bench Press':80});h.choices.push('R');h.ctx.chooseProgramMode('hlm');for(let i=0;i<5;i++)h.ctx.tapSet('Squat',i);
   setLiftSettingsFields(h,'Squat',{weight:120,increment:1});h.ctx.saveLiftSettings('Squat');const saved=h.S().hlm.driver.Squat===120&&h.S().weights.Squat===120&&h.S().core.Squat.increment===1;
   h.ctx.tapSet('Squat',0);const kept=h.S().hlm.driver.Squat===120&&h.S().weights.Squat===120&&h.S().core.Squat.increment===1;pass=pass&&saved&&kept;out.push(`HLM saved=${saved} after-correction=${h.S().hlm.driver.Squat}/+${h.S().core.Squat.increment}`)}
  // 4-Day driver
  {const h=H.boot(build);configureLP(h,{...H.LP_W,'Bench Press':55});h.choices.push('R');h.ctx.chooseProgramMode('fourday');for(let i=0;i<5;i++)h.ctx.tapSet('Bench Press',i);
   setLiftSettingsFields(h,'Bench Press',{weight:90,increment:1,drop:5});h.ctx.saveLiftSettings('Bench Press');const saved=h.S().hlm.driver['Bench Press']===90&&h.S().weights['Bench Press']===90&&h.S().core['Bench Press'].increment===1;
   h.ctx.tapSet('Bench Press',0);const kept=h.S().hlm.driver['Bench Press']===90&&h.S().weights['Bench Press']===90&&h.S().core['Bench Press'].increment===1;pass=pass&&saved&&kept;out.push(`4D saved=${saved} after-correction=${h.S().hlm.driver['Bench Press']}/+${h.S().core['Bench Press'].increment}`)}
  return ok(pass,out.join(' | '));
});
function editAccessoryViaBuilder(h,a,newIncrement){
  h.ctx.openAccessoryBuilder(a.id);const o=h.lastOverlay();if(!o)return false;const q=s=>o.querySelector(s);
  q('#accCat').value=a.category||'Upper';q('#accName').value=a.name;q('#accAssign').value=a.assignment||'A';q('#accEquipment').value=a.equipment||'machine';q('#accPlateMode').value=a.plateMode||'standard';q('#accStyle').value=a.style||'straight';q('#accSets').value=String(a.sets||3);q('#accReps').value=String(a.reps||8);q('#accTopReps').value=String(a.topReps||a.reps||8);q('#accWeight').value=String(a.weight);q('#accInc').value=String(newIncrement);q('#accBar').value=String(a.barWeight||20);q('#accSave').onclick();return true;
}
function accessoryFixture(id='a1',name='Lat Pulldown'){return{id,name,category:'Upper',assignment:'A',hlmAssignment:'Any',fourDayAssignment:'Any',freeAssignment:null,bbAssignment:null,equipment:'machine',plateMode:'standard',style:'straight',sets:3,reps:8,topReps:8,weight:30,increment:2.5,drop:5}}
test('F18-ACTIVE-ACCESSORY-EDIT-PRESERVES-SESSION','DEFECT','Editing an accessory during an active workout preserves logged sets/processed state and cannot create a double-progression path; Bodybuilding logged accessory sets also survive',()=>{
  const out=[];let pass=true;
  // Partial LP accessory: one recorded set must survive a template edit.
  {const h=H.boot(build);configureLP(h);const a=accessoryFixture();h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:30,attempts:0}};h.ctx.tapAccessory('a1',0);const before=JSON.stringify(h.S().session['ACC:a1']);editAccessoryViaBuilder(h,a,1);const after=h.S().session['ACC:a1'];const good=JSON.stringify(after)===before&&a.increment===1;pass=pass&&good;out.push(`partial sets=${Object.keys(after||{}).length} inc=${a.increment}`)}
  // Completed LP accessory: keep the completed session and processed guard after changing only increment.
  {const h=H.boot(build);configureLP(h);const a=accessoryFixture();h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:30,attempts:0}};for(let i=0;i<3;i++)h.ctx.tapAccessory('a1',i);const progressed=a.weight;editAccessoryViaBuilder(h,a,1);const ss=h.S().session['ACC:a1'],processed=!!h.S().processed?.['ACC:a1'];const good=Object.keys(ss||{}).length===3&&processed&&a.weight===progressed&&a.increment===1;pass=pass&&good;out.push(`complete sets=${Object.keys(ss||{}).length} processed=${processed} weight=${a.weight} inc=${a.increment}`)}
  // Bodybuilding accessory uses the same builder save path: a recorded set must not disappear.
  {const h=H.boot(build);bbStart(h);h.S().processed=h.S().processed||{};const a={...accessoryFixture('bbacc','Cable Curl'),assignment:'__BODYBUILDING__',hlmAssignment:'__BODYBUILDING__',fourDayAssignment:'__BODYBUILDING__',freeAssignment:'__BODYBUILDING__',bbAssignment:'Any',sets:2,reps:12,topReps:12,weight:15};h.S().accessoryList=[a];h.S().accessoryProgress={bbacc:{weight:15,attempts:0}};h.ctx.tapAccessory('bbacc',0);const before=JSON.stringify(h.S().session['ACC:bbacc']);editAccessoryViaBuilder(h,a,1);const after=h.S().session['ACC:bbacc'];const good=JSON.stringify(after)===before;pass=pass&&good;out.push(`BB sets=${Object.keys(after||{}).length}`)}
  return ok(pass,out.join(' | '));
});
test('F19-POSTCOMPLETE-WEIGHT-EDIT-CORRECTION-ATOMIC','DEFECT','Changing a completed lift working weight then correcting a set cannot mix old/new prescription loads or progress the lift a second time',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:40});for(let i=0;i<3;i++)h.ctx.tapSet('Squat',i);const firstProgress=h.S().weights.Squat;
  h.ctx.bvomWeightModal=(n,current,onSave)=>onSave(50);h.ctx.editWeight('Squat');const selected=h.S().weights.Squat;
  h.ctx.tapSet('Squat',0);for(let i=1;i<3;i++)if(!h.S().session.Squat?.[i])h.ctx.tapSet('Squat',i);
  const loads=Object.values(h.S().session.Squat||{}).filter(x=>x&&x.reps!==undefined).map(x=>Number(x.load)),unique=[...new Set(loads)],final=h.S().weights.Squat;
  return ok(firstProgress===42.5&&selected===50&&final===50&&unique.length<=1,`first=${firstProgress} selected=${selected} final=${final} loads=${loads.join('/')}`);
});

/* ======================= THIRD COLD-AUDIT FOLLOW-UP: F20 ======================= */
test('F20-STARTING-SETUP-ACTIVE-WORKOUT-GUARD','DEFECT','Run Starting Setup Again cannot erase or orphan an unfinished workout, while remaining available when no workout is active',async()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:40});h.ctx.tapSet('Squat',0);
  const before=JSON.parse(JSON.stringify(h.S().session.Squat||{})),beforeHistory=h.S().history.length,beforeActive=h.ctx.bvomStateWorkoutActive(h.S());
  // Entitlement is outside this contract; let the real setup-completion path proceed if the UI allows entry.
  h.ev("bvomCloud.user={id:'user-1',email:'lifter@example.com'}");h.ctx.bvomEntitlementStartTrial=async()=>true;
  h.ctx.bvomStartingSetupModal();const o=h.lastOverlay(),html=String(o?.innerHTML||'');
  if(/data-r/.test(html)){const run=o.querySelector('[data-r]');if(run?.onclick)run.onclick()}
  const enteredSetup=h.S().configured===false;
  if(enteredSetup){await h.ctx.completeSetup();h.flush()}
  const S=h.S(),after=S.session?.Squat||{},sameSet=JSON.stringify(after)===JSON.stringify(before),historyKept=S.history.length===beforeHistory,hasRecorded=Object.values(after).some(x=>x&&x.reps!==undefined),active=h.ctx.bvomStateWorkoutActive(S),ghost=active&&!hasRecorded;
  const h2=H.boot(build);configureLP(h2);h2.ev("bvomCloud.user={id:'user-2',email:'idle@example.com'}");h2.ctx.bvomEntitlementStartTrial=async()=>true;h2.ctx.bvomStartingSetupModal();const o2=h2.lastOverlay(),run2=o2?.querySelector('[data-r]'),idleAllowed=!!run2?.onclick;if(run2?.onclick)run2.onclick();const idleEntered=h2.S().configured===false;
  const h3=H.boot(build);configureLP(h3,{...H.LP_W,Squat:100});h3.choices.push('R');h3.ctx.chooseProgramMode('hlm');h3.S().hlm.rep.Squat=2;h3.S().session.Squat={0:{reps:1,load:100}};h3.ev('save()');const hlmBefore=JSON.stringify(h3.S().session.Squat);h3.choices.push('R');h3.ctx.offerHlmRepChoice('Squat');const hlmBlocked=h3.S().configured===true&&JSON.stringify(h3.S().session.Squat)===hlmBefore&&h3.ctx.bvomStateWorkoutActive(h3.S());
  return ok(beforeActive&&sameSet&&historyKept&&!ghost&&idleAllowed&&idleEntered&&hlmBlocked,`settings active: enteredSetup=${enteredSetup} beforeSets=${Object.keys(before).length} afterSets=${Object.keys(after).length} history=${S.history.length} active=${active} ghost=${ghost} | idle: allowed=${idleAllowed} entered=${idleEntered} | HLM active blocked=${hlmBlocked}`);
});



/* ======================= FOURTH COLD-AUDIT FOLLOW-UPS: F21–F22 ======================= */
test('F21-ONRAMP-FAILED-HANDOFF-VALIDATION-NONDESTRUCTIVE','DEFECT','Failed manual validation after Skip On-Ramp must leave the active On-Ramp transaction untouched and recoverable after reload',()=>{
  const ls=H.memStore(),h=H.boot(build,{ls});bbStart(h,{onramp:true});orSession(h); // A exposure establishes some loads; B still has UNSET numeric exercises.
  const S=h.S(),before=JSON.parse(JSON.stringify(S.bodybuilding.onramp)),beforeCompleted=Number(S.bodybuilding.completedSessions||0),beforeDay=S.day;
  const missing=Object.values(S.bodybuilding.selections).find(id=>h.ctx.bvomBbNumericExercise(id)&&!(h.ctx.bvomBbOnRampNumericValue(id)>0));
  h.ctx.bvomBbOnRampSkip(); // opens manual setup with known On-Ramp values copied in
  const draft=h.ctx.__bvomBbSetupDraft;if(missing&&draft?.progression?.[missing]){draft.progression[missing].load=null;draft.progression[missing].increment=null}
  h.ctx.bvomBbCommitSetup(); // must fail validation without handing off
  const mem=h.S(),memSame=mem.bodybuilding?.onramp?.status==='active'&&mem.bodybuilding.onramp.sessionsCompleted===before.sessionsCompleted&&JSON.stringify(mem.bodybuilding.onramp.exercises)===JSON.stringify(before.exercises)&&Number(mem.bodybuilding.completedSessions||0)===beforeCompleted;
  const r=H.boot(build,{ls}),R=r.S(),reloadSame=R.bodybuilding?.onramp?.status==='active'&&R.bodybuilding.onramp.sessionsCompleted===before.sessionsCompleted&&JSON.stringify(R.bodybuilding.onramp.exercises)===JSON.stringify(before.exercises)&&Number(R.bodybuilding.completedSessions||0)===beforeCompleted;
  return ok(!!missing&&memSame&&reloadSame,`missing=${missing} before=${before.status}/${before.sessionsCompleted}/day${beforeDay} memory=${mem.bodybuilding?.onramp?.status}/${mem.bodybuilding?.onramp?.sessionsCompleted}/bb${mem.bodybuilding?.completedSessions} reload=${R.bodybuilding?.onramp?.status}/${R.bodybuilding?.onramp?.sessionsCompleted}/bb${R.bodybuilding?.completedSessions}`);
});
function optionalDeadliftSkipCorrectionCase(mode,correctedReps=5){
  const h=H.boot(build);configureLP(h,{...H.LP_W,Deadlift:100});h.choices.push('R');h.ctx.chooseProgramMode(mode);h.ctx.switchDay(mode==='hlm'?'L':'4');h.S().hlm.optionalSingles=true;h.ev('save()');
  h.ctx.tapSet('Deadlift',0);const beforeSkip=h.S().weights.Deadlift,optional=h.ctx.getSetPlan('Deadlift').some(q=>q.optional);h.ctx.skipOptionalSingle('Deadlift');const afterSkip=h.S().weights.Deadlift,processedAfterSkip=!!h.S().processed?.Deadlift,snapAfterSkip=!!h.S().processedSnapshots?.Deadlift;
  h.reps.push(correctedReps);h.ctx.tapSet('Deadlift',0);
  // A corrected straight-set miss opens BVOM's normal rescue work. Complete it so the
  // contract can assert the final failure/progression state rather than inspecting a
  // deliberately incomplete correction transaction.
  if(correctedReps<5){let plan=h.ctx.getSetPlan('Deadlift');for(let i=1;i<plan.length;i++){if(!h.S().session.Deadlift?.[i])h.ctx.tapSet('Deadlift',i);plan=h.ctx.getSetPlan('Deadlift')}}
  const final=h.S().weights.Deadlift,loads=Object.values(h.S().session.Deadlift||{}).filter(x=>x&&x.reps!==undefined).map(x=>Number(x.load));
  return {beforeSkip,optional,afterSkip,processedAfterSkip,snapAfterSkip,final,loads,attempts:h.S().attempts.Deadlift||0};
}
test('F22-OPTIONAL-DEADLIFT-SKIP-CORRECTION-ATOMIC','DEFECT','Skipping the optional Deadlift single must process/snapshot the lift so later corrections cannot double-progress or retain progression after a corrected miss (HLM Light and 4-Day W4)',()=>{
  const out=[];let pass=true;
  for(const mode of ['hlm','fourday']){
    const same=optionalDeadliftSkipCorrectionCase(mode,5),miss=optionalDeadliftSkipCorrectionCase(mode,4);
    const sameGood=same.beforeSkip===100&&same.optional&&same.afterSkip===105&&same.processedAfterSkip&&same.snapAfterSkip&&same.final===105&&same.loads.every(x=>x===100);
    const missGood=miss.beforeSkip===100&&miss.optional&&miss.afterSkip===105&&miss.processedAfterSkip&&miss.snapAfterSkip&&miss.final===100&&miss.loads[0]===100&&!miss.loads.some(x=>x>=105)&&miss.attempts>=1;
    pass=pass&&sameGood&&missGood;out.push(`${mode}: same ${same.beforeSkip}->${same.afterSkip}->${same.final} processed=${same.processedAfterSkip}/${same.snapAfterSkip}; miss ${miss.beforeSkip}->${miss.afterSkip}->${miss.final} attempts=${miss.attempts}`);
  }
  return ok(pass,out.join(' | '));
});



/* ======================= FIFTH COLD-AUDIT / INVARIANT FOLLOW-UPS: F23–F27 ======================= */
test('F23-NOOP-POSTCOMPLETE-SETTINGS-PRESERVE-ROLLBACK','DEFECT','Saving unchanged Advanced Lift Settings after completion must not replace the pre-result rollback point or permit a second progression',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:40});for(let i=0;i<3;i++)h.ctx.tapSet('Squat',i);
  const first=h.S().weights.Squat,originalSnap=h.S().processedSnapshots?.Squat?.weight;
  setLiftSettingsFields(h,'Squat',{weight:first,increment:h.S().core.Squat.increment});h.ctx.saveLiftSettings('Squat');
  const snapAfterSave=h.S().processedSnapshots?.Squat?.weight;
  h.reps.push(5);h.ctx.tapSet('Squat',0);let plan=h.ctx.getSetPlan('Squat');for(let i=1;i<plan.length;i++){if(!h.S().session.Squat?.[i])h.ctx.tapSet('Squat',i);plan=h.ctx.getSetPlan('Squat')}
  const loads=Object.values(h.S().session.Squat||{}).filter(x=>x&&x.reps!==undefined).map(x=>Number(x.load)),final=h.S().weights.Squat;
  return ok(first===42.5&&originalSnap===40&&snapAfterSave===40&&final===42.5&&loads.every(x=>x===40),`first=${first} snap ${originalSnap}->${snapAfterSave} final=${final} loads=${loads.join('/')}`);
});
function intermediateUnitCorrectionCase(mode){
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:40,'Bench Press':40});const n=mode==='hlm'?'Squat':'Bench Press';h.S().core[n].increment=1.5;h.choices.push('R');h.ctx.chooseProgramMode(mode);
  if(mode==='fourday')h.ctx.switchDay('1');
  let plan=h.ctx.getSetPlan(n);for(let i=0;i<plan.length;i++){h.ctx.tapSet(n,i);plan=h.ctx.getSetPlan(n)}
  const nextKg=h.S().hlm.nextHeavy[n],snapKg=h.S().processedSnapshots?.[n]?.hlm?.driver?.[n],snapIncKg=h.S().processedSnapshots?.[n]?.cfg?.increment;
  h.ctx.changeUnits('lb',true);const currentLb=h.S().hlm.driver[n],nextLb=h.S().hlm.nextHeavy[n],snapLb=h.S().processedSnapshots?.[n]?.hlm?.driver?.[n],snapIncLb=h.S().processedSnapshots?.[n]?.cfg?.increment,firstLb=Number(h.S().session[n]?.[0]?.load);
  h.ctx.changeUnits('kg',true);const currentBack=h.S().hlm.driver[n],nextBack=h.S().hlm.nextHeavy[n],snapBack=h.S().processedSnapshots?.[n]?.hlm?.driver?.[n],snapIncBack=h.S().processedSnapshots?.[n]?.cfg?.increment,liveIncBack=h.S().core[n].increment;
  h.ctx.changeUnits('lb',true);
  h.reps.push(h.S().session[n]?.[0]?.reps??5);h.ctx.tapSet(n,0);plan=h.ctx.getSetPlan(n);for(let i=1;i<plan.length;i++){if(!h.S().session[n]?.[i])h.ctx.tapSet(n,i);plan=h.ctx.getSetPlan(n)}
  const loads=Object.values(h.S().session[n]||{}).filter(x=>x&&x.reps!==undefined).sort((a,b)=>a.index-b.index).map(x=>Number(x.load)),finalPlan=h.ctx.getSetPlan(n).map(x=>Number(x.load));
  return {n,nextKg,snapKg,snapIncKg,currentLb,nextLb,snapLb,snapIncLb,firstLb,currentBack,nextBack,snapBack,snapIncBack,liveIncBack,finalDriver:h.S().hlm.driver[n],finalNext:h.S().hlm.nextHeavy[n],finalInc:h.S().core[n].increment,loads,finalPlan};
}
test('F24-INTERMEDIATE-SNAPSHOT-UNIT-CONVERSION-ATOMIC','DEFECT','HLM/4-Day processed rollback snapshots must convert nested driver/nextHeavy state and reversible increments so post-conversion corrections remain coherent',()=>{
  const out=[];let pass=true;for(const mode of ['hlm','fourday']){const r=intermediateUnitCorrectionCase(mode);const snapConverted=r.snapLb>=85&&r.snapLb<=95,roundTrip=r.currentBack===40&&r.snapBack===40&&r.liveIncBack===1.5&&r.snapIncBack===1.5,sessionCoherent=r.loads.length===r.finalPlan.length&&Math.abs(r.loads[0]-r.firstLb)<1e-9&&r.loads.slice(1).every((x,i)=>Math.abs(x-r.finalPlan[i+1])<1e-9),finalSane=r.finalDriver>=85&&r.finalNext>=90&&r.finalInc===2.5&&sessionCoherent;pass=pass&&r.nextKg>40&&r.snapKg===40&&r.snapIncKg===1.5&&r.currentLb>=85&&r.nextLb>=90&&snapConverted&&r.snapIncLb===2.5&&roundTrip&&finalSane;out.push(`${mode}/${r.n}: kg next=${r.nextKg} snap=${r.snapKg}/+${r.snapIncKg}; lb current=${r.currentLb} next=${r.nextLb} snap=${r.snapLb}/+${r.snapIncLb}; back live/snap=${r.currentBack}/${r.snapBack} inc=${r.liveIncBack}/${r.snapIncBack}; final=${r.finalDriver}/${r.finalNext}/+${r.finalInc} loads=${r.loads.join('/')} plan=${r.finalPlan.join('/')}`)}return ok(pass,out.join(' | '));
});
function onRampRoundTripCase(inc){
  const h=H.boot(build);bbStart(h,{onramp:true});const S=h.S(),ids=Object.values(S.bodybuilding.selections);
  for(const id of ids){const e=h.ctx.bvomBbOnRampEx(id);if(h.ctx.bvomBbNumericExercise(id)){e.load=id==='machine_chest_press'?30:(H.BB_LOADS[id]||20);e.increment=id==='machine_chest_press'?inc:2.5}else e.resistance='green band';e.state='CONFIRMED'}S.bodybuilding.onramp.sessionsCompleted=2;h.ev('save()');
  const before=h.ctx.bvomBbOnRampEx('machine_chest_press');const b0={load:before.load,inc:before.increment};h.ctx.changeUnits('lb',true);const lb=h.ctx.bvomBbOnRampEx('machine_chest_press'),mid={load:lb.load,inc:lb.increment};h.ctx.changeUnits('kg',true);const back=h.ctx.bvomBbOnRampEx('machine_chest_press'),rt={load:back.load,inc:back.increment};h.ctx.bvomBbOnRampHandoff(true);const p=h.S().bodybuilding.progression.machine_chest_press;
  return {inc,b0,mid,rt,p:{load:p.load,inc:p.increment}};
}
test('F25-ONRAMP-UNIT-ROUNDTRIP-HANDOFF-REVERSIBLE','DEFECT','On-Ramp equipment load/increment state must survive kg→lb→kg without training and hand off the original practical values',()=>{
  const out=[];let pass=true;for(const inc of [1,1.5,2,2.5]){const r=onRampRoundTripCase(inc),good=r.b0.load===30&&r.b0.inc===inc&&r.rt.load===30&&r.rt.inc===inc&&r.p.load===30&&r.p.inc===inc;pass=pass&&good;out.push(`+${inc}: ${r.b0.load}/+${r.b0.inc} -> ${r.mid.load}/+${r.mid.inc} -> ${r.rt.load}/+${r.rt.inc} -> handoff ${r.p.load}/+${r.p.inc}`)}
  return ok(pass,out.join(' | '));
});
test('F26-ACCESSORY-CORRECTION-RECOMPUTES-PROGRESSION','DEFECT','Correcting a completed accessory must roll back and recompute the earned progression exactly once, for both corrected misses and corrected successes',()=>{
  const run=(correctedReps)=>{const h=H.boot(build);configureLP(h);const a={...accessoryFixture(),weight:20,increment:2.5};h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:20,attempts:0}};for(let i=0;i<3;i++)h.ctx.tapAccessory('a1',i);const first=a.weight,processedBefore=!!h.S().processed?.['ACC:a1'];h.reps.push(correctedReps);h.ctx.tapAccessory('a1',0);const afterEdit={weight:a.weight,processed:!!h.S().processed?.['ACC:a1'],sets:Object.keys(h.S().session['ACC:a1']||{}).length};let plan=h.ctx.accessoryPlan17(a);for(let i=1;i<plan.length;i++){if(!h.S().session['ACC:a1']?.[i])h.ctx.tapAccessory('a1',i);plan=h.ctx.accessoryPlan17(a)}const ss=h.S().session['ACC:a1']||{},loads=Object.values(ss).filter(x=>x&&x.reps!==undefined).map(x=>Number(x.load)),finalPlan=h.ctx.accessoryPlan17(a);const coherent=finalPlan.every((q,i)=>!ss[i]||Math.abs(Number(ss[i].load)-Number(q.load))<1e-9);return{first,processedBefore,afterEdit,finalWeight:a.weight,attempts:Number(a.attempts||0),processed:!!h.S().processed?.['ACC:a1'],loads,plan:finalPlan.map(q=>Number(q.load)),coherent}};
  const miss=run(5),success=run(8);const missGood=miss.first===22.5&&miss.processedBefore&&miss.afterEdit.weight===20&&!miss.afterEdit.processed&&miss.afterEdit.sets===1&&miss.finalWeight===20&&miss.attempts===1&&miss.processed&&miss.coherent&&!miss.loads.some(x=>x>20);const successGood=success.first===22.5&&success.afterEdit.weight===20&&!success.afterEdit.processed&&success.afterEdit.sets===1&&success.finalWeight===22.5&&success.attempts===0&&success.processed&&success.loads.length===3&&success.loads.every(x=>x===20);
  return ok(missGood&&successGood,`miss first=${miss.first} edit=${miss.afterEdit.weight}/${miss.afterEdit.sets} final=${miss.finalWeight} attempts=${miss.attempts} processed=${miss.processed} loads=${miss.loads.join('/')} plan=${miss.plan.join('/')} coherent=${miss.coherent} | success first=${success.first} edit=${success.afterEdit.weight}/${success.afterEdit.sets} final=${success.finalWeight} attempts=${success.attempts} processed=${success.processed} loads=${success.loads.join('/')} coherent=${success.coherent}`);
});
test('F27-RECORDED-OPTIONAL-WORK-REMOVAL-PRESERVES-LIVE-DATA','DEFECT','Recorded accessory/GPP work must block destructive template removal until the workout is resolved, while idle templates remain removable',()=>{
  const out=[];let pass=true;
  {const h=H.boot(build);configureLP(h);const a={...accessoryFixture(),weight:20};h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:20,attempts:0}};h.ctx.tapAccessory('a1',0);const before=JSON.stringify(h.S().session['ACC:a1']);h.choices.push('R');h.ctx.removeAccessory('a1');const after=h.S().session['ACC:a1'],keptTemplate=h.S().accessoryList.some(x=>x.id==='a1');const blocked=!!after&&JSON.stringify(after)===before&&keptTemplate;pass=pass&&blocked;out.push(`accessory active: session=${after?Object.keys(after).length:0} template=${keptTemplate}`)}
  {const h=H.boot(build);configureLP(h);const a={...accessoryFixture(),weight:20};h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:20,attempts:0}};h.S().processed={};h.S().processedSnapshots={};h.choices.push('R');h.ctx.removeAccessory('a1');const removed=!h.S().accessoryList.some(x=>x.id==='a1');pass=pass&&removed;out.push(`accessory idle: removed=${removed}`)}
  {const h=H.boot(build);configureLP(h);h.S().gppList=[{id:'g1',name:'Sled Push',assignment:'A',hlmAssignment:'Any',fourDayAssignment:'Any',metrics:{reps:true,load:true,distance:false,timed:false},planned:{reps:10,load:20}}];h.S().gppSession={g1:{sets:[{reps:10,load:20}],actual:{reps:10,load:20}}};h.S().workoutStartedAt=Date.now();h.ev('save()');const before=JSON.stringify(h.S().gppSession.g1);h.choices.push('R');h.ctx.removeGpp('g1');const after=h.S().gppSession.g1,keptTemplate=h.S().gppList.some(x=>x.id==='g1');const blocked=!!after&&JSON.stringify(after)===before&&keptTemplate;pass=pass&&blocked;out.push(`gpp active: session=${after?'kept':'deleted'} template=${keptTemplate}`)}
  {const h=H.boot(build);configureLP(h);h.S().gppList=[{id:'g1',name:'Sled Push',assignment:'A',hlmAssignment:'Any',fourDayAssignment:'Any',metrics:{reps:true,load:true,distance:false,timed:false},planned:{reps:10,load:20}}];h.choices.push('R');h.ctx.removeGpp('g1');const removed=!h.S().gppList.some(x=>x.id==='g1');pass=pass&&removed;out.push(`gpp idle: removed=${removed}`)}
  return ok(pass,out.join(' | '));
});



/* ======================= SIXTH COLD-AUDIT / TRANSACTION FOLLOW-UPS: F28–F33 ======================= */
test('F28-CORE-POSTRESULT-INCREMENT-EDIT-PRESERVES-EARNED-PROGRESSION','DEFECT','Changing only a core progression increment after a completed lift must not move the already-earned next load when the recorded performance is later corrected unchanged',()=>{
  const ls=H.memStore(),h=H.boot(build,{ls});configureLP(h,{...H.LP_W,Squat:40});for(let i=0;i<3;i++)h.ctx.tapSet('Squat',i);
  const earned=h.S().weights.Squat,preSnap=JSON.parse(JSON.stringify(h.S().processedSnapshots?.Squat||null));
  setLiftSettingsFields(h,'Squat',{weight:earned,increment:5});h.ctx.saveLiftSettings('Squat');const saved=h.S().weights.Squat===42.5&&h.S().core.Squat.increment===5;
  const r=H.boot(build,{ls});r.reps.push(5);r.ctx.tapSet('Squat',2);let plan=r.ctx.getSetPlan('Squat');for(let i=0;i<plan.length;i++){if(!r.S().session.Squat?.[i])r.ctx.tapSet('Squat',i);plan=r.ctx.getSetPlan('Squat')}
  const loads=Object.values(r.S().session.Squat||{}).filter(x=>x&&x.reps!==undefined).map(x=>Number(x.load)),final=r.S().weights.Squat,incNow=r.S().core.Squat.increment;
  return ok(earned===42.5&&preSnap?.weight===40&&preSnap?.cfg?.increment===2.5&&saved&&final===42.5&&incNow===5&&loads.length===3&&loads.every(x=>x===40),`earned=${earned} snap=${preSnap?.weight}/+${preSnap?.cfg?.increment} saved=${saved} final=${final}/+${incNow} loads=${loads.join('/')}`);
});

test('F29-ACCESSORY-POSTRESULT-INCREMENT-EDIT-PRESERVES-EARNED-PROGRESSION','DEFECT','Changing only an accessory increment after earned progression must not retroactively recalculate that already-earned next load when the completed set is corrected unchanged',()=>{
  const a={...accessoryFixture(),weight:20,increment:2.5};const h=H.boot(build);configureLP(h);h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:20,attempts:0}};for(let i=0;i<3;i++)h.ctx.tapAccessory('a1',i);
  const earned=a.weight,snap=JSON.parse(JSON.stringify(h.S().processedSnapshots?.['ACC:a1']||null));editAccessoryViaBuilder(h,a,5);const saved=a.weight===22.5&&a.increment===5;
  h.reps.push(8);h.ctx.tapAccessory('a1',2);let plan=h.ctx.accessoryPlan17(a);for(let i=0;i<plan.length;i++){if(!h.S().session['ACC:a1']?.[i])h.ctx.tapAccessory('a1',i);plan=h.ctx.accessoryPlan17(a)}
  const loads=Object.values(h.S().session['ACC:a1']||{}).filter(x=>x&&x.reps!==undefined).map(x=>Number(x.load));
  return ok(earned===22.5&&snap?.weight===20&&saved&&a.weight===22.5&&a.increment===5&&Number(a.attempts||0)===0&&loads.length===3&&loads.every(x=>x===20),`earned=${earned} snap=${snap?.weight} saved=${saved} final=${a.weight}/+${a.increment} attempts=${a.attempts||0} loads=${loads.join('/')}`);
});

test('F30-INTERMEDIATE-INCREMENT-EDIT-PRESERVES-EARNED-NEXTHEAVY','DEFECT','HLM/4-Day increment-only Advanced Settings edits must preserve an already-earned nextHeavy target; the new increment applies only to later progression, while a real driver edit still invalidates nextHeavy',()=>{
  let pass=true;const out=[];for(const mode of ['hlm','fourday']){const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:100,'Bench Press':100});h.choices.push('R');h.ctx.chooseProgramMode(mode);if(mode==='fourday')h.ctx.switchDay('2');let p=h.ctx.getSetPlan('Squat');for(let i=0;i<p.length;i++){h.ctx.tapSet('Squat',i);p=h.ctx.getSetPlan('Squat')}const earned=h.S().hlm.nextHeavy.Squat;setLiftSettingsFields(h,'Squat',{weight:100,increment:5});h.ctx.saveLiftSettings('Squat');const preserved=earned===102.5&&h.S().hlm.driver.Squat===100&&h.S().hlm.nextHeavy.Squat===102.5&&h.S().core.Squat.increment===5;setLiftSettingsFields(h,'Squat',{weight:105,increment:5});h.ctx.saveLiftSettings('Squat');const invalidated=h.S().hlm.driver.Squat===105&&h.S().hlm.nextHeavy.Squat==null;const good=preserved&&invalidated;pass=pass&&good;out.push(`${mode}: earned=${earned} preserved=${preserved} afterInc=${preserved?102.5:h.S().hlm.nextHeavy.Squat} driverEdit=${h.S().hlm.driver.Squat} nextAfterDriver=${h.S().hlm.nextHeavy.Squat}`)}return ok(pass,out.join(' | '));
});

test('F31-ONRAMP-CORRECTION-REVOKES-SUPERSEDED-CONFIRMATION','DEFECT','Only correction of the exposure that established On-Ramp CONFIRMED may revoke/re-evaluate calibration; invalid corrected evidence must revoke it, valid corrected evidence must retain it, and later-session set corrections must not erase historical calibration',()=>{
  // A) The actual confirming exposure is corrected out of range: confirmation must be revoked.
  const h=H.boot(build);bbStart(h,{onramp:true});const id='machine_chest_press',e=h.ctx.bvomBbOnRampEx(id);e.state='PROVISIONAL';e.load=40;e.increment=2.5;h.ev('save()');orSet(h,id,0,{reps:7,load:40,feel:'about_right',inc:'2.5'});const confirmed=e.state==='CONFIRMED';
  for(const other of Object.values(h.S().bodybuilding.selections)){if(other===id)continue;const x=h.ctx.bvomBbOnRampEx(other);if(h.ctx.bvomBbNumericExercise(other)){x.load=x.load||H.BB_LOADS[other]||20;x.increment=x.increment||2.5}else x.resistance=x.resistance||'green band';x.state='CONFIRMED'}h.ev('save()');
  orSet(h,id,0,{reps:5,load:40,inc:'2.5'});const rec=h.S().session['BBOR:'+id]?.[0],all=h.ctx.bvomBbOnRampAllConfirmed(),revoked=confirmed&&rec?.reps===5&&e.state!=='CONFIRMED'&&!all;
  // B) The same confirming exposure is corrected but still valid: confirmation remains supported.
  const hv=H.boot(build);bbStart(hv,{onramp:true});const ev=hv.ctx.bvomBbOnRampEx(id);ev.state='PROVISIONAL';ev.load=40;ev.increment=2.5;hv.ev('save()');orSet(hv,id,0,{reps:7,load:40,feel:'about_right',inc:'2.5'});orSet(hv,id,0,{reps:6,load:40,inc:'2.5'});const validRetained=ev.state==='CONFIRMED'&&hv.S().session['BBOR:'+id]?.[0]?.reps===6;
  // C) A later set recorded after calibration was already confirmed is not the evidence that established calibration.
  const hl=H.boot(build);bbStart(hl,{onramp:true});const el=hl.ctx.bvomBbOnRampEx(id);el.state='CONFIRMED';el.load=40;el.increment=2.5;hl.ev('save()');orSet(hl,id,0,{reps:7,load:40,inc:'2.5'});orSet(hl,id,0,{reps:5,load:40,inc:'2.5'});const laterRetained=el.state==='CONFIRMED'&&hl.S().session['BBOR:'+id]?.[0]?.reps===5;
  return ok(revoked&&validRetained&&laterRetained,`revoke: initial=${confirmed} corrected=${rec?.reps} state=${e.state} load=${e.load} all=${all} | valid correction=${ev.state}/${hv.S().session['BBOR:'+id]?.[0]?.reps} | later correction=${el.state}/${hl.S().session['BBOR:'+id]?.[0]?.reps}`);
});

test('F32-ONRAMP-FAILED-SET-VALIDATION-ATOMIC','DEFECT','Rejected On-Ramp set input must not mutate live exercise state or leak rejected values into a later unrelated save/reload',()=>{
  const ls=H.memStore(),h=H.boot(build,{ls});bbStart(h,{onramp:true});const id='machine_chest_press',e=h.ctx.bvomBbOnRampEx(id);e.state='PROVISIONAL';e.load=40;e.increment=2.5;h.ev('save()');const rawBeforeReject=ls.getItem('bvom_data');
  h.ctx.bvomBbOnRampSetModal(id,0);const o=h.lastOverlay();o.querySelector('[data-load]').value='60';o.querySelector('[data-inc]').value='0';o.querySelector('[data-reps]').value='7';if(o.innerHTML.includes('data-feel'))o.querySelector('[data-feel]').value='about_right';o.querySelector('[data-save]').onclick();const liveAfterReject={load:e.load,inc:e.increment,sets:Object.keys(h.S().session['BBOR:'+id]||{}).length};const storageAtomic=ls.getItem('bvom_data')===rawBeforeReject;o.querySelector('[data-cancel]').onclick();
  const other=Object.values(h.S().bodybuilding.selections).find(x=>x!==id&&h.ctx.bvomBbNumericExercise(x));const eo=h.ctx.bvomBbOnRampEx(other);eo.state='PROVISIONAL';eo.load=eo.load||H.BB_LOADS[other]||20;eo.increment=2.5;h.ev('save()');orSet(h,other,0,{reps:7,load:eo.load,feel:'about_right',inc:'2.5'});const r=H.boot(build,{ls}),back=r.ctx.bvomBbOnRampEx(id);
  return ok(storageAtomic&&liveAfterReject.load===40&&liveAfterReject.inc===2.5&&liveAfterReject.sets===0&&back.load===40&&back.increment===2.5,`after reject=${liveAfterReject.load}/+${liveAfterReject.inc} sets=${liveAfterReject.sets} storageAtomic=${storageAtomic}; reload=${back.load}/+${back.increment}; other=${other}`);
});

function broadRoundTripLpCase(){
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:41});h.S().enabledMicro=[.5];h.S().plateMode=h.S().plateMode||{};h.S().plateMode.Squat='micro';
  const a={...accessoryFixture(),weight:21.5,increment:1.5};h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:21.5,attempts:0}};h.S().session.Squat={0:{load:41,reps:5,target:5,index:0}};h.S().session['ACC:a1']={0:{load:21.5,reps:8,target:8,index:0}};
  h.S().gppList=[{id:'g1',name:'Sled Push',assignment:'A',hlmAssignment:'Any',fourDayAssignment:'Any',metrics:{load:true,reps:true},planned:{load:21.5,reps:10}}];h.S().gppSession={g1:{sets:[{load:21.5,reps:10}],actual:{load:21.5,reps:10}}};h.ev('save()');
  const snap=()=>({core:h.S().weights.Squat,coreSet:h.S().session.Squat?.[0]?.load,acc:a.weight,accInc:a.increment,accProg:h.S().accessoryProgress.a1.weight,accSet:h.S().session['ACC:a1']?.[0]?.load,gppPlan:h.S().gppList[0].planned.load,gppSet:h.S().gppSession.g1.sets[0].load,gppActual:h.S().gppSession.g1.actual.load});const before=snap();h.ctx.changeUnits('lb',true);const mid=snap();h.ctx.changeUnits('kg',true);return {before,mid,after:snap()};
}
function broadRoundTripFreeCase(){
  const h=H.boot(build);configureLP(h);h.S().programMode='free';h.S().freeTraining={selectedDay:1,nextDayId:2,days:[{id:'ft1',compounds:[{lift:'Squat',style:'straight',weight:41,sets:3,reps:5,rptLevel:0,dropPct:10,optionalSingle:false}]}]};h.S().freeTrainingSession={Squat:{sets:[{load:41,plannedLoad:41,reps:5,rpe:8,target:5}]}};h.ev('save()');const snap=()=>({plan:h.S().freeTraining.days[0].compounds[0]?.weight,set:h.S().freeTrainingSession.Squat?.sets?.[0]?.load,planned:h.S().freeTrainingSession.Squat?.sets?.[0]?.plannedLoad});const before=snap();h.ctx.changeUnits('lb',true);const mid=snap();h.ctx.changeUnits('kg',true);return{before,mid,after:snap()};
}
function broadRoundTripBbCase(onramp){const h=H.boot(build);if(onramp){bbStart(h,{onramp:true});const e=h.ctx.bvomBbOnRampEx('machine_chest_press');e.load=30;e.increment=4.5;e.state='PROVISIONAL';h.ev('save()');const before={load:e.load,inc:e.increment};h.ctx.changeUnits('lb',true);const mid={load:e.load,inc:e.increment};h.ctx.changeUnits('kg',true);return{before,mid,after:{load:e.load,inc:e.increment}}}bbStart(h,{loads:{...H.BB_LOADS,machine_chest_press:30},incs:{machine_chest_press:4.5}});const p=h.S().bodybuilding.progression.machine_chest_press,before={load:p.load,inc:p.increment};h.ctx.changeUnits('lb',true);const mid={load:p.load,inc:p.increment};h.ctx.changeUnits('kg',true);return{before,mid,after:{load:p.load,inc:p.increment}}}
test('F33-NO-TRAINING-UNIT-ROUNDTRIP-PRESERVES-LEGITIMATE-ARBITRARY-STATE','DEFECT','kg→lb→kg with no training must preserve legitimate arbitrary planned and already-recorded loads/increments across core, accessory, GPP, Custom Training, Bodybuilding and On-Ramp state',()=>{
  const lp=broadRoundTripLpCase(),ft=broadRoundTripFreeCase(),bb=broadRoundTripBbCase(false),or=broadRoundTripBbCase(true);const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),pass=same(lp.before,lp.after)&&same(ft.before,ft.after)&&same(bb.before,bb.after)&&same(or.before,or.after);
  return ok(pass,`LP ${JSON.stringify(lp.before)} -> ${JSON.stringify(lp.mid)} -> ${JSON.stringify(lp.after)} | FT ${JSON.stringify(ft.before)} -> ${JSON.stringify(ft.after)} | BB ${JSON.stringify(bb.before)} -> ${JSON.stringify(bb.after)} | OR ${JSON.stringify(or.before)} -> ${JSON.stringify(or.after)}`);
});



/* ======================= SEVENTH COLD-AUDIT / ACTIVE-PRESCRIPTION FOLLOW-UPS: F34–F37 ======================= */
function setHlmSettingsFields(h,{light=20,sqMed=10,bnMed=10,optionalSingles=true,singleSq=10,singleBn=5,singleDl=10}={}){
  const d=h.ctx.document;d.getElementById('hlmLight').value=String(light);d.getElementById('hlmSqMed').value=String(sqMed);d.getElementById('hlmBnMed').value=String(bnMed);d.getElementById('hlmSingles').checked=!!optionalSingles;d.getElementById('hlmSingleSq').value=String(singleSq);d.getElementById('hlmSingleBn').value=String(singleBn);d.getElementById('hlmSingleDl').value=String(singleDl);
}

test('F34-ACTIVE-CORE-PRESCRIPTION-IMMUTABLE-AFTER-SETTINGS-EDIT','DEFECT','After a core lift has recorded work, Advanced Settings may define future training but cannot reinterpret today’s recorded work under a new mode/weight or earn progression from a weight never performed',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:100});h.ctx.tapSet('Squat',0);const beforePlan=h.ctx.getSetPlan('Squat').map(q=>({load:Number(q.load),target:Number(q.target)}));
  setLiftSettingsFields(h,'Squat',{weight:110,increment:2.5,mode:'rpt',drop:10,level:0});h.ctx.saveLiftSettings('Squat');const futureSaved=h.S().weights.Squat===110&&h.S().core.Squat.mode==='rpt';const afterPlan=h.ctx.getSetPlan('Squat').map(q=>({load:Number(q.load),target:Number(q.target)}));
  let plan=h.ctx.getSetPlan('Squat');for(let i=1;i<plan.length;i++){if(!h.S().session.Squat?.[i])h.ctx.tapSet('Squat',i);plan=h.ctx.getSetPlan('Squat')}
  const loads=Object.values(h.S().session.Squat||{}).filter(x=>x&&x.reps!==undefined).sort((a,b)=>a.index-b.index).map(x=>Number(x.load));const final=h.S().weights.Squat;
  return ok(futureSaved&&JSON.stringify(afterPlan)===JSON.stringify(beforePlan)&&loads.length===3&&loads.every(x=>x===100)&&final===110,`beforePlan=${JSON.stringify(beforePlan)} afterPlan=${JSON.stringify(afterPlan)} loads=${loads.join('/')} future=${h.S().core.Squat.mode}/${final}`);
});

test('F35-POSTCOMPLETE-SETTINGS-WEIGHT-EDIT-CORRECTION-SAFE','DEFECT','A working-weight change saved through Advanced Settings after progression must survive later correction without repricing the completed session or progressing the edited future weight again',()=>{
  const run=(withUnits)=>{const ls=H.memStore(),h=H.boot(build,{ls});configureLP(h,{...H.LP_W,Squat:100});for(let i=0;i<3;i++)h.ctx.tapSet('Squat',i);const earned=h.S().weights.Squat;setLiftSettingsFields(h,'Squat',{weight:110,increment:2.5,mode:'straight'});h.ctx.saveLiftSettings('Squat');if(withUnits)h.ctx.changeUnits('lb',true);const selected=h.S().weights.Squat;const originalSet=Number(h.S().session.Squat?.[0]?.load);const r=H.boot(build,{ls});r.reps.push(5);r.ctx.tapSet('Squat',0);let p=r.ctx.getSetPlan('Squat');for(let i=1;i<p.length;i++){if(!r.S().session.Squat?.[i])r.ctx.tapSet('Squat',i);p=r.ctx.getSetPlan('Squat')}const loads=Object.values(r.S().session.Squat||{}).filter(x=>x&&x.reps!==undefined).sort((a,b)=>a.index-b.index).map(x=>Number(x.load));return{earned,selected,originalSet,final:r.S().weights.Squat,loads,unit:r.S().unit}};
  const kg=run(false),lb=run(true),kgGood=kg.earned===102.5&&kg.selected===110&&kg.final===110&&kg.loads.length===3&&kg.loads.every(x=>x===100),lbGood=lb.unit==='lb'&&lb.originalSet>=219&&lb.originalSet<=221&&lb.selected>=240&&lb.selected<=245&&lb.final===lb.selected&&lb.loads.every(x=>Math.abs(x-lb.originalSet)<1e-9);
  return ok(kgGood&&lbGood,`kg earned=${kg.earned} selected=${kg.selected} final=${kg.final} loads=${kg.loads.join('/')} | lb set=${lb.originalSet} selected=${lb.selected} final=${lb.final} loads=${lb.loads.join('/')}`);
});

function optionalSinglesLiveSettingsCase(mode,startEnabled,nextEnabled){
  const h=H.boot(build);configureLP(h,{...H.LP_W,Deadlift:100});h.choices.push('R');h.ctx.chooseProgramMode(mode);h.ctx.switchDay(mode==='hlm'?'L':'4');h.S().hlm.optionalSingles=startEnabled;h.ev('save()');h.ctx.tapSet('Deadlift',0);const before={weight:h.S().weights.Deadlift,processed:!!h.S().processed?.Deadlift,optional:h.ctx.getSetPlan('Deadlift').some(q=>q.optional)};setHlmSettingsFields(h,{light:h.S().hlm.lightPct,sqMed:h.S().hlm.squatMediumPct,bnMed:h.S().hlm.benchMediumPct,optionalSingles:nextEnabled,singleSq:h.S().hlm.singlePct.Squat,singleBn:h.S().hlm.singlePct['Bench Press'],singleDl:h.S().hlm.singlePct.Deadlift});h.ctx.saveHlmSettings();const after={weight:h.S().weights.Deadlift,processed:!!h.S().processed?.Deadlift,optional:h.ctx.getSetPlan('Deadlift').some(q=>q.optional),savedSetting:h.S().hlm.optionalSingles};return{mode,startEnabled,nextEnabled,before,after};
}
test('F36-OPTIONAL-SINGLES-SETTING-DOES-NOT-REWRITE-LIVE-DEADLIFT-EXPOSURE','DEFECT','Changing Optional Heavy Singles after live HLM/4-Day Deadlift work has begun must apply only to future workouts, never add a second progression obligation or remove a pending one',()=>{
  let pass=true;const out=[];for(const mode of ['hlm','fourday']){const add=optionalSinglesLiveSettingsCase(mode,false,true),remove=optionalSinglesLiveSettingsCase(mode,true,false);const addGood=add.before.weight===105&&add.before.processed&&!add.before.optional&&add.after.weight===105&&add.after.processed&&!add.after.optional&&add.after.savedSetting===true;const removeGood=remove.before.weight===100&&!remove.before.processed&&remove.before.optional&&remove.after.weight===100&&!remove.after.processed&&remove.after.optional&&remove.after.savedSetting===false;pass=pass&&addGood&&removeGood;out.push(`${mode}: OFF→ON before=${JSON.stringify(add.before)} after=${JSON.stringify(add.after)} | ON→OFF before=${JSON.stringify(remove.before)} after=${JSON.stringify(remove.after)}`)}return ok(pass,out.join(' | '));
});

test('F37-HLM-NEXT-WORKOUT-SETTINGS-DO-NOT-ALTER-PARTIAL-CURRENT-PRESCRIPTION','DEFECT','HLM settings explicitly described as applying to the next workout must not change the load prescription of a partially completed current Light session',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:100,'Bench Press':80});h.choices.push('R');h.ctx.chooseProgramMode('hlm');h.ctx.switchDay('L');h.S().hlm.lightPct=20;h.ev('save()');const initial=h.ctx.getSetPlan('Squat').map(q=>Number(q.load));h.ctx.tapSet('Squat',0);const first=Number(h.S().session.Squat?.[0]?.load);setHlmSettingsFields(h,{light:10,sqMed:h.S().hlm.squatMediumPct,bnMed:h.S().hlm.benchMediumPct,optionalSingles:h.S().hlm.optionalSingles,singleSq:h.S().hlm.singlePct.Squat,singleBn:h.S().hlm.singlePct['Bench Press'],singleDl:h.S().hlm.singlePct.Deadlift});h.ctx.saveHlmSettings();const after=h.ctx.getSetPlan('Squat').map(q=>Number(q.load));const futureSaved=h.S().hlm.lightPct===10;return ok(initial.every(x=>x===80)&&first===80&&futureSaved&&after.every(x=>x===80),`initial=${initial.join('/')} first=${first} after=${after.join('/')} savedLightPct=${h.S().hlm.lightPct}`);
});


/* ======================= EIGHTH COLD-AUDIT / POST-RESULT MERGE FOLLOW-UPS: F38–F39 ======================= */
function editAccessoryFutureFieldsViaBuilder(h,a,{weight=a.weight,increment=a.increment}={}){
  h.ctx.openAccessoryBuilder(a.id);const o=h.lastOverlay();if(!o)return false;const q=s=>o.querySelector(s);
  q('#accCat').value=a.category||'Upper';q('#accName').value=a.name;q('#accAssign').value=a.assignment||'A';q('#accEquipment').value=a.equipment||'machine';q('#accPlateMode').value=a.plateMode||'standard';q('#accStyle').value=a.style||'straight';q('#accSets').value=String(a.sets||3);q('#accReps').value=String(a.reps||8);q('#accTopReps').value=String(a.topReps||a.reps||8);q('#accWeight').value=String(weight);q('#accInc').value=String(increment);q('#accBar').value=String(a.barWeight||20);q('#accSave').onclick();return true;
}
function completeMissingCoreV14(h,n){
  let guard=0;
  while(guard++<12){
    const p=h.ctx.getSetPlan(n);let did=false;
    for(let i=0;i<p.length;i++)if(!h.S().session[n]?.[i]){h.ctx.tapSet(n,i);did=true;break}
    if(!did)return;
  }
  throw new Error('completeMissingCoreV14 guard tripped for '+n);
}
function f38LpCase(){
  const ls=H.memStore(),h=H.boot(build,{ls});configureLP(h,{...H.LP_W,Squat:100});for(let i=0;i<3;i++)h.ctx.tapSet('Squat',i);
  const earned=h.S().weights.Squat;
  setLiftSettingsFields(h,'Squat',{weight:earned,increment:5});h.ctx.saveLiftSettings('Squat');
  const r=H.boot(build,{ls});r.reps.push(4);r.ctx.tapSet('Squat',0);completeMissingCoreV14(r,'Squat');
  const afterCorrection={weight:r.S().weights.Squat,increment:r.S().core.Squat.increment,attempts:r.S().attempts.Squat||0,result:r.ctx.coreResult('Squat'),loads:Object.values(r.S().session.Squat||{}).filter(x=>x&&x.reps!==undefined).sort((a,b)=>a.index-b.index).map(x=>Number(x.load))};
  for(const n of ['Bench Press','Prone Row'])for(let i=0;i<3;i++)r.ctx.tapSet(n,i);finish(r);
  const z=H.boot(build,{ls}),hist=z.S().history.at(-1),histSq=Object.values(hist?.session?.Squat||{}).filter(x=>x&&x.reps!==undefined).sort((a,b)=>a.index-b.index);
  return {earned,afterCorrection,reload:{weight:z.S().weights.Squat,increment:z.S().core.Squat.increment,attempts:z.S().attempts.Squat||0},histFirst:histSq[0]};
}
function f38IntermediateCase(mode){
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:100,'Bench Press':100});h.choices.push('R');h.ctx.chooseProgramMode(mode);if(mode==='fourday')h.ctx.switchDay('2');
  let p=h.ctx.getSetPlan('Squat');for(let i=0;i<p.length;i++){h.ctx.tapSet('Squat',i);p=h.ctx.getSetPlan('Squat')}
  const earned=h.S().hlm.nextHeavy.Squat;
  setLiftSettingsFields(h,'Squat',{weight:100,increment:5});h.ctx.saveLiftSettings('Squat');
  const live=h.ctx.getSetPlan('Squat'),topIndex=live.findIndex(x=>x.top),target=Number(live[topIndex].target);h.reps.push(Math.max(0,target-1));h.ctx.tapSet('Squat',topIndex);completeMissingCoreV14(h,'Squat');
  return {mode,earned,next:h.S().hlm.nextHeavy.Squat,driver:h.S().hlm.driver.Squat,increment:h.S().core.Squat.increment,failCount:h.S().hlm.failCount.Squat||0,result:h.ctx.coreResult('Squat')};
}
test('F38-CORE-CORRECTION-RECOMPUTES-EARNED-STATE-THEN-MERGES-FUTURE-SETTINGS','DEFECT','After post-result settings edits, correction must recompute earned core/intermediate progression from the original workout and then retain only explicit future settings; a corrected failure must revoke stale earned progression',()=>{
  const lp=f38LpCase(),hlm=f38IntermediateCase('hlm'),fd=f38IntermediateCase('fourday');
  const lpGood=lp.earned===102.5&&lp.afterCorrection.result.failed===true&&lp.afterCorrection.weight===100&&lp.afterCorrection.increment===5&&lp.afterCorrection.attempts===1&&lp.reload.weight===100&&lp.reload.increment===5&&lp.reload.attempts===1&&lp.histFirst?.reps===4&&lp.histFirst?.load===100;
  const intGood=[hlm,fd].every(x=>x.earned===102.5&&x.result.failed===true&&x.driver===100&&x.next==null&&x.increment===5&&x.failCount===1);
  return ok(lpGood&&intGood,`LP earned=${lp.earned} corrected=${lp.afterCorrection.weight}/+${lp.afterCorrection.increment} attempts=${lp.afterCorrection.attempts} failed=${lp.afterCorrection.result.failed} reload=${lp.reload.weight}/+${lp.reload.increment} hist=${lp.histFirst?.load}x${lp.histFirst?.reps} | HLM next=${hlm.earned}->${hlm.next} driver=${hlm.driver}/+${hlm.increment} fail=${hlm.failCount} | 4D next=${fd.earned}->${fd.next} driver=${fd.driver}/+${fd.increment} fail=${fd.failCount}`);
});

function f39AccessoryFutureOverrideCase(correctedReps,{completeCorrection=true,finishPartial=false}={}){
  const ls=H.memStore(),h=H.boot(build,{ls});configureLP(h);const a={...accessoryFixture(),name:'Biceps Curl',weight:20,increment:2.5};h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:20,attempts:0}};
  if(finishPartial)for(const n of ['Squat','Bench Press','Prone Row'])for(let i=0;i<3;i++)h.ctx.tapSet(n,i);
  for(let i=0;i<3;i++)h.ctx.tapAccessory('a1',i);const earned=a.weight;editAccessoryFutureFieldsViaBuilder(h,a,{weight:30,increment:2.5});const storedEdit=JSON.parse(ls.getItem('bvom_data')).accessoryList.find(x=>x.id==='a1')?.weight;
  const r=H.boot(build,{ls}),ar=r.S().accessoryList.find(x=>x.id==='a1');r.reps.push(correctedReps);r.ctx.tapAccessory('a1',0);
  if(completeCorrection){let guard=0;while(guard++<12){const p=r.ctx.accessoryPlan17(ar);let did=false;for(let i=0;i<p.length;i++)if(!r.S().session['ACC:a1']?.[i]){r.ctx.tapAccessory('a1',i);did=true;break}if(!did)break}}
  const beforeFinish=ar.weight,loads=Object.values(r.S().session['ACC:a1']||{}).filter(x=>x&&x.reps!==undefined).map(x=>Number(x.load));if(finishPartial)finish(r);else r.ev('save()');const z=H.boot(build,{ls}),az=z.S().accessoryList.find(x=>x.id==='a1');
  return {earned,storedEdit,beforeFinish,final:az?.weight,inc:az?.increment,attempts:Number(az?.attempts||0),loads,history:z.S().history.length};
}
test('F39-ACCESSORY-CORRECTION-PRESERVES-EXPLICIT-FUTURE-TEMPLATE-OVERRIDE','DEFECT','A persisted post-result accessory template weight edit must survive later success/failure correction of the old workout and also survive resolving an incomplete correction',()=>{
  const success=f39AccessoryFutureOverrideCase(9),miss=f39AccessoryFutureOverrideCase(5),partial=f39AccessoryFutureOverrideCase(9,{completeCorrection:false,finishPartial:true});
  const successGood=success.earned===22.5&&success.storedEdit===30&&success.final===30&&success.inc===2.5&&success.attempts===0&&success.loads.length===3&&success.loads.every(x=>x===20);
  const missGood=miss.earned===22.5&&miss.storedEdit===30&&miss.final===30&&miss.inc===2.5&&miss.attempts===1&&miss.loads.length>=2&&miss.loads.every(x=>x<=20);
  const partialGood=partial.earned===22.5&&partial.storedEdit===30&&partial.beforeFinish===20&&partial.final===30&&partial.history===1;
  return ok(successGood&&missGood&&partialGood,`success final=${success.final}/+${success.inc} attempts=${success.attempts} loads=${success.loads.join('/')} | miss final=${miss.final}/+${miss.inc} attempts=${miss.attempts} loads=${miss.loads.join('/')} | partial beforeFinish=${partial.beforeFinish} final=${partial.final} history=${partial.history}`);
});



/* ======================= NINTH COLD-AUDIT / STATE-OWNERSHIP + PENDING-DECISION FOLLOW-UPS: F40–F43 ======================= */
function f40CompleteHeavy(h,n){
  let guard=0;
  while(guard++<16){const p=h.ctx.getSetPlan(n);let did=false;for(let i=0;i<p.length;i++)if(!h.S().session[n]?.[i]){h.ctx.tapSet(n,i);did=true;break}if(!did)return;}
  throw new Error('f40CompleteHeavy guard tripped for '+n);
}
test('F40-HLM-CROSS-LIFT-CORRECTION-ISOLATION','DEFECT','Correcting one completed HLM Heavy lift must restore/recompute only that lift; independently earned nextHeavy state for another processed lift must survive untouched',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:40,'Bench Press':30});h.choices.push('R');h.ctx.chooseProgramMode('hlm');
  f40CompleteHeavy(h,'Squat');f40CompleteHeavy(h,'Bench Press');
  const before={sq:h.S().hlm.nextHeavy.Squat,bn:h.S().hlm.nextHeavy['Bench Press'],bnProcessed:!!h.S().processed?.['Bench Press']};
  const p=h.ctx.getSetPlan('Squat'),top=p.findIndex(x=>x.top),target=Number(p[top].target);h.reps.push(Math.max(0,target-1));h.ctx.tapSet('Squat',top);f40CompleteHeavy(h,'Squat');
  const after={sq:h.S().hlm.nextHeavy.Squat,bn:h.S().hlm.nextHeavy['Bench Press'],sqFail:h.S().hlm.failCount.Squat||0,bnProcessed:!!h.S().processed?.['Bench Press']};
  return ok(before.sq===42.5&&before.bn===32.5&&before.bnProcessed&&after.sq==null&&after.sqFail===1&&after.bn===32.5&&after.bnProcessed,`before sq=${before.sq} bn=${before.bn} processedBn=${before.bnProcessed}; after sq=${after.sq} fail=${after.sqFail} bn=${after.bn} processedBn=${after.bnProcessed}`);
});

function f41BbActualRoundTrip(onramp){
  const ls=H.memStore(),h=H.boot(build,{ls}),id='machine_chest_press';
  if(onramp){bbStart(h,{onramp:true});const e=h.ctx.bvomBbOnRampEx(id);e.state='PROVISIONAL';e.load=22.5;e.increment=2.5;h.ev('save()');orSet(h,id,0,{reps:7,load:24,feel:'about_right',inc:'2.5'});const before={set:Number(h.S().session['BBOR:'+id]?.[0]?.load),exercise:Number(e.load)};h.ctx.changeUnits('lb',true);const mid={set:Number(h.S().session['BBOR:'+id]?.[0]?.load),exercise:Number(e.load)};h.ctx.changeUnits('kg',true);const after={set:Number(h.S().session['BBOR:'+id]?.[0]?.load),exercise:Number(e.load)};const r=H.boot(build,{ls}),er=r.ctx.bvomBbOnRampEx(id);return{onramp,before,mid,after,reload:{set:Number(r.S().session['BBOR:'+id]?.[0]?.load),exercise:Number(er.load)}};}
  bbStart(h,{loads:{...H.BB_LOADS,[id]:22.5},incs:{[id]:2.5}});h.S().bodybuilding.progression[id].calibrated=true;h.ev('save()');bbSet(h,id,0,{reps:8,load:24});const before={set:Number(h.S().session['BB:'+id]?.[0]?.load),rx:Number(h.S().bodybuilding.progression[id].load)};h.ctx.changeUnits('lb',true);const mid={set:Number(h.S().session['BB:'+id]?.[0]?.load),rx:Number(h.S().bodybuilding.progression[id].load)};h.ctx.changeUnits('kg',true);const after={set:Number(h.S().session['BB:'+id]?.[0]?.load),rx:Number(h.S().bodybuilding.progression[id].load)};const r=H.boot(build,{ls});return{onramp,before,mid,after,reload:{set:Number(r.S().session['BB:'+id]?.[0]?.load),rx:Number(r.S().bodybuilding.progression[id].load)}};
}
test('F41-BB-ACTUAL-LOAD-ROUNDTRIP-EXACT','DEFECT','A kg→lb→kg round-trip with no training must restore the exact actual load recorded through the real Bodybuilding and On-Ramp set-entry UI, including off-grid actuals',()=>{
  const bb=f41BbActualRoundTrip(false),or=f41BbActualRoundTrip(true);const bbGood=bb.before.set===24&&bb.mid.set===55&&bb.after.set===24&&bb.reload.set===24&&bb.after.rx===22.5;const orGood=or.before.set===24&&or.mid.set===55&&or.after.set===24&&or.reload.set===24&&or.after.exercise===24&&or.reload.exercise===24;
  return ok(bbGood&&orGood,`BB set ${bb.before.set}->${bb.mid.set}->${bb.after.set}, reload=${bb.reload.set}, rx=${bb.after.rx} | OR set ${or.before.set}->${or.mid.set}->${or.after.set}, reload=${or.reload.set}, exercise=${or.after.exercise}/${or.reload.exercise}`);
});

function f42ThirdFailurePending(){
  const ls=H.memStore(),h=H.boot(build,{ls});configureLP(h,{...H.LP_W,Squat:100,'Bench Press':80});h.choices.push('R');h.ctx.chooseProgramMode('hlm');h.S().hlm.failCount.Squat=2;h.ev('save()');let shown='';h.ctx.bvomChoiceModal=(title,body,l,r,onL,onR)=>{shown=String(title)};
  h.ctx.tapSet('Squat',0);h.ctx.tapSet('Squat',1);h.reps.push(4);h.ctx.tapSet('Squat',2);f40CompleteHeavy(h,'Squat');
  const before={shown,fail:Number(h.S().hlm.failCount.Squat||0),rep:Number(h.S().hlm.rep.Squat||5),processed:!!h.S().processed?.Squat,pending:JSON.parse(JSON.stringify(h.S().hlm.pendingRepChoice||null))},tabId=h.ctx.bvomTabId();
  const r=H.boot(build,{ls});r.ctx.sessionStorage.setItem('bvom_tab_id',tabId);let reopened='',drop=null;r.ctx.bvomChoiceModal=(title,body,l,rr,onL,onR)=>{reopened=String(title);drop=onR};r.ctx.renderAll();
  const after={reopened,fail:Number(r.S().hlm.failCount.Squat||0),rep:Number(r.S().hlm.rep.Squat||5),processed:!!r.S().processed?.Squat,pending:JSON.parse(JSON.stringify(r.S().hlm.pendingRepChoice||null))};
  if(typeof drop==='function')drop();
  const storedAfter=JSON.parse(ls.getItem('bvom_data')||'{}');const resolved={fail:Number(r.S().hlm.failCount.Squat||0),rep:Number(r.S().hlm.rep.Squat||5),pending:r.S().hlm.pendingRepChoice||null,storedFail:Number(storedAfter.hlm?.failCount?.Squat??-1),storedRep:Number(storedAfter.hlm?.rep?.Squat??-1),storedPending:storedAfter.hlm?.pendingRepChoice||null};
  const rr=H.boot(build,{ls});let reopenedAgain='';rr.ctx.bvomChoiceModal=(title)=>{reopenedAgain=String(title)};rr.ctx.renderAll();
  return{before,after,resolved,reloadResolved:{reopened:reopenedAgain,fail:Number(rr.S().hlm.failCount.Squat||0),rep:Number(rr.S().hlm.rep.Squat||5),pending:rr.S().hlm.pendingRepChoice||null}};
}
test('F42-HLM-THIRD-FAILURE-DECISION-PERSISTS','DEFECT','Reloading while the HLM third-failure choice is unresolved must re-present that persisted decision; choosing a branch after reload must commit it exactly once and clear the pending state',()=>{
  const x=f42ThirdFailurePending(),pre=/3 unsuccessful attempts/i.test(x.before.shown),pending=/3 unsuccessful attempts/i.test(x.after.reopened)&&x.after.fail>=3&&x.after.rep===5&&x.after.pending?.lift==='Squat',resolved=x.resolved.rep===4&&x.resolved.fail===0&&!x.resolved.pending&&!x.reloadResolved.reopened&&x.reloadResolved.rep===4&&x.reloadResolved.fail===0&&!x.reloadResolved.pending;return ok(pre&&pending&&resolved,`before modal="${x.before.shown}" fail=${x.before.fail} rep=${x.before.rep} pending=${JSON.stringify(x.before.pending)}; reload modal="${x.after.reopened}" fail=${x.after.fail} rep=${x.after.rep} pending=${JSON.stringify(x.after.pending)}; resolved rep=${x.resolved.rep} fail=${x.resolved.fail} pending=${JSON.stringify(x.resolved.pending)} stored=${x.resolved.storedRep}/${x.resolved.storedFail}/${JSON.stringify(x.resolved.storedPending)}; reload2 modal="${x.reloadResolved.reopened}" rep=${x.reloadResolved.rep} fail=${x.reloadResolved.fail}`);
});

function f43CloseMissPending(branch){
  const ls=H.memStore(),h=H.boot(build,{ls});configureLP(h,{...H.LP_W,'Bench Press':30});h.S().core['Bench Press'].mode='rpt';h.S().core['Bench Press'].rptLevel=0;h.ev('save()');let shown='';h.ctx.bvomChoiceModal=(title)=>{shown=String(title)};
  h.ctx.tapSet('Bench Press',0);h.reps.push(5);h.ctx.tapSet('Bench Press',1);f40CompleteHeavy(h,'Bench Press');
  const tabId=h.ctx.bvomTabId(),before={shown,attempts:Number(h.S().attempts['Bench Press']||0),weight:Number(h.S().weights['Bench Press']),processed:!!h.S().processed?.['Bench Press'],pending:JSON.parse(JSON.stringify(h.S().pendingCloseMissChoice||null))};
  const r=H.boot(build,{ls});r.ctx.sessionStorage.setItem('bvom_tab_id',tabId);let reopened='',onRepeat=null,onProgress=null;r.ctx.bvomChoiceModal=(title,body,left,right,onL,onR)=>{reopened=String(title);onRepeat=onL;onProgress=onR};r.ctx.renderAll();
  const after={reopened,attempts:Number(r.S().attempts['Bench Press']||0),weight:Number(r.S().weights['Bench Press']),processed:!!r.S().processed?.['Bench Press'],pending:JSON.parse(JSON.stringify(r.S().pendingCloseMissChoice||null))};
  const choose=branch==='progress'?onProgress:onRepeat;if(typeof choose==='function')choose();
  const stored=JSON.parse(ls.getItem('bvom_data')||'{}'),resolved={attempts:Number(r.S().attempts['Bench Press']||0),weight:Number(r.S().weights['Bench Press']),pending:r.S().pendingCloseMissChoice||null,storedAttempts:Number(stored.attempts?.['Bench Press']||0),storedWeight:Number(stored.weights?.['Bench Press']),storedPending:stored.pendingCloseMissChoice||null};
  const rr=H.boot(build,{ls});rr.ctx.sessionStorage.setItem('bvom_tab_id',tabId);let reopenedAgain='';rr.ctx.bvomChoiceModal=(title)=>{reopenedAgain=String(title)};rr.ctx.renderAll();
  return{branch,before,after,resolved,reloadResolved:{reopened:reopenedAgain,attempts:Number(rr.S().attempts['Bench Press']||0),weight:Number(rr.S().weights['Bench Press']),pending:rr.S().pendingCloseMissChoice||null}};
}
test('F43-LP-CLOSE-MISS-DECISION-PERSISTS','DEFECT','Reloading while an LP/RPT close-miss REPEAT / PROGRESS ANYWAY decision is unresolved must restore the persisted choice, and either branch must commit exactly once and clear pending state',()=>{
  const repeat=f43CloseMissPending('repeat'),progress=f43CloseMissPending('progress');
  const pending=x=>/close miss/i.test(x.before.shown)&&/close miss/i.test(x.after.reopened)&&x.after.weight===30&&x.after.attempts===0&&x.after.pending?.lift==='Bench Press';
  const repeatGood=pending(repeat)&&repeat.resolved.weight===30&&repeat.resolved.attempts===1&&!repeat.resolved.pending&&repeat.resolved.storedWeight===30&&repeat.resolved.storedAttempts===1&&!repeat.resolved.storedPending&&!repeat.reloadResolved.reopened&&repeat.reloadResolved.weight===30&&repeat.reloadResolved.attempts===1;
  const progressGood=pending(progress)&&progress.resolved.weight===32.5&&progress.resolved.attempts===0&&!progress.resolved.pending&&progress.resolved.storedWeight===32.5&&progress.resolved.storedAttempts===0&&!progress.resolved.storedPending&&!progress.reloadResolved.reopened&&progress.reloadResolved.weight===32.5&&progress.reloadResolved.attempts===0;
  return ok(repeatGood&&progressGood,`REPEAT before="${repeat.before.shown}" reload="${repeat.after.reopened}" pending=${JSON.stringify(repeat.after.pending)} -> ${repeat.resolved.weight}/${repeat.resolved.attempts} reload2="${repeat.reloadResolved.reopened}" | PROGRESS reload="${progress.after.reopened}" pending=${JSON.stringify(progress.after.pending)} -> ${progress.resolved.weight}/${progress.resolved.attempts} reload2="${progress.reloadResolved.reopened}"`);
});

test('F44-ACTIVE-WORKOUT-CLOUD-RESTORE-GUARD','DEFECT','Cloud restore is refused while an unfinished workout is active; persisted local workout remains untouched',async()=>{
  const ls=H.memStore(),net={online:true},sup=H.mockSupabase({net,entitlement:[{status:'subscriber',user_id:'user-1'}],session:true});
  const h=await H.launch(build,{ls,net,supabase:sup});H.configureLP(h);
  await h.ctx.bvomCloudSaveNow();

  h.reps.push(5);h.ctx.tapSet('Squat',0);
  const beforeRaw=ls.getItem('bvom_data'),before=JSON.parse(beforeRaw||'{}');
  h.choices.push('R');
  await h.ctx.bvomCloudRestore();

  const afterRaw=ls.getItem('bvom_data'),after=JSON.parse(afterRaw||'{}');
  const reloads=h.log.filter(x=>x[0]==='reload').length;
  const activeBefore=before?.session?.Squat?.['0']?.reps===5&&!!before.workoutStartedAt;
  const activeAfter=after?.session?.Squat?.['0']?.reps===5&&!!after.workoutStartedAt;
  return ok(activeBefore&&activeAfter&&afterRaw===beforeRaw&&reloads===0,
    `beforeActive=${activeBefore} afterActive=${activeAfter} unchanged=${afterRaw===beforeRaw} reloads=${reloads}`);
});

/* ======================= runner ======================= */
(async()=>{
  const sel=only.length?T.filter(t=>only.includes(t.id)):T;const results=[];
  for(const t of sel){let r;try{r=await t.fn()}catch(e){r={pass:false,detail:'THREW '+(e&&e.stack||e).toString().split('\n').slice(0,2).join(' ')}}results.push({id:t.id,kind:t.kind,title:t.title,pass:r.pass,detail:r.detail})}
  if(asJson){process.stdout.write(JSON.stringify(results));process.exit(results.every(r=>r.pass)?0:1)}
  for(const k of ['CONTROL','NEGATIVE','DEFECT']){const g=results.filter(r=>r.kind===k);if(!g.length)continue;console.log(`\n== ${k} (${g.filter(r=>r.pass).length}/${g.length} pass)`);for(const r of g)console.log(`${r.pass?'PASS':'FAIL'}  [${r.id}] ${r.title}${r.detail?'\n        '+r.detail:''}`)}
  const p=results.filter(r=>r.pass).length;console.log(`\nRESULT: ${p} passed, ${results.length-p} failed`);process.exit(p===results.length?0:1);
})();
