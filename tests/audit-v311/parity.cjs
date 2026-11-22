'use strict';

const assert = require('node:assert/strict');
const H = require('../bvom-lab/lib/bvom_harness');
const baseline = H.loadBuild(process.argv[2]);
const candidate = H.loadBuild(process.argv[3] || '.');
assert.match(baseline.html,/const BVOM_BUILD='3\.1\.0'/);

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
   if(build===candidate&&language==='ja'){
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
 return JSON.parse(JSON.stringify({prescription,plan,result,volume,metadata,session,progress,history,backup}));
}

const cases=[
 ['lprpt','A','Squat','straight','L'],['lprpt','A','Squat','straight','R'],
 ['lprpt','B','Overhead Press','rpt','L'],['lprpt','B','Overhead Press','rpt','R'],
 ['hlm','H','Squat','rpt','L'],['hlm','L','Deadlift','rpt','L'],
 ['fourday','1','Bench Press','rpt','L'],
];
for(const language of ['en','ja']){
 for(const args of cases){
  assert.deepEqual(inspect(candidate,language,...args),inspect(baseline,language,...args),[language,...args].join(' '));
 }
}
console.log('PASS 14 locked-baseline comparisons for prescriptions, rescue, decisions, session, metadata, volume, progression, History and cloud payload');
