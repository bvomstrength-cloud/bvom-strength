'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const H=require('../bvom-lab/lib/bvom_harness');
const candidate=path.resolve(process.argv[2]||'.');
const reference=path.resolve(process.argv[3]||candidate);
const build=H.loadBuild(candidate);
const round=x=>Math.max(20,Math.round(x/2.5)*2.5);
const increments={Squat:10,'Bench Press':5};

for(const [mode,heavy,medium,lift] of [
 ['hlm','H','M','Squat'],['hlm','H','M','Bench Press'],
 ['fourday','2','4','Squat'],['fourday','1','3','Bench Press']
]){
 const app=H.boot(build);H.configureLP(app);
 const state=app.S();
 Object.assign(state,{programMode:mode,enabledStandard:[1.25]});
 state.hlm.driver[lift]=100;
 state.hlm.nextHeavy[lift]=null;
 state.core[lift].drop=increments[lift];
 state.fixedWorkingSets={[mode]:{[lift]:{sets:1,reps:50}}};
 for(const reps of [2,3,4,5]){
  state.day=heavy;state.session={};state.hlm.rep[lift]=reps;
  const p=app.ctx.corePrescription(lift);
  assert.equal(p.topIndex,2);
  assert.deepEqual(Array.from(p.targets),[reps,reps,reps,reps+1,reps+3]);
  assert.deepEqual(Array.from(p.loads),[90,95,100,100-increments[lift],100-2*increments[lift]]);
  state.day=medium;
  const mediumLoad=100+increments[lift];
  assert.deepEqual(Array.from(app.ctx.corePrescription(lift).loads),[mediumLoad]);
  state.session[lift]={0:{reps,load:mediumLoad}};
  const plan=app.ctx.getSetPlan(lift);
  const multiplier=reps===3?.5:reps===4?(lift==='Squat'?.75:.8):1;
  assert.equal(plan.length,reps===2?1:2);
  if(reps!==2){
   assert.equal(plan[1].target,1);
   assert.equal(plan[1].load,round(mediumLoad*(1+increments[lift]*multiplier/100)));
  }
  if(mode==='hlm'&&lift==='Squat'){
   state.day='L';state.session={};
   const light=app.ctx.corePrescription(lift);
   assert.deepEqual(Array.from(light.targets),[reps,reps]);
   assert.deepEqual(Array.from(light.loads),[80,80]);
  }
 }
}
for(const file of ['browser-core.mjs','browser-host.mjs','app-session.mjs','cloud-sidecar.mjs','cloud-coordinator.mjs']){
 assert.deepEqual(fs.readFileSync(path.join(candidate,'bb2',file)),fs.readFileSync(path.join(reference,'bb2',file)));
}
const bb=H.boot(build),original=H.boot(H.loadBuild(reference));
H.bbStart(bb);H.bbStart(original);
for(const id of H.bbDayIds(bb)){
 const actual=bb.ctx.bvomBbPrescription(id),expected=original.ctx.bvomBbPrescription(id);
 assert.equal(JSON.stringify(actual),JSON.stringify(expected));
}
console.log('PASS 16 linked Heavy/Medium combinations, Light and optional singles, BB1 prescriptions and all five BB2 modules');

async function cloud(){
 const net={online:true},supabase=H.mockSupabase({net,session:true});
 const first=await H.launch(build,{ls:H.memStore(),net,supabase});
 H.configureLP(first);
 first.ctx.tapSet('Squat',0);
 H.finish(first);
 first.lastOverlay().querySelector('[data-ok]').click();
 const legacy=JSON.stringify(first.S().history[0]);
 first.ev("cfg('Squat').mode='rpt';cfg('Squat').drop=10;save()");
 first.ctx.bvomWeightModal=(_n,w,save)=>save(w,{sets:4,reps:7},w);
 first.ctx.editWeight('Squat');
 first.reps.push(7,5,6,8);
 [0,1,2,3].forEach(i=>first.ctx.tapSet('Squat',i));
 H.finish(first);
 first.lastOverlay().querySelector('[data-ok]').click();
 await first.ctx.bvomCloudSaveNow();
 assert.equal(first.ev('bvomCloud.cloudExists'),true);
 const device=await H.launch(build,{ls:H.memStore(),net,supabase});
 device.choices.push('R');
 await device.ctx.bvomCloudRestore();
 const storage=JSON.parse(device.ls.getItem('bvom_data'));
 assert.equal(JSON.stringify(storage.history[0]),legacy);
 assert.equal(storage.history.length,2);
 assert.deepEqual(storage.fixedWorkingSets.lprpt.Squat,{sets:4,reps:7});
 assert.deepEqual(Object.values(storage.history[1].session.Squat).map(row=>[row.load,row.reps,row.target]),
  [[100,7,7],[100,5,7],[90,6,6],[80,8,8]]);
 console.log('PASS mocked two-device cloud restore, legacy History and actual RPT recovery records');
}
cloud().catch(error=>{console.error(error);process.exitCode=1});
