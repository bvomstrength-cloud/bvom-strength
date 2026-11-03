'use strict';
// Bounded synthetic ledger, not an endurance journey or owner's training data.
module.exports=async function cappedDay(){
 const data=await require('./bb2-next-flow.cjs')(),c=await import('../../../bb2/browser-core.mjs');
 const b=data.bb2,L=c.BB2_BROWSER_MODULES.ledger;
 for(let n=1;n<8;n++){
  const prep=c.BB2_BROWSER_MODULES.start.prepareBB2SharedProgression(b.opening,b.events,b.setup);b.events=prep.events;
  const slots=c.getBB2TemplatePrescription(b.setup,'upper_a').slots.map(s=>{
   const p=L.sharedProgressFor(prep.projection,'upper_a|'+s.roleSlotId+'|'+s.exerciseId,s).progress;
   return {roleSlotId:s.roleSlotId,exerciseId:s.exerciseId,sets:s.sets,floor:s.floor,ceiling:s.ceiling,equipment:s.equipment,plannedG:p.loadG,plannedOrigin:p.loadOrigin,incrementG:p.incrementG,incrementOrigin:p.incrementOrigin};
  });
  const sessionId='capped-upper-a-'+n,add=(type,fields)=>b.events.push({type,eventId:'cap-'+b.events.length,blockId:b.opening.blockId,commitOrdinal:b.events.length+1,...fields});
  add('WORKOUT_STARTED',{sessionId,templateId:'upper_a',kind:'NORMAL',inlineDecisions:1,progressionPolicy:1,slots,startedAt:Date.parse('2026-11-03T13:00:00Z')+n*100000});
  for(const s of slots)for(let j=0;j<s.sets;j++)add('SET_RECORDED',{sessionId,roleSlotId:s.roleSlotId,exerciseId:s.exerciseId,setIndex:j,reps:s.floor,prescribed:true,actualG:s.plannedG,actualOrigin:s.plannedOrigin});
  b.events=c.planBB2Finish(b.opening,b.events,sessionId,'FINISH',{knownWorkingWeights:true,completedAt:Date.parse('2026-11-03T14:00:00Z')+n*100000}).events;
 }
 return data;
};
