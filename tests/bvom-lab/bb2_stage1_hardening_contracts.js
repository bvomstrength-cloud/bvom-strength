// BB2 Stage (i) — additional fail-closed gates, independent of shipped app.
// Intended to be run against an isolated ledger.cjs, not BB1 runtime.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createBB2Opening, foldBB2Block, planBB2Finish, commitBB2Transaction,
  createNextBB2Opening, discardBB2Session } = require('../../bb2/ledger.cjs');
// Audit the private snapshot guard without exposing an unsafe projection
// transition through the real module API. Mutation tests load the altered
// ledger source here too, preserving tamper-check mutation coverage.
const privateContext = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(require.resolve('../../bb2/ledger.cjs'), 'utf8') +
  '\nmodule.exports.auditSnapshot = createNextBB2OpeningFromProjection;',
  privateContext, { filename: 'bb2-private-snapshot-audit.cjs' });
const inspectSealedProjection = (p, id) =>
  JSON.parse(JSON.stringify(privateContext.module.exports.auditSnapshot(p, id)));
const origin = grams => ({ value: String(grams / 1000), unit: 'kg' });
const slot = (sets) => ({
  roleSlotId:'bench', exerciseId:'barbell-bench', equipment:'loaded', sets,
  ceiling:8, plannedG:100000, plannedOrigin:origin(100000),
  incrementG:2500, incrementOrigin:origin(2500)
});
const opening = () => createBB2Opening({ownerId:'test-owner', blockId:'test-block'});
const verifiedNext = (events, id) => createNextBB2Opening(opening(), events, id);
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
check('a standalone historical credit regrant respects the global active-workout guard',()=>{
  const r=log();r.start('s',3);const saved=r.sets('s',3);r.finish('s');
  r.append('CREDIT_GRANTED',{sessionId:'s',creditId:'credit-original'});
  r.append('SET_VOIDED',{sessionId:'s',targetEventId:saved[0].eventId});
  r.append('CREDIT_REVOKED',{sessionId:'s',creditId:'credit-original'});
  r.append('SET_CORRECTED',{sessionId:'s',targetEventId:saved[0].eventId,reps:7});
  const before=JSON.stringify(r.events), prior=foldBB2Block(opening(),r.events);
  assert.equal(prior.quotas.upper_a,0);
  const proposal={type:'CREDIT_REGRANTED',eventId:'regrant-after-recovery',
    commitOrdinal:r.events.length+1,blockId:'test-block',sessionId:'s',creditId:'credit-restored'};
  const token={ownerId:'test-owner',blockId:'test-block',foldRulesVersion:1,
    expectedHead:prior.headOrdinal,sealRevision:prior.sealRevision};
  assert.throws(()=>commitBB2Transaction(opening(),r.events,[proposal],{
    ...token,activeWorkout:true}),/active workout blocks correction/i);
  assert.throws(()=>commitBB2Transaction(opening(),r.events,[proposal],token),
    /active workout blocks correction/i);
  assert.equal(JSON.stringify(r.events),before);
  const committed=commitBB2Transaction(opening(),r.events,[proposal],{
    ...token,activeWorkout:false});
  assert.equal(committed.projection.quotas.upper_a,1);
  assert.equal(committed.projection.activeCredits.s,'credit-restored');
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


const acceptedOffPlanJournal=(bMode='NORMAL',hardB=false)=>{
  const r=log();
  const planned=p=>({...slot(3),plannedG:p,plannedOrigin:origin(p)});
  const record=(sessionId,load,hard=false)=>{
    const refs=[];
    for(let i=0;i<3;i++) refs.push(r.append('SET_RECORDED',{
      sessionId,roleSlotId:'bench',exerciseId:'barbell-bench',
      setIndex:i,reps:7,actualG:load,actualOrigin:origin(load),
      harderThanIntended:i===0&&hard,prescribed:true
    }));
    return refs;
  };
  r.append('WORKOUT_STARTED',{sessionId:'A',templateId:'upper_a',
    kind:'NORMAL',slots:[planned(60000)]});
  const a=record('A',55000);
  r.finish('A');
  const choice=r.append('CHOICE_RESOLVED',{
    sourceSessionId:'A',roleSlotId:'bench',exerciseId:'barbell-bench',
    decision:'ACCEPT',loadG:55000,loadOrigin:origin(55000)
  });
  r.append('WORKOUT_STARTED',{sessionId:'B',templateId:'upper_a',
    kind:bMode==='INCOMPLETE'?'NORMAL':bMode,slots:[planned(55000)]});
  const b=record('B',55000,hardB);
  if(bMode==='INCOMPLETE') r.append('WORKOUT_INCOMPLETE',{sessionId:'B'});
  else r.finish('B');
  return {...r,a,b,choice};
};
const voidSet=(r,sessionId,target)=>r.append('SET_VOIDED',
  {sessionId,targetEventId:target.eventId});
check('qualified B retroactive first calibration still supersedes invalidated A acceptance',()=>{
  const r=acceptedOffPlanJournal();
  voidSet(r,'A',r.a[0]);
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.requiredConsent,[]);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].loadG,55000);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].calibrated,true);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].bestReps,21);
  assert.deepEqual(p.history.map(h=>h.status),
    ['INCOMPLETE_CORRECTED','COMPLETED_NORMAL_NONCREDIT']);
});
check('correcting qualified B reactivates A consent and refuses an unconsented transaction',()=>{
  const r=acceptedOffPlanJournal();
  voidSet(r,'A',r.a[0]);
  const before=foldBB2Block(opening(),r.events);
  assert.deepEqual(before.requiredConsent,[]);
  const prospective={type:'SET_VOIDED',eventId:'void-B',
    commitOrdinal:r.events.length+1,blockId:'test-block',
    sessionId:'B',targetEventId:r.b[0].eventId};
  const saved=JSON.stringify(r.events);
  assert.throws(()=>commitBB2Transaction(opening(),r.events,[prospective],
    {ownerId:'test-owner',blockId:'test-block',foldRulesVersion:1,expectedHead:r.events.length,
     sealRevision:0,activeWorkout:false,retrospective:true}),
    /unresolved correction consent/);
  assert.equal(JSON.stringify(r.events),saved);
  const after=foldBB2Block(opening(),[...r.events,prospective]);
  assert.equal(after.requiredConsent.length,1);
  assert.equal(after.requiredConsent[0].choiceEventId,r.choice.eventId);
});
check('KEEP-as-manual during restored consent retains original choice ordinal, not a new weight event',()=>{
  const r=acceptedOffPlanJournal();
  voidSet(r,'A',r.a[0]);
  const prospective={type:'SET_VOIDED',eventId:'void-B',
    commitOrdinal:r.events.length+1,blockId:'test-block',
    sessionId:'B',targetEventId:r.b[0].eventId};
  const keep={type:'CHOICE_RECLASSIFIED',eventId:'consent-keep',
    commitOrdinal:r.events.length+2,blockId:'test-block',
    targetEventId:r.choice.eventId,decision:'KEEP_AS_MANUAL'};
  const out=commitBB2Transaction(opening(),r.events,[prospective,keep],
    {ownerId:'test-owner',blockId:'test-block',foldRulesVersion:1,expectedHead:r.events.length,
     sealRevision:0,activeWorkout:false,retrospective:true});
  const p=out.projection;
  assert.deepEqual(p.requiredConsent,[]);
  assert.deepEqual([p.progress['upper_a|bench|barbell-bench'].loadG,
    p.progress['upper_a|bench|barbell-bench'].bestReps,
    p.progress['upper_a|bench|barbell-bench'].stallCount],
    [55000,null,0]);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].epochId,
    'choice:'+r.choice.eventId);
  assert.equal(out.events.at(-1).type,'CHOICE_RECLASSIFIED');
  assert.equal(out.events.at(-1).loadG,undefined);
});
check('saved INCOMPLETE B does not supersede original acceptance',()=>{
  const r=acceptedOffPlanJournal('INCOMPLETE');
  voidSet(r,'A',r.a[0]);
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.requiredConsent.map(x=>x.choiceEventId),[r.choice.eventId]);
});
check('hard-effort B cannot supersede invalidated A acceptance despite valid quota sets',()=>{
  const r=acceptedOffPlanJournal('NORMAL',true);
  voidSet(r,'A',r.a[0]);
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.requiredConsent.map(x=>x.choiceEventId),[r.choice.eventId]);
});
check('RECOVERY B cannot supersede invalidated A acceptance',()=>{
  const r=acceptedOffPlanJournal('RECOVERY');
  voidSet(r,'A',r.a[0]);
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.requiredConsent.map(x=>x.choiceEventId),[r.choice.eventId]);
});


