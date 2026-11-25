'use strict';

const assert = require('node:assert/strict');
const H = require('../bvom-lab/lib/bvom_harness');
const baseline = H.loadBuild(process.argv[2]);
const candidate = H.loadBuild(process.argv[3] || '.');
const expected=process.argv[4]||'3.1.0';
assert.ok(baseline.html.includes("const BVOM_BUILD='"+expected+"'"),'unexpected comparison baseline');

function inspect(build, language, programMode, day, lift, style, choice){
 const app=H.boot(build);
 H.configureLP(app);
 const state=app.S();
 Object.assign(state,{language,programMode,day});
 app.ev('ensureHLM()');
 const config=app.ctx.cfg(lift);
 config.mode=style;
 app.ev('save()');
 const prescription=app.ctx.corePrescription(lift);
 for(let i=0;i<prescription.targets.length;i++){
  if(!app.ctx.getSetPlan(lift)[i])break;
  const target=app.ctx.getSetPlan(lift)[i].target;
  app.reps.push(i===0?Math.max(1,target-2):target);
  app.ctx.tapSet(lift,i);
 }
 const plan=app.ctx.getSetPlan(lift),result=app.ctx.coreResult(lift);
 const volume=app.ctx.bvomWorkoutVolume();
 const metadata=app.ctx.bvomHistoryExerciseMeta(state.session);
 const session=JSON.parse(JSON.stringify(state.session));
 if(programMode==='lprpt'){
  let called=false;
  app.ctx.bvomChoiceModal=(title,body,left,right,onLeft,onRight)=>{
   called=true;
   if(build===candidate&&language==='en'&&lift==='Overhead Press'){
    assert.match(title,/Press/);
    assert.doesNotMatch(title,/Overhead Press/);
   }
   if(language==='ja'&&(build===candidate||expected==='3.1.1')){
    assert.match(title,/目標未達/);
    assert.match(body,/×/);
    assert.equal(left,'同じ重量で再挑戦');
    assert.equal(right,style==='rpt'?'次の回数設定へ進む':'RPTに切り替える');
   }
   (choice==='R'?onRight:onLeft)();
  };
  app.ctx.offerThreeFailureChoice(lift);
  assert.ok(called);
 }
 const progress={weights:state.weights,attempts:state.attempts,core:state.core,hlm:state.hlm};
 H.finish(app);
 const history=state.history.map(record=>{
  // Each run creates its own timestamps, workout ID and release provenance.
  const {workoutId,date,startedAt,duration,elapsedSeconds,sourceAppVersion,...data}=record;
  return data;
 });
 const backup=app.ctx.bvomCloudPayload();
 for(const key of ['history','workoutLastActivityAt','workoutStartedAt','workoutOwnerProtocol'])delete backup[key];
 const resultForComparison=JSON.parse(JSON.stringify({prescription,plan,result,volume,metadata,session,progress,history,backup}));
 if(!baseline.html.includes('core.romanian_deadlift')){
  // These cross-release cases record existing lifts only. Compare all prior
  // fields after projecting away the new, independently tested lift record.
  const body=resultForComparison,rdl='Romanian Deadlift';
  for(const key of ['weights','core'])delete body.progress[key][rdl];
  for(const key of ['weights','core','barByLift','plateMode'])delete body.backup[key]?.[rdl];
  const removeUnusedBSlot=session=>{for(const n of ['Squat',rdl])if(session[n]&&Object.keys(session[n]).length===0)delete session[n];};
  if(programMode==='lprpt'&&day==='B')removeUnusedBSlot(body.session);
  for(const item of body.history){
   delete item.weights?.[rdl];
   if(programMode==='lprpt'&&day==='B')removeUnusedBSlot(item.session);
  }
 }
 return resultForComparison;
}

const cases=[
 ['lprpt','A','Squat','straight','L'],['lprpt','A','Squat','straight','R'],
 ['lprpt','B','Overhead Press','rpt','L'],['lprpt','B','Overhead Press','rpt','R'],
 ['lprpt','B','Deadlift','straight','L'],['lprpt','B','Deadlift','rpt','R'],
 ['hlm','H','Squat','rpt','L'],['hlm','L','Deadlift','rpt','L'],
 ['fourday','1','Bench Press','rpt','L'],
];
for(const language of ['en','ja']){
 for(const args of cases){
  assert.deepEqual(inspect(candidate,language,...args),inspect(baseline,language,...args),[language,...args].join(' '));
 }
}
console.log('PASS '+2*cases.length+' locked-baseline comparisons for prescriptions, rescue, decisions, session, metadata, volume, progression, History and cloud payload');
