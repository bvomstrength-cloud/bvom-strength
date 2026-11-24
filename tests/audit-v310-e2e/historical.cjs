'use strict';
const assert=require('node:assert/strict');
const H=require('../bvom-lab/lib/bvom_harness');
const dir=process.argv[2],mode=process.argv[3]||'repaired';
const build=H.loadBuild(dir);
const squat='Squat';

function app(weights={}) {
 const h=H.boot(build);
 H.configureLP(h,{...H.LP_W,...weights});
 h.ev('save();renderAll()');
 return h;
}
function savePrescription(h,lift,sets,reps,weight){
 h.ctx.bvomWeightModal=(_lift,current,save)=>save(weight??current,{sets,reps},weight??current);
 h.ctx.editWeight(lift);
}
function set(h,lift,index,reps){ h.reps.push(reps);h.ctx.tapSet(lift,index); }
function capture(h,lift,index){
 let action;
 h.ctx.bvomRepModal=(_name,_weight,_target,_initial,save,_rpe,cancel)=>{action={save,cancel}};
 h.ctx.tapSet(lift,index);
 return action;
}
function verdict(name,actual,affected,expected){
 assert.deepEqual(actual,mode===affected?expected[0]:expected[1],name);
 console.log(mode===affected?'REPRODUCED':'PASS',name,JSON.stringify(actual));
}
if(mode!=='affected-seven'){
 // The first six defects were all present in 9931782.
 {
  const h=app();savePrescription(h,squat,1,1);
  set(h,squat,0,1);
  capture(h,squat,0).cancel();
  verdict('1 sole fixed actual Cancel leaves workout active',h.ctx.bvomStateWorkoutActive(h.S()),'affected-six',[true,false]);
 }
 {
  const h=app();savePrescription(h,squat,1,8);
  set(h,squat,0,8);savePrescription(h,squat,1,8,120);
  assert.equal(h.S().session.Squat[0].load,100);
  verdict('2 lighter work earns new load',h.S().weights.Squat,'affected-six',[122.5,120]);
 }
 {
  const h=app();savePrescription(h,squat,1,8);
  const old=capture(h,squat,0);
  savePrescription(h,squat,2,10);old.save(8);
  verdict('3 stale rep dialog records old target',h.S().session.Squat[0]?.target??null,'affected-six',[8,null]);
 }
 {
  const h=app();h.ev("cfg('Squat').mode='rpt';save()");
  savePrescription(h,squat,8,3);
  for(let i=0;i<5;i++)set(h,squat,i,0);
  const targets=Array.from(h.ctx.getSetPlan(squat),row=>row.target);
  verdict('4 zero-rep recovery rows',targets,'affected-six',[[3,1,1,2,1,0,0,0],[3,1,1,2,1,1,1,1]]);
 }
 {
  const h=app({Squat:250});
  h.ev("cfg('Squat').mode='rpt';cfg('Squat').drop=7;state.enabledStandard=[2.5];save()");
  savePrescription(h,squat,2,8);set(h,squat,0,4);
  verdict('5 half-grid RPT rounding at 232.5',h.ctx.getSetPlan(squat)[1].load,'affected-six',[230,235]);
 }
 {
  const h=app();h.ev("cfg('Squat').mode='rpt';state.attempts.Squat=2;save()");
  savePrescription(h,squat,2,7);
  h.choices.push('R');set(h,squat,0,5);set(h,squat,1,6);
  assert.equal(h.S().core.Squat.rptLevel,1);
  capture(h,squat,1).cancel();
  verdict('6 accepted RPT transition survives partial undo',[h.S().weights.Squat,h.S().core.Squat.rptLevel,h.S().fixedWorkingSets.lprpt.Squat.reps],
   'affected-six',[[100,1,6],[100,0,7]]);
 }
}
if(mode!=='affected-six'){
 for(const [lift,weight,edits,reps,broken,repaired] of [
  ['Prone Row',80,[],5,[75,5,true],[75,5,true]],
  ['Bench Press',80,[6],6,[80,6,false],[75,6,true]],
  ['Squat',110,[8,5],5,[110,5,false],[100,5,true]]
 ]){
  const h=app({[lift]:weight});
  for(const target of edits)savePrescription(h,lift,3,target);
  set(h,lift,0,reps);set(h,lift,1,reps-1);
  const third=h.ctx.getSetPlan(lift)[2];
  verdict('7 straight recovery '+lift,[third.load,third.target,third.drop],'affected-seven',[broken,repaired]);
 }
}

if(mode==='repaired'||mode==='stale-weight'){
 const h=app(),pending=[];
 h.ctx.bvomWeightModal=(_name,weight,save)=>pending.push({weight,save});
 h.ctx.editWeight(squat);h.ctx.editWeight(squat);
 pending[1].save(100,{sets:3,reps:8},100);
 pending[0].save(100,{sets:5,reps:3},100);
 const saved=h.S().fixedWorkingSets.lprpt.Squat;
 assert.deepEqual([saved.sets,saved.reps],mode==='stale-weight'?[5,3]:[3,8]);
 console.log(mode==='stale-weight'?'REPRODUCED':'PASS','stale weight editor',JSON.stringify(saved));
}