const sealedFixture=()=>{
  const r=log();
  for(const templateId of ['upper_a','lower_a','upper_b','lower_b']){
    for(let i=1;i<=8;i++){
      const sessionId=templateId+'-'+i;
      r.append('WORKOUT_STARTED',{sessionId,templateId,kind:'NORMAL',slots:[slot(1)]});
      r.append('SET_RECORDED',{sessionId,roleSlotId:'bench',exerciseId:'barbell-bench',
        setIndex:0,reps:7,actualG:100000,actualOrigin:origin(100000),prescribed:true});
      r.append('WORKOUT_FINISHED',{sessionId});
      r.append('CREDIT_GRANTED',{sessionId,creditId:'credit-'+sessionId});
    }
  }
  r.append('BLOCK_SEALED',{sealId:'seal-one'});
  return r;
};
check('EXTRA NORMAL is allowed on a filled template only while the block remains open',()=>{
  const incomplete=log();incomplete.append('WORKOUT_STARTED',{
    sessionId:'premature-extra',templateId:'upper_a',kind:'EXTRA_NORMAL',slots:[slot(1)]});
  assert.throws(()=>foldBB2Block(opening(),incomplete.events),/requires filled template quota/i);

  const stillOpen=sealedFixture();
  stillOpen.events.splice(-5); // Remove last Lower B workout and the unused seal.
  const base=foldBB2Block(opening(),stillOpen.events);
  assert.deepEqual(base.quotas,{upper_a:8,lower_a:8,upper_b:8,lower_b:7});
  stillOpen.append('WORKOUT_STARTED',{sessionId:'intentional-extra',
    templateId:'upper_a',kind:'EXTRA_NORMAL',slots:[slot(1)]});
  stillOpen.append('SET_RECORDED',{sessionId:'intentional-extra',roleSlotId:'bench',
    exerciseId:'barbell-bench',setIndex:0,reps:7,actualG:100000,
    actualOrigin:origin(100000),prescribed:true});
  stillOpen.append('WORKOUT_FINISHED',{sessionId:'intentional-extra'});
  const extra=foldBB2Block(opening(),stillOpen.events);
  assert.deepEqual(extra.quotas,base.quotas);
  assert.equal(extra.history.at(-1).status,'COMPLETED_EXTRA_NORMAL');

  const complete=sealedFixture();complete.events.pop(); // full 32 credits, before sealing
  complete.append('WORKOUT_STARTED',{sessionId:'forbidden-extra',
    templateId:'upper_a',kind:'EXTRA_NORMAL',slots:[slot(1)]});
  assert.throws(()=>foldBB2Block(opening(),complete.events),
    /block complete.*next block/i);
});
check('sealed prior block denies all training mutations, including recovery and swaps',()=>{
  const r=sealedFixture();
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.sealed,true);
  const forged=[
    {type:'WORKOUT_STARTED',sessionId:'recovery-after-seal',kind:'RECOVERY',
      templateId:'upper_a',slots:[slot(1)]},
    {type:'INCREMENT_EDITED',templateId:'upper_a',roleSlotId:'bench',
      exerciseId:'barbell-bench',incrementG:5000,incrementOrigin:origin(5000),scope:'GLOBAL'},
    {type:'EXERCISE_SWAPPED',templateId:'upper_a',roleSlotId:'bench',exerciseId:'new-exercise'},
    {type:'UNIT_METADATA',unit:'lb'},
    {type:'STALL_OFFER_DISMISSED',templateId:'upper_a',roleSlotId:'bench',
      exerciseId:'barbell-bench',epochId:'opening',stallCount:4}
  ];
  for(const [i,fields] of forged.entries()){
    const ev={...fields,eventId:'post-seal-'+i,commitOrdinal:r.events.length+1,
      blockId:'test-block'};
    assert.throws(()=>foldBB2Block(opening(),[...r.events,ev]),/sealed block.*read-only/,fields.type);
  }
});
check('notes and History hide/unhide remain legal after seal without changing closing snapshot',()=>{
  const r=sealedFixture();
  const p=foldBB2Block(opening(),r.events);
  r.append('NOTE_EDITED',{sessionId:'upper_a-1',text:'Corrected note after sealing'});
  r.append('HISTORY_HIDDEN',{sessionId:'upper_a-1'});
  let changed=foldBB2Block(opening(),r.events);
  assert.deepEqual(changed.closingSnapshot,p.closingSnapshot);
  assert.deepEqual(changed.progress,p.progress);
  assert.deepEqual(changed.quotas,p.quotas);
  assert.deepEqual(changed.activeCredits,p.activeCredits);
  assert.equal(changed.sealRevision,p.sealRevision);
  assert.equal(changed.history.find(x=>x.sessionId==='upper_a-1').hidden,true);
  assert.equal(changed.history.find(x=>x.sessionId==='upper_a-1').note,'Corrected note after sealing');
  r.append('HISTORY_UNHIDDEN',{sessionId:'upper_a-1'});
  changed=foldBB2Block(opening(),r.events);
  assert.equal(changed.history.find(x=>x.sessionId==='upper_a-1').hidden,false);
  assert.deepEqual(changed.closingSnapshot,p.closingSnapshot);
});
check('restored 32-credit stream cannot seal with unresolved correction-time consent',()=>{
  const r=sealedFixture();r.events.pop(); // full credits, still unsealed
  const source=r.events.find(e=>e.type==='SET_RECORDED'&&e.sessionId==='lower_b-8');
  source.actualG=95000;source.actualOrigin=origin(95000);
  const choice=r.append('CHOICE_RESOLVED',{sourceSessionId:'lower_b-8',
    roleSlotId:'bench',exerciseId:'barbell-bench',decision:'ACCEPT',
    loadG:95000,loadOrigin:origin(95000)});
  assert.deepEqual(foldBB2Block(opening(),r.events).requiredConsent,[]);
  r.append('SET_CORRECTED',{sessionId:'lower_b-8',targetEventId:source.eventId,
    reps:7,actualG:90000,actualOrigin:origin(90000)});
  const beforeSeal=foldBB2Block(opening(),r.events);
  assert.deepEqual(beforeSeal.requiredConsent,[{
    choiceEventId:choice.eventId,sourceSessionId:'lower_b-8',
    key:'lower_b|bench|barbell-bench',valueG:95000
  }]);
  r.append('BLOCK_SEALED',{sealId:'invalid-seal'});
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /cannot seal with unresolved correction consent/i);
  r.events.pop();
  r.append('CHOICE_RECLASSIFIED',{targetEventId:choice.eventId,
    decision:'KEEP_AS_MANUAL'});
  r.append('BLOCK_SEALED',{sealId:'consented-seal'});
  const resolved=foldBB2Block(opening(),r.events);
  assert.equal(resolved.sealed,true);
  assert.deepEqual(resolved.requiredConsent,[]);
  assert.equal(resolved.closingSnapshot.progress['lower_b|bench|barbell-bench'].loadG,95000);
  assert.equal(verifiedNext(r.events,'next-after-consent').blockId,
    'next-after-consent');
});
check('sealing rejects unfinished active recovery despite full quotas',()=>{
  const r=sealedFixture();
  r.events.pop();
  r.append('WORKOUT_STARTED',{sessionId:'ongoing-recovery',templateId:'upper_a',
    kind:'RECOVERY',slots:[slot(1)]});
  r.append('BLOCK_SEALED',{sealId:'seal-two'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/cannot seal with unfinished workout/);
});
check('BLOCK_CREATED is optional, but when recorded must match opening at ordinal one',()=>{
  const valid=log();
  valid.append('BLOCK_CREATED',{ownerId:'test-owner',schemaVersion:1,
    foldRulesVersion:1,openingSnapshotVersion:1});
  valid.start('fresh',1);
  assert.equal(foldBB2Block(opening(),valid.events).headOrdinal,2);
  for(const change of [
    {ownerId:'wrong-owner'},{schemaVersion:2},{foldRulesVersion:2},
    {openingSnapshotVersion:2}
  ]){
    const broken=structuredClone(valid.events);
    Object.assign(broken[0],change);
    assert.throws(()=>foldBB2Block(opening(),broken),/block creation|unsupported|schema|rules/i);
  }
  const late=log();late.start('first',1);
  late.append('BLOCK_CREATED',{ownerId:'test-owner',schemaVersion:1,
    foldRulesVersion:1,openingSnapshotVersion:1});
  assert.throws(()=>foldBB2Block(opening(),late.events),/block creation.*first ordinal/);
});
check('Discard tombstones require matching Discard and cannot retain set evidence',()=>{
  const r=log();r.start('discard-me',1);r.sets('discard-me',1);
  const discarded=discardBB2Session(r.events,'discard-me');
  assert.equal(foldBB2Block(opening(),discarded).history.length,0);
  const orphan=structuredClone(discarded);
  orphan.at(-1).sessionId='different-session';
  assert.throws(()=>foldBB2Block(opening(),orphan),/unlinked discard tombstone/);
  const missing=structuredClone(discarded).filter(e=>e.type!=='TOMBSTONE');
  missing.forEach((e,i)=>e.commitOrdinal=i+1);
  assert.throws(()=>foldBB2Block(opening(),missing),/discard missing tombstones/);
  const leaked=structuredClone(discarded);
  leaked[0].reps=8;
  assert.throws(()=>foldBB2Block(opening(),leaked),/tombstone cannot retain/);
});
check('Discard purges notes and rejects hidden live session events in restored ledgers',()=>{
  const r=log();r.start('discard-me',1);r.sets('discard-me',1);
  r.append('NOTE_EDITED',{sessionId:'discard-me',text:'private training note'});
  const discarded=discardBB2Session(r.events,'discard-me');
  assert.equal(discarded.filter(e=>e.type==='TOMBSTONE').length,3);
  assert.equal(foldBB2Block(opening(),discarded).history.length,0);
  const leaking=structuredClone(discarded);
  leaking[1]={...r.events[1]};
  assert.throws(()=>foldBB2Block(opening(),leaking),/discard.*session.*event|discard.*tombstone/i);
  const leakedStart=structuredClone(discarded);
  leakedStart[0]={...r.events[0]};
  assert.throws(()=>foldBB2Block(opening(),leakedStart),/discard.*session.*event|discard.*tombstone/i);
});
check('a discarded stable session ID can never be reused for another workout',()=>{
  const r=log();r.start('same-id',1);r.sets('same-id',1);
  const discarded=discardBB2Session(r.events,'same-id');
  const replay=[...discarded,{type:'WORKOUT_STARTED',eventId:'new-start',
    commitOrdinal:discarded.length+1,blockId:'test-block',sessionId:'same-id',
    templateId:'upper_a',kind:'NORMAL',slots:[slot(1)]}];
  assert.throws(()=>foldBB2Block(opening(),replay),/discarded session event|duplicate session ID/i);
});
check('next block preserves all 32 credits and sealed provenance with fresh identity',()=>{
  const r=sealedFixture();
  const next=verifiedNext(r.events,'block-next');
  assert.equal(next.previousSealId,'seal-one');
  assert.equal(next.previousBlockId,'test-block');
  assert.deepEqual([next.previousSchemaVersion,next.previousFoldRulesVersion,
    next.previousOpeningSnapshotVersion],[1,1,1]);
  assert.equal(next.sealRevision,1);
  assert.equal(next.previousCreditIds.length,32);
  assert.deepEqual(foldBB2Block(next,[]).quotas,
    {upper_a:0,lower_a:0,upper_b:0,lower_b:0});
  assert.throws(()=>verifiedNext(r.events,'test-block'),/fresh ID/);
});
check('earned future load retains valid derived mass provenance into next block',()=>{
  const r=sealedFixture();
  const lastUpper=r.events.find(e=>e.type==='SET_RECORDED'&&e.sessionId==='upper_a-8');
  lastUpper.reps=8;
  const sealed=foldBB2Block(opening(),r.events);
  const key='upper_a|bench|barbell-bench';
  assert.equal(sealed.progress[key].loadG,102500);
  assert.equal(sealed.progress[key].loadOrigin.kind,'DERIVED');
  const earnedFrom=r.events.find(e=>e.type==='WORKOUT_FINISHED'&&e.sessionId==='upper_a-8');
  assert.deepEqual(sealed.progress[key].loadOrigin,
    {kind:'DERIVED',sourceEventId:earnedFrom.eventId});
  const carried=verifiedNext(r.events,'next-after-earned-load');
  const replay=foldBB2Block(carried,[]);
  assert.equal(replay.progress[key].loadG,102500);
  assert.deepEqual(replay.progress[key].loadOrigin,sealed.progress[key].loadOrigin);
  assert.equal(replay.quotas.upper_a,0);
});
check('damaged sealed ancestry or restored next-opening credit lineage rejects cleanly',()=>{
  const r=sealedFixture(), p=foldBB2Block(opening(),r.events);
  const mutations=[
    x=>{x.closingSnapshot.priorQuotas.upper_a=7},
    x=>{x.closingSnapshot.priorCreditIds.pop()},
    x=>{x.closingSnapshot.priorCreditIds[0]='bogus-credit'},
    x=>{x.closingSnapshot.sealedBlockId='wrong-block'},
    x=>{x.closingSnapshot.sealId='stale-seal'},
    x=>{x.closingSnapshot.foldRulesVersion=999}
  ];
  for(const modify of mutations){
    const bad=structuredClone(p);modify(bad);
    assert.throws(()=>inspectSealedProjection(bad,'block-next'),/invalid sealed block ancestry/);
  }
  const next=verifiedNext(r.events,'block-next');
  const corrupt=structuredClone(next);corrupt.previousCreditIds.pop();
  assert.throws(()=>foldBB2Block(corrupt,[]),/invalid prior credit IDs/);
  const reused=structuredClone(next);reused.previousBlockId='block-next';
  assert.throws(()=>foldBB2Block(reused,[]),/fresh ID/);
  const unsupported=structuredClone(next);unsupported.previousFoldRulesVersion=999;
  assert.throws(()=>foldBB2Block(unsupported,[]),/invalid prior snapshot version/);
});


const guardJournal=()=>{
  const r=log();r.start('verified',3);const saved=r.sets('verified',3);r.finish('verified');
  const proposed={type:'SET_CORRECTED',eventId:'guard-correction',
    commitOrdinal:r.events.length+1,blockId:'test-block',
    sessionId:'verified',targetEventId:saved[0].eventId,
    reps:6,actualG:100000,actualOrigin:origin(100000)};
  const guard={ownerId:'test-owner',blockId:'test-block',foldRulesVersion:1,
    expectedHead:r.events.length,sealRevision:0,activeWorkout:false,retrospective:true};
  return {r,proposed,guard};
};
check('correction preview binds owner/block/fold/head/seal without mutating input',()=>{
  const {r,proposed,guard}=guardJournal(), old=JSON.stringify(r.events);
  for(const broken of [
    {ownerId:'other-owner'}, {blockId:'other-block'}, {blockId:undefined},
    {foldRulesVersion:2},{foldRulesVersion:undefined},
    {expectedHead:guard.expectedHead-1}, {sealRevision:1}
  ]){
    assert.throws(()=>commitBB2Transaction(opening(),r.events,[proposed],
      {...guard,...broken}),/owner mismatch|stale correction preview/);
  }
  assert.equal(JSON.stringify(r.events),old);
  const good=commitBB2Transaction(opening(),r.events,[proposed],guard);
  assert.equal(good.projection.history[0].sets[0].reps,6);
  assert.equal(good.projection.headOrdinal,r.events.length+1);
});
check('missing active-workout verification fails closed on retrospective changes',()=>{
  const {r,proposed,guard}=guardJournal();
  for(const value of [undefined,true,'false',null]){
    assert.throws(()=>commitBB2Transaction(opening(),r.events,[proposed],
      {...guard,activeWorkout:value}),/active workout blocks correction/);
  }
  const good=commitBB2Transaction(opening(),r.events,[proposed],guard);
  assert.equal(good.events.at(-1).eventId,'guard-correction');
});
check('empty correction batch rejects without changing prior ledger',()=>{
  const {r,guard}=guardJournal(), saved=JSON.stringify(r.events);
  assert.throws(()=>commitBB2Transaction(opening(),r.events,[],guard),
    /invalid empty event transaction/);
  assert.throws(()=>commitBB2Transaction(opening(),r.events,null,guard),
    /invalid empty event transaction/);
  assert.equal(JSON.stringify(r.events),saved);
});
const linkedReplace=(r,choice,overrides={})=>r.append('CHOICE_REPLACED',{
  targetEventId:choice.eventId,sourceSessionId:'A',roleSlotId:'bench',
  exerciseId:'barbell-bench',decision:'REPLACE',loadG:57500,loadOrigin:origin(57500),
  ...overrides
});
const invalidatedAcceptedOffPlanJournal=()=>{
  const r=acceptedOffPlanJournal();
  // Both the original source and its later qualified superseder must lose
  // eligibility before a KEEP/REPLACE correction-time decision is needed.
  voidSet(r,'A',r.a[0]);
  voidSet(r,'B',r.b[0]);
  return r;
};
check('explicit replacement must target exact prior accepted choice identity',()=>{
  const r=invalidatedAcceptedOffPlanJournal();
  const replacement=linkedReplace(r,r.choice);
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].loadG,57500);
  assert.deepEqual(p.requiredConsent,[]);
  assert.ok(replacement.eventId);
  for(const change of [
    {targetEventId:'made-up-choice'},
    {sourceSessionId:'B'},
    {roleSlotId:'other-slot'},
    {exerciseId:'other-exercise'},
    {decision:'ACCEPT'},
    {loadOrigin:{value:'58',unit:'kg'}}
  ]){
    const forged=structuredClone(r.events);
    Object.assign(forged.at(-1),change);
    assert.throws(()=>foldBB2Block(opening(),forged),
      /choice revision|choice replacement|replacement load|origin/i);
  }
});
check('choice revision cannot be duplicated or target a non-ACCEPT decision',()=>{
  const r=invalidatedAcceptedOffPlanJournal();
  linkedReplace(r,r.choice);
  r.append('CHOICE_RECLASSIFIED',{targetEventId:r.choice.eventId,decision:'KEEP_AS_MANUAL'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/duplicate choice revision/);
  const first=acceptedOffPlanJournal();
  first.append('CHOICE_RECLASSIFIED',{targetEventId:'not-an-accept',decision:'KEEP_AS_MANUAL'});
  assert.throws(()=>foldBB2Block(opening(),first.events),/choice revision must target a prior ACCEPT/);
});
check('choice reclassification cannot be reused to suppress consent twice',()=>{
  const r=invalidatedAcceptedOffPlanJournal();
  r.append('CHOICE_RECLASSIFIED',{targetEventId:r.choice.eventId,decision:'KEEP_AS_MANUAL'});
  const first=foldBB2Block(opening(),r.events);
  assert.deepEqual(first.requiredConsent,[]);
  r.append('CHOICE_RECLASSIFIED',{targetEventId:r.choice.eventId,decision:'KEEP_AS_MANUAL'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/duplicate choice revision/);
});


check('ACCEPT requires exact original offered off-plan value',()=>{
  const r=acceptedOffPlanJournal();
  const valid=foldBB2Block(opening(),r.events);
  assert.equal(valid.progress['upper_a|bench|barbell-bench'].loadG,55000);
  const changed=structuredClone(r.events);
  const accept=changed.find(e=>e.eventId===r.choice.eventId);
  accept.loadG=54000;accept.loadOrigin=origin(54000);
  assert.throws(()=>foldBB2Block(opening(),changed),/accepted value differs from original off-plan offer/);
});
check('on-plan completed exercise does not issue an ACCEPT offer',()=>{
  const r=creditJournal();
  r.append('CHOICE_RESOLVED',{sourceSessionId:'s',roleSlotId:'bench',
    exerciseId:'barbell-bench',decision:'ACCEPT',loadG:100000,loadOrigin:origin(100000)});
  assert.throws(()=>foldBB2Block(opening(),r.events),/no original eligible off-plan offer/);
});
check('real off-plan KEEP leaves normal prescription unchanged',()=>{
  const r=creditJournal();
  for(const e of r.events.filter(e=>e.type==='SET_RECORDED')) {
    e.actualG=95000;e.actualOrigin=origin(95000);
  }
  r.append('CHOICE_RESOLVED',{sourceSessionId:'s',roleSlotId:'bench',
    exerciseId:'barbell-bench',decision:'KEEP'});
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].loadG,100000);
  assert.equal(p.pending['upper_a|bench|barbell-bench'],undefined);
});
check('one off-plan source offer resolves only once, never earns a duplicate ACCEPT or KEEP',()=>{
  for(const decisions of [['ACCEPT','ACCEPT'],['ACCEPT','KEEP'],['KEEP','ACCEPT']]){
    const r=creditJournal();
    for(const e of r.events.filter(e=>e.type==='SET_RECORDED')) {
      e.actualG=95000;e.actualOrigin=origin(95000);
    }
    const fields=decision=>({sourceSessionId:'s',roleSlotId:'bench',
      exerciseId:'barbell-bench',decision,
      ...(decision==='ACCEPT'?{loadG:95000,loadOrigin:origin(95000)}:{})});
    r.append('CHOICE_RESOLVED',fields(decisions[0]));
    const legitimate=foldBB2Block(opening(),r.events);
    assert.equal(legitimate.pending['upper_a|bench|barbell-bench'],undefined);
    r.append('CHOICE_RESOLVED',fields(decisions[1]));
    assert.throws(()=>foldBB2Block(opening(),r.events),/already resolved|stale.*offer/i);
  }
});
check('a bodyweight HOLD consumes the offer even though it does not edit the prescription',()=>{
  const r=log();
  r.append('WORKOUT_STARTED',{sessionId:'bw-hold',templateId:'upper_a',
    kind:'NORMAL',slots:[bwSlot()]});
  for(let i=0;i<3;i++)r.append('SET_RECORDED',{
    sessionId:'bw-hold',roleSlotId:'vertical-pull',exerciseId:'chin-up',
    setIndex:i,reps:8,actualG:5000,actualOrigin:origin(5000),
    variation:'chin-up',assistance:'light-band',prescribed:true});
  r.finish('bw-hold');
  const resolution={sourceSessionId:'bw-hold',roleSlotId:'vertical-pull',
    exerciseId:'chin-up',decision:'HOLD'};
  r.append('CHOICE_RESOLVED',resolution);
  assert.equal(foldBB2Block(opening(),r.events).pending['upper_a|vertical-pull|chin-up'],undefined);
  r.append('CHOICE_RESOLVED',resolution);
  assert.throws(()=>foldBB2Block(opening(),r.events),/offer already resolved/);
});
check('a superseded pending choice cannot be ACCEPTed after a global prescription edit',()=>{
  const r=creditJournal();
  for(const e of r.events.filter(e=>e.type==='SET_RECORDED')) {
    e.actualG=95000;e.actualOrigin=origin(95000);
  }
  r.append('PRESCRIPTION_EDITED',{templateId:'upper_a',roleSlotId:'bench',
    exerciseId:'barbell-bench',loadG:97500,loadOrigin:origin(97500)});
  r.append('CHOICE_RESOLVED',{sourceSessionId:'s',roleSlotId:'bench',
    exerciseId:'barbell-bench',decision:'ACCEPT',loadG:95000,loadOrigin:origin(95000)});
  assert.throws(()=>foldBB2Block(opening(),r.events),/stale.*offer|no unresolved.*offer/i);
});
check('original ACCEPT remains historically valid after subsequent source correction',()=>{
  const r=acceptedOffPlanJournal();
  r.append('SET_CORRECTED',{sessionId:'A',targetEventId:r.a[0].eventId,
    roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:0,
    reps:7,actualG:50000,actualOrigin:origin(50000)});
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.requiredConsent,[]);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].loadG,55000);
});
check('ordinary resolution cannot masquerade as future replacement',()=>{
  const r=acceptedOffPlanJournal();
  r.append('CHOICE_RESOLVED',{sourceSessionId:'A',roleSlotId:'bench',
    exerciseId:'barbell-bench',decision:'REPLACE',loadG:57000,loadOrigin:origin(57000)});
  assert.throws(()=>foldBB2Block(opening(),r.events),/invalid decision/);
});
check('HOLD requires a genuine bodyweight offer',()=>{
  const r=creditJournal();
  r.append('CHOICE_RESOLVED',{sourceSessionId:'s',roleSlotId:'bench',
    exerciseId:'barbell-bench',decision:'HOLD'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/no eligible bodyweight offer/);
});


const bodyweightDirectionJournal=(withSuperseder=false)=>{
  const r=bwJournal();
  r.append('WORKOUT_STARTED',{sessionId:'bw2',templateId:'upper_a',kind:'NORMAL',slots:[bwSlot()]});
  const earned=[];
  for(let i=0;i<3;i++) earned.push(r.append('SET_RECORDED',{
    sessionId:'bw2',roleSlotId:'vertical-pull',exerciseId:'chin-up',
    setIndex:i,reps:8,actualG:5000,actualOrigin:origin(5000),
    variation:'chin-up',assistance:'light-band',prescribed:true
  }));
  r.finish('bw2');
  const choice=r.append('CHOICE_RESOLVED',{sourceSessionId:'bw2',
    roleSlotId:'vertical-pull',exerciseId:'chin-up',decision:'DIFFICULTY_ACCEPT',
    variation:'weighted-chin',assistance:'light-band',
    addedWeightG:7500,addedWeightOrigin:origin(7500)});
  if(withSuperseder){
    r.append('WORKOUT_STARTED',{sessionId:'bw3',templateId:'upper_a',kind:'NORMAL',
      slots:[{...bwSlot(),plannedG:7500,plannedOrigin:origin(7500),
        variation:'weighted-chin'}]});
    for(let i=0;i<3;i++) r.append('SET_RECORDED',{
      sessionId:'bw3',roleSlotId:'vertical-pull',exerciseId:'chin-up',
      setIndex:i,reps:7,actualG:7500,actualOrigin:origin(7500),
      variation:'weighted-chin',assistance:'light-band',prescribed:true
    });
    r.finish('bw3');
  }
  return {...r,earned,choice};
};
const voidDifficultyTop=(r,first)=>r.append('SET_CORRECTED',{
  sessionId:'bw2',targetEventId:first.eventId,
  roleSlotId:'vertical-pull',exerciseId:'chin-up',setIndex:0,
  reps:7,actualG:5000,actualOrigin:origin(5000)
});
const bodyweightProgressKey='upper_a|vertical-pull|chin-up';
check('accepted harder bodyweight choice survives source correction but demands consent',()=>{
  const r=bodyweightDirectionJournal();
  let p=foldBB2Block(opening(),r.events);
  assert.equal(p.progress[bodyweightProgressKey].loadG,7500);
  assert.equal(p.progress[bodyweightProgressKey].variation,'weighted-chin');
  assert.deepEqual(p.requiredConsent,[]);
  voidDifficultyTop(r,r.earned[0]);
  p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.requiredConsent,[{
    choiceEventId:r.choice.eventId,sourceSessionId:'bw2',key:bodyweightProgressKey,
    valueG:7500,variation:'weighted-chin',assistance:'light-band'
  }]);
  assert.equal(p.progress[bodyweightProgressKey].loadG,7500);
  assert.equal(p.progress[bodyweightProgressKey].variation,'weighted-chin');
});
check('unconsented bodyweight source correction rejects atomic transaction',()=>{
  const r=bodyweightDirectionJournal();
  const old=JSON.stringify(r.events);
  const correction={type:'SET_CORRECTED',eventId:'correct-bodyweight',
    commitOrdinal:r.events.length+1,blockId:'test-block',
    sessionId:'bw2',targetEventId:r.earned[0].eventId,
    roleSlotId:'vertical-pull',exerciseId:'chin-up',setIndex:0,
    reps:7,actualG:5000,actualOrigin:origin(5000)};
  const guard={ownerId:'test-owner',blockId:'test-block',foldRulesVersion:1,
    expectedHead:r.events.length,sealRevision:0,activeWorkout:false};
  assert.throws(()=>commitBB2Transaction(opening(),r.events,[correction],guard),
    /unresolved correction consent/);
  assert.equal(JSON.stringify(r.events),old);
});
check('bodyweight KEEP-AS-MANUAL retains accepted historical variation and original ordinal',()=>{
  const r=bodyweightDirectionJournal();
  const correction={type:'SET_CORRECTED',eventId:'correct-bodyweight',
    commitOrdinal:r.events.length+1,blockId:'test-block',
    sessionId:'bw2',targetEventId:r.earned[0].eventId,
    reps:7,actualG:5000,actualOrigin:origin(5000)};
  const keep={type:'CHOICE_RECLASSIFIED',eventId:'keep-bodyweight',
    commitOrdinal:r.events.length+2,blockId:'test-block',
    targetEventId:r.choice.eventId,decision:'KEEP_AS_MANUAL'};
  const out=commitBB2Transaction(opening(),r.events,[correction,keep],{
    ownerId:'test-owner',blockId:'test-block',foldRulesVersion:1,
    expectedHead:r.events.length,sealRevision:0,activeWorkout:false
  });
  assert.deepEqual(out.projection.requiredConsent,[]);
  assert.equal(out.projection.progress[bodyweightProgressKey].loadG,7500);
  assert.equal(out.projection.progress[bodyweightProgressKey].variation,'weighted-chin');
  assert.equal(out.projection.progress[bodyweightProgressKey].epochId,
    'choice:'+r.choice.eventId);
  assert.equal(out.projection.progress[bodyweightProgressKey].bestReps,null);
});
check('bodyweight REPLACE makes a new explicitly chosen variation and load',()=>{
  const r=bodyweightDirectionJournal();
  voidDifficultyTop(r,r.earned[0]);
  const replacement=r.append('CHOICE_REPLACED',{
    targetEventId:r.choice.eventId,sourceSessionId:'bw2',
    roleSlotId:'vertical-pull',exerciseId:'chin-up',
    decision:'REPLACE',loadG:7000,loadOrigin:origin(7000),
    variation:'assisted-chin',assistance:'medium-band'
  });
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.requiredConsent,[]);
  assert.equal(p.progress[bodyweightProgressKey].loadG,7000);
  assert.equal(p.progress[bodyweightProgressKey].variation,'assisted-chin');
  assert.equal(p.progress[bodyweightProgressKey].assistance,'medium-band');
  assert.equal(p.progress[bodyweightProgressKey].epochId,'choice:'+replacement.eventId);
});
check('later qualified same-identity bodyweight exposure supersedes invalidated earlier choice',()=>{
  const r=bodyweightDirectionJournal(true);
  voidDifficultyTop(r,r.earned[0]);
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.requiredConsent,[]);
  assert.equal(p.progress[bodyweightProgressKey].loadG,7500);
  assert.equal(p.progress[bodyweightProgressKey].bestReps,21);
});
check('bodyweight replacement refuses missing variation or invalid assistance',()=>{
  const r=bodyweightDirectionJournal();
  voidDifficultyTop(r,r.earned[0]);
  const repl=r.append('CHOICE_REPLACED',{
    targetEventId:r.choice.eventId,sourceSessionId:'bw2',
    roleSlotId:'vertical-pull',exerciseId:'chin-up',
    decision:'REPLACE',loadG:7000,loadOrigin:origin(7000),
    variation:'assisted-chin',assistance:'medium-band'
  });
  const damaged=structuredClone(r.events);
  delete damaged.at(-1).variation;
  assert.throws(()=>foldBB2Block(opening(),damaged),/replacement difficulty variation/);
  const invalid=structuredClone(r.events);
  invalid.at(-1).assistance=19;
  assert.throws(()=>foldBB2Block(opening(),invalid),/replacement assistance/);
  assert.ok(repl.eventId);
});


