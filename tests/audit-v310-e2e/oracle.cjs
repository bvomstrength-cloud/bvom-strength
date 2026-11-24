'use strict';

function random(seed) {
  let value = seed >>> 0;
  return (min, max) => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return min + Math.floor(value * (max - min + 1) / 4294967296);
  };
}

function nextLoad(weight, drop, grid) {
  return Math.max(20, Math.floor(weight * (100 - drop) / (100 * grid) + .5) * grid);
}

// The transition contract is expressed in terms of the recorded prefix, without
// using application functions. The worked slots stay at their original load.
function rows(lift) {
  const {sets, reps, weight, drop, grid, actual, edited} = lift;
  const plan = Array.from({length:sets}, () => [weight,reps,false,false]);
  const miss = plan.findIndex((_, index) => actual[index]?.reps < reps);
  if (miss < 0) return plan;
  const left = sets - miss - 1;
  let load = actual[miss].load;
  let running = actual[miss].reps + 1;
  for (let offset = 0; offset < left; offset++) {
    const index = miss + offset + 1;
    const addition = left === 2 ? 2 * offset : left >= 3 ? [0,1,3][Math.min(offset,2)] : 0;
    load = nextLoad(load,drop,grid);
    const target = edited ? Math.max(1,running+addition) : running+addition;
    plan[index] = [load,target,offset===left-1,true];
    if (actual[index]?.reps < target) running--;
    if (edited && actual[index]) load=actual[index].load;
  }
  if (actual[sets-1]?.reps < reps) {
    plan.push([nextLoad(edited ? actual[sets-1].load : weight,drop,grid),reps,true,true]);
  }
  return plan;
}

function result(lift) {
  if(lift.actual.length<rows(lift).length)return 'pending';
  return lift.actual.slice(0,lift.sets).some(row=>row.reps<lift.reps)?'repeat':'increase';
}

module.exports={random,rows,result};
