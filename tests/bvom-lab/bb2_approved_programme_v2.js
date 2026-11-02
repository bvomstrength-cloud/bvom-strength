'use strict';
const assert = require('node:assert/strict');
const {DAYS,OPTIONAL_CURL,SET_COUNTS} = require('../../bb2/approved-programme-v2.cjs');
assert.deepEqual(SET_COUNTS,{upper_a:10,lower_a:10,upper_b:13,lower_b:9});
assert.equal(Object.values(SET_COUNTS).reduce((a,b)=>a+b,0),42);
assert.deepEqual(DAYS.lower_b.map(x=>x[0]),['quad','hip_hinge','calf_raise','abdominal']);
assert.equal(DAYS.lower_b[0][4],'front_squat');
assert.equal(DAYS.lower_a.find(x=>x[0]==='hamstring_curl')[1],3);
assert.equal(DAYS.upper_a.some(x=>x[0]==='vertical_pull'),false);
assert.equal(DAYS.lower_b.some(x=>x[0]==='hamstring_curl'),false);
assert.equal(DAYS.upper_b.find(x=>x[0]==='secondary_chest')[1],2);
assert.equal(OPTIONAL_CURL[1],2);
assert.equal(DAYS.upper_a.some(x=>x[0]==='biceps_curl'),false);
assert.equal(DAYS.upper_b.some(x=>x[0]==='biceps_curl'),false);
console.log('PASS BB2 owner-approved 42-set design contract');

const core = require('../../bb2/catalogue.cjs');
const setup = core.createBB2Setup();
assert.equal(setup.catalogueVersion,5);
assert.equal(setup.optionalUpperACurls,false);
assert.equal(setup.optionalUpperBCurls,false);
for (const [day,rows] of Object.entries(DAYS)) {
 const plan=core.getBB2TemplatePrescription(setup,day);
 assert.deepEqual(plan.slots.map(s=>[s.roleSlotId,s.sets,s.floor,s.ceiling,s.exerciseId]),rows);
 assert.equal(plan.prescribedCount,SET_COUNTS[day]);
 assert.equal(plan.minimumToFinish,Math.ceil(.7*SET_COUNTS[day]));
}
const curls=core.setBB2OptionalCurls(setup,true);
assert.equal(core.getBB2TemplatePrescription(curls,'upper_b').prescribedCount,15);
assert.equal(core.getBB2TemplatePrescription(curls,'upper_b').slots.at(-1).exerciseId,'dumbbell_curl');
assert.equal(core.getBB2TemplatePrescription(setup,'lower_b').slots[0].warmup,'FULL');
const legacy=core.createBB2Setup({catalogueVersion:1});
assert.deepEqual(core.TEMPLATE_ORDER.map(d=>core.getBB2TemplatePrescription(legacy,d).prescribedCount),[12,11,13,12]);
assert.equal(core.createBB2Setup(legacy).catalogueVersion,1);
assert.equal(core.setBB2OptionalCurls(legacy,true).catalogueVersion,1);
assert.equal(core.chooseBB2Exercise(legacy,'lower_b','hamstring_curl','nordic_curl').catalogueVersion,1);
assert.throws(()=>core.chooseBB2Exercise(setup,'lower_b','hamstring_curl','nordic_curl'),/invalid exercise role/);
assert.throws(()=>core.validateBB2Setup({...setup,catalogueVersion:undefined}),/version/);
for(const day of core.TEMPLATE_ORDER) for(const role of core.getBB2Catalogue(setup.catalogueVersion)[day]) for(const option of role.options) {
 const chosen=core.chooseBB2Exercise(setup,day,role.roleSlotId,option.id);
 const plan=core.getBB2TemplatePrescription(chosen,day);
 assert.deepEqual(plan.slots.map(s=>s.roleSlotId),DAYS[day].map(s=>s[0]));
 assert.equal(plan.minimumToFinish,Math.ceil(.7*plan.prescribedCount));
}
console.log('PASS BB2 v4 real catalogue, all choices, ordering, optional curls and v1 preservation');

// Upper A and B curls are independent optional additions to the 42-set core.
const both=core.setBB2OptionalCurls(curls,true,'upper_a');
assert.deepEqual(core.TEMPLATE_ORDER.map(d=>core.getBB2TemplatePrescription(both,d).prescribedCount),[12,10,15,9]);
assert.deepEqual(core.TEMPLATE_ORDER.map(d=>core.getBB2TemplatePrescription(both,d).minimumToFinish),[9,7,11,7]);
assert.equal(core.getBB2TemplatePrescription(both,'upper_a').slots.at(-1).exerciseId,'dumbbell_curl');
const aOnly=core.setBB2OptionalCurls(both,false,'upper_b');
assert.equal(aOnly.optionalUpperACurls,true);
assert.equal(aOnly.optionalUpperBCurls,false);
console.log('PASS independent optional curls on both upper days');

// Saved catalogues keep their original choices and optional-role availability.
for(const version of [2,3]) {
 const saved=core.createBB2Setup({catalogueVersion:version});
 assert.equal(core.createBB2Setup(saved).catalogueVersion,version);
 for(const [day,rows] of Object.entries(DAYS)) {
  assert.deepEqual(core.getBB2TemplatePrescription(saved,day).slots.map(s=>
   [s.roleSlotId,s.sets,s.floor,s.ceiling,s.exerciseId]),rows);
 }
 const calf=core.chooseBB2Exercise(saved,'lower_a','calf_raise','bodyweight_calf_raise');
 assert.equal(calf.catalogueVersion,version);
 assert.equal(core.getBB2TemplatePrescription(calf,'lower_a').slots.at(-1).exerciseId,'bodyweight_calf_raise');
 assert.throws(()=>core.chooseBB2Exercise(saved,'lower_a','squat','safety_bar_squat'),/finite catalogue/);
 if(version===2)assert.throws(()=>core.setBB2OptionalCurls(saved,true,'upper_a'),/unavailable/);
 else assert.equal(core.getBB2TemplatePrescription(core.setBB2OptionalCurls(saved,true,'upper_a'),'upper_a').prescribedCount,12);
}
for(const [day,roleId] of [['lower_a','squat'],['lower_b','quad']]) {
 const swapped=core.chooseBB2Exercise(setup,day,roleId,'safety_bar_squat');
 const plan=core.getBB2TemplatePrescription(swapped,day);
 assert.equal(plan.slots[0].exerciseId,'safety_bar_squat');
 assert.equal(plan.prescribedCount,SET_COUNTS[day]);
 assert.deepEqual(plan.slots.map(s=>s.roleSlotId),DAYS[day].map(s=>s[0]));
 assert.throws(()=>core.chooseBB2Exercise(setup,day,'calf_raise','bodyweight_calf_raise'),/finite catalogue/);
}
console.log('PASS v2/v3 historical choices and v4 safety squat/calf choice boundaries');