const retroPendingLoaded=(secondOutcome='FINISH')=>{
  const r=log();
  r.start('calibration',3);r.sets('calibration',3);r.finish('calibration');
  r.start('A',3);const source=r.sets('A',3);r.finish('A');
  r.start('B',3);r.sets('B',3);
  if(secondOutcome==='INCOMPLETE')r.append('WORKOUT_INCOMPLETE',{sessionId:'B'});
  else r.finish('B');
  for(const original of source) r.append('SET_CORRECTED',{
    sessionId:'A',targetEventId:original.eventId,
    reps:7,actualG:95000,actualOrigin:origin(95000)
  });
  return {...r,source};
};
check('later corrections do not invalidate earlier legitimate Start with superseding B Finish',()=>{
  const r=retroPendingLoaded();
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history.length,3);
  assert.equal(p.history.find(x=>x.sessionId==='B').status,'COMPLETED_NORMAL_NONCREDIT');
  assert.equal(p.pending['upper_a|bench|barbell-bench'],undefined);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].loadG,100000);
  assert.equal(p.history.find(x=>x.sessionId==='A').sets[0].actualG,95000);
});
check('retroactive pending loaded offer survives historical incomplete B but does not erase it',()=>{
  const r=retroPendingLoaded('INCOMPLETE');
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history.length,3);
  assert.equal(p.history.find(x=>x.sessionId==='B').status,'INCOMPLETE');
  assert.deepEqual(p.pending['upper_a|bench|barbell-bench'],{
    kind:'OFF_PLAN',sessionId:'A',valueG:95000,plannedG:100000
  });
});
check('new Start must still refuse retroactively created unresolved offer',()=>{
  const r=retroPendingLoaded('INCOMPLETE');
  r.start('new-C',3);
  assert.throws(()=>foldBB2Block(opening(),r.events),/unresolved choice blocks same exercise/);
});
check('resolving newly created pending offer permits next same-identity Start',()=>{
  const r=retroPendingLoaded('INCOMPLETE');
  r.append('CHOICE_RESOLVED',{sourceSessionId:'A',roleSlotId:'bench',
    exerciseId:'barbell-bench',decision:'ACCEPT',loadG:95000,loadOrigin:origin(95000)});
  let p=foldBB2Block(opening(),r.events);
  assert.equal(p.pending['upper_a|bench|barbell-bench'],undefined);
  r.start('new-C',3);
  p=foldBB2Block(opening(),r.events);
  assert.equal(p.headOrdinal,r.events.length);
});
check('retroactive bodyweight all-top offer cannot invalidate already saved B Start',()=>{
  const r=bwJournal();
  r.append('WORKOUT_STARTED',{sessionId:'A',templateId:'upper_a',kind:'NORMAL',slots:[bwSlot()]});
  const a=[];
  for(let i=0;i<3;i++)a.push(r.append('SET_RECORDED',{
    sessionId:'A',roleSlotId:'vertical-pull',exerciseId:'chin-up',
    setIndex:i,reps:i===0?7:8,actualG:5000,actualOrigin:origin(5000),
    variation:'chin-up',assistance:'light-band',prescribed:true
  }));
  r.finish('A');
  r.append('WORKOUT_STARTED',{sessionId:'B',templateId:'upper_a',kind:'NORMAL',slots:[bwSlot()]});
  for(let i=0;i<3;i++)r.append('SET_RECORDED',{
    sessionId:'B',roleSlotId:'vertical-pull',exerciseId:'chin-up',
    setIndex:i,reps:7,actualG:5000,actualOrigin:origin(5000),
    variation:'chin-up',assistance:'light-band',prescribed:true
  });
  r.finish('B');
  r.append('SET_CORRECTED',{sessionId:'A',targetEventId:a[0].eventId,
    reps:8,actualG:5000,actualOrigin:origin(5000)});
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history.length,3);
  assert.equal(p.pending['upper_a|vertical-pull|chin-up'],undefined);
  assert.equal(p.progress['upper_a|vertical-pull|chin-up'].variation,'chin-up');
});


