#!/usr/bin/env node
'use strict';
// Monkey 018 — deterministic, test-only Bodyweight edit endurance.
// Uses BVOM's real app code in the established Node VM harness. No live auth/network.
const assert=require('node:assert/strict');
const path=require('node:path');
const H=require('./lib/bvom_harness');
const build=H.loadBuild(path.resolve(__dirname,'../..'));
const modes=['free','lprpt','hlm','fourday','bodybuilding'];
let actions=0,checks=0;
function equal(actual,expected,label){assert.deepEqual(actual,expected,label);checks++}
function yes(value,label){assert.ok(value,label);checks++}
const near=(a,b)=>Math.abs(a-b)<1e-7;
for(const lang of ['en','ja'])for(const mode of modes){
 const h=H.boot(build);H.configureLP(h);if(mode==='bodybuilding')H.bbStart(h);
 h.S().programMode=mode;h.S().language=lang;
 if(mode==='hlm')h.S().day='H';
 if(mode==='fourday')h.S().day='1';
 if(mode==='free')h.ctx.bvomFtEnsure();
 const a={id:'monkey018',name:'Chin-Up <script>alert(1)</script>',category:'Upper',
  assignment:'A',hlmAssignment:'H',fourDayAssignment:'1',
  freeAssignment:h.ctx.bvomFtDayId(),bbAssignment:'Any',
  equipment:'bodyweight',style:'straight',sets:3,reps:8,topReps:8,
  weight:0,increment:1.25,drop:10,approximateBodyweight:90,resistance:''};
 h.S().accessoryList=[a];h.ctx.save();
 const baseWeights=JSON.stringify(h.S().weights);
 const baseAttempts=JSON.stringify(h.S().attempts);
 const expected=new Map();
 for(let pass=0;pass<14;pass++)for(let set=0;set<3;set++){
  const reps=[8,6,6,10,4,9,7][(pass+set)%7];
  const load=[0,1.25,2.5,3.75,0][(pass*3+set)%5];
  const estimate=pass%6===0&&set===2?null:[90,75,85,92.5][(pass+set)%4];
  const assistance=(pass+set)%4===0?'green band <img src=x onerror=alert(1)>':'';
  h.ctx.tapAccessory('monkey018',set);
  const modal=h.lastOverlay();yes(!!modal&&modal.innerHTML.includes('data-bw-estimate'),'Bodyweight modal opened');
  yes(!modal.innerHTML.includes('Stage 1'),'no developer jargon in modal');
  yes(!modal.innerHTML.includes('e.g. 90 kg'),'no invented athlete-weight recommendations');
  modal.querySelector('[data-load]').value=String(load);
  modal.querySelector('[data-bw-estimate]').value=estimate==null?'':String(estimate);
  modal.querySelector('[data-reps]').value=String(reps);
  modal.querySelector('[data-rpe]').value='8';
  modal.querySelector('[data-res]').value=assistance;
  modal.querySelector('[data-save]').onclick();
  const actual=h.S().session['ACC:monkey018']?.[set];
  yes(!!actual&&actual.bodyweight===true,'actual Bodyweight set persisted');
  equal(actual.load,load,'added load exact');
  equal(actual.reps,reps,'reps exact');
  equal(actual.approximateBodyweight,estimate,'estimate snapshot');
  equal(actual.resistance,assistance,'assist snapshot');
  equal(actual.rpe,8,'RPE snapshot');
  expected.set(set,{load,reps,estimate,assistance});
  const predicted=[...expected.values()].reduce((sum,x)=>sum+(x.load+(x.estimate||0))*x.reps,0);
  const volume=mode==='free'?h.ctx.bvomFtVolume():h.ctx.bvomWorkoutVolume();
  yes(near(volume,predicted),'no duplicate/missing estimated volume '+mode+' '+lang+' '+pass+' '+set+' ('+volume+' vs '+predicted+')');
  const markup=h.ctx.renderAccessories17();
  yes(markup.includes('bvomBwSets'),'compact Bodyweight row rendered');
  yes(!markup.includes('Estimated weight moved (optional)'),'long field label not repeated inside sets');
  yes(!markup.includes('<script>alert(1)</script>'),'exercise name escaped');
  yes(!markup.includes('<img src=x onerror=alert(1)>'),'assistance escaped');
  equal(a.weight,0,'template not auto-increased even after 8 reps');
  equal(a.increment,1.25,'manual increment unchanged');
  equal(JSON.stringify(h.S().weights),baseWeights,'barbell weights untouched');
  equal(JSON.stringify(h.S().attempts),baseAttempts,'barbell failures untouched');
  actions++;
 }
 const stateBefore=JSON.stringify(h.S()),rawBefore=h.ls.getItem('bvom_data');
 h.ctx.tapAccessory('monkey018',1);
 const bad=h.lastOverlay();bad.querySelector('[data-load]').value='-5';
 bad.querySelector('[data-bw-estimate]').value='90';
 bad.querySelector('[data-reps]').value='8';bad.querySelector('[data-rpe]').value='8';
 bad.querySelector('[data-res]').value='';
 bad.querySelector('[data-save]').onclick();
 equal(JSON.stringify(h.S()),stateBefore,'invalid negative load leaves in-memory state unchanged');
 equal(h.ls.getItem('bvom_data'),rawBefore,'invalid negative load leaves persisted state unchanged');
 actions++;
 console.log('PASS '+lang+' '+mode+': 42 saved/re-edited sets, no unearned progression, totals exact, escaping and invalid input safe');
}
console.log('MONKEY 018 PASS: '+actions+' attempted set writes across EN/JA and 5 modes; '+checks+' assertions.');
