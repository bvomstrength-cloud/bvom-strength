// BB2 Stage (i) — additional fail-closed gates, independent of shipped app.
// Intended to be run against an isolated ledger.cjs, not BB1 runtime.
'use strict';
const assert = require('node:assert/strict');
const { createBB2Opening, foldBB2Block, planBB2Finish } = require('../../bb2/ledger.cjs');
const origin = grams => ({ value: String(grams / 1000), unit: 'kg' });
const slot = (sets) => ({
  roleSlotId:'bench', exerciseId:'barbell-bench', equipment:'loaded', sets,
  ceiling:8, plannedG:100000, plannedOrigin:origin(100000),
  incrementG:2500, incrementOrigin:origin(2500)
});
const opening = () => createBB2Opening({ownerId:'test-owner', blockId:'test-block'});
const log = () => {
  const events=[];
  const append=(type,p={}) => {
    const e={type,eventId:'id-'+(events.length+1),commitOrdinal:events.length+1,
      blockId:'test-block',...p};
    events.push(e); return e;
  };
  const start=(sessionId,count) => append('WORKOUT_STARTED',{
    sessionId,templateId:'upper_a',kind:'NORMAL',slots:[slot(count)]});
  const sets=(sessionId,count,from=0) => {
    const result=[];
    for(let i=from;i<from+count;i++) result.push(append('SET_RECORDED',{
      sessionId,roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:i,
      reps:7,actualG:100000,actualOrigin:origin(100000),prescribed:true}));
    return result;
  };
  const finish=sessionId => append('WORKOUT_FINISHED',{sessionId});
  return {events,append,start,sets,finish};
};
let failures=0,passes=0;
function check(name,fn) {
  try { fn(); passes++; console.log('PASS BB2-HARDEN '+name); }
  catch(e) { failures++; console.error('FAIL BB2-HARDEN '+name+': '+e.stack); }
}
check('threshold rounds upward for 11/12/13/15 prescribed sets',()=>{
  for(const [count,min] of [[11,8],[12,9],[13,10],[15,11]]) {
    const r=log(); r.start('s',count); r.sets('s',min-1); r.finish('s');
    assert.throws(()=>foldBB2Block(opening(),r.events),/Finish below 70 percent gate/,count+' sets');
    const second=log(); second.start('s',count); second.sets('s',min); second.finish('s');
    const projected=foldBB2Block(opening(),second.events);
    assert.equal(projected.history[0].validCount,min);
    assert.equal(projected.history[0].status,'COMPLETED_NORMAL_NONCREDIT');
  }
});
check('extra sets cannot substitute for missing prescribed gating sets',()=>{
  const r=log(); r.start('s',11); r.sets('s',7);
  for(let i=0;i<10;i++) r.append('EXTRA_SET_RECORDED',{
    sessionId:'s',roleSlotId:'bench',exerciseId:'barbell-bench',
    setIndex:11+i,reps:8,actualG:100000,actualOrigin:origin(100000)});
  r.finish('s');
  assert.throws(()=>foldBB2Block(opening(),r.events),/Finish below 70 percent gate/);
});
check('an unrelated historical correction never authorises a below-gate Finish',()=>{
  const r=log(); r.start('A',3); const a=r.sets('A',3); r.finish('A');
  r.append('SET_CORRECTED',{
    sessionId:'A',targetEventId:a[0].eventId,
    roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:0,
    reps:6,actualG:100000,actualOrigin:origin(100000)
  });
  r.start('B',3); r.sets('B',1); r.finish('B');
  assert.throws(()=>foldBB2Block(opening(),r.events),/Finish below 70 percent gate/);
});
check('post-Finish correction can revoke credit without rewriting valid original Finish',()=>{
  const r=log(); r.start('A',3); const a=r.sets('A',3); r.finish('A');
  r.append('CREDIT_GRANTED',{sessionId:'A',creditId:'credit-A'});
  assert.equal(foldBB2Block(opening(),r.events).quotas.upper_a,1);
  r.append('SET_VOIDED',{sessionId:'A',targetEventId:a[0].eventId,
    roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:0});
  assert.throws(()=>foldBB2Block(opening(),r.events),/ineligible active credit requires revoke/);
  r.append('CREDIT_REVOKED',{sessionId:'A',creditId:'credit-A'});
  const projection=foldBB2Block(opening(),r.events);
  assert.equal(projection.quotas.upper_a,0);
  assert.equal(projection.history[0].status,'INCOMPLETE_CORRECTED');
});
check('corrections cannot impersonate another slot/exercise/index',()=>{
  for(const forged of [{roleSlotId:'row'},{exerciseId:'curl'},{setIndex:1}]) {
    const r=log();r.start('s',3);const saved=r.sets('s',3);r.finish('s');
    r.append('SET_CORRECTED',{sessionId:'s',targetEventId:saved[0].eventId,
      roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:0,...forged,
      reps:6,actualG:100000,actualOrigin:origin(100000)});
    assert.throws(()=>foldBB2Block(opening(),r.events),/correction target identity mismatch/);
  }
});
check('a valid exact-target correction preserves the original set identity',()=>{
  const r=log();r.start('s',3);const saved=r.sets('s',3);r.finish('s');
  r.append('SET_CORRECTED',{sessionId:'s',targetEventId:saved[0].eventId,
    roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:0,
    reps:6,actualG:100000,actualOrigin:origin(100000)});
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history[0].sets[0].reps,6);
  assert.equal(p.history[0].sets[0].setIndex,0);
});
check('Finish idempotence leaves one session and one credit',()=>{
  const r=log();r.start('s',3);r.sets('s',3);
  const planned=planBB2Finish(opening(),r.events,'s');
  assert.equal(planned.projection.quotas.upper_a,1);
  const again=planBB2Finish(opening(),planned.events,'s');
  assert.equal(again.noOp,true);
  assert.equal(again.events.filter(e=>e.type==='CREDIT_GRANTED').length,1);
  assert.equal(again.projection.history.length,1);
});
console.log('BB2-HARDEN '+passes+' PASS / '+failures+' FAIL');
if(failures) process.exit(1);