check('second BB2 Start cannot overlap an unfinished workout',()=>{
  const r=log();
  r.start('active-one',3);
  r.start('overlapping-two',3);
  assert.throws(()=>foldBB2Block(opening(),r.events),/another workout is active/);
});
check('saved incomplete ends active session and permits another Start',()=>{
  const r=log();
  r.start('first',3);
  r.append('WORKOUT_INCOMPLETE',{sessionId:'first'});
  r.start('second',3);
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history.length,1);
  assert.equal(p.history[0].status,'INCOMPLETE');
  assert.equal(p.quotas.upper_a,0);
});
check('exercise swap requires no active session, even when no sessionId is supplied',()=>{
  const r=log();
  r.start('working',3);
  r.append('EXERCISE_SWAPPED',{templateId:'upper_a',
    roleSlotId:'bench',exerciseId:'dumbbell-press'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/exercise swap while workout active/);
  const valid=log();
  valid.append('EXERCISE_SWAPPED',{templateId:'upper_a',
    roleSlotId:'bench',exerciseId:'dumbbell-press'});
  valid.start('later',3);
  assert.equal(foldBB2Block(opening(),valid.events).selections['upper_a|bench'],
    'dumbbell-press');
});
check('calibration cannot be accepted before any trial set or duplicated',()=>{
  const early=log();
  early.start('early',3);
  early.append('CALIBRATION_ACCEPTED',{sessionId:'early',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    loadG:100000,loadOrigin:origin(100000)});
  assert.throws(()=>foldBB2Block(opening(),early.events),
    /calibration needs a recorded trial set/);
  const repeated=log();
  repeated.start('cal',3);
  repeated.sets('cal',1);
  repeated.append('CALIBRATION_ACCEPTED',{sessionId:'cal',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    loadG:100000,loadOrigin:origin(100000)});
  repeated.append('CALIBRATION_ACCEPTED',{sessionId:'cal',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    loadG:102500,loadOrigin:origin(102500)});
  assert.throws(()=>foldBB2Block(opening(),repeated.events),
    /duplicate calibration acceptance/);
});
check('session void is idempotent by stable source session identity',()=>{
  const r=log();
  r.start('finished',3);r.sets('finished',3);r.finish('finished');
  r.append('SESSION_VOIDED',{sessionId:'finished'});
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history[0].status,'VOID');
  r.append('SESSION_VOIDED',{sessionId:'finished'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/duplicate session void/);
});


check('exercise lock cannot be recorded after saved Incomplete or Finish',()=>{
  for(const outcome of ['WORKOUT_INCOMPLETE','WORKOUT_FINISHED']) {
    const r=log();r.start('already-ended',3);
    if(outcome==='WORKOUT_FINISHED')r.sets('already-ended',3);
    r.append(outcome,{sessionId:'already-ended'});
    r.append('EXERCISE_LOCKED',{sessionId:'already-ended',
      roleSlotId:'bench',exerciseId:'barbell-bench',
      plannedG:100000,plannedOrigin:origin(100000)});
    assert.throws(()=>foldBB2Block(opening(),r.events),
      /exercise lock after workout outcome/);
  }
});
check('session-tied future prescription edit is refused after its Finish',()=>{
  const r=log();r.start('done',3);r.sets('done',3);r.finish('done');
  const field={templateId:'upper_a',roleSlotId:'bench',
    exerciseId:'barbell-bench',loadG:102500,loadOrigin:origin(102500),scope:'GLOBAL'};
  r.append('PRESCRIPTION_EDITED',{...field,sessionId:'done'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/session edit after workout outcome/);
  r.events.pop();
  r.append('PRESCRIPTION_EDITED',field);
  assert.equal(foldBB2Block(opening(),r.events).progress['upper_a|bench|barbell-bench'].loadG,102500);
});
check('session-tied edit cannot refer to unknown session even with valid template',()=>{
  const r=log();r.append('PRESCRIPTION_EDITED',{
    sessionId:'fictional-session',templateId:'upper_a',
    roleSlotId:'bench',exerciseId:'barbell-bench',scope:'GLOBAL',
    loadG:102500,loadOrigin:origin(102500)
  });
  assert.throws(()=>foldBB2Block(opening(),r.events),/edit references unknown session/);
});
check('hide or unhide requires History outcome; active notes remain harmless',()=>{
  for(const type of ['HISTORY_HIDDEN','HISTORY_UNHIDDEN']){
    const r=log();r.start('still-active',3);r.append(type,{sessionId:'still-active'});
    assert.throws(()=>foldBB2Block(opening(),r.events),
      /History visibility requires finished session/);
  }
  const r=log();r.start('still-active',3);
  r.append('NOTE_EDITED',{sessionId:'still-active',text:'Session note'});
  assert.equal(foldBB2Block(opening(),r.events).headOrdinal,2);
});
check('post-Finish set revisions cannot be recorded while another session is active',()=>{
  const r=log();r.start('old',3);const saved=r.sets('old',3);r.finish('old');
  r.start('current',3);
  r.append('SET_CORRECTED',{
    sessionId:'old',targetEventId:saved[0].eventId,
    roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:0,
    reps:6,actualG:100000,actualOrigin:origin(100000)
  });
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /retrospective revision during active workout/);
  r.events.pop();r.append('WORKOUT_INCOMPLETE',{sessionId:'current'});
  r.append('SET_CORRECTED',{
    sessionId:'old',targetEventId:saved[0].eventId,reps:6,
    actualG:100000,actualOrigin:origin(100000)
  });
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history.find(h=>h.sessionId==='old').sets[0].reps,6);
});
check('session void cannot be committed during a different active workout',()=>{
  const r=log();r.start('old',3);r.sets('old',3);r.finish('old');
  r.start('current',3);
  r.append('SESSION_VOIDED',{sessionId:'old'});
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /retrospective revision during active workout/);
  r.events.pop();r.append('WORKOUT_INCOMPLETE',{sessionId:'current'});
  r.append('SESSION_VOIDED',{sessionId:'old'});
  assert.equal(foldBB2Block(opening(),r.events).history.find(h=>h.sessionId==='old').status,'VOID');
});


check('globally committed pre-lock edit survives Discard but cannot be forged afterward',()=>{
  const r=log();r.start('discarded',3);
  r.append('PRESCRIPTION_EDITED',{sessionId:'discarded',templateId:'upper_a',
    roleSlotId:'bench',exerciseId:'barbell-bench',scope:'GLOBAL',
    loadG:105000,loadOrigin:origin(105000)});
  r.append('EXERCISE_LOCKED',{sessionId:'discarded',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    plannedG:105000,plannedOrigin:origin(105000)});
  const discarded=discardBB2Session(r.events,'discarded');
  const p=foldBB2Block(opening(),discarded);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].loadG,105000);
  assert.equal(p.history.length,0);
  const forged=[...discarded,{
    type:'PRESCRIPTION_EDITED',eventId:'fabricated-global-late',
    commitOrdinal:discarded.length+1,blockId:'test-block',
    sessionId:'discarded',templateId:'upper_a',roleSlotId:'bench',
    exerciseId:'barbell-bench',scope:'GLOBAL',
    loadG:107500,loadOrigin:origin(107500)
  }];
  assert.throws(()=>foldBB2Block(opening(),forged),/edit references unknown session/);
});


check('bodyweight prescribed set must explicitly record variation and assistance',()=>{
  const r=bwJournal();
  const missing=structuredClone(r.events);
  const first=missing.find(e=>e.type==='SET_RECORDED');
  delete first.assistance;
  assert.throws(()=>foldBB2Block(opening(),missing),/invalid recorded set/);
  const blank=structuredClone(r.events);
  blank.find(e=>e.type==='SET_RECORDED').variation='   ';
  assert.throws(()=>foldBB2Block(opening(),blank),/invalid recorded set/);
});
check('numeric-plan bodyweight set cannot omit recorded added load',()=>{
  const r=bwJournal();
  const missing=structuredClone(r.events);
  const first=missing.find(e=>e.type==='SET_RECORDED');
  delete first.actualG;delete first.actualOrigin;
  assert.throws(()=>foldBB2Block(opening(),missing),/invalid recorded set/);
});
check('zero added weight and explicit no-assistance remain valid bodyweight evidence',()=>{
  const r=log();
  r.append('WORKOUT_STARTED',{sessionId:'unloaded',
    templateId:'upper_a',kind:'NORMAL',
    slots:[{...bwSlot(),plannedG:0,plannedOrigin:origin(0),
      assistance:'none'}]});
  for(let i=0;i<3;i++)r.append('SET_RECORDED',{
    sessionId:'unloaded',roleSlotId:'vertical-pull',exerciseId:'chin-up',
    setIndex:i,reps:7,actualG:0,actualOrigin:origin(0),
    variation:'chin-up',assistance:'none',prescribed:true
  });
  r.finish('unloaded');
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history[0].validCount,3);
  assert.equal(p.progress['upper_a|vertical-pull|chin-up'].calibrated,true);
});
check('qualitative bodyweight variant without numeric plan may omit numeric load',()=>{
  const r=log(),slot=bwSlot();
  delete slot.plannedG;delete slot.plannedOrigin;
  r.append('WORKOUT_STARTED',{sessionId:'qualitative',templateId:'upper_a',
    kind:'NORMAL',slots:[slot]});
  for(let i=0;i<3;i++)r.append('SET_RECORDED',{
    sessionId:'qualitative',roleSlotId:'vertical-pull',exerciseId:'chin-up',
    setIndex:i,reps:7,variation:'chin-up',assistance:'none',prescribed:true
  });
  r.append('WORKOUT_INCOMPLETE',{sessionId:'qualitative'});
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history[0].validCount,3);
  assert.equal(p.history[0].status,'INCOMPLETE');
});
check('qualitative bodyweight reps-only correction retains nonnumeric variation evidence',()=>{
  const r=log(),chosen=bwSlot();
  delete chosen.plannedG;delete chosen.plannedOrigin;
  chosen.assistance='none';
  r.append('WORKOUT_STARTED',{sessionId:'qual-correct',templateId:'upper_a',
    kind:'NORMAL',slots:[chosen]});
  let first;
  for(let i=0;i<3;i++){
    const logged=r.append('SET_RECORDED',{
      sessionId:'qual-correct',roleSlotId:'vertical-pull',exerciseId:'chin-up',
      setIndex:i,reps:7,variation:'chin-up',assistance:'none',prescribed:true});
    if(i===0)first=logged;
  }
  r.finish('qual-correct');
  r.append('SET_CORRECTED',{sessionId:'qual-correct',targetEventId:first.eventId,
    roleSlotId:'vertical-pull',exerciseId:'chin-up',setIndex:0,reps:8});
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history[0].status,'COMPLETED_NORMAL_NONCREDIT');
  assert.equal(p.history[0].validCount,3);
  assert.deepEqual([p.history[0].sets[0].reps,p.history[0].sets[0].variation,
    p.history[0].sets[0].assistance,p.history[0].sets[0].actualG],
    [8,'chin-up','none',undefined]);
  assert.equal(p.progress['upper_a|vertical-pull|chin-up'].bestReps,22);
  assert.deepEqual([p.progress['upper_a|vertical-pull|chin-up'].loadG,
    p.progress['upper_a|vertical-pull|chin-up'].epochId],[null,'opening']);
  r.append('WORKOUT_STARTED',{sessionId:'qual-later',templateId:'upper_a',
    kind:'NORMAL',slots:[chosen]});
  for(let i=0;i<3;i++)r.append('SET_RECORDED',{
    sessionId:'qual-later',roleSlotId:'vertical-pull',exerciseId:'chin-up',
    setIndex:i,reps:7,variation:'chin-up',assistance:'none',prescribed:true});
  r.finish('qual-later');
  const later=foldBB2Block(opening(),r.events).progress['upper_a|vertical-pull|chin-up'];
  assert.deepEqual([later.loadG,later.bestReps,later.stallCount],
    [null,22,1]); // No phantom null-to-undefined load epoch on a later Finish.
  assert.equal(later.epochId,'opening');
});
check('numeric reps-only correction inherits original grams and input-unit evidence',()=>{
  const r=creditJournal();
  const original=r.source[0];
  r.append('SET_CORRECTED',{sessionId:'s',targetEventId:original.eventId,
    roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:0,reps:8});
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual([p.history[0].sets[0].reps,p.history[0].sets[0].actualG],
    [8,100000]);
  assert.deepEqual(p.history[0].sets[0].actualOrigin,origin(100000));
  assert.equal(p.progress['upper_a|bench|barbell-bench'].bestReps,22);
});
check('bodyweight correction cannot replace valid actual with missing required load',()=>{
  const r=bwJournal();
  r.append('SET_CORRECTED',{sessionId:'bw',
    targetEventId:r.source[0].eventId,reps:7,
    actualOrigin:origin(5000)});
  assert.throws(()=>foldBB2Block(opening(),r.events),/actual origin requires numeric load/);
});
check('a newly specified corrected mass must supply matching original numeric metadata',()=>{
  const r=bwJournal();
  r.append('SET_CORRECTED',{sessionId:'bw',targetEventId:r.source[0].eventId,
    reps:7,actualG:6000});
  assert.throws(()=>foldBB2Block(opening(),r.events),/invalid actual origin/);
});


