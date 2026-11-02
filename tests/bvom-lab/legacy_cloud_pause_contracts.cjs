'use strict';
// Counterfactual guard tests on both exact static builds; no database/network.
const assert=require('node:assert/strict'),path=require('node:path');
const H=require('./lib/bvom_harness');
const copy=x=>JSON.parse(JSON.stringify(x));
const builds=[['candidate',path.resolve(__dirname,'../..')],...(process.argv[2]?[['production-v2.9.21',path.resolve(process.argv[2])]]:[])];
let passed=0;
function setup(build){
 const remote={data:null,writes:0};
 const client={from(){let incoming;const q={select(){return q},eq(){return q},order(){return q},
  async limit(){return {data:remote.data?[{id:'audit-row',data:copy(remote.data)}]:[],error:null}},
  update(v){incoming=v;return q},insert(v){incoming=v;return q},async single(){remote.writes++;remote.data=copy(incoming.data);return {data:{id:'audit-row'},error:null}}};return q}};
 const h=H.boot(build,{supabase:{createClient:()=>client}});H.configureLP(h);
 h.ev("bvomCloud.user={id:'guard-audit'};bvomCloud.offlineLocalAccess=false;bvomCloud.startupState='VERIFIED';bvomCloud.accountSwitchDeferred=false");
 remote.data=copy(h.ctx.bvomCloudPayload());return {h,remote};
}
async function check(label,fn){await fn();passed++;console.log('PASS LEGACY GUARD '+label)}
(async()=>{
 for(const [name,dir]of builds){const build=H.loadBuild(dir);
  await check(name+' unchanged full payload automatically establishes a safe baseline',async()=>{
   const {h,remote}=setup(build);await h.ctx.bvomCloudAssessSync();assert.equal(h.ev('bvomCloud.syncReady'),true);assert.equal(remote.writes,0);
  });
  await check(name+' trusted in-memory starting baseline permits finished continuation',async()=>{
   const {h,remote}=setup(build);h.ev('bvomCloud.workoutBaselineFingerprint=bvomCloudComparableFingerprint(bvomCloudPayload())');h.S().history.push({date:'2026-11-02',note:'locally finished'});
   await h.ctx.bvomCloudAssessSync();assert.equal(h.ev('bvomCloud.syncReady'),true);assert.equal(h.ev('bvomCloud.conflict'),false);await h.ctx.bvomCloudAutoSave();assert.equal(remote.writes,1);
  });
  await check(name+' missing baseline plus a longer History does not authorise overwrite',async()=>{
   const {h,remote}=setup(build);h.S().history.push({date:'2026-11-02',note:'local only'});await h.ctx.bvomCloudAssessSync();assert.equal(h.ev('bvomCloud.conflict'),true);await h.ctx.bvomCloudAutoSave();assert.equal(remote.writes,0);
  });
  await check(name+' post-progression recapture cannot impersonate the original baseline',async()=>{
   const {h,remote}=setup(build);h.S().weights.Squat+=2.5;h.ev('bvomCloud.workoutBaselineFingerprint=bvomCloudComparableFingerprint(bvomCloudPayload())');h.S().history.push({note:'finished after reload'});
   await h.ctx.bvomCloudAssessSync();assert.equal(h.ev('bvomCloud.conflict'),true);assert.equal(remote.writes,0);
  });
  await check(name+' History prefix cannot erase another device weight or increment edits',async()=>{
   for(const change of [d=>d.weights.Squat+=5,d=>d.core.Squat.increment=.5]){
    const {h,remote}=setup(build);h.S().history.push({note:'extra local workout'});change(remote.data);
    assert.deepEqual(copy(h.S().history.slice(0,remote.data.history.length)),remote.data.history);
    await h.ctx.bvomCloudAssessSync();await h.ctx.bvomCloudAutoSave();assert.equal(h.ev('bvomCloud.conflict'),true);assert.equal(remote.writes,0);
   }
  });
  await check(name+' cloud change after assessment still blocks the existing automatic writer',async()=>{
   const {h,remote}=setup(build);await h.ctx.bvomCloudAssessSync();remote.data.weights.Squat+=5;await h.ctx.bvomCloudAutoSave();assert.equal(h.ev('bvomCloud.conflict'),true);assert.equal(remote.writes,0);
  });
  await check(name+' active workout and account-switch fences still prevent checking/upload',async()=>{
   for(const fence of ['state.workoutStartedAt=Date.now()','bvomCloud.accountSwitchDeferred=true']){
    const {h,remote}=setup(build);h.ev(fence);await h.ctx.bvomCloudAssessSync();await h.ctx.bvomCloudAutoSave();assert.equal(remote.writes,0);assert.equal(h.ev('bvomCloud.syncReady'),false);
   }
  });
 }
 console.log('Legacy cloud guard audit: '+passed+'/'+(builds.length*7)+' PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
