import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as core from '../../bb2/browser-core.mjs';
const require=createRequire(import.meta.url),H=require('./lib/bvom_harness'),fixture=await require('./fixtures/bb2-lower-b-history.cjs')();
const h=H.boot(H.loadBuild(new URL('../..',import.meta.url).pathname));H.configureLP(h);h.ctx.__data=fixture;h.ctx.__core=core;h.ev('state=__data;bvomBb2PreviewModule=__core');
const original=JSON.stringify(fixture),p=core.foldBB2Block(fixture.bb2.opening,fixture.bb2.events),workout=p.history.at(-1);
assert.equal(workout.validCount,9);assert.equal(workout.prescribedCount,9);
let view=h.ctx.bvomBb2HistoryView(workout);assert.equal(view.volume,3240,'mixed BW workout retains recorded external-load volume');assert.equal(view.duration,'1:07');
h.ev("bvomExpandedHistoryIndex='test'");let html=h.ctx.bvomHistoryWorkoutCard(view,'test');
assert.equal((html.match(/Duration/g)||[]).length,1,'expanded duration occurs once');assert.match(html,/3,240|3240/);assert.ok(!html.includes('hanging_knee_raise'));assert.ok(!html.includes(' · none'));assert.equal((html.match(/Actual bodyweight/g)||[]).length,1);
const shared=h.ctx.bvomShareWorkoutText(view);assert.match(shared,/Volume: 3240 kg/);assert.match(shared,/external load only/);assert.match(shared,/Actual bodyweight 40 kg/);assert.ok(!shared.includes('hanging_knee_raise'));
const bb1=fixture.history.at(-1);assert.equal(h.ctx.bvomVolumeText(view),h.ctx.bvomVolumeText(bb1),'same BB1 volume formatter');
const ids=new Set();for(const version of [1,2,3,4,5])for(const roles of Object.values(core.BB2_BROWSER_MODULES.catalogue.getBB2Catalogue(version)))for(const role of roles)for(const o of role.options)if(o.equipment==='bodyweight')ids.add(o.id);
for(const id of ids){
 const w={...workout,sets:[0,1].map(setIndex=>({roleSlotId:'bw',exerciseId:id,variation:id,assistance:'none',actualBodyweightKg:40,reps:10,setIndex,prescribed:true}))};
 const v=h.ctx.bvomBb2HistoryView(w),card=h.ctx.bvomHistoryWorkoutCard(v,'test');assert.equal(v.volume,0,'unknown BW is not invented as tonnage');assert.ok(!card.includes(id));assert.equal((card.match(/Actual bodyweight/g)||[]).length,1);
 w.sets[0]={...w.sets[0],assistance:'light band',actualG:2500};w.sets[1]={...w.sets[1],variation:'slower tempo',actualBodyweightKg:41,actualG:5000,prescribed:false};
 const weighted=h.ctx.bvomBb2HistoryView(w),details=h.ctx.bvomHistoryWorkoutCard(weighted,'test');assert.equal(weighted.volume,75);assert.match(details,/light band/);assert.match(details,/slower tempo/i);assert.match(details,/41 kg/);assert.match(details,/EXTRA SET/);
}
h.ev("state.unit='lb'");view=h.ctx.bvomBb2HistoryView(workout);assert.ok(Math.abs(view.volume-3240*1000/453.59237)<1e-8);h.ev("state.unit='kg'");
assert.equal(JSON.stringify(fixture),original,'rendering never changes recorded data');assert.deepEqual(core.foldBB2Block(fixture.bb2.opening,fixture.bb2.events),p);
console.log('PASS Lower B 9/9 volume/1:07, BB1 metric parity, all '+ids.size+' bodyweight identities, assisted/weighted/extra sets, units and immutable journal');