check('qualitative bodyweight exercise may lock without fictitious numeric load',()=>{
  const r=log(),chosen=bwSlot();
  delete chosen.plannedG;delete chosen.plannedOrigin;
  r.append('WORKOUT_STARTED',{sessionId:'qual-lock',templateId:'upper_a',
    kind:'NORMAL',slots:[chosen]});
  r.append('EXERCISE_LOCKED',{sessionId:'qual-lock',
    roleSlotId:'vertical-pull',exerciseId:'chin-up'});
  for(let i=0;i<3;i++)r.append('SET_RECORDED',{
    sessionId:'qual-lock',roleSlotId:'vertical-pull',exerciseId:'chin-up',
    setIndex:i,reps:7,variation:'chin-up',assistance:'none',prescribed:true
  });
  r.append('WORKOUT_INCOMPLETE',{sessionId:'qual-lock'});
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history[0].validCount,3);
  assert.equal(p.history[0].status,'INCOMPLETE');
});
check('qualitative exercise lock rejects spurious numeric origin',()=>{
  const r=log(),chosen=bwSlot();
  delete chosen.plannedG;delete chosen.plannedOrigin;
  r.append('WORKOUT_STARTED',{sessionId:'q',templateId:'upper_a',
    kind:'NORMAL',slots:[chosen]});
  r.append('EXERCISE_LOCKED',{sessionId:'q',roleSlotId:'vertical-pull',
    exerciseId:'chin-up',plannedOrigin:origin(0)});
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /qualitative lock cannot have numeric origin/);
});
check('numeric exercise lock must still match its saved plan and numeric origin',()=>{
  const r=log();r.start('numeric',3);
  r.append('EXERCISE_LOCKED',{sessionId:'numeric',
    roleSlotId:'bench',exerciseId:'barbell-bench'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/lock plan differs from committed plan/);
  r.events.pop();
  r.append('EXERCISE_LOCKED',{sessionId:'numeric',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    plannedG:100000,plannedOrigin:{value:'99',unit:'kg'}});
  assert.throws(()=>foldBB2Block(opening(),r.events),/invalid planned origin/);
});


check('bodyweight Start requires an explicit slot variation and assistance',()=>{
  for(const field of ['variation','assistance']){
    const r=log(),slot=bwSlot();delete slot[field];
    r.append('WORKOUT_STARTED',{sessionId:'missing-slot-'+field,
      templateId:'upper_a',kind:'NORMAL',slots:[slot]});
    assert.throws(()=>foldBB2Block(opening(),r.events),
      /invalid bodyweight slot identity/);
  }
  const r=log(),slot=bwSlot();slot.variation='  ';
  r.append('WORKOUT_STARTED',{sessionId:'blank-variation',
    templateId:'upper_a',kind:'NORMAL',slots:[slot]});
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /invalid bodyweight slot identity/);
});
check('pre-lock assistance-only edit is committed and used for same-session comparability',()=>{
  const r=log();
  r.append('WORKOUT_STARTED',{sessionId:'assisted',templateId:'upper_a',
    kind:'NORMAL',slots:[bwSlot()]});
  const edit=r.append('VARIATION_EDITED',{sessionId:'assisted',templateId:'upper_a',
    roleSlotId:'vertical-pull',exerciseId:'chin-up',scope:'GLOBAL',
    variation:'chin-up',assistance:'medium-band'});
  for(let i=0;i<3;i++)r.append('SET_RECORDED',{sessionId:'assisted',
    roleSlotId:'vertical-pull',exerciseId:'chin-up',setIndex:i,reps:7,
    actualG:5000,actualOrigin:origin(5000),
    variation:'chin-up',assistance:'medium-band',prescribed:true});
  r.finish('assisted');
  const p=foldBB2Block(opening(),r.events);
  const q=p.progress[bodyweightProgressKey];
  assert.deepEqual([q.variation,q.assistance,q.bestReps,q.stallCount],
    ['chin-up','medium-band',21,0]);
  assert.equal(q.epochId,'event:'+edit.eventId);
  assert.equal(p.history[0].sets[0].assistance,'medium-band');
  assert.deepEqual(p.pending,{});
});
check('no-op variation edit accounts for BOTH variation and assistance',()=>{
  const r=log();r.append('WORKOUT_STARTED',{sessionId:'no-op',
    templateId:'upper_a',kind:'NORMAL',slots:[bwSlot()]});
  r.append('VARIATION_EDITED',{sessionId:'no-op',templateId:'upper_a',
    roleSlotId:'vertical-pull',exerciseId:'chin-up',
    scope:'GLOBAL',variation:'chin-up',assistance:'light-band'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/no-op variation event/);
  r.events.pop();
  r.append('VARIATION_EDITED',{sessionId:'no-op',templateId:'upper_a',
    roleSlotId:'vertical-pull',exerciseId:'chin-up',
    scope:'GLOBAL',variation:'chin-up',assistance:'medium-band'});
  assert.equal(foldBB2Block(opening(),r.events).progress[bodyweightProgressKey].assistance,
    'medium-band');
  r.append('VARIATION_EDITED',{sessionId:'no-op',templateId:'upper_a',
    roleSlotId:'vertical-pull',exerciseId:'chin-up',
    scope:'GLOBAL',variation:'chin-up',assistance:'medium-band'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/no-op variation event/);
});
check('standalone future variation+assistance change starts one new epoch',()=>{
  const r=bwJournal();
  const before=foldBB2Block(opening(),r.events).progress[bodyweightProgressKey];
  assert.equal(before.bestReps,20);
  const edit=r.append('VARIATION_EDITED',{templateId:'upper_a',
    roleSlotId:'vertical-pull',exerciseId:'chin-up',
    scope:'GLOBAL',variation:'weighted-chin',assistance:'none'});
  const changed=foldBB2Block(opening(),r.events).progress[bodyweightProgressKey];
  assert.equal(changed.variation,'weighted-chin');
  assert.equal(changed.assistance,'none');
  assert.equal(changed.bestReps,null);
  assert.equal(changed.stallCount,0);
  assert.equal(changed.epochId,'event:'+edit.eventId);
  assert.equal(before.variation,'chin-up');
  assert.equal(before.assistance,'light-band');
});
check('malformed variation assistance cannot enter committed event stream',()=>{
  const r=log();r.append('WORKOUT_STARTED',{sessionId:'bad-assist',
    templateId:'upper_a',kind:'NORMAL',slots:[bwSlot()]});
  r.append('VARIATION_EDITED',{sessionId:'bad-assist',
    roleSlotId:'vertical-pull',exerciseId:'chin-up',
    scope:'GLOBAL',variation:'chin-up',assistance:123});
  assert.throws(()=>foldBB2Block(opening(),r.events),/invalid variation assistance/);
});


check('independently committed assistance edit survives discarded working session',()=>{
  const r=bwJournal();
  r.append('WORKOUT_STARTED',{sessionId:'discard-var',
    templateId:'upper_a',kind:'NORMAL',slots:[bwSlot()]});
  const edit=r.append('VARIATION_EDITED',{sessionId:'discard-var',
    templateId:'upper_a',roleSlotId:'vertical-pull',exerciseId:'chin-up',
    scope:'GLOBAL',variation:'chin-up',assistance:'medium-band'});
  r.append('SET_RECORDED',{sessionId:'discard-var',
    roleSlotId:'vertical-pull',exerciseId:'chin-up',setIndex:0,
    reps:6,actualG:5000,actualOrigin:origin(5000),
    variation:'chin-up',assistance:'medium-band',prescribed:true});
  const before=foldBB2Block(opening(),r.events);
  assert.equal(before.progress[bodyweightProgressKey].assistance,'medium-band');
  const discarded=discardBB2Session(r.events,'discard-var');
  const after=foldBB2Block(opening(),discarded);
  assert.equal(after.progress[bodyweightProgressKey].assistance,'medium-band');
  assert.equal(after.progress[bodyweightProgressKey].variation,'chin-up');
  assert.equal(after.progress[bodyweightProgressKey].loadG,5000);
  assert.equal(after.progress[bodyweightProgressKey].epochId,'event:'+edit.eventId);
  assert.equal(after.progress[bodyweightProgressKey].bestReps,null);
  assert.equal(after.history.length,1);
  assert.equal(after.history[0].sessionId,'bw');
  assert.equal(after.quotas.upper_a,0);
  assert.equal(discarded.find(x=>x.eventId===edit.eventId).type,'VARIATION_EDITED');
  assert.ok(discarded.some(x=>x.type==='TOMBSTONE'&&x.discardedSessionId==='discard-var'));
  assert.deepEqual(discarded.map(e=>e.commitOrdinal),
    Array.from({length:discarded.length},(_,i)=>i+1));
});
check('cannot attach an invented variation edit to already discarded session',()=>{
  const r=bwJournal();
  r.append('WORKOUT_STARTED',{sessionId:'gone',
    templateId:'upper_a',kind:'NORMAL',slots:[bwSlot()]});
  const discarded=discardBB2Session(r.events,'gone');
  discarded.push({type:'VARIATION_EDITED',eventId:'forged-variation',
    commitOrdinal:discarded.length+1,blockId:'test-block',
    sessionId:'gone',templateId:'upper_a',roleSlotId:'vertical-pull',
    exerciseId:'chin-up',scope:'GLOBAL',
    variation:'weighted-chin',assistance:'none'});
  assert.throws(()=>foldBB2Block(opening(),discarded),
    /edit references unknown session/);
});


const stallJournal=(unimproved)=>{
  const r=log();
  for(let n=0;n<=unimproved;n++){
    const sid='stall-'+n;
    r.start(sid,3);r.sets(sid,3);r.finish(sid);
  }
  return r;
};
const benchStallKey='upper_a|bench|barbell-bench';
check('three comparable unimproved sessions create nonmodal note, not a forced change',()=>{
  const r=stallJournal(3),p=foldBB2Block(opening(),r.events);
  assert.equal(p.progress[benchStallKey].loadG,100000);
  assert.equal(p.progress[benchStallKey].bestReps,21);
  assert.equal(p.progress[benchStallKey].stallCount,3);
  assert.deepEqual(p.stallSignals[benchStallKey],
    {kind:'NOTE',epochId:'opening',stallCount:3});
  assert.equal(p.quotas.upper_a,0);
  const earlier=foldBB2Block(opening(),stallJournal(2).events);
  assert.equal(earlier.stallSignals[benchStallKey],undefined);
});
check('four unimproved sessions expose only nonblocking documented stall actions',()=>{
  const r=stallJournal(4),p=foldBB2Block(opening(),r.events);
  assert.equal(p.progress[benchStallKey].loadG,100000);
  assert.equal(p.progress[benchStallKey].stallCount,4);
  assert.deepEqual(p.stallSignals[benchStallKey],{
    kind:'OFFER',epochId:'opening',stallCount:4,dismissed:false,
    actions:['REDUCE_ABOUT_10_PERCENT','SWAP_MOVEMENT','RECOVERY_SESSION']
  });
  assert.deepEqual(p.pending,{});
  assert.equal(p.history.length,5);
});
check('stall-offer dismissal is durable, inert to training, and specific to epoch+count',()=>{
  const r=stallJournal(4),before=foldBB2Block(opening(),r.events);
  r.append('STALL_OFFER_DISMISSED',{
    templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
    epochId:before.progress[benchStallKey].epochId,
    stallCount:before.progress[benchStallKey].stallCount
  });
  const after=foldBB2Block(opening(),r.events);
  assert.equal(after.stallSignals[benchStallKey].dismissed,true);
  for(const key of ['progress','quotas','activeCredits','history','pending','requiredConsent']){
    assert.deepEqual(after[key],before[key],key);
  }
  const reread=foldBB2Block(opening(),structuredClone(r.events));
  assert.deepEqual(reread.stallSignals,after.stallSignals);
  r.start('stall-after-dismissal',3);
  r.sets('stall-after-dismissal',3);
  r.finish('stall-after-dismissal');
  const next=foldBB2Block(opening(),r.events);
  assert.equal(next.progress[benchStallKey].stallCount,5);
  assert.equal(next.stallSignals[benchStallKey].dismissed,false);
  assert.equal(next.progress[benchStallKey].loadG,100000);
});
check('explicit new prescription epoch clears old offer without changing prior sessions',()=>{
  const r=stallJournal(4),before=foldBB2Block(opening(),r.events);
  r.append('STALL_OFFER_DISMISSED',{
    templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
    epochId:'opening',stallCount:4
  });
  const edit=r.append('PRESCRIPTION_EDITED',{
    templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
    scope:'GLOBAL',loadG:102500,loadOrigin:origin(102500)
  });
  const after=foldBB2Block(opening(),r.events);
  assert.equal(after.stallSignals[benchStallKey],undefined);
  assert.equal(after.progress[benchStallKey].epochId,'event:'+edit.eventId);
  assert.deepEqual([after.progress[benchStallKey].loadG,after.progress[benchStallKey].bestReps,
    after.progress[benchStallKey].stallCount],[102500,null,0]);
  assert.deepEqual(after.history,before.history);
});
check('malformed stall-offer dismissal cannot enter immutable event stream',()=>{
  const r=stallJournal(4);
  const good={templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
    epochId:'opening',stallCount:4};
  for(const bad of [{stallCount:3},{stallCount:null},{epochId:''},
                    {templateId:'unknown'},{roleSlotId:''}]){
    const altered=structuredClone(r.events);
    altered.push({type:'STALL_OFFER_DISMISSED',eventId:'invalid-stall',
      commitOrdinal:altered.length+1,blockId:'test-block',...good,...bad});
    assert.throws(()=>foldBB2Block(opening(),altered),
      /stall offer|invalid.*stall/i);
  }
});


check('stall dismissal cannot be forged before fourth eligible comparable stall',()=>{
  const r=stallJournal(3);
  r.append('STALL_OFFER_DISMISSED',{
    templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
    epochId:'opening',stallCount:4
  });
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /stall dismissal without original actionable offer/);
});
check('retrospective invalidation preserves originally legitimate stall dismissal evidence',()=>{
  const r=stallJournal(4);
  r.append('STALL_OFFER_DISMISSED',{
    templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
    epochId:'opening',stallCount:4
  });
  const source=r.events.find(e=>e.type==='SET_RECORDED' && e.sessionId==='stall-0');
  r.append('SET_VOIDED',{sessionId:'stall-0',targetEventId:source.eventId});
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.progress[benchStallKey].stallCount,3);
  assert.deepEqual(p.stallSignals[benchStallKey],
    {kind:'NOTE',epochId:'opening',stallCount:3});
  assert.equal(p.history.length,5);
});


