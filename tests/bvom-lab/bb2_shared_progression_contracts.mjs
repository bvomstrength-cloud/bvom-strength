import assert from 'node:assert/strict';
import * as core from '../../bb2/browser-core.mjs';
const L=core.BB2_BROWSER_MODULES.ledger,S=core.BB2_BROWSER_MODULES.start,C=core.BB2_BROWSER_MODULES.catalogue;
const copy=x=>JSON.parse(JSON.stringify(x)),origin=n=>({value:String(n/1000),unit:'kg'});
function journal({version=5,old=false}={}){
 let setup=core.createBB2Setup({catalogueVersion:version,...(version>=3?{optionalUpperACurls:true}:{}),optionalUpperBCurls:true});
 let sealedBlocks=[];let opening=core.createBB2Opening({ownerId:'11111111-1111-4111-8111-111111111111',blockId:'sharing-block'}),events=[],id=0;
 const fold=()=>core.foldBB2Block(opening,events);
 const guard=()=>({ownerId:opening.ownerId,blockId:opening.blockId,expectedHead:events.length,foldRulesVersion:opening.foldRulesVersion,sealRevision:fold().sealRevision,activeWorkout:false});
 const add=(type,fields={})=>{const e={type,eventId:'event-'+(++id),commitOrdinal:events.length+1,blockId:opening.blockId,...fields};events.push(e);return e};
 function begin(day,{legacy=old,load=10000,inc=1000,recovery=false}={}){
  const prep=legacy?{policy:null,projection:fold(),events}:S.prepareBB2SharedProgression(opening,events,setup,{sealedBlocks,priorSealedBlock:sealedBlocks.at(-1)});
  const slots=core.getBB2TemplatePrescription(setup,day).slots.map(slot=>{
   const key=`${day}|${slot.roleSlotId}|${slot.exerciseId}`,p=legacy?prep.projection.progress[key]:L.sharedProgressFor(prep.projection,key,slot).progress;
   return {...Object.fromEntries(['roleSlotId','exerciseId','sets','floor','ceiling','equipment'].map(k=>[k,slot[k]])),
    ...(slot.equipment==='loaded'?{plannedG:p?.loadG??load,plannedOrigin:p?.loadOrigin??origin(load),incrementG:p?.incrementG??inc,incrementOrigin:p?.incrementOrigin??origin(inc)}:
      {variation:p?.variation??slot.exerciseId,assistance:p?.assistance??'none',...(p?.loadG!=null?{plannedG:p.loadG,plannedOrigin:p.loadOrigin}:{}),...(p?{incrementG:p.incrementG,incrementOrigin:p.incrementOrigin}:{})})};
  });
  const start={type:'WORKOUT_STARTED',eventId:'start-'+(++id),commitOrdinal:prep.events.length+1,blockId:opening.blockId,sessionId:'session-'+id,templateId:day,kind:recovery?'RECOVERY':'NORMAL',slots,...(!legacy?{progressionPolicy:1}:{})};
  if(recovery){const tx=L.commitBB2Transaction(opening,events,prep.policy?[prep.policy,start]:[start],guard());events=tx.events;}
  else events=S.commitBB2Start(opening,events,setup,start,guard(),{sharingPolicy:prep.policy,sealedBlocks,priorSealedBlock:sealedBlocks.at(-1)}).events;
  return start;
 }
 function finish(start,{top=true,bodyTop=false,hard=false,incomplete=false,extra=false}={}){
  for(const slot of start.slots)for(let n=0;n<slot.sets;n++)add('SET_RECORDED',{sessionId:start.sessionId,roleSlotId:slot.roleSlotId,exerciseId:slot.exerciseId,setIndex:n,reps:(slot.equipment==='loaded'&&top)||(bodyTop&&slot.roleSlotId==='calf_raise')?slot.ceiling:slot.floor,prescribed:true,harderThanIntended:hard,...(slot.plannedG!==undefined?{actualG:slot.plannedG,actualOrigin:slot.plannedOrigin}:{}),...(slot.equipment==='bodyweight'?{variation:slot.variation,assistance:slot.assistance}:{})});
  if(extra){const slot=start.slots.at(-1);add('EXTRA_SET_RECORDED',{sessionId:start.sessionId,roleSlotId:slot.roleSlotId,exerciseId:slot.exerciseId,setIndex:slot.sets,reps:99,prescribed:false,actualG:slot.plannedG,actualOrigin:slot.plannedOrigin});}
  events=core.planBB2Finish(opening,events,start.sessionId,incomplete?'INCOMPLETE':'FINISH',{knownWorkingWeights:true}).events;
  return fold();
 }
 return {get setup(){return setup},set setup(x){setup=x},fold,begin,finish,add,get opening(){return opening},set opening(x){opening=x},get sealedBlocks(){return sealedBlocks},set sealedBlocks(x){sealedBlocks=x},get events(){return events},set events(x){events=x}};
}
const curl=day=>`${day}|biceps_curl|dumbbell_curl`;
{
 const j=journal();let a=j.begin('upper_a');j.finish(a);assert.equal(j.fold().progress[curl('upper_a')].loadG,11000);
 let b=j.begin('upper_b');assert.equal(b.slots.at(-1).plannedG,11000,'Upper B inherits Upper A curl prescription');j.finish(b,{extra:true});assert.equal(j.fold().progress[curl('upper_a')].loadG,12000);assert.equal(j.fold().progress[curl('upper_b')].loadG,12000);
 a=j.begin('upper_a');assert.equal(a.slots.at(-1).plannedG,12000);j.finish(a,{hard:true});assert.equal(j.fold().progress[curl('upper_b')].loadG,12000,'hard work cannot advance the shared track');
 b=j.begin('upper_b');j.finish(b,{top:false});assert.equal(j.fold().progress[curl('upper_a')].loadG,12000,'below-ceiling exposure holds both days');
 const snapshot=copy(j.events),history=copy(j.fold().history),credits=copy(j.fold().quotas);assert.deepEqual(copy(core.foldBB2Block(copy(j.opening),copy(snapshot)).history),history);assert.deepEqual(j.fold().quotas,credits);
 assert.equal(core.planBB2Finish(j.opening,j.events,b.sessionId,'FINISH').noOp,true,'repeat Finish does not double advance');
 console.log('PASS cross-day 10 -> 11 -> 12, hard/low-rep holds, extra-set exclusion, replay/reload and idempotence');
}
{
 const j=journal({old:true});j.finish(j.begin('upper_a',{load:20000}),{top:true});j.finish(j.begin('upper_b',{load:10000}),{top:true});
 const old=copy(j.events),oldHistory=copy(j.fold().history),s=j.begin('upper_a',{legacy:false});assert.equal(s.slots.at(-1).plannedG,11000,'latest compatible legacy prescription wins, not largest or summed gains');assert.deepEqual(j.events.slice(0,old.length),old);assert.deepEqual(copy(j.fold().history),oldHistory,'activation never rewrites historical workout plans');j.finish(s);assert.equal(j.fold().progress[curl('upper_b')].loadG,12000);
 console.log('PASS deterministic legacy migration preserves original journal/history and never sums prior independent advances');
}
{
 const j=journal({old:true});j.finish(j.begin('upper_a',{load:10000,inc:1000}));j.finish(j.begin('upper_b',{load:20000,inc:2000}));const a=j.begin('upper_a',{legacy:false});assert.equal(a.slots.at(-1).plannedG,11000);j.finish(a);const b=j.begin('upper_b',{legacy:false});assert.equal(b.slots.at(-1).plannedG,22000,'different increments stay independent');j.finish(b);
 console.log('PASS incompatible increment settings remain independent');
}
{
 const j=journal({old:true});j.finish(j.begin('upper_a'));j.add('INCREMENT_EDITED',{templateId:'upper_b',roleSlotId:'biceps_curl',exerciseId:'dumbbell_curl',scope:'GLOBAL',incrementG:1000,incrementOrigin:origin(1000)});
 const a=j.begin('upper_a',{legacy:false});assert.equal(a.slots.at(-1).plannedG,11000,'later increment-only preference cannot erase an established working load');j.finish(a);
 const b=j.begin('upper_b',{legacy:false});assert.equal(b.slots.at(-1).plannedG,12000,'matching increment-only preference inherits the established shared load');
 console.log('PASS unconfigured load preferences cannot replace a working progression track');
}
{
 const j=journal();j.finish(j.begin('lower_a'));const b=j.begin('lower_b');assert.equal(b.slots.find(s=>s.roleSlotId==='calf_raise').plannedG,11000);j.finish(b);assert.equal(j.fold().progress['lower_a|calf_raise|standing_calf_raise'].loadG,12000);
 console.log('PASS standing calf progression shares across lower days, independently of optional curls');
}
{
 const j=journal();j.finish(j.begin('upper_a'));const b=j.begin('upper_b');j.add('INCREMENT_EDITED',{sessionId:b.sessionId,templateId:'upper_b',roleSlotId:'biceps_curl',exerciseId:'dumbbell_curl',scope:'GLOBAL',incrementG:2000,incrementOrigin:origin(2000)});j.finish(b);assert.equal(j.fold().progress[curl('upper_b')].loadG,13000);assert.equal(j.fold().progress[curl('upper_a')].loadG,11000,'an explicit incompatible increment forks the track');
 const a=j.begin('upper_a');assert.equal(a.slots.at(-1).plannedG,11000);j.finish(a,{incomplete:true});assert.equal(j.fold().progress[curl('upper_b')].loadG,13000);assert.equal(j.fold().progress[curl('upper_a')].loadG,11000,'incomplete work never advances a shared or forked track');
 console.log('PASS explicit increment split, interrupted/incomplete session and unrelated track preservation');
}
{
 const j=journal();j.finish(j.begin('upper_a'));
 j.setup=C.chooseBB2Exercise(j.setup,'upper_b','biceps_curl','barbell_curl');j.add('EXERCISE_SWAPPED',{templateId:'upper_b',roleSlotId:'biceps_curl',exerciseId:'barbell_curl'});j.finish(j.begin('upper_b',{load:20000}));
 j.setup=C.chooseBB2Exercise(j.setup,'upper_b','biceps_curl','dumbbell_curl');j.add('EXERCISE_SWAPPED',{templateId:'upper_b',roleSlotId:'biceps_curl',exerciseId:'dumbbell_curl'});const b=j.begin('upper_b');assert.equal(b.slots.at(-1).plannedG,11000);j.finish(b);assert.equal(j.fold().progress['upper_b|biceps_curl|barbell_curl'].loadG,21000);assert.equal(j.fold().progress[curl('upper_a')].loadG,12000);
 console.log('PASS exercise swap away/back retains inactive variant and returns to the latest compatible shared track');
}
{
 const j=journal();const a=j.begin('upper_a');j.finish(a);const b=j.begin('upper_b');j.finish(b);const original=j.events.find(e=>e.type==='SET_RECORDED'&&e.sessionId===a.sessionId&&e.roleSlotId==='biceps_curl');
 j.add('SET_CORRECTED',{sessionId:a.sessionId,targetEventId:original.eventId,roleSlotId:original.roleSlotId,exerciseId:original.exerciseId,setIndex:original.setIndex,reps:10});
 const p=j.fold();assert.equal(p.progress[curl('upper_a')].loadG,12000,'later legitimate cross-day exposure is retained after an earlier correction');assert.equal(p.quotas.upper_a,1);assert.equal(p.quotas.upper_b,1);assert.equal(p.history[1].sets.find(s=>s.roleSlotId==='biceps_curl').actualG,11000);
 console.log('PASS cross-day retrospective correction preserves later actual weights, deterministic replay and original credits');
}
{
 const j=journal();const a=j.begin('upper_a');j.finish(a);const b=j.begin('upper_b');
 j.add('PRESCRIPTION_EDITED',{templateId:'upper_a',roleSlotId:'biceps_curl',exerciseId:'dumbbell_curl',scope:'GLOBAL',loadG:20000,loadOrigin:origin(20000)});assert.throws(()=>j.fold(),/shared edit requires active session linkage/);j.events=j.events.slice(0,-1);j.finish(b);
 assert.ok(j.events.every((e,i)=>e.commitOrdinal===i+1));
 console.log('PASS cross-day global edit cannot bypass the active workout/session lock');
}
{
 const j=journal({version:1});j.setup=C.chooseBB2Exercise(j.setup,'lower_a','calf_raise','bodyweight_calf_raise');j.setup=C.chooseBB2Exercise(j.setup,'lower_b','calf_raise','bodyweight_calf_raise');
 const a=j.begin('lower_a');j.finish(a,{bodyTop:true});assert.equal(Object.keys(j.fold().pending).length,1);assert.throws(()=>j.begin('lower_b'),/unresolved choice/,'a pending shared bodyweight choice blocks the other day');
 j.add('CHOICE_RESOLVED',{sourceSessionId:a.sessionId,sourceBlockId:j.opening.blockId,roleSlotId:'calf_raise',exerciseId:'bodyweight_calf_raise',decision:'DIFFICULTY_ACCEPT',variation:'slower tempo',assistance:'none',addedWeightG:1000,addedWeightOrigin:origin(1000)});
 const b=j.begin('lower_b');const calf=b.slots.find(s=>s.roleSlotId==='calf_raise');assert.equal(calf.variation,'slower tempo');assert.equal(calf.plannedG,1000);j.finish(b);assert.equal(Object.keys(j.fold().pending).length,0);
 console.log('PASS shared qualitative/assisted progression requires one explicit decision and preserves chosen added weight on the other day');
}
{
 const opening=core.createBB2Opening({ownerId:'same-workout',blockId:'duplicate-session'}),d={exerciseId:'dumbbell_curl',sets:2,floor:10,ceiling:15,equipment:'loaded'},descriptors=['first_curl','second_curl'].map(roleSlotId=>({templateId:'upper_a',roleSlotId,...d}));
 const events=[],add=(type,fields)=>events.push({type,eventId:'double-'+events.length,commitOrdinal:events.length+1,blockId:opening.blockId,...fields});
 add('PROGRESSION_SHARED',{version:1,catalogueVersion:5,prescriptions:descriptors,openingOrder:[]});add('WORKOUT_STARTED',{sessionId:'one-session',templateId:'upper_a',kind:'NORMAL',progressionPolicy:1,slots:descriptors.map(({templateId,...s})=>({...s,plannedG:10000,plannedOrigin:origin(10000),incrementG:1000,incrementOrigin:origin(1000)}))});
 for(const d of descriptors)for(let i=0;i<2;i++)add('SET_RECORDED',{sessionId:'one-session',roleSlotId:d.roleSlotId,exerciseId:d.exerciseId,setIndex:i,reps:15,prescribed:true,actualG:10000,actualOrigin:origin(10000)});
 const done=core.planBB2Finish(opening,events,'one-session','FINISH',{knownWorkingWeights:true});const p=done.projection;assert.equal(p.progress['upper_a|first_curl|dumbbell_curl'].loadG,11000,'two compatible slots in one Finish can earn only one increment');
 console.log('PASS duplicate same-workout references cannot cause double advancement');
}
{
 const {validateBB2PortableCatalogue}=await import('../../bb2/cloud-coordinator.mjs');
 const {createBB2CloudSidecar}=await import('../../bb2/cloud-sidecar.mjs');
 const j=journal();j.finish(j.begin('upper_a'));validateBB2PortableCatalogue(j.setup,j.events,{opening:j.opening});
 const bad=copy(j.events);bad[0].prescriptions.find(d=>d.templateId==='upper_a'&&d.exerciseId==='dumbbell_curl').ceiling=14;
 assert.throws(()=>validateBB2PortableCatalogue(j.setup,bad,{opening:j.opening}),/shared progression migration differs/);
 assert.throws(()=>createBB2CloudSidecar({ownerId:j.opening.ownerId,bb2:{setup:j.setup,opening:j.opening,events:bad,sealedBlocks:[]},previousRevision:null,requestId:'forged-policy'}),/shared progression migration differs/);
 const unmarked=copy(j.events);delete unmarked.find(e=>e.type==='WORKOUT_STARTED').progressionPolicy;assert.throws(()=>core.foldBB2Block(j.opening,unmarked),/shared progression policy required/);
 const wrongLoad=copy(j.events);wrongLoad.find(e=>e.type==='WORKOUT_STARTED').slots[0].plannedOrigin={value:'999',unit:'kg'};assert.throws(()=>validateBB2PortableCatalogue(j.setup,wrongLoad,{opening:j.opening}),/origin|load/);
 console.log('PASS portable restore/cloud reject forged compatibility registries, unmarked Starts and forged load provenance');
}
{
 const j=journal();const registry=S.buildBB2SharedPolicy(j.opening,[],j.setup).prescriptions;
 const rowA=registry.find(d=>d.templateId==='upper_a'&&d.exerciseId==='chest_supported_row'),rowB=registry.find(d=>d.templateId==='upper_b'&&d.exerciseId==='chest_supported_row');assert.notEqual(L.sharedRecipe(rowA),L.sharedRecipe(rowB),'three-set and two-set progression gates are incompatible');
 const frontA=registry.find(d=>d.templateId==='lower_a'&&d.exerciseId==='front_squat'),frontB=registry.find(d=>d.templateId==='lower_b'&&d.exerciseId==='front_squat');assert.notEqual(L.sharedRecipe(frontA),L.sharedRecipe(frontB),'different rep ranges remain independent');
 for(const version of [1,2,3,4,5]){const q=journal({version}),policy=S.buildBB2SharedPolicy(q.opening,[],q.setup),ids=[...new Set(policy.prescriptions.map(d=>d.exerciseId))];const duplicates=ids.filter(id=>policy.prescriptions.filter(d=>d.exerciseId===id).length>1);assert.ok(duplicates.length>=8);console.log('AUDIT catalogue v'+version+': '+duplicates.join(', '));}
 console.log('PASS all duplicated exercise options audited across catalogues v1–v5');
}

