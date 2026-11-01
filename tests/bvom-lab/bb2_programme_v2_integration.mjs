// Real BVOM application: v2 defaults through saved training, not a second engine.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as core from '../../bb2/browser-core.mjs';
import {validateBB2PortableCatalogue,validateBB2PortableGenesis} from '../../bb2/cloud-coordinator.mjs';
const require=createRequire(import.meta.url),H=require('./lib/bvom_harness');
const root=new URL('../..',import.meta.url).pathname;
function boot(ls){
 const h=H.boot(H.loadBuild(root),ls?{ls}:{});if(!ls)H.configureLP(h);
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__core=core;h.ctx.__bb2PortableCatalogueForTest={validateBB2PortableCatalogue,validateBB2PortableGenesis};
 h.ev('bvomBb2PreviewModule=__core');
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const f=selector.match(/data-bb2-(load|inc|assist|reps|hard|bw-variation|bw-assist|bw-added)="([^"]+)"/);
  if(f){
   const start=h.S().bb2?.events?.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===h.S().bb2.activeSessionId);
   const slot=start?.slots[Number(f[2].split('|')[0])];
   return {value:f[1]==='load'?'60':f[1]==='inc'?'1':f[1].includes('assist')?'none':
    f[1]==='bw-variation'?slot?.variation||'':f[1]==='bw-added'?'':String(slot?.ceiling||8),checked:false};
  }
  return query(selector);
 };
 return h;
}
function open(h){h.ev('bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode;'+
 'bvomBb2PreviewDraft=__core.createBB2Setup(state.bb2?.setup);bvomBb2PreviewSaved=!!state.bb2?.setup;bvomBb2RenderPreview()')}
let h=boot();open(h);
assert.equal(h.ctx.bvomBb2SaveSetup(),true);
assert.equal(h.S().bb2.setup.catalogueVersion,2);
const counts={upper_a:10,lower_a:10,upper_b:13,lower_b:9};
const cloud=JSON.stringify(h.ctx.bvomCloudPayload()),legacyHistory=JSON.stringify(h.S().history);
for(let round=0;round<8;round++)for(const day of Object.keys(counts)){
 open(h);h.ctx.bvomBb2ChooseDay(day);
 assert.equal(h.ctx.bvomBb2Begin(),true,day+' starts');
 const bb=h.S().bb2,start=bb.events.find(e=>e.sessionId===bb.activeSessionId&&e.type==='WORKOUT_STARTED');
 assert.equal(start.slots.reduce((n,s)=>n+s.sets,0),counts[day]);
 if(day==='lower_b')assert.deepEqual(Array.from(start.slots,s=>s.roleSlotId),['quad','hip_hinge','calf_raise','abdominal']);
 for(const [i,s] of start.slots.entries())for(let j=0;j<s.sets;j++)assert.equal(h.ctx.bvomBb2Log(i,j),true);
 assert.equal(h.ctx.bvomBb2End('FINISH'),true);
 const p=core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events);
 assert.equal(p.quotas[day],round+1);
 open(h);
 let choices=0;
 while(Object.keys(core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events).pending).length)
  {assert.ok(++choices<10,'pending choices converge');assert.equal(h.ctx.bvomBb2ResolveChoice(0,'HOLD'),true);}
 console.log('PASS v2 workout',round+1,day);
 if(round===0){
  // Persisted v2 sessions reopen with unchanged immutable prescriptions.
  h=boot(h.ls);
  assert.equal(h.S().bb2.setup.catalogueVersion,2);
  assert.equal(core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events).quotas[day],1);
 }
}
let b=h.S().bb2,p=core.foldBB2Block(b.opening,b.events);
assert.deepEqual(p.quotas,{upper_a:8,lower_a:8,upper_b:8,lower_b:8});
assert.equal(p.history.length,32);
assert.ok(p.progress['upper_a|flat_press|bench_press'].loadG>60000,'earned progress survives v2 sessions');
await h.ctx.bvomBb2ValidatePortableJournal(JSON.parse(JSON.stringify(b)),b.opening.ownerId);
assert.equal(JSON.stringify(h.S().history),legacyHistory,'legacy History preserved');
assert.equal(JSON.stringify(h.ctx.bvomCloudPayload()),cloud,'ordinary cloud document preserved');
console.log('PASS v2 all 32 credited workouts, all four days, reload, earned progress and portable backup validation');
// Recovery uses current v2 volume and never earns a 33rd credit.
open(h);h.ctx.bvomBb2ChooseDay('lower_b');h.ctx.bvomBb2ChooseKind('RECOVERY');
assert.equal(h.ctx.bvomBb2Begin(),true);
b=h.S().bb2;let start=b.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===b.activeSessionId);
assert.deepEqual(Array.from(start.slots,s=>s.sets),[1,2,1,1]);
for(const [i,s] of start.slots.entries())for(let j=0;j<s.sets;j++)assert.equal(h.ctx.bvomBb2Log(i,j),true);
assert.equal(h.ctx.bvomBb2End('FINISH'),true);
assert.deepEqual(core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events).quotas,p.quotas);
await h.ctx.bvomBb2ValidatePortableJournal(JSON.parse(JSON.stringify(h.S().bb2)),h.S().bb2.opening.ownerId);
console.log('PASS v2 low-stress session follows approved ordering and half-volume without quota inflation');
// A real v2 block seals atomically and carries exact earned prescriptions.
open(h);assert.equal(h.ctx.bvomBb2NextBlock(),true);
const previousLoad=core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events).progress['upper_a|flat_press|bench_press'].loadG;
assert.equal(h.ctx.bvomBb2CommitNextBlock(),true);
assert.equal(h.S().bb2.setup.catalogueVersion,2);
assert.equal(h.S().bb2.sealedBlocks.length,1);
assert.equal(core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events).progress['upper_a|flat_press|bench_press'].loadG,previousLoad);
assert.deepEqual(core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events).quotas,{upper_a:0,lower_a:0,upper_b:0,lower_b:0});
await h.ctx.bvomBb2ValidatePortableJournal(JSON.parse(JSON.stringify(h.S().bb2)),h.S().bb2.opening.ownerId);
console.log('PASS v2 next-block seal, retained earned loads, zeroed quota and complete archive validation');
// Minimum is seven of ten, with no credit from the sixth set.
h=boot();open(h);assert.equal(h.ctx.bvomBb2SaveSetup(),true);assert.equal(h.ctx.bvomBb2Begin(),true);
for(const [i,j] of [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]])assert.equal(h.ctx.bvomBb2Log(i,j),true);
const raw=h.ls.getItem('bvom_data');assert.equal(h.ctx.bvomBb2End('FINISH'),false);assert.equal(h.ls.getItem('bvom_data'),raw);
assert.equal(h.ctx.bvomBb2Log(2,0),true);assert.equal(h.ctx.bvomBb2End('FINISH'),true);
assert.equal(core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events).quotas.upper_a,1);
console.log('PASS v2 exact 70% Finish boundary, insufficient-work refusal and unchanged durable data');
