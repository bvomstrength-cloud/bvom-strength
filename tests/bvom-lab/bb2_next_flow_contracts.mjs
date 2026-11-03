import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as core from '../../bb2/browser-core.mjs';
const require=createRequire(import.meta.url),H=require('./lib/bvom_harness'),copy=x=>JSON.parse(JSON.stringify(x));
const fixture=await require('./fixtures/bb2-next-flow.cjs')(),h=H.boot(H.loadBuild(new URL('../..',import.meta.url).pathname));H.configureLP(h);h.ctx.__core=core;
const use=data=>{h.ctx.__data=copy(data);h.ev('state=__data;bvomBb2PreviewModule=__core');};
use(fixture);let next=h.ctx.bvomBb2NextView();assert.equal(next.templateId,'upper_a');assert.equal(next.slots[0].plannedG,62500);
const numericCard=h.ctx.bvomBb2PendingChoices({pending:{'upper_a|flat_press|bench_press':{kind:'OFF_PLAN',valueG:65000}},progress:{}},null,true);assert.match(numericCard,/before Start/);assert.ok(!numericCard.includes('Other exercises can be completed first'));
const raw=JSON.stringify(h.S()),token=h.ctx.bvomBb2NextToken();h.ctx.bvomBb2NextView();h.ctx.renderWorkout();assert.equal(JSON.stringify(h.S()),raw,'preview creates no session, timer or document changes');
const old=h.S().bb2.events.at(-1);h.S().bb2.events.push({type:'NOTE_EDITED',eventId:'token-note',commitOrdinal:h.S().bb2.events.length+1,blockId:old.blockId,sessionId:'seed-lower_b',text:'Note'});assert.notEqual(h.ctx.bvomBb2NextToken(),token);assert.equal(h.ctx.bvomBb2StartNext(token),false,'stale preview cannot Start');
// Rotation ignores optional recovery; an incomplete normal day is repeated even
// when a session note follows its terminal event.
use(fixture);const b=h.S().bb2,add=(type,fields)=>b.events.push({type,eventId:'boundary-'+b.events.length,commitOrdinal:b.events.length+1,blockId:b.opening.blockId,...fields});
const slot={roleSlotId:'synthetic',exerciseId:'synthetic',equipment:'loaded',sets:1,floor:6,ceiling:8,plannedG:10000,plannedOrigin:{value:'10',unit:'kg'},incrementG:1000,incrementOrigin:{value:'1',unit:'kg'}};
add('WORKOUT_STARTED',{sessionId:'recovery',kind:'RECOVERY',templateId:'upper_b',progressionPolicy:1,slots:[slot]});add('SET_RECORDED',{sessionId:'recovery',roleSlotId:'synthetic',exerciseId:'synthetic',setIndex:0,prescribed:true,reps:6,actualG:10000,actualOrigin:slot.plannedOrigin});add('WORKOUT_FINISHED',{sessionId:'recovery'});assert.equal(h.ctx.bvomBb2NextView().templateId,'upper_a');
add('WORKOUT_STARTED',{sessionId:'incomplete',kind:'NORMAL',templateId:'lower_a',progressionPolicy:1,slots:[slot]});add('WORKOUT_INCOMPLETE',{sessionId:'incomplete'});add('NOTE_EDITED',{sessionId:'incomplete',text:'Incomplete note'});assert.equal(h.ctx.bvomBb2NextView().templateId,'lower_a');
// Selector-only synthetic 32-credit block: no endurance journey or catalogue
// substitution is performed. Full-catalogue carry is tested by inline --seal.
use(fixture);const opening=core.createBB2Opening({ownerId:b.opening.ownerId,blockId:'selector-boundary'}),events=[];
for(const day of ['upper_a','lower_a','upper_b','lower_b'])for(let n=0;n<8;n++){
 const sessionId=day+n,append=(type,fields)=>events.push({type,eventId:'selector-'+events.length,commitOrdinal:events.length+1,blockId:opening.blockId,...fields});
 append('WORKOUT_STARTED',{sessionId,templateId:day,kind:'NORMAL',slots:[{...slot,roleSlotId:'flat_press',exerciseId:'bench_press'}]});append('SET_RECORDED',{sessionId,roleSlotId:'flat_press',exerciseId:'bench_press',setIndex:0,prescribed:true,reps:6,actualG:10000,actualOrigin:slot.plannedOrigin});append('WORKOUT_FINISHED',{sessionId});append('CREDIT_GRANTED',{sessionId,creditId:'credit-'+sessionId});
}
h.S().bb2.opening=opening;h.S().bb2.events=events;assert.equal(h.ctx.bvomBb2NextView().complete,true);h.ctx.renderWorkout();assert.ok(!h.ctx.document.querySelector('#workout').innerHTML.includes('data-bb2-start-next'),'32 credits require explicit block review');
events.push({type:'BLOCK_SEALED',sealId:'selector-seal',eventId:'seal',commitOrdinal:events.length+1,blockId:opening.blockId});
h.S().bb2.opening=core.BB2_BROWSER_MODULES.ledger.createNextBB2Opening(opening,events,'selector-next');h.S().bb2.events=[];next=h.ctx.bvomBb2NextView();assert.equal(next.templateId,'upper_a');assert.equal(next.slots[0].plannedG,10000);
console.log('PASS read-only next preview, earned load, stale guard, incomplete note/recovery rotation, 32-credit review and next-block opening');
