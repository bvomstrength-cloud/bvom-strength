import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as core from '../../bb2/browser-core.mjs';
const require=createRequire(import.meta.url),H=require('./lib/bvom_harness');
const build=H.loadBuild(new URL('../..',import.meta.url).pathname);
function fixture(){
 const h=H.boot(build,{supabase:null,online:false});H.configureLP(h);
 h.ctx.__core=core;h.ev("bvomCloud.user={id:'cancel-owner'};window.__bvomAuthUserId='cancel-owner';bvomEntitlement.record={status:'complimentary',user_id:'cancel-owner'};bvomSetLocalOwnerId('cancel-owner')");h.ctx.showApp();
 h.ev('bvomBb2PreviewModule=__core;bvomBb2PreviewDraft=__core.createBB2Setup({catalogueVersion:5});bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);
 const query=h.ctx.document.querySelector;h.ctx.document.querySelector=selector=>{
  const field=selector.match(/data-bb2-(load|inc|assist|reps)="([^"]+)"/);
  return field?{value:field[1]==='load'?'60':field[1]==='inc'?'2.5':field[1]==='assist'?'none':'8'}:query(selector);
 };
 assert.equal(h.ctx.bvomBb2Begin(),true);h.ctx.bvomWorkoutActionAllowed();return h;
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name)}
test('empty cancel requires explicit confirmation and closes once without credit/progression/history',()=>{
 const h=fixture(),b=h.S().bb2,prior=core.foldBB2Block(b.opening,b.events),raw=h.ls.getItem('bvom_data');let confirm;
 h.ctx.bvomChoiceModal=(...args)=>{confirm=args.at(-1)};
 assert.equal(h.ctx.bvomBb2CancelWorkout(),true);assert.equal(h.ctx.bvomBb2CancelWorkout(),false);assert.equal(h.ls.getItem('bvom_data'),raw);
 assert.equal(confirm(),true);const saved=h.ls.getItem('bvom_data');assert.equal(confirm(),false);assert.equal(h.ls.getItem('bvom_data'),saved);
 const next=core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events);assert.deepEqual(next.progress,prior.progress);assert.deepEqual(next.quotas,prior.quotas);assert.deepEqual(next.history,prior.history);assert.equal(h.S().history.length,0);assert.equal(h.S().bb2.activeSessionId,null);
 core.validateBB2RestoredBlock(h.S().bb2.opening,h.S().bb2.events);
});
test('zero-rep actual rejects direct and stale confirmation attempts with exact bytes preserved',()=>{
 const h=fixture();let confirm;h.ctx.bvomChoiceModal=(...args)=>{confirm=args.at(-1)};h.ctx.bvomBb2CancelWorkout();
 assert.equal(h.ctx.bvomBb2Log(0,0),true);h.S().bb2.events.at(-1).reps=0;const raw=h.ls.getItem('bvom_data');assert.equal(h.ctx.bvomBb2Discard(),false);assert.equal(confirm(),false);assert.equal(h.ls.getItem('bvom_data'),raw);assert.doesNotMatch(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-cancel-workout/);
});
test('extra-set event also rejects cancellation internally before planning',()=>{
 const h=fixture();const b=h.S().bb2;b.events.push({type:'EXTRA_SET_RECORDED',sessionId:b.activeSessionId,reps:0});const raw=h.ls.getItem('bvom_data');assert.equal(h.ctx.bvomBb2Discard(),false);assert.equal(h.ls.getItem('bvom_data'),raw);
});
test('changed account/raw/marker/lock/memory and prior-workout tokens all fail closed',()=>{
 for(const change of ['account','auth','owner','raw','marker','lock','memory','session','stored-actual','ledger-owner']){
  const h=fixture(),token=h.ctx.bvomBb2CancelToken();
  if(change==='account')h.ev("bvomCloud.user={id:'other'}");
  if(change==='auth')h.ev("window.__bvomAuthUserId='other'");
  if(change==='owner')h.ls.setItem('bvom_data_owner','other');
  if(change==='raw'){const d=JSON.parse(h.ls.getItem('bvom_data'));d.session={Squat:{0:{reps:0}}};h.ls.setItem('bvom_data',JSON.stringify(d))}
  if(change==='marker')h.ls.setItem('bvom_workout_tab_owner','other');
  if(change==='lock')h.ev('bvomWindowLockOwned=false');
  if(change==='memory')h.S().bb2.events.push({type:'NOTE_EDITED',sessionId:h.S().bb2.activeSessionId,text:'new'});
  if(change==='session')token.sessionId='old-session';
  if(change==='ledger-owner'){
   h.S().bb2.opening.ownerId='foreign-ledger-owner';const next=JSON.stringify(h.S());h.ls.setItem('bvom_data',next);h.ctx.__savedRaw=next;h.ev('bvomLastPersistedRaw=__savedRaw');token.raw=next;
  }
  if(change==='stored-actual'){
   const d=JSON.parse(h.ls.getItem('bvom_data'));d.freeTrainingSession={Squat:{sets:[],single:{reps:0,load:60}}};
   h.ls.setItem('bvom_data',JSON.stringify(d));h.ctx.__savedRaw=JSON.stringify(d);h.ev('bvomLastPersistedRaw=__savedRaw');token.raw=JSON.stringify(d);
  }
  const raw=h.ls.getItem('bvom_data');assert.equal(h.ctx.bvomBb2Discard(token),false,change);assert.equal(h.ls.getItem('bvom_data'),raw,change);
 }
});
test('a raw change during discard planning is rechecked before commit',()=>{
 const h=fixture(),real=core.BB2_BROWSER_MODULES.ledger.discardBB2Session;let changed;
 h.ctx.__alteredCore={...core,BB2_BROWSER_MODULES:{...core.BB2_BROWSER_MODULES,ledger:{...core.BB2_BROWSER_MODULES.ledger,discardBB2Session(...args){const events=real(...args),d=JSON.parse(h.ls.getItem('bvom_data'));d.workoutNote='new durable note';changed=JSON.stringify(d);h.ls.setItem('bvom_data',changed);return events}}}};
 h.ev('bvomBb2PreviewModule=__alteredCore');assert.equal(h.ctx.bvomBb2Discard(),false);assert.equal(h.ls.getItem('bvom_data'),changed);assert.ok(h.S().bb2.activeSessionId);
});
test('quota failure rolls back cancel and retains exact ledger/timer/owner',()=>{
 const h=fixture(),raw=h.ls.getItem('bvom_data'),before=JSON.stringify(h.S()),owner=h.ls.getItem('bvom_workout_tab_owner'),put=h.ls.setItem;
 h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('quota');put(k,v)};
 assert.equal(h.ctx.bvomBb2Discard(),false);assert.equal(h.ls.getItem('bvom_data'),raw);assert.deepEqual(JSON.parse(JSON.stringify(h.S())),JSON.parse(before),'exact memory values after rollback');assert.equal(h.ls.getItem('bvom_workout_tab_owner'),owner);
});
console.log('RESULT '+passed+' BB2 empty-cancel contracts passed');
