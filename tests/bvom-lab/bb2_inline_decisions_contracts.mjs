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
 function begin(day,{legacy=old,load=10000,inc=1000,recovery=false,inline=false}={}){
  const prep=legacy?{policy:null,projection:fold(),events}:S.prepareBB2SharedProgression(opening,events,setup,{sealedBlocks,priorSealedBlock:sealedBlocks.at(-1)});
  const slots=core.getBB2TemplatePrescription(setup,day).slots.map(slot=>{
   const key=`${day}|${slot.roleSlotId}|${slot.exerciseId}`,p=legacy?prep.projection.progress[key]:L.sharedProgressFor(prep.projection,key,slot).progress;
   return {...Object.fromEntries(['roleSlotId','exerciseId','sets','floor','ceiling','equipment'].map(k=>[k,slot[k]])),
    ...(slot.equipment==='loaded'?{plannedG:p?.loadG??load,plannedOrigin:p?.loadOrigin??origin(load),incrementG:p?.incrementG??inc,incrementOrigin:p?.incrementOrigin??origin(inc)}:
      {variation:p?.variation??slot.exerciseId,assistance:p?.assistance??'none',...(p?.loadG!=null?{plannedG:p.loadG,plannedOrigin:p.loadOrigin}:{}),...(p?{incrementG:p.incrementG,incrementOrigin:p.incrementOrigin}:{})})};
  });
  const start={type:'WORKOUT_STARTED',eventId:'start-'+(++id),commitOrdinal:prep.events.length+1,blockId:opening.blockId,sessionId:'session-'+id,templateId:day,kind:recovery?'RECOVERY':'NORMAL',slots,...(!legacy?{progressionPolicy:1}:{}),...(inline?{inlineDecisions:1}:{})};
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

for(const decision of ['HOLD','DIFFICULTY_ACCEPT']){
 const j=journal({version:1});for(const day of ['lower_a','lower_b'])j.setup=C.chooseBB2Exercise(j.setup,day,'calf_raise','bodyweight_calf_raise');
 const a=j.begin('lower_a');j.finish(a,{bodyTop:true});const original=copy(j.events);
 assert.throws(()=>j.begin('lower_b'),/unresolved choice/,'legacy Start remains fail-closed');
 const b=j.begin('lower_b',{inline:true});const slot=b.slots.find(s=>s.roleSlotId==='calf_raise');
 const set={sessionId:b.sessionId,roleSlotId:slot.roleSlotId,exerciseId:slot.exerciseId,setIndex:0,reps:slot.floor,prescribed:true,variation:slot.variation,assistance:slot.assistance};
 j.add('SET_RECORDED',set);assert.throws(()=>j.fold(),/resolve inline/);j.events=j.events.slice(0,-1);
 j.add('EXERCISE_LOCKED',{sessionId:b.sessionId,roleSlotId:slot.roleSlotId,exerciseId:slot.exerciseId});assert.throws(()=>j.fold(),/resolve inline/);j.events=j.events.slice(0,-1);
 j.add('EXERCISE_READY',{sessionId:b.sessionId,roleSlotId:slot.roleSlotId,exerciseId:slot.exerciseId,choiceEventId:'forged'});assert.throws(()=>j.fold(),/matching explicit/);j.events=j.events.slice(0,-1);
 const pBefore=copy(j.fold().progress),choice=j.add('CHOICE_RESOLVED',{sourceSessionId:a.sessionId,sourceBlockId:j.opening.blockId,roleSlotId:'calf_raise',exerciseId:'bodyweight_calf_raise',decision,...(decision==='DIFFICULTY_ACCEPT'?{variation:'slower tempo',assistance:'light band',addedWeightG:1000,addedWeightOrigin:origin(1000)}:{})});
 j.add('SET_RECORDED',set);assert.throws(()=>j.fold(),/resolve inline/,'a choice alone cannot unlock a stale session plan');j.events=j.events.slice(0,-1);
 j.add('EXERCISE_READY',{sessionId:b.sessionId,roleSlotId:slot.roleSlotId,exerciseId:slot.exerciseId,choiceEventId:choice.eventId});j.fold();
 const current=decision==='DIFFICULTY_ACCEPT'?{...set,variation:'slower tempo',assistance:'light band',actualG:1000,actualOrigin:origin(1000)}:set;
 const ready=j.events.at(-1);j.add('EXERCISE_READY',{sessionId:b.sessionId,roleSlotId:slot.roleSlotId,exerciseId:slot.exerciseId,choiceEventId:choice.eventId});assert.throws(()=>j.fold(),/duplicate/);j.events=j.events.slice(0,-1);
 j.add('SET_RECORDED',current);assert.doesNotThrow(()=>j.fold());
 const latest=j.fold();assert.equal(latest.quotas.lower_b,0,'decision and readiness never grant credit');assert.deepEqual(j.events.slice(0,original.length),original);
 assert.deepEqual(copy(core.foldBB2Block(copy(j.opening),copy(j.events))),copy(latest),'reload/replay identical');
 const discarded=L.discardBB2Session(j.events,b.sessionId);const d=core.foldBB2Block(j.opening,discarded);assert.equal(d.quotas.lower_b,0);assert.equal(Object.keys(d.pending).length,0,'explicit global choice survives discarded session');
 if(decision==='HOLD')assert.deepEqual(d.progress['lower_a|calf_raise|bodyweight_calf_raise'],pBefore['lower_a|calf_raise|bodyweight_calf_raise']);
 if(decision==='DIFFICULTY_ACCEPT'){
  j.events=core.planBB2Finish(j.opening,j.events,b.sessionId,'INCOMPLETE').events;
  const source=j.events.find(e=>e.type==='SET_RECORDED'&&e.sessionId===a.sessionId&&e.roleSlotId==='calf_raise');
  j.add('SET_CORRECTED',{sessionId:a.sessionId,targetEventId:source.eventId,roleSlotId:source.roleSlotId,exerciseId:source.exerciseId,setIndex:source.setIndex,reps:slot.floor});
  const corrected=j.fold();assert.equal(corrected.requiredConsent.length,1,'historical choice invalidation retains existing correction consent');assert.equal(corrected.history.at(-1).sets[0].actualG,1000,'later recorded chosen plan is unchanged');
 }
 console.log('PASS inline '+decision+': pending/choice-only record block, explicit readiness, exact replay, no credit, choice survives discard');
}

if(process.argv.includes('--seal')){
 const {validateBB2PortableCatalogue}=await import('../../bb2/cloud-coordinator.mjs');
 const j=journal({version:1});for(const day of ['lower_a','lower_b'])j.setup=C.chooseBB2Exercise(j.setup,day,'calf_raise','bodyweight_calf_raise');
 let last;for(let n=0;n<8;n++)for(const day of ['upper_a','lower_a','upper_b','lower_b']){last=j.begin(day);j.finish(last,{bodyTop:n===7&&day==='lower_b'});}
 j.add('BLOCK_SEALED',{sealId:'inline-seam'});const prior={opening:copy(j.opening),events:copy(j.events)};
 j.opening=L.createNextBB2Opening(prior.opening,prior.events,'inline-carried');j.sealedBlocks=[prior];j.events=[];
 const start=j.begin('lower_a',{inline:true}),slot=start.slots.find(s=>s.roleSlotId==='calf_raise');
 const choice=j.add('CHOICE_RESOLVED',{sourceSessionId:last.sessionId,sourceBlockId:prior.opening.blockId,roleSlotId:'calf_raise',exerciseId:'bodyweight_calf_raise',decision:'DIFFICULTY_ACCEPT',variation:'slower tempo',assistance:'none'});
 j.add('EXERCISE_READY',{sessionId:start.sessionId,roleSlotId:slot.roleSlotId,exerciseId:slot.exerciseId,choiceEventId:choice.eventId});
 j.add('SET_RECORDED',{sessionId:start.sessionId,roleSlotId:slot.roleSlotId,exerciseId:slot.exerciseId,setIndex:0,reps:slot.floor,prescribed:true,variation:'slower tempo',assistance:'none'});
 assert.deepEqual(Object.values(j.fold().quotas),[0,0,0,0]);
 // Portable completed journal proves carried choice and derived Start provenance.
 j.events=core.planBB2Finish(j.opening,j.events,start.sessionId,'INCOMPLETE').events;
 validateBB2PortableCatalogue(j.setup,j.events,{opening:j.opening,priorSealedBlock:prior,sealedBlocks:[prior]});
 assert.deepEqual(Object.values(core.foldBB2Block(prior.opening,prior.events).quotas),[8,8,8,8]);
 console.log('PASS bounded 32-credit boundary: pending shared BW choice carries, resolves inline in next block, no extra credit and portable validation');
}
