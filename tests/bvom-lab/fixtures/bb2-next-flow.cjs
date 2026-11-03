'use strict';
module.exports=async function nextFlow(){
 const c=await import('../../../bb2/browser-core.mjs'),L=c.BB2_BROWSER_MODULES.ledger,C=c.BB2_BROWSER_MODULES.catalogue;
 const data=JSON.parse(JSON.stringify(require('./bb2-android-history-shape.json').data));
 let setup=C.chooseBB2Exercise(c.createBB2Setup(),'lower_b','abdominal','hanging_knee_raise');
 const opening=c.createBB2Opening({ownerId:data.bb2.opening.ownerId,blockId:'next-flow'});let events=[],id=0;
 const origin=n=>({value:String(n/1000),unit:'kg'});
 for(const day of C.TEMPLATE_ORDER){
  const prep=c.BB2_BROWSER_MODULES.start.prepareBB2SharedProgression(opening,events,setup);events=prep.events;
  const slots=c.getBB2TemplatePrescription(setup,day).slots.map(s=>{const key=day+'|'+s.roleSlotId+'|'+s.exerciseId,p=L.sharedProgressFor(prep.projection,key,s).progress;
   return {roleSlotId:s.roleSlotId,exerciseId:s.exerciseId,sets:s.sets,floor:s.floor,ceiling:s.ceiling,equipment:s.equipment,...(s.equipment==='bodyweight'?{variation:p?.variation||s.exerciseId,assistance:p?.assistance||'light band',actualBodyweightKg:80}:{plannedG:p?.loadG??60000,plannedOrigin:p?.loadOrigin??origin(60000),incrementG:p?.incrementG??2500,incrementOrigin:p?.incrementOrigin??origin(2500)})};});
  const sessionId='seed-'+day,add=(type,fields)=>events.push({type,eventId:'flow-'+(++id),blockId:opening.blockId,commitOrdinal:events.length+1,...fields});
  add('WORKOUT_STARTED',{sessionId,templateId:day,kind:'NORMAL',inlineDecisions:1,progressionPolicy:1,slots,startedAt:Date.parse('2026-11-03T09:00:00Z')+id*100000});
  for(const s of slots)for(let j=0;j<s.sets;j++)add('SET_RECORDED',{sessionId,roleSlotId:s.roleSlotId,exerciseId:s.exerciseId,setIndex:j,reps:s.ceiling,prescribed:true,...(s.equipment==='bodyweight'?{variation:s.variation,assistance:s.assistance,actualBodyweightKg:80}:{actualG:s.plannedG,actualOrigin:s.plannedOrigin})});
  events=c.planBB2Finish(opening,events,sessionId,'FINISH',{knownWorkingWeights:true,completedAt:Date.parse('2026-11-03T12:00:00Z')+id*100000}).events;
 }
 data.bb2={setup,opening,events,sealedBlocks:[],activeSessionId:null,selectedProgram:true};
 data.session={};data.gppSession={};data.workoutStartedAt=null;data.timerStart=null;
 return data;
};
