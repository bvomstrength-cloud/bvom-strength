#!/usr/bin/env node
// BB2 Stage (i) deterministic replay scale/performance proof.
// Run independently of shipped BB1 app and external services.
'use strict';
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {createBB2Opening,foldBB2Block}=require('../../bb2/ledger.cjs');

const ownerId='performance-fixture',blockId='perf-block';
const opening=createBB2Opening({ownerId,blockId});
const origin=g=>({value:String(g/1000),unit:'kg'});
const appendFactory=()=>{
  const events=[];
  const add=(type,fields={})=>{
    const e={type,eventId:'perf-'+(events.length+1),
      commitOrdinal:events.length+1,blockId,...fields};
    events.push(e);return e;
  };
  return {events,add};
};
const loadedSlot=(id,weight=100000)=>({
  roleSlotId:id,exerciseId:'exercise-'+id,sets:3,ceiling:8,
  equipment:'loaded',plannedG:weight,plannedOrigin:origin(weight),
  incrementG:2500,incrementOrigin:origin(2500)
});
const set=(add,sessionId,slot,index,reps=7,actualG=slot.plannedG)=>
  add('SET_RECORDED',{sessionId,roleSlotId:slot.roleSlotId,
    exerciseId:slot.exerciseId,setIndex:index,reps,prescribed:true,
    actualG,actualOrigin:origin(actualG)});
function fullCreditBlock(){
  const j=appendFactory();
  for(const templateId of ['upper_a','lower_a','upper_b','lower_b']){
    for(let n=0;n<8;n++){
      const sessionId=templateId+'-'+(n+1);
      const slots=Array.from({length:6},(_,i)=>loadedSlot('slot-'+i,60000+2500*i));
      j.add('WORKOUT_STARTED',{sessionId,kind:'NORMAL',templateId,slots});
      for(const slot of slots)for(let k=0;k<slot.sets;k++)set(j.add,sessionId,slot,k);
      j.add('WORKOUT_FINISHED',{sessionId});
      j.add('CREDIT_GRANTED',{sessionId,creditId:'credit-'+sessionId});
    }
  }
  j.add('BLOCK_SEALED',{sealId:'sealed-perf-block'});
  return j.events;
}
function retrospectivePending(incompleteCount){
  const j=appendFactory(), slot=loadedSlot('bench');
  const start=id=>j.add('WORKOUT_STARTED',{
    sessionId:id,kind:'NORMAL',templateId:'upper_a',slots:[slot]});
  const finish=id=>j.add('WORKOUT_FINISHED',{sessionId:id});
  start('calibration');
  for(let i=0;i<3;i++)set(j.add,'calibration',slot,i);
  finish('calibration');
  start('source');
  const original=[];
  for(let i=0;i<3;i++)original.push(set(j.add,'source',slot,i));
  finish('source');
  // At original Start time these incomplete workouts had no pending offer.
  // A final correction retroactively gives the earlier source an off-plan offer.
  for(let i=0;i<incompleteCount;i++){
    const sessionId='paused-'+i;
    start(sessionId);
    j.add('WORKOUT_INCOMPLETE',{sessionId});
  }
  for(const old of original)j.add('SET_CORRECTED',{
    sessionId:'source',targetEventId:old.eventId,
    reps:7,actualG:95000,actualOrigin:origin(95000)
  });
  return j.events;
}
const timed=(name,events,verify,budgetMs)=>{
  const t0=performance.now();
  const first=foldBB2Block(opening,events);
  const t1=performance.now();
  const second=foldBB2Block(opening,events);
  const t2=performance.now();
  verify(first);
  assert.deepEqual(first,second,'full deterministic replay must be byte-for-byte equivalent');
  const elapsedMs=Math.round(t1-t0), replayMs=Math.round(t2-t1);
  const heapMiB=Math.round(process.memoryUsage().heapUsed/1048576);
  console.log('BB2-PERF '+name+' events='+events.length+
    ' initialMs='+elapsedMs+' replayMs='+replayMs+' heapMiB='+heapMiB);
  assert.ok(t1-t0<budgetMs && t2-t1<budgetMs,
    name+' replay exceeded conservative '+budgetMs+'ms CI budget');
};
const full=fullCreditBlock();
timed('32-credited-6-slot-full-block',full,p=>{
  assert.deepEqual(p.quotas,{upper_a:8,lower_a:8,upper_b:8,lower_b:8});
  assert.equal(p.history.length,32);
  assert.equal(p.sealed,true);
  assert.equal(p.closingSnapshot.priorCreditIds.length,32);
},12000);
const pending=retrospectivePending(96);
timed('96-retroactive-paused-workouts',pending,p=>{
  assert.equal(p.history.length,98);
  assert.deepEqual(p.pending['upper_a|bench|exercise-bench'],
    {kind:'OFF_PLAN',sessionId:'source',valueG:95000,plannedG:100000});
  assert.equal(p.quotas.upper_a,0);
},12000);
console.log('BB2 REPLAY PERFORMANCE: PASS');
