'use strict';

function random(seed) {
  return (min, max) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return min + ((seed >>> 0) % (max - min + 1));
  };
}

// Independent decision table for ordinary RPT. Slot zero is the top set.
// A logged miss fixes the recovery starting point for the rest of this plan.
function prescription({ sets, reps, load, drop, grid, bar, actual, rpt }) {
  const round = weight => Math.max(bar, Math.round(weight / grid) * grid);
  const rows = Array.from({ length: sets }, () => ({ target: reps, load }));
  if (!rpt) return rows;
  const miss = actual.findIndex(row => row && row.reps < reps);
  if (miss < 0) return rows;
  const remaining = sets - 1 - miss;
  const offsets = remaining === 2 ? [0, 2] : [0, 1, 3];
  let base = actual[miss].reps + 1;
  let previousLoad = actual[miss].load;
  for (let offset = 0; offset < remaining; offset++) {
    const index = miss + 1 + offset;
    const target = Math.max(1, base + (remaining === 1 ? 0 : offsets[Math.min(offset, offsets.length - 1)]));
    const weight = round(previousLoad * (100 - drop) / 100);
    rows[index] = { target, load: weight };
    const recorded = actual[index];
    if (recorded && recorded.reps < target) base--;
    previousLoad = recorded ? recorded.load : weight;
  }
  return rows;
}

function outcome({ sets, reps, rpt, actual }) {
  const counted = actual.slice(0, sets);
  if (counted.length < sets || Array.from(counted).some(row => !row)) return 'open';
  const miss = counted.findIndex(row => row.reps < reps);
  if (miss < 0) return 'success';
  return rpt && miss > 0 ? 'close' : 'failure';
}

module.exports = {random, prescription, outcome};
