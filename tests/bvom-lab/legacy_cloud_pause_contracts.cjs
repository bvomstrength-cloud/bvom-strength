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
 const build=H.loadBuild(builds[0][1]);
 function active(){const f=setup(build),h=f.h;h.ls.setItem('bvom_data_owner','guard-audit');h.ev("window.__bvomAuthUserId='guard-audit';state.workoutStartedAt=Date.now();save({localOnly:true});bvomCloud.workoutBaselineFingerprint=null");return f}
 await check('candidate verified owner can remember an exactly matching active baseline without writing',async()=>{
  const {h,remote}=active(),raw=h.ls.getItem('bvom_data');assert.equal(typeof h.ctx.bvomCloudRememberMatchingActiveBaseline,'function');
  assert.equal(h.ctx.bvomCloudRememberMatchingActiveBaseline('guard-audit',remote.data),true);assert.equal(h.ls.getItem('bvom_data'),raw);assert.equal(remote.writes,0);assert.equal(h.ev('bvomCloud.syncReady'),false);
  h.S().workoutStartedAt=null;h.S().history.push({note:'normal Finish'});await h.ctx.bvomCloudAssessSync();assert.equal(h.ev('bvomCloud.syncReady'),true);await h.ctx.bvomCloudAutoSave();assert.equal(remote.writes,1);
 });
 await check('candidate remembered baseline still rejects a later cloud edit',async()=>{
  const {h,remote}=active();assert.equal(h.ctx.bvomCloudRememberMatchingActiveBaseline('guard-audit',remote.data),true);remote.data.weights.Squat+=5;h.S().workoutStartedAt=null;h.S().history.push({note:'finished'});await h.ctx.bvomCloudAssessSync();await h.ctx.bvomCloudAutoSave();assert.equal(h.ev('bvomCloud.conflict'),true);assert.equal(remote.writes,0);
 });
 for(const [name,change]of Object.entries({
  'already progressed local weights':(h)=>h.S().weights.Squat+=2.5,
  'newer cloud increment':(h,r)=>r.data.core.Squat.increment=.5,
  'older restored History':(h,r)=>r.data.history.push({note:'newer remote workout'}),
  'other signed-in owner':h=>h.ev("bvomCloud.user={id:'other-user'}"),
  'account switch':h=>h.ev('bvomCloud.accountSwitchDeferred=true'),
  'offline or unverified startup':h=>h.ev("bvomCloud.startupState='VERIFYING'"),
  'another document owner':h=>h.ev('bvomWindowLockOwned=false'),
  'raw document changed':h=>h.ls.setItem('bvom_data','{}'),
  'BB2 active journal':h=>{h.S().bb2={activeSessionId:'isolated-fixture'};}
 }))await check('candidate refuses active baseline with '+name,async()=>{
  const {h,remote}=active();change(h,remote);assert.equal(h.ctx.bvomCloudRememberMatchingActiveBaseline('guard-audit',remote.data),false);assert.equal(h.ev('bvomCloud.workoutBaselineFingerprint'),null);assert.equal(remote.writes,0);
 });
 console.log('Legacy cloud guard audit: '+passed+'/'+(builds.length*7+11)+' PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