if(process.argv.includes('--seal')){
 const {validateBB2PortableCatalogue}=await import('../../bb2/cloud-coordinator.mjs');
 const j=journal();for(let n=0;n<8;n++)for(const day of ['upper_a','lower_a','upper_b','lower_b'])j.finish(j.begin(day));
 assert.deepEqual(Object.values(j.fold().quotas),[8,8,8,8]);assert.equal(j.fold().progress[curl('upper_a')].loadG,26000);
 j.add('BLOCK_SEALED',{sealId:'shared-seal'});const old={opening:copy(j.opening),events:copy(j.events)},closing=copy(j.fold().closingSnapshot);
 validateBB2PortableCatalogue(j.setup,j.events,{opening:j.opening});
 const next=L.createNextBB2Opening(j.opening,j.events,'next-shared-block');assert.deepEqual(next.sharedProgression,closing.sharedProgression);j.sealedBlocks=[old];j.opening=next;j.events=[];
 const nextA=j.begin('upper_a');assert.equal(nextA.slots.at(-1).plannedG,26000);j.finish(nextA);const nextB=j.begin('upper_b');assert.equal(nextB.slots.at(-1).plannedG,27000);j.finish(nextB);
 validateBB2PortableCatalogue(j.setup,j.events,{opening:j.opening,priorSealedBlock:old,sealedBlocks:[old]});assert.deepEqual(Object.values(j.fold().quotas),[1,0,1,0]);assert.deepEqual(old.events,j.sealedBlocks[0].events);
 console.log('PASS bounded 32-credit seal/carry fixture, shared source provenance across blocks and portable restore validation (no 220-session endurance run)');
}
