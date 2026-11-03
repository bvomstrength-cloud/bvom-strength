'use strict';
// Synthetic reproduction of the owner's Lower B 9/9, 1:07, 40 kg BW example.
module.exports=async function lowerBHistory(){
 const core=await import('../../../bb2/browser-core.mjs');
 const data=JSON.parse(JSON.stringify(require('./bb2-android-history-shape.json').data));
 let setup=core.createBB2Setup();setup=core.BB2_BROWSER_MODULES.catalogue.chooseBB2Exercise(setup,'lower_b','abdominal','hanging_knee_raise');
 const opening=core.createBB2Opening({ownerId:data.bb2.opening.ownerId,blockId:'lower-b-display'}),events=[];
 const add=(type,fields)=>events.push({type,eventId:'display-'+(events.length+1),commitOrdinal:events.length+1,blockId:opening.blockId,...fields});
 const slots=core.getBB2TemplatePrescription(setup,'lower_b').slots.map(s=>({roleSlotId:s.roleSlotId,exerciseId:s.exerciseId,sets:s.sets,floor:s.floor,ceiling:s.ceiling,equipment:s.equipment,...(s.equipment==='bodyweight'?{variation:s.exerciseId,assistance:'none'}:{plannedG:60000,plannedOrigin:{value:'60',unit:'kg'},incrementG:2500,incrementOrigin:{value:'2.5',unit:'kg'}})}));
 const startedAt=Date.parse('2026-11-03T09:00:00Z');
 add('WORKOUT_STARTED',{sessionId:'lower-b-acceptance',templateId:'lower_b',kind:'NORMAL',startedAt,slots});
 for(const s of slots)for(let i=0;i<s.sets;i++)add('SET_RECORDED',{sessionId:'lower-b-acceptance',roleSlotId:s.roleSlotId,exerciseId:s.exerciseId,setIndex:i,reps:s.floor,prescribed:true,...(s.equipment==='bodyweight'?{variation:s.exerciseId,assistance:'none',actualBodyweightKg:40}:{actualG:60000,actualOrigin:{value:'60',unit:'kg'}})});
 const finished=core.planBB2Finish(opening,events,'lower-b-acceptance','FINISH',{knownWorkingWeights:true,completedAt:startedAt+67000});
 data.bb2={setup,opening,events:finished.events,sealedBlocks:[],activeSessionId:null,selectedProgram:true};
 const session={};for(const s of slots)session['BB:'+s.exerciseId]=Object.fromEntries(Array.from({length:s.sets},(_,i)=>[i,{reps:s.floor,load:s.equipment==='bodyweight'?0:60,...(s.equipment==='bodyweight'?{bodyweight:true,actualBodyweightKg:40}:{})}]));
 data.history.push({date:new Date(startedAt-86400000).toISOString(),program:'bodybuilding',day:'B',unit:'kg',duration:'1:07',volume:3240,session});
 return data;
};