const multiStallJournal=(order)=>{
  const r=log(),setsBySession=new Map();
  const roles={
    A:{...slot(3),roleSlotId:'bench',exerciseId:'barbell-bench'},
    B:{...slot(3),roleSlotId:'row',exerciseId:'barbell-row'}
  };
  for(const [n,item] of order.entries()){
    const mode=typeof item==='string'? 'FINISH':item.outcome;
    const role=typeof item==='string'?item:item.role;
    const selected=roles[role],sessionId='multi-'+n;
    r.append('WORKOUT_STARTED',{sessionId,templateId:'upper_a',
      kind:mode==='RECOVERY'?'RECOVERY':'NORMAL',slots:[selected]});
    const saved=[];
    for(let i=0;i<3;i++) saved.push(r.append('SET_RECORDED',{
      sessionId,roleSlotId:selected.roleSlotId,exerciseId:selected.exerciseId,
      setIndex:i,reps:7,actualG:100000,actualOrigin:origin(100000),
      harderThanIntended:mode==='HARD'&&i===0,prescribed:true
    }));
    setsBySession.set(sessionId,saved);
    r.append(mode==='INCOMPLETE'?'WORKOUT_INCOMPLETE':'WORKOUT_FINISHED',{sessionId});
  }
  return {...r,setsBySession};
};
const fullMultiSequence=['A','B','A','A','A','B','B','B'];
const multiKeys=['upper_a|bench|barbell-bench','upper_a|row|barbell-row'];
check('single stalled identity never forces or offers a multi-exercise recovery',()=>{
  const r=multiStallJournal(['A','A','A','A']);
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.stallSignals[multiKeys[0]],
    {kind:'NOTE',epochId:'opening',stallCount:3});
  assert.equal(p.multiStallRecovery,null);
  assert.equal(p.quotas.upper_a,0);
});
check('two identities reaching three stalls inside four eligible finishes give optional recovery',()=>{
  const r=multiStallJournal(fullMultiSequence);
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.multiStallRecovery,{
    kind:'OPTIONAL_RECOVERY',windowSize:4,
    sessionIds:['multi-4','multi-5','multi-6','multi-7'],
    identities:multiKeys
  });
  assert.equal(p.progress[multiKeys[0]].stallCount,3);
  assert.equal(p.progress[multiKeys[1]].stallCount,3);
  assert.equal(p.history.length,8);
  assert.deepEqual(p.quotas,{upper_a:0,lower_a:0,upper_b:0,lower_b:0});
});
check('old stall milestone outside four eligible sessions cannot trigger recovery',()=>{
  const r=multiStallJournal(['A','A','A','A','B','B','B','B']);
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.progress[multiKeys[0]].stallCount,3);
  assert.equal(p.progress[multiKeys[1]].stallCount,3);
  assert.equal(p.multiStallRecovery,null);
});
check('recovery and Save Incomplete do not consume the four-session recovery window',()=>{
  const seq=[...fullMultiSequence.slice(0,5),
    {role:'A',outcome:'INCOMPLETE'}, {role:'A',outcome:'RECOVERY'},
    ...fullMultiSequence.slice(5)];
  const r=multiStallJournal(seq),p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.multiStallRecovery,{
    kind:'OPTIONAL_RECOVERY',windowSize:4,
    sessionIds:['multi-4','multi-7','multi-8','multi-9'],
    identities:multiKeys
  });
  assert.equal(p.history.find(x=>x.sessionId==='multi-6').status,
    'LOW_STRESS_RECOVERY');
  assert.equal(p.history.find(x=>x.sessionId==='multi-5').status,
    'INCOMPLETE');
  assert.equal(p.quotas.upper_a,0);
});
check('retrospective correction removes and then restores correct optional recovery signal',()=>{
  const r=multiStallJournal(fullMultiSequence);
  const before=foldBB2Block(opening(),r.events);
  assert.equal(before.multiStallRecovery.kind,'OPTIONAL_RECOVERY');
  const first=r.setsBySession.get('multi-4')[0];
  r.append('SET_VOIDED',{sessionId:'multi-4',targetEventId:first.eventId});
  const corrected=foldBB2Block(opening(),r.events);
  assert.equal(corrected.multiStallRecovery,null);
  assert.equal(corrected.progress[multiKeys[0]].stallCount,2);
  r.append('SET_CORRECTED',{sessionId:'multi-4',targetEventId:first.eventId,
    reps:7,actualG:100000,actualOrigin:origin(100000)});
  const restored=foldBB2Block(opening(),r.events);
  assert.deepEqual(restored.multiStallRecovery,before.multiStallRecovery);
  assert.deepEqual(restored.progress,before.progress);
  assert.deepEqual(restored.quotas,before.quotas);
  assert.deepEqual(restored.activeCredits,before.activeCredits);
});
check('excluded harder-than-intended evidence never earns a multi-stall milestone',()=>{
  const r=multiStallJournal([...fullMultiSequence.slice(0,-1),
    {role:'B',outcome:'HARD'}]);
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.progress[multiKeys[0]].stallCount,3);
  assert.equal(p.progress[multiKeys[1]].stallCount,2);
  assert.equal(p.multiStallRecovery,null);
});
check('new manual exercise epoch makes previous stall milestone inapplicable',()=>{
  const r=multiStallJournal(fullMultiSequence);
  r.append('PRESCRIPTION_EDITED',{templateId:'upper_a',
    roleSlotId:'bench',exerciseId:'barbell-bench',scope:'GLOBAL',
    loadG:102500,loadOrigin:origin(102500)});
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.multiStallRecovery,null);
  assert.equal(p.progress[multiKeys[0]].stallCount,0);
  assert.equal(p.progress[multiKeys[1]].stallCount,3);
  assert.equal(p.progress[multiKeys[0]].loadG,102500);
});


const acceptStallReduction=(r,fields={})=>r.append('STALL_REDUCTION_ACCEPTED',{
  templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
  scope:'GLOBAL',offerEpochId:'opening',offerStallCount:4,
  loadG:90000,loadOrigin:origin(90000),...fields
});
check('stall reduction requires an actionable original fourth-stall offer',()=>{
  for(const count of [2,3]){
    const r=stallJournal(count);
    acceptStallReduction(r);
    assert.throws(()=>foldBB2Block(opening(),r.events),
      /stall reduction lacks matching original offer/);
  }
});
check('valid stall-reduction acceptance explicitly lowers only the future prescription',()=>{
  const r=stallJournal(4);
  const before=foldBB2Block(opening(),r.events);
  const accepted=acceptStallReduction(r);
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual([p.progress[benchStallKey].loadG,
    p.progress[benchStallKey].bestReps,p.progress[benchStallKey].stallCount,
    p.progress[benchStallKey].epochId],
    [90000,null,0,'event:'+accepted.eventId]);
  assert.equal(p.stallSignals[benchStallKey],undefined);
  assert.deepEqual(p.history,before.history);
  assert.deepEqual(p.quotas,before.quotas);
  assert.deepEqual(p.activeCredits,before.activeCredits);
});
check('stale offer epoch and stall count fail without rewriting original progression',()=>{
  const r=stallJournal(4);
  const recorded=JSON.stringify(r.events);
  for(const fields of [
    {offerEpochId:'another-epoch'},
    {offerStallCount:5}
  ]){
    const forged=structuredClone(r.events);
    forged.push({type:'STALL_REDUCTION_ACCEPTED',
      eventId:'forged-stall-accept',commitOrdinal:forged.length+1,
      blockId:'test-block',templateId:'upper_a',roleSlotId:'bench',
      exerciseId:'barbell-bench',scope:'GLOBAL',loadG:90000,
      loadOrigin:origin(90000),offerEpochId:'opening',offerStallCount:4,
      ...fields});
    assert.throws(()=>foldBB2Block(opening(),forged),
      /stall reduction lacks matching original offer/);
  }
  assert.equal(JSON.stringify(r.events),recorded);
});
check('stall acceptance must reduce numeric load, not silently increase it',()=>{
  const r=stallJournal(4);
  acceptStallReduction(r,{loadG:102500,loadOrigin:origin(102500)});
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /stall reduction must lower the offered numeric load/);
});
check('dismissed or replaced stall offer may not be accepted from stale screen',()=>{
  const dismissed=stallJournal(4);
  dismissed.append('STALL_OFFER_DISMISSED',{
    templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
    epochId:'opening',stallCount:4
  });
  acceptStallReduction(dismissed);
  assert.throws(()=>foldBB2Block(opening(),dismissed.events),
    /stall reduction lacks matching original offer/);
  const changed=stallJournal(4);
  changed.append('PRESCRIPTION_EDITED',{templateId:'upper_a',
    roleSlotId:'bench',exerciseId:'barbell-bench',scope:'GLOBAL',
    loadG:102500,loadOrigin:origin(102500)});
  acceptStallReduction(changed);
  assert.throws(()=>foldBB2Block(opening(),changed.events),
    /stall reduction lacks matching original offer/);
});
check('accepted original stall reduction survives later retrospective invalidation',()=>{
  const r=stallJournal(4);
  const accepted=acceptStallReduction(r);
  const source=r.events.find(x=>x.type==='SET_RECORDED' && x.sessionId==='stall-0');
  r.append('SET_VOIDED',{sessionId:'stall-0',targetEventId:source.eventId});
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.progress[benchStallKey].loadG,90000);
  assert.equal(p.progress[benchStallKey].epochId,'event:'+accepted.eventId);
  assert.equal(p.progress[benchStallKey].stallCount,0);
  assert.equal(p.stallSignals[benchStallKey],undefined);
});
check('second accepted stall reduction cannot reuse the consumed offer',()=>{
  const r=stallJournal(4);
  acceptStallReduction(r);
  acceptStallReduction(r,{loadG:85000,loadOrigin:origin(85000)});
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /stall reduction lacks matching original offer/);
});


const bb2Extra = (r, sessionId, index, roleSlotId='bench', exerciseId='barbell-bench') =>
  r.append('EXTRA_SET_RECORDED',{sessionId,roleSlotId,exerciseId,
    setIndex:index,reps:8,actualG:100000,actualOrigin:origin(100000)});
check('BB2 permits exactly 30 recorded extra working sets for one exercise',()=>{
  const r=log();r.start('extras30',3);r.sets('extras30',3);
  for(let i=0;i<30;i++)bb2Extra(r,'extras30',3+i);
  r.finish('extras30');
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.history.length,1);
  assert.equal(p.history[0].validCount,3);
  assert.equal(p.history[0].prescribedCount,3);
  assert.equal(p.history[0].sets.length,33);
  assert.equal(p.history[0].sets.filter(x=>!x.prescribed).length,30);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].bestReps,21);
  assert.deepEqual(p.quotas,{upper_a:0,lower_a:0,upper_b:0,lower_b:0});
});
check('BB2 refuses a 31st extra set even without Finish',()=>{
  const r=log();r.start('too-many',3);r.sets('too-many',3);
  for(let i=0;i<30;i++)bb2Extra(r,'too-many',3+i);
  bb2Extra(r,'too-many',33);
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /extra working set index exceeds limit/);
});
check('BB2 rejects a sparse far future extra set index',()=>{
  const r=log();r.start('sparse',3);
  bb2Extra(r,'sparse',3003);
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /extra working set index exceeds limit/);
});
check('extra set limit is per role/exercise, not a shared session allowance',()=>{
  const r=log(),row={...slot(2),roleSlotId:'row',exerciseId:'barbell-row'};
  r.append('WORKOUT_STARTED',{sessionId:'two-roles',templateId:'upper_a',
    kind:'NORMAL',slots:[slot(3),row]});
  for(const [role,exercise,n] of [['bench','barbell-bench',3],['row','barbell-row',2]]){
    for(let i=0;i<30;i++)bb2Extra(r,'two-roles',n+i,role,exercise);
  }
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.headOrdinal,61);
  assert.equal(p.history.length,0);
  bb2Extra(r,'two-roles',32,'row','barbell-row');
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /extra working set index exceeds limit/);
});
check('extra hard-effort sets do not affect ordinary on-plan rep evidence or stall',()=>{
  const r=log();r.start('base',3);r.sets('base',3);r.finish('base');
  r.start('with-extra',3);r.sets('with-extra',3);
  r.append('EXTRA_SET_RECORDED',{sessionId:'with-extra',
    roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:3,
    reps:20,actualG:50000,actualOrigin:origin(50000),
    harderThanIntended:true});
  r.finish('with-extra');
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual([p.progress['upper_a|bench|barbell-bench'].bestReps,
    p.progress['upper_a|bench|barbell-bench'].stallCount],[21,1]);
  assert.deepEqual(p.pending,{});
  assert.equal(p.history[1].validCount,3);
  assert.equal(p.history[1].sets.filter(x=>!x.prescribed).length,1);
});


check('full matching lock snapshot is legal and preserves recorded plan in History',()=>{
  const r=log(),planned=slot(3);
  r.start('lock-complete',3);
  r.append('EXERCISE_LOCKED',{sessionId:'lock-complete',
    roleSlotId:planned.roleSlotId,exerciseId:planned.exerciseId,
    equipment:planned.equipment,sets:planned.sets,ceiling:planned.ceiling,
    plannedG:planned.plannedG,plannedOrigin:planned.plannedOrigin,
    incrementG:planned.incrementG,incrementOrigin:planned.incrementOrigin});
  r.sets('lock-complete',3);r.finish('lock-complete');
  const p=foldBB2Block(opening(),r.events);
  assert.deepEqual(p.history[0].slots[0],planned);
  assert.equal(p.history[0].validCount,3);
});
check('lock cannot forge prescribed set count, ceiling, equipment or increment',()=>{
  for(const [field,value] of [
    ['equipment','bodyweight'],['sets',2],['ceiling',15],['incrementG',5000]
  ]){
    const r=log();r.start('lock-'+field,3);
    r.append('EXERCISE_LOCKED',{sessionId:'lock-'+field,
      roleSlotId:'bench',exerciseId:'barbell-bench',
      plannedG:100000,plannedOrigin:origin(100000),[field]:value});
    assert.throws(()=>foldBB2Block(opening(),r.events),
      /lock field differs from effective session plan/);
  }
});
check('bodyweight lock cannot forge variation or assistance identity',()=>{
  for(const [field,value] of [
    ['variation','weighted-chin'],['assistance','different-band']
  ]){
    const r=log();r.append('WORKOUT_STARTED',{sessionId:'bw-lock',
      templateId:'upper_a',kind:'NORMAL',slots:[bwSlot()]});
    r.append('EXERCISE_LOCKED',{sessionId:'bw-lock',roleSlotId:'vertical-pull',
      exerciseId:'chin-up',plannedG:5000,plannedOrigin:origin(5000),
      [field]:value});
    assert.throws(()=>foldBB2Block(opening(),r.events),
      /lock field differs from effective session plan/);
  }
});
check('lock cannot relabel original numeric input units or magnitude text',()=>{
  const r=log();r.start('fake-unit',3);
  r.append('EXERCISE_LOCKED',{sessionId:'fake-unit',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    plannedG:100000,plannedOrigin:{value:'100.0',unit:'kg'}});
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /lock original load metadata differs from saved plan/);
});
check('lock cannot relabel saved increment origin',()=>{
  const r=log();r.start('fake-increment',3);
  r.append('EXERCISE_LOCKED',{sessionId:'fake-increment',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    plannedG:100000,plannedOrigin:origin(100000),
    incrementG:2500,incrementOrigin:{value:'2.500',unit:'kg'}});
  assert.throws(()=>foldBB2Block(opening(),r.events),
    /lock increment origin differs from saved plan/);
});
check('lock must follow independently committed pre-lock prescription changes',()=>{
  const r=log();r.start('updated-lock',3);
  r.append('PRESCRIPTION_EDITED',{sessionId:'updated-lock',
    templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
    scope:'GLOBAL',loadG:102500,loadOrigin:origin(102500)});
  r.append('EXERCISE_LOCKED',{sessionId:'updated-lock',roleSlotId:'bench',
    exerciseId:'barbell-bench',plannedG:102500,plannedOrigin:origin(102500),
    sets:3,ceiling:8,incrementG:2500,incrementOrigin:origin(2500)});
  r.sets('updated-lock',3);
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].loadG,102500);
  r.append('PRESCRIPTION_EDITED',{sessionId:'updated-lock',
    templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
    scope:'GLOBAL',loadG:105000,loadOrigin:origin(105000)});
  assert.throws(()=>foldBB2Block(opening(),r.events),/edit after lock/);
});


