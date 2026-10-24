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

const bwSlot=()=>({roleSlotId:'vertical-pull',exerciseId:'chin-up',equipment:'bodyweight',
  sets:3,ceiling:8,variation:'chin-up',assistance:'light-band',
  plannedG:5000,plannedOrigin:origin(5000),
  incrementG:1000,incrementOrigin:origin(1000)});
const bwJournal=(hard=false,extra=false)=>{
  const r=log();
  r.append('WORKOUT_STARTED',{sessionId:'bw',templateId:'upper_a',kind:'NORMAL',
    slots:[bwSlot()]});
  const source=[];
  for(let i=0;i<3+(extra?1:0);i++) {
    source.push(r.append(i===3?'EXTRA_SET_RECORDED':'SET_RECORDED',{
      sessionId:'bw',roleSlotId:'vertical-pull',exerciseId:'chin-up',
      setIndex:i,reps:i===0?6:7,actualG:5000,actualOrigin:origin(5000),
      variation:'chin-up',assistance:'light-band',
      harderThanIntended:i===0&&hard,...(i===3?{}:{prescribed:true})
    }));
  }
  r.finish('bw');
  return { ...r,source };
};
const correctBW=(r,target,fields={})=>r.append('SET_CORRECTED',{
  sessionId:'bw',targetEventId:target.eventId,
  roleSlotId:'vertical-pull',exerciseId:'chin-up',setIndex:target.setIndex,
  reps:7,actualG:5000,actualOrigin:origin(5000),...fields
});
check('bodyweight reps-only correction preserves actual variation and assistance',()=>{
  const r=bwJournal();
  const original=structuredClone(r.source[0]);
  correctBW(r,r.source[0]);
  const p=foldBB2Block(opening(),r.events);
  const entry=p.history[0].sets[0];
  assert.equal(entry.variation,'chin-up');
  assert.equal(entry.assistance,'light-band');
  assert.equal(entry.reps,7);
  assert.equal(entry.actualG,5000);
  assert.deepEqual(r.source[0],original);
  assert.equal(p.progress['upper_a|vertical-pull|chin-up'].bestReps,21);
});
check('explicit bodyweight variation update persists through later reps-only revision',()=>{
  const r=bwJournal();
  correctBW(r,r.source[0],{variation:'assisted-chin',assistance:'medium-band'});
  const first=foldBB2Block(opening(),r.events).history[0].sets[0];
  assert.equal(first.variation,'assisted-chin');
  assert.equal(first.assistance,'medium-band');
  correctBW(r,r.source[0],{reps:8});
  const second=foldBB2Block(opening(),r.events).history[0].sets[0];
  assert.deepEqual([second.reps,second.variation,second.assistance],[8,'assisted-chin','medium-band']);
});
check('hard-effort exclusion survives unrelated bodyweight reps correction',()=>{
  const r=bwJournal(true);
  correctBW(r,r.source[0]);
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history[0].sets[0].harderThanIntended,true);
  assert.equal(p.progress['upper_a|vertical-pull|chin-up'].calibrated,true);
  assert.equal(p.progress['upper_a|vertical-pull|chin-up'].bestReps,null);
});
check('explicit false removes hard-effort flag and allows calibration reference',()=>{
  const r=bwJournal(true);
  correctBW(r,r.source[0],{harderThanIntended:false});
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history[0].sets[0].harderThanIntended,false);
  assert.equal(p.progress['upper_a|vertical-pull|chin-up'].bestReps,21);
});
check('extra bodyweight set revision keeps variation and never changes gating',()=>{
  const r=bwJournal(false,true);
  correctBW(r,r.source[3],{reps:9});
  const p=foldBB2Block(opening(),r.events);
  const extra=p.history[0].sets.find(s=>s.setIndex===3);
  assert.deepEqual([extra.reps,extra.variation,extra.assistance,extra.prescribed],
    [9,'chin-up','light-band',false]);
  assert.equal(p.history[0].validCount,3);
  assert.equal(p.progress['upper_a|vertical-pull|chin-up'].bestReps,20);
});
check('void then restore preserves original variation when not explicitly changed',()=>{
  const r=bwJournal();
  r.append('SET_VOIDED',{sessionId:'bw',targetEventId:r.source[0].eventId});
  correctBW(r,r.source[0]);
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual([p.history[0].sets[0].variation,p.history[0].sets[0].assistance],
    ['chin-up','light-band']);
});
check('malformed hard-effort boolean is rejected on set and correction',()=>{
  const r=bwJournal();
  const bad=structuredClone(r.events);
  bad[1].harderThanIntended='false';
  assert.throws(()=>foldBB2Block(opening(),bad),/harder-than-intended flag/);
  correctBW(r,r.source[0],{harderThanIntended:'false'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/harder-than-intended flag/);
});


const revokeCredit=(r,creditId='credit-s')=>r.append('CREDIT_REVOKED',
  {sessionId:'s',creditId});
const grantCredit=(r,creditId='credit-s',type='CREDIT_GRANTED')=>r.append(type,
  {sessionId:'s',creditId});
const correctCreditSet=(r,target)=>r.append('SET_CORRECTED',{
  sessionId:'s',targetEventId:target.eventId,
  roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:target.setIndex,
  reps:7,actualG:100000,actualOrigin:origin(100000)
});
const creditJournal=()=>{
  const r=log();r.start('s',3);const source=r.sets('s',3);r.finish('s');
  return { ...r,source };
};
check('credit grant rejects ineligible revision even if later correction restores eligibility',()=>{
  const r=creditJournal();
  r.append('SET_VOIDED',{sessionId:'s',targetEventId:r.source[0].eventId});
  grantCredit(r);
  correctCreditSet(r,r.source[0]);
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /credit grant without eligible session revision/);
});
check('credit cannot be revoked while session was still eligible at revoke ordinal',()=>{
  const r=creditJournal();grantCredit(r);revokeCredit(r);
  r.append('SET_VOIDED',{sessionId:'s',targetEventId:r.source[0].eventId});
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /credit revoke without ineligible session revision/);
});
check('premature regrant stays illegal even when a later correction restores eligibility',()=>{
  const r=creditJournal();grantCredit(r);
  r.append('SET_VOIDED',{sessionId:'s',targetEventId:r.source[0].eventId});
  revokeCredit(r);
  grantCredit(r,'credit-restored','CREDIT_REGRANTED');
  correctCreditSet(r,r.source[0]);
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /credit grant without eligible session revision/);
});
check('revoked session cannot mint a second first-grant in place of regrant',()=>{
  const r=creditJournal();grantCredit(r);
  r.append('SET_VOIDED',{sessionId:'s',targetEventId:r.source[0].eventId});
  revokeCredit(r);correctCreditSet(r,r.source[0]);
  grantCredit(r,'credit-replacement','CREDIT_GRANTED');
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /second first-grant; use regrant/);
});
check('two revoke-restore-regrant cycles yield exactly one active credit and full lineage',()=>{
  const r=creditJournal();grantCredit(r);
  for(let i=1;i<=2;i++) {
    r.append('SET_VOIDED',{sessionId:'s',targetEventId:r.source[0].eventId});
    revokeCredit(r,i===1?'credit-s':'credit-regrant-1');
    correctCreditSet(r,r.source[0]);
    grantCredit(r,'credit-regrant-'+i,'CREDIT_REGRANTED');
    const p=foldBB2Block(opening(),r.events);
    assert.equal(p.quotas.upper_a,1);
    assert.equal(Object.keys(p.activeCredits).length,1);
    assert.equal(p.history[0].creditId,'credit-regrant-'+i);
    assert.equal(p.history[0].status,'COMPLETED_NORMAL');
  }
  const p=foldBB2Block(opening(),r.events);
  assert.equal(Object.keys(p.creditLedger).length,3);
  assert.deepEqual(p.activeCredits,{s:'credit-regrant-2'});
  assert.equal(p.creditLedger['credit-s'].active,false);
  assert.equal(p.creditLedger['credit-regrant-1'].active,false);
  assert.equal(p.creditLedger['credit-regrant-2'].active,true);
  assert.equal(p.creditLedger['credit-regrant-1'].previousCreditId,'credit-s');
  assert.equal(p.creditLedger['credit-regrant-2'].previousCreditId,'credit-regrant-1');
  assert.ok(p.creditLedger['credit-s'].revokeEventId);
  assert.ok(p.creditLedger['credit-regrant-1'].revokeEventId);
  assert.equal(p.history.length,1);
});
check('initial valid grant may later revoke after correction; unaffected template quotas stay zero',()=>{
  const r=creditJournal();grantCredit(r);
  r.append('SET_VOIDED',{sessionId:'s',targetEventId:r.source[0].eventId});
  revokeCredit(r);
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.quotas,{upper_a:0,lower_a:0,upper_b:0,lower_b:0});
  assert.equal(p.history[0].status,'INCOMPLETE_CORRECTED');
  assert.equal(p.creditLedger['credit-s'].active,false);
});

console.log('BB2-HARDEN '+passes+' PASS / '+failures+' FAIL');
if(failures) process.exit(1);