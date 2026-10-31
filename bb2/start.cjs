/* BB2 Stage (ii) — guarded new NORMAL / EXTRA_NORMAL Start boundary.
 * Historical Stage (i) streams remain replayable without catalogue checks.
 * This pure boundary does not persist, sync, or enable workouts in the app.
 */
'use strict';

const { canonicalGrams, identity, foldBB2Block, createNextBB2Opening,
  commitBB2Transaction } = require('./ledger.cjs');
const { validateBB2Setup, getBB2TemplatePrescription } = require('./catalogue.cjs');

const fail = msg => { throw Error('BB2 Start: ' + msg); };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const equal = (a, b) => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => own(b, k) && equal(a[k], b[k]));
};
const enteredMass = (grams, origin, name, positive = false) => {
  if (!Number.isSafeInteger(grams) || grams < (positive ? 1 : 0) ||
      !origin || typeof origin.value !== 'string' || !['kg', 'lb'].includes(origin.unit) ||
      Object.keys(origin).some(k => !['value', 'unit'].includes(k)) ||
      canonicalGrams(origin.value, origin.unit) !== grams) {
    fail('invalid manually entered ' + name + ' and origin');
  }
};

// Carried derived grams must be the *exact* product of a verified sealed
// predecessor. A self-described opening with sourceEventId: 'nope' is not
// evidence. Callers must supply the prior opening and its real event stream
// (not a mutable projection), or the operation stops here.
function carriedDerivedProvenance(opening, key, current, priorSealedBlock) {
  if (!priorSealedBlock || typeof priorSealedBlock !== 'object' ||
      !priorSealedBlock.opening || !Array.isArray(priorSealedBlock.events)) {
    fail('carried DERIVED provenance needs verified sealed predecessor');
  }
  const verified = createNextBB2Opening(priorSealedBlock.opening,
    priorSealedBlock.events, opening.blockId);
  if (!equal(verified, opening) || !equal(verified.progress[key], current)) {
    fail('carried DERIVED provenance disagrees with sealed predecessor');
  }
}

function validateBB2NewStart(opening, previousEvents, setup, startEvent,
  { priorSealedBlock } = {}) {
  validateBB2Setup(setup);
  if (!startEvent || startEvent.type !== 'WORKOUT_STARTED' ||
      !['NORMAL', 'EXTRA_NORMAL'].includes(startEvent.kind)) {
    fail('expected NORMAL or EXTRA_NORMAL Start; recovery needs separate planner');
  }
  if (startEvent.blockId !== opening?.blockId ||
      startEvent.commitOrdinal !== previousEvents.length + 1) {
    fail('Start block or head is stale');
  }
  const projection = foldBB2Block(opening, previousEvents);
  if (projection.sealed || projection.requiredConsent.length) {
    fail('Start blocked by seal or unresolved consent');
  }
  const expected = getBB2TemplatePrescription(setup, startEvent.templateId);
  if (!Array.isArray(startEvent.slots) || startEvent.slots.length !== expected.slots.length) {
    fail('Start does not match prescribed catalogue slot count');
  }
  for (let i = 0; i < expected.slots.length; i++) {
    const prescribed = expected.slots[i];
    const recorded = startEvent.slots[i];
    if (!recorded || ['roleSlotId', 'exerciseId', 'sets', 'floor', 'ceiling', 'equipment']
      .some(k => recorded[k] !== prescribed[k])) {
      fail('Start slot/order/range differs from versioned catalogue at index ' + i);
    }
    const allowed = ['roleSlotId', 'exerciseId', 'sets', 'floor', 'ceiling', 'equipment',
      'plannedG', 'plannedOrigin', 'incrementG', 'incrementOrigin', 'variation', 'assistance'];
    if (Object.keys(recorded).some(k => !allowed.includes(k))) {
      fail('Start slot contains a non-catalogue field');
    }
    const key = identity(startEvent.templateId, recorded.roleSlotId, recorded.exerciseId);
    const previous = projection.progress[key];
    const plannedExists = own(recorded, 'plannedG');

    if (prescribed.equipment === 'loaded') {
      if (!plannedExists || own(recorded, 'variation') || own(recorded, 'assistance')) {
        fail('loaded Start needs a canonical load without qualitative assistance');
      }
    } else if (typeof recorded.variation !== 'string' || !recorded.variation.trim() ||
        typeof recorded.assistance !== 'string') {
      fail('bodyweight Start needs explicit variation and assistance');
    }

    if (previous) {
      if ((recorded.plannedG ?? null) !== previous.loadG ||
          !equal(recorded.plannedOrigin ?? null, previous.loadOrigin)) {
        fail('Start must inherit current derived prescription exactly');
      }
      if (prescribed.equipment === 'bodyweight' &&
          ((previous.variation !== null && recorded.variation !== previous.variation) ||
           (previous.assistance !== null && recorded.assistance !== previous.assistance))) {
        fail('bodyweight identity change needs an explicit prior decision');
      }
      if (prescribed.equipment === 'loaded' || recorded.incrementG !== undefined) {
        if (recorded.incrementG !== previous.incrementG ||
            !equal(recorded.incrementOrigin, previous.incrementOrigin)) {
          fail('Start must inherit saved progression increment');
        }
      } else if (own(recorded, 'incrementOrigin')) fail('orphan increment origin');
      if (previous.loadOrigin?.kind === 'DERIVED') {
        const source = previousEvents.find(e => e.eventId === previous.loadOrigin.sourceEventId);
        if (!source) carriedDerivedProvenance(opening, key,
          opening.progress[key], priorSealedBlock);
        else if (!['WORKOUT_FINISHED', 'CHOICE_RESOLVED'].includes(source.type)) {
          fail('DERIVED source is not an earning event');
        } else {
          const before = foldBB2Block(opening, previousEvents.slice(0, source.commitOrdinal - 1));
          const after = foldBB2Block(opening, previousEvents.slice(0, source.commitOrdinal));
          const result = after.progress[key];
          if (!equal(result?.loadOrigin, previous.loadOrigin) ||
              result.loadG === (before.progress[key]?.loadG ?? null)) {
            fail('DERIVED source does not earn this load');
          }
        }
      }
    } else {
      if (plannedExists) enteredMass(recorded.plannedG, recorded.plannedOrigin, 'new load');
      else if (own(recorded, 'plannedOrigin')) fail('orphan qualitative origin');
      // An initial loaded movement requires explicit entered increments;
      // do not synthesise false entered kg or quietly inherit BB1 settings.
      if (recorded.incrementG !== undefined) {
        enteredMass(recorded.incrementG, recorded.incrementOrigin, 'new increment', true);
      } else if (prescribed.equipment === 'loaded') fail('loaded Start needs explicit increment');
      else if (own(recorded, 'incrementOrigin')) fail('orphan increment origin');
    }
  }
  return projection;
}

function commitBB2Start(opening, previousEvents, setup, startEvent, guard, evidence) {
  if (guard?.activeWorkout !== false) fail('Start requires explicit inactive-workout guard');
  validateBB2NewStart(opening, previousEvents, setup, startEvent, evidence);
  return commitBB2Transaction(opening, previousEvents, [startEvent], guard);
}

module.exports = { validateBB2NewStart, commitBB2Start };