const blockWithFinalPending=(kind='OFF_PLAN')=>{
  const r=log(), templates=['upper_a','lower_a','upper_b','lower_b'];
  let finalSource=null;
  for(const templateId of templates)for(let n=0;n<8;n++){
    const id=templateId+'-'+n;
    const bodyweight=kind==='DIFFICULTY' && templateId==='upper_a';
    const selected=bodyweight?bwSlot():slot(3);
    r.append('WORKOUT_STARTED',{sessionId:id,templateId,kind:'NORMAL',slots:[selected]});
    for(let i=0;i<3;i++){
      const last=templateId==='upper_a' && n===7;
      r.append('SET_RECORDED',{sessionId:id,roleSlotId:selected.roleSlotId,
        exerciseId:selected.exerciseId,setIndex:i,
        reps:bodyweight && last?8:7,
        actualG:bodyweight?5000:(last?95000:100000),
        actualOrigin:origin(bodyweight?5000:(last?95000:100000)),
        ...(bodyweight?{variation:'chin-up',assistance:'light-band'}:{}),
        prescribed:true});
    }
    r.append('WORKOUT_FINISHED',{sessionId:id});
    r.append('CREDIT_GRANTED',{sessionId:id,creditId:'credit-'+id});
    if(templateId==='upper_a'&&n===7)finalSource=id;
  }
  r.append('BLOCK_SEALED',{sealId:'original-seal'});
  const projection=foldBB2Block(opening(),r.events);
  const next=verifiedNext(r.events,'block-next');
  return {r,projection,next,finalSource};
};
const nextBlockEvent=(type,fields={})=>({
  type,eventId:'next-'+type,commitOrdinal:1,blockId:'block-next',...fields
});
check('sealed 32-credit block retains an unresolved numeric choice through next opening',()=>{
  const {projection,next,finalSource}=blockWithFinalPending();
  const key='upper_a|bench|barbell-bench';
  assert.equal(projection.sealed,true);
  assert.equal(projection.closingSnapshot.pending[key].sourceBlockId,'test-block');
  assert.equal(projection.closingSnapshot.pending[key].sourceRepSum,21);
  assert.equal(projection.closingSnapshot.pending[key].sourceAllTop,false);
  assert.deepEqual(projection.closingSnapshot.pending,next.pending);
  assert.equal(next.pending[key].sessionId,finalSource);
  const after=foldBB2Block(next,[]);
  assert.deepEqual(after.pending,next.pending);
  assert.deepEqual(after.quotas,{upper_a:0,lower_a:0,upper_b:0,lower_b:0});
  assert.equal(after.history.length,0);
  assert.equal(after.progress[key].loadG,100000);
});
check('carried pending load blocks next same-identity Start until explicitly resolved',()=>{
  const {next,finalSource}=blockWithFinalPending();
  const newStart=nextBlockEvent('WORKOUT_STARTED',{sessionId:'new-1',
    templateId:'upper_a',kind:'NORMAL',slots:[slot(3)]});
  assert.throws(()=>foldBB2Block(next,[newStart]),
    /unresolved choice blocks same exercise/);
  const resolve=nextBlockEvent('CHOICE_RESOLVED',{
    sourceBlockId:'test-block',sourceSessionId:finalSource,roleSlotId:'bench',
    exerciseId:'barbell-bench',decision:'ACCEPT',
    loadG:95000,loadOrigin:origin(95000)
  });
  const accepted=foldBB2Block(next,[resolve]);
  const key='upper_a|bench|barbell-bench';
  assert.deepEqual(accepted.pending,{});
  assert.equal(accepted.progress[key].loadG,95000);
  assert.equal(accepted.progress[key].bestReps,21);
  assert.equal(accepted.quotas.upper_a,0);
  const newPlan={...slot(3),plannedG:95000,plannedOrigin:origin(95000)};
  const started=foldBB2Block(next,[resolve,{...newStart,
    eventId:'new-workout-start',commitOrdinal:2,slots:[newPlan]}]);
  assert.equal(started.headOrdinal,2);
});
check('forged or stale carried source and retargeted weight are refused',()=>{
  const {next,finalSource}=blockWithFinalPending();
  const make=(extra={})=>nextBlockEvent('CHOICE_RESOLVED',{
    sourceBlockId:'test-block',sourceSessionId:finalSource,
    roleSlotId:'bench',exerciseId:'barbell-bench',decision:'ACCEPT',
    loadG:95000,loadOrigin:origin(95000),...extra});
  for(const altered of [
    {sourceBlockId:'other-block'},{sourceSessionId:'other-session'},
    {loadG:94000,loadOrigin:origin(94000)},
    {decision:'DIFFICULTY_ACCEPT'}
  ])assert.throws(()=>foldBB2Block(next,[make(altered)]),
    /missing or stale carried choice offer|carried acceptance differs|invalid carried numeric decision/);
  assert.throws(()=>foldBB2Block(next,[make(),{...make(),
    eventId:'repeated-choice',commitOrdinal:2}]),
    /missing or stale carried choice offer/);
});
check('carried numeric KEEP declines offer without rewriting past prescribed load',()=>{
  const {next,finalSource}=blockWithFinalPending();
  const e=nextBlockEvent('CHOICE_RESOLVED',{
    sourceBlockId:'test-block',sourceSessionId:finalSource,
    roleSlotId:'bench',exerciseId:'barbell-bench',decision:'KEEP'});
  const p=foldBB2Block(next,[e]);
  assert.deepEqual(p.pending,{});
  assert.equal(p.progress['upper_a|bench|barbell-bench'].loadG,100000);
  assert.equal(p.history.length,0);
});
check('deliberate new-block working-load edit supersedes carried offer, increment edit does not',()=>{
  const {next}=blockWithFinalPending();
  const increment=nextBlockEvent('INCREMENT_EDITED',{
    templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
    scope:'GLOBAL',incrementG:5000,incrementOrigin:origin(5000)});
  const held=foldBB2Block(next,[increment]);
  assert.ok(held.pending['upper_a|bench|barbell-bench']);
  const change={...nextBlockEvent('PRESCRIPTION_EDITED',{
    templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench',
    scope:'GLOBAL',loadG:97500,loadOrigin:origin(97500)}),
    eventId:'manual-new-baseline',commitOrdinal:2};
  const p=foldBB2Block(next,[increment,change]);
  assert.deepEqual(p.pending,{});
  assert.equal(p.progress['upper_a|bench|barbell-bench'].loadG,97500);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].incrementG,5000);
});
check('carried harder bodyweight direction requires explicit choice in next block',()=>{
  const {next,finalSource}=blockWithFinalPending('DIFFICULTY');
  const key='upper_a|vertical-pull|chin-up';
  assert.equal(next.pending[key].kind,'DIFFICULTY');
  assert.equal(next.pending[key].sourceBlockId,'test-block');
  const accepted=nextBlockEvent('CHOICE_RESOLVED',{
    sourceBlockId:'test-block',sourceSessionId:finalSource,
    roleSlotId:'vertical-pull',exerciseId:'chin-up',decision:'DIFFICULTY_ACCEPT',
    variation:'weighted-chin',assistance:'none',
    addedWeightG:7500,addedWeightOrigin:origin(7500)
  });
  const p=foldBB2Block(next,[accepted]);
  assert.deepEqual(p.pending,{});
  assert.equal(p.progress[key].variation,'weighted-chin');
  assert.equal(p.progress[key].assistance,'none');
  assert.equal(p.progress[key].loadG,7500);
  assert.equal(p.progress[key].epochId,'choice:'+accepted.eventId);
});
check('damaged carried pending opening cannot bootstrap BB2 training',()=>{
  const {next}=blockWithFinalPending();
  const key='upper_a|bench|barbell-bench';
  for(const bad of [
    {sourceBlockId:''},{sourceRepSum:'21'},{valueG:-1},
    {kind:'unknown'}
  ]){
    const openingCopy=structuredClone(next);
    Object.assign(openingCopy.pending[key],bad);
    assert.throws(()=>foldBB2Block(openingCopy,[]),
      /carried|pending|invalid/);
  }
});


check('closing snapshot cannot silently retarget offered numeric weight',()=>{
  const {projection}=blockWithFinalPending();
  const forged=structuredClone(projection);
  forged.closingSnapshot.pending['upper_a|bench|barbell-bench'].valueG=90000;
  assert.throws(()=>inspectSealedProjection(forged,'forged-next'),
    /invalid sealed pending provenance/);
});
check('closing snapshot rejects a forged offer source-block identity',()=>{
  const {projection}=blockWithFinalPending();
  const forged=structuredClone(projection);
  forged.closingSnapshot.pending['upper_a|bench|barbell-bench'].sourceBlockId='unrelated-block';
  assert.throws(()=>inspectSealedProjection(forged,'forged-next'),
    /invalid sealed pending provenance/);
});
check('closing snapshot verifies original prescribed rep evidence for carried offer',()=>{
  const {projection}=blockWithFinalPending();
  for(const field of ['sourceRepSum','sourceAllTop']){
    const forged=structuredClone(projection);
    forged.closingSnapshot.pending['upper_a|bench|barbell-bench'][field]=
      field==='sourceRepSum'?99:true;
    assert.throws(()=>inspectSealedProjection(forged,'forged-next'),
      /invalid sealed pending source evidence/);
  }
});
check('sealed all-top off-plan carry accepts exact source and earns only explicit next-block increase',()=>{
  const {r,finalSource}=blockWithFinalPending();
  for(const item of r.events)if(item.type==='SET_RECORDED' && item.sessionId===finalSource) {
    item.reps=8;
  }
  const original=foldBB2Block(opening(),r.events);
  const next=verifiedNext(r.events,'full-ceiling-next');
  const key='upper_a|bench|barbell-bench';
  assert.equal(next.pending[key].sourceRepSum,24);
  assert.equal(next.pending[key].sourceAllTop,true);
  const accept={type:'CHOICE_RESOLVED',eventId:'accept-full',
    commitOrdinal:1,blockId:'full-ceiling-next',
    sourceBlockId:'test-block',sourceSessionId:finalSource,
    roleSlotId:'bench',exerciseId:'barbell-bench',decision:'ACCEPT',
    loadG:95000,loadOrigin:origin(95000)};
  const p=foldBB2Block(next,[accept]);
  assert.equal(p.progress[key].loadG,97500);
  assert.equal(p.progress[key].epochId,'earned-choice:accept-full');
  assert.deepEqual(p.pending,{});
  assert.equal(p.history.length,0);
});
check('opening carrying bodyweight offer rejects forged difficulty source fields',()=>{
  const {projection}=blockWithFinalPending('DIFFICULTY');
  const forged=structuredClone(projection);
  const k='upper_a|vertical-pull|chin-up';
  forged.closingSnapshot.pending[k].assistance='different-band';
  assert.throws(()=>inspectSealedProjection(forged,'bad-bodyweight-next'),
    /invalid sealed pending provenance/);
});


const reversedJsonObject=x=>{
  if(Array.isArray(x))return x.map(reversedJsonObject);
  if(x&&typeof x==='object')return Object.fromEntries(
    Object.keys(x).reverse().map(k=>[k,reversedJsonObject(x[k])]));
  return x;
};
check('sealed snapshot accepts JSON object reordering without changing training state',()=>{
  const {projection}=blockWithFinalPending();
  const rekeyed=structuredClone(projection);
  rekeyed.closingSnapshot.progress=reversedJsonObject(rekeyed.closingSnapshot.progress);
  rekeyed.closingSnapshot.selections=reversedJsonObject(rekeyed.closingSnapshot.selections);
  const next=inspectSealedProjection(rekeyed,'rekeyed-next');
  assert.deepEqual(next.progress,projection.progress);
  assert.deepEqual(next.pending,projection.closingSnapshot.pending);
  assert.deepEqual(next.previousCreditIds,projection.closingSnapshot.priorCreditIds);
});
check('reordered object with one changed prescription remains an invalid closing snapshot',()=>{
  const {projection}=blockWithFinalPending();
  const tampered=structuredClone(projection);
  tampered.closingSnapshot.progress=reversedJsonObject(tampered.closingSnapshot.progress);
  tampered.closingSnapshot.progress['upper_a|bench|barbell-bench'].loadG=101000;
  assert.throws(()=>inspectSealedProjection(tampered,'tampered-next'),
    /invalid sealed block ancestry/);
});
check('reordered selections with changed exercise identity are rejected',()=>{
  const {projection}=blockWithFinalPending();
  const copied=structuredClone(projection);
  // Nonempty explicitly selected alternatives are legal in stored snapshots,
  // but equality must compare values rather than property insertion order.
  copied.selections={'upper_b|optional-press':'log-press',
    'lower_a|optional-curl':'nordic-curl'};
  copied.closingSnapshot.selections={
    'lower_a|optional-curl':'nordic-curl',
    'upper_b|optional-press':'log-press'
  };
  assert.deepEqual(inspectSealedProjection(copied,'reordered-selections').selections,
    copied.closingSnapshot.selections);
  copied.closingSnapshot.selections['upper_b|optional-press']='different-press';
  assert.throws(()=>inspectSealedProjection(copied,'invalid-selections'),
    /invalid sealed block ancestry/);
});


