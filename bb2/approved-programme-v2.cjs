'use strict';
// Owner-approved BB2 four-day prescription, 2026-11-01.
// Used by catalogue v2 and its generated browser bundle. Catalogue v1 remains
// available for saved preview journals; production enablement is still off.
const DAYS = Object.freeze({
  upper_a: [
    ['flat_press',3,6,8,'bench_press'],
    ['horizontal_row',3,8,12,'chest_supported_row'],
    ['shoulder_press',2,8,12,'dumbbell_shoulder_press'],
    ['triceps_extension',2,10,15,'lying_barbell_triceps_extension']
  ],
  lower_a: [
    ['squat',3,6,8,'high_bar_squat'],
    ['unilateral_quad',2,8,12,'bulgarian_split_squat'],
    ['hamstring_curl',3,6,10,'nordic_curl'],
    ['calf_raise',2,10,20,'standing_calf_raise']
  ],
  upper_b: [
    ['incline_press',3,8,12,'incline_dumbbell_press'],
    ['vertical_pull',3,6,10,'chinup'],
    ['horizontal_row',2,8,12,'chest_supported_row'],
    ['lateral_raise',3,12,20,'dumbbell_lateral_raise'],
    ['secondary_chest',2,10,15,'dumbbell_fly']
  ],
  lower_b: [
    ['quad',2,8,12,'front_squat'],
    ['hip_hinge',3,6,8,'romanian_deadlift'],
    ['calf_raise',2,10,20,'standing_calf_raise'],
    ['abdominal',2,10,15,'weighted_crunch']
  ]
});
const OPTIONAL_CURL = Object.freeze(['biceps_curl',2,10,15,'dumbbell_curl']);
const SET_COUNTS = Object.freeze(Object.fromEntries(Object.entries(DAYS).map(([day,slots]) =>
  [day,slots.reduce((n,s)=>n+s[1],0)])));
if (Object.values(SET_COUNTS).reduce((a,b)=>a+b,0)!==42) throw Error('BB2 approved core set budget drift');
for (const [day,slots] of Object.entries(DAYS)) {
  const names = slots.map(s=>s[0]);
  if (new Set(names).size!==names.length) throw Error('duplicate role in '+day);
  if (slots.some(s=>s[1]<1||s[2]>s[3])) throw Error('invalid prescription in '+day);
}
module.exports = Object.freeze({DAYS,OPTIONAL_CURL,SET_COUNTS});
