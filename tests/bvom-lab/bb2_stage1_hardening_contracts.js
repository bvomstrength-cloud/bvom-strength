// BB2 Stage (i) — additional fail-closed gates, independent of shipped app.
// Intended to be run against an isolated ledger.cjs, not BB1 runtime.
'use strict';
const assert = require('node:assert/strict');
const { createBB2Opening, foldBB2Block, planBB2Finish, commitBB2Transaction,
  createNextBB2Opening, discardBB2Session } = require('../../bb2/ledger.cjs');
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
    {ownerId:'test-owner',expectedHead:r.events.length,
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
    {ownerId:'test-owner',expectedHead:r.events.length,
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
    {type:'STALL_OFFER_DISMISSED',templateId:'upper_a',roleSlotId:'bench',exerciseId:'barbell-bench'}
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
check('next block preserves all 32 credits and sealed provenance with fresh identity',()=>{
  const p=foldBB2Block(opening(),sealedFixture().events);
  const next=createNextBB2Opening(p,'block-next');
  assert.equal(next.previousSealId,'seal-one');
  assert.equal(next.previousBlockId,'test-block');
  assert.deepEqual([next.previousSchemaVersion,next.previousFoldRulesVersion,
    next.previousOpeningSnapshotVersion],[1,1,1]);
  assert.equal(next.sealRevision,1);
  assert.equal(next.previousCreditIds.length,32);
  assert.deepEqual(foldBB2Block(next,[]).quotas,
    {upper_a:0,lower_a:0,upper_b:0,lower_b:0});
  assert.throws(()=>createNextBB2Opening(p,'test-block'),/fresh ID/);
});
check('damaged sealed ancestry or restored next-opening credit lineage rejects cleanly',()=>{
  const p=foldBB2Block(opening(),sealedFixture().events);
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
    assert.throws(()=>createNextBB2Opening(bad,'block-next'),/invalid sealed block ancestry/);
  }
  const next=createNextBB2Opening(p,'block-next');
  const corrupt=structuredClone(next);corrupt.previousCreditIds.pop();
  assert.throws(()=>foldBB2Block(corrupt,[]),/invalid prior credit IDs/);
  const reused=structuredClone(next);reused.previousBlockId='block-next';
  assert.throws(()=>foldBB2Block(reused,[]),/fresh ID/);
  const unsupported=structuredClone(next);unsupported.previousFoldRulesVersion=999;
  assert.throws(()=>foldBB2Block(unsupported,[]),/invalid prior snapshot version/);
});

console.log('BB2-HARDEN '+passes+' PASS / '+failures+' FAIL');
if(failures) process.exit(1);