check('History retains immutable Start 100 and effective lock 105 after pre-lock edit',()=>{
  const r=log();r.start('snapshot',3);
  const original=structuredClone(r.events[0].slots[0]);
  r.append('PRESCRIPTION_EDITED',{sessionId:'snapshot',scope:'GLOBAL',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    loadG:105000,loadOrigin:origin(105000)});
  const source=[];
  for(let i=0;i<3;i++)source.push(r.append('SET_RECORDED',{
    sessionId:'snapshot',roleSlotId:'bench',exerciseId:'barbell-bench',
    setIndex:i,reps:7,actualG:105000,actualOrigin:origin(105000),prescribed:true}));
  r.finish('snapshot');
  const p=foldBB2Block(opening(),r.events),h=p.history[0];
  assert.deepEqual(h.initialSlots[0],original);
  assert.deepEqual([h.initialSlots[0].plannedG,h.effectiveSlots[0].plannedG,
    h.slots[0].plannedG,p.progress['upper_a|bench|barbell-bench'].loadG],
    [100000,105000,105000,105000]);
  assert.deepEqual(h.effectiveSlots[0].plannedOrigin,origin(105000));
  assert.deepEqual([h.prescribedCount,h.validCount,h.status],
    [3,3,'COMPLETED_NORMAL_NONCREDIT']);
  assert.deepEqual(r.events[0].slots[0],original);
  r.append('SET_CORRECTED',{sessionId:'snapshot',targetEventId:source[0].eventId,
    roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:0,reps:8});
  const corrected=foldBB2Block(opening(),r.events).history[0];
  assert.deepEqual(corrected.initialSlots,h.initialSlots);
  assert.deepEqual(corrected.effectiveSlots,h.effectiveSlots);
  assert.deepEqual([corrected.sets[0].reps,corrected.sets[0].actualG],[8,105000]);
  assert.deepEqual(corrected.sets[0].actualOrigin,origin(105000));
});
check('explicit exercise lock records the effective edited plan',()=>{
  const r=log();r.start('lock-snapshot',3);
  r.append('PRESCRIPTION_EDITED',{sessionId:'lock-snapshot',scope:'GLOBAL',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    loadG:105000,loadOrigin:origin(105000)});
  r.append('EXERCISE_LOCKED',{sessionId:'lock-snapshot',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    plannedG:105000,plannedOrigin:origin(105000)});
  for(let i=0;i<3;i++)r.append('SET_RECORDED',{
    sessionId:'lock-snapshot',roleSlotId:'bench',exerciseId:'barbell-bench',
    setIndex:i,reps:7,actualG:105000,actualOrigin:origin(105000),prescribed:true});
  r.finish('lock-snapshot');
  const h=foldBB2Block(opening(),r.events).history[0];
  assert.deepEqual([h.initialSlots[0].plannedG,h.effectiveSlots[0].plannedG],
    [100000,105000]);
  assert.deepEqual(h.effectiveSlots[0].plannedOrigin,origin(105000));
});
check('calibration trials never rewrite first-set lock-time plan',()=>{
  const r=log();r.start('trial-snapshot',3);
  for(let i=0;i<3;i++){
    const grams=(80+i*10)*1000;
    r.append('SET_RECORDED',{sessionId:'trial-snapshot',roleSlotId:'bench',
      exerciseId:'barbell-bench',setIndex:i,reps:7,
      actualG:grams,actualOrigin:origin(grams),prescribed:true});
    if(i<2){
      const trial=(90+i*10)*1000;
      r.append('CALIBRATION_PLAN_REVISED',{sessionId:'trial-snapshot',
        roleSlotId:'bench',exerciseId:'barbell-bench',
        plannedG:trial,plannedOrigin:origin(trial)});
    }
  }
  r.append('CALIBRATION_ACCEPTED',{sessionId:'trial-snapshot',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    loadG:100000,loadOrigin:origin(100000)});
  r.finish('trial-snapshot');
  const p=foldBB2Block(opening(),r.events),h=p.history[0];
  assert.deepEqual([h.initialSlots[0].plannedG,h.effectiveSlots[0].plannedG,
    h.slots[0].calibrationTrialG],[100000,100000,100000]);
  assert.equal(Object.hasOwn(h.effectiveSlots[0],'calibrationTrialG'),false);
  assert.deepEqual(h.sets.map(x=>x.actualG),[80000,90000,100000]);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].bestReps,null);
});

check('calibration-only trial and acceptance events reject a previously calibrated exercise',()=>{
  for(const extraType of ['CALIBRATION_PLAN_REVISED','CALIBRATION_ACCEPTED']) {
    const r=log();r.start('first',3);r.sets('first',3);r.finish('first');
    r.append('CREDIT_GRANTED',{sessionId:'first',creditId:'credit-first'});
    r.start('second',3);r.sets('second',1);
    r.append(extraType,{sessionId:'second',roleSlotId:'bench',exerciseId:'barbell-bench',
      ...(extraType==='CALIBRATION_PLAN_REVISED'
        ? {plannedG:105000,plannedOrigin:origin(105000)}
        : {loadG:105000,loadOrigin:origin(105000)})});
    assert.throws(()=>foldBB2Block(opening(),r.events),/calibration.*first exposure/i,extraType);
  }
});

check('incomplete first exposure leaves calibration available to the next eligible workout',()=>{
  const r=log();r.start('incomplete',3);r.sets('incomplete',1);
  r.append('WORKOUT_INCOMPLETE',{sessionId:'incomplete'});
  r.start('first-eligible',3);r.sets('first-eligible',1);
  r.append('CALIBRATION_PLAN_REVISED',{sessionId:'first-eligible',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    plannedG:102500,plannedOrigin:origin(102500)});
  r.append('CALIBRATION_ACCEPTED',{sessionId:'first-eligible',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    loadG:102500,loadOrigin:origin(102500)});
  r.sets('first-eligible',2,1);r.finish('first-eligible');
  const p=foldBB2Block(opening(),r.events);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].calibrated,true);
  assert.equal(p.progress['upper_a|bench|barbell-bench'].loadG,102500);
  assert.deepEqual(p.history.map(h=>h.status),['INCOMPLETE','COMPLETED_NORMAL_NONCREDIT']);
});

check('foreign template cannot enter the isolated ledger by global edit or opening progress',()=>{
  const r=log();
  r.append('PRESCRIPTION_EDITED',{templateId:'bodybuilding',roleSlotId:'bench',
    exerciseId:'barbell-bench',loadG:105000,loadOrigin:origin(105000),scope:'GLOBAL'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/invalid BB2 template/i);
  const forged=createBB2Opening({ownerId:'test-owner',blockId:'test-block',
    progress:{'bodybuilding|bench|barbell-bench':{loadG:105000,loadOrigin:origin(105000)}}});
  assert.throws(()=>foldBB2Block(forged,[]),/invalid BB2 template/i);
});
check('delimited session and exercise identities cannot alias distinct records',()=>{
  const r=log();r.start('session|other',3);
  assert.throws(()=>foldBB2Block(opening(),r.events),/invalid session/i);
  const s=log();s.start('valid',3);
  s.events[0].slots[0].roleSlotId='bench|barbell';
  assert.throws(()=>foldBB2Block(opening(),s.events),/invalid slot/i);
});

check('later correction cannot criminalise historically lawful first-exposure calibration events',()=>{
  const r=log();r.start('A',3);const original=r.sets('A',3);r.finish('A');
  r.append('CREDIT_GRANTED',{sessionId:'A',creditId:'credit-A'});
  r.append('SET_VOIDED',{sessionId:'A',targetEventId:original[0].eventId});
  r.append('CREDIT_REVOKED',{sessionId:'A',creditId:'credit-A'});
  r.start('B',3);r.sets('B',1);
  r.append('CALIBRATION_PLAN_REVISED',{sessionId:'B',roleSlotId:'bench',
    exerciseId:'barbell-bench',plannedG:102500,plannedOrigin:origin(102500)});
  r.append('CALIBRATION_ACCEPTED',{sessionId:'B',roleSlotId:'bench',
    exerciseId:'barbell-bench',loadG:102500,loadOrigin:origin(102500)});
  r.sets('B',2,1);r.finish('B');
  r.append('CREDIT_GRANTED',{sessionId:'B',creditId:'credit-B'});
  assert.equal(foldBB2Block(opening(),r.events).progress['upper_a|bench|barbell-bench'].loadG,102500);
  r.append('SET_CORRECTED',{sessionId:'A',targetEventId:original[0].eventId,
    reps:7,roleSlotId:'bench',exerciseId:'barbell-bench',setIndex:0});
  r.append('CREDIT_REGRANTED',{sessionId:'A',creditId:'credit-A-restored'});
  const projected=foldBB2Block(opening(),r.events);
  assert.equal(projected.quotas.upper_a,2);
  assert.equal(projected.history.length,2);
  assert.deepEqual(projected.history.map(h=>h.sessionId),['A','B']);
});

check('session-scoped global edits cannot impersonate a different BB2 template',()=>{
  const editFields={sessionId:'active',templateId:'lower_a',scope:'GLOBAL',
    roleSlotId:'bench',exerciseId:'barbell-bench'};
  for(const [type,value] of [
    ['PRESCRIPTION_EDITED',{loadG:105000,loadOrigin:origin(105000)}],
    ['INCREMENT_EDITED',{incrementG:1250,incrementOrigin:origin(1250)}],
    ['VARIATION_EDITED',{variation:'dumbbell-bench'}]
  ]) {
    const r=log();r.start('active',3);
    r.append(type,{...editFields,...value});
    assert.throws(()=>foldBB2Block(opening(),r.events),/session template mismatch/i,type);
  }
  const valid=log();valid.start('active',3);
  valid.append('INCREMENT_EDITED',{sessionId:'active',scope:'GLOBAL',
    roleSlotId:'bench',exerciseId:'barbell-bench',
    incrementG:1250,incrementOrigin:origin(1250)});
  const out=foldBB2Block(opening(),valid.events);
  assert.equal(out.progress['upper_a|bench|barbell-bench'].incrementG,1250);
  assert.equal(out.progress['lower_a|bench|barbell-bench'],undefined);
});
check('unlinked global edit cannot bypass the matching active exercise plan lock',()=>{
  for(const [type,fields] of [
    ['PRESCRIPTION_EDITED',{loadG:105000,loadOrigin:origin(105000)}],
    ['INCREMENT_EDITED',{incrementG:1250,incrementOrigin:origin(1250)}],
    ['VARIATION_EDITED',{variation:'dumbbell-bench'}]
  ]) {
    const r=log();r.start('active',3);
    r.append(type,{templateId:'upper_a',roleSlotId:'bench',
      exerciseId:'barbell-bench',scope:'GLOBAL',...fields});
    assert.throws(()=>foldBB2Block(opening(),r.events),
      /active session requires linked global edit/i,type);
  }
  // A future edit for another, currently inactive template is independent.
  const other=log();other.start('active',3);
  other.append('PRESCRIPTION_EDITED',{templateId:'lower_a',roleSlotId:'bench',
    exerciseId:'barbell-bench',scope:'GLOBAL',loadG:105000,loadOrigin:origin(105000)});
  const valid=foldBB2Block(opening(),other.events);
  assert.equal(valid.progress['lower_a|bench|barbell-bench'].loadG,105000);
  assert.equal(valid.history.length,0);
});
check('opening exercise selections reject foreign, ambiguous or empty identities',()=>{
  for(const selections of [
    {'bodybuilding|bench':'barbell-bench'},
    {'upper_a|bench|extra':'barbell-bench'},
    {'upper_a|bench':''}
  ]) {
    const b=opening();b.selections=selections;
    assert.throws(()=>foldBB2Block(b,[]),/invalid opening selection/i);
  }
  const valid=opening();valid.selections={'upper_a|bench':'barbell-bench'};
  assert.deepEqual(foldBB2Block(valid,[]).selections,valid.selections);
});
check('current-block choice events cannot forge their source block lineage',()=>{
  const r=acceptedOffPlanJournal();
  const withSource=structuredClone(r.events);
  withSource.find(e=>e.eventId===r.choice.eventId).sourceBlockId='test-block';
  assert.deepEqual(foldBB2Block(opening(),withSource).requiredConsent,[]);
  const forged=structuredClone(withSource);
  forged.find(e=>e.eventId===r.choice.eventId).sourceBlockId='unrelated-block';
  assert.throws(()=>foldBB2Block(opening(),forged),/choice source block mismatch/i);
  const replacement=acceptedOffPlanJournal();
  linkedReplace(replacement,replacement.choice,{sourceBlockId:'unrelated-block'});
  assert.throws(()=>foldBB2Block(opening(),replacement.events),/choice source block mismatch/i);
});
check('reselecting an unchanged exercise is a true no-op, not a new audit boundary',()=>{
  const r=log();
  r.append('EXERCISE_SWAPPED',{templateId:'upper_a',roleSlotId:'bench',
    exerciseId:'dumbbell-bench'});
  assert.equal(foldBB2Block(opening(),r.events).selections['upper_a|bench'],'dumbbell-bench');
  r.append('EXERCISE_SWAPPED',{templateId:'upper_a',roleSlotId:'bench',
    exerciseId:'dumbbell-bench'});
  assert.throws(()=>foldBB2Block(opening(),r.events),/no-op exercise swap/i);
});
check('KEEP-as-manual and REPLACE cannot pre-authorise a future source correction',()=>{
  for(const type of ['CHOICE_RECLASSIFIED','CHOICE_REPLACED']) {
    const r=acceptedOffPlanJournal();
    if(type==='CHOICE_RECLASSIFIED') {
      r.append(type,{targetEventId:r.choice.eventId,decision:'KEEP_AS_MANUAL'});
    } else linkedReplace(r,r.choice);
    assert.throws(()=>foldBB2Block(opening(),r.events),/correction-time consent not required/i,type);
    // A future correction cannot make the earlier forged consent legitimate.
    voidSet(r,'A',r.a[0]);
    voidSet(r,'B',r.b[0]);
    assert.throws(()=>foldBB2Block(opening(),r.events),/correction-time consent not required/i,
      type+' before later invalidation');
  }
});

console.log('BB2-HARDEN '+passes+' PASS / '+failures+' FAIL');
if(failures) process.exit(1);
