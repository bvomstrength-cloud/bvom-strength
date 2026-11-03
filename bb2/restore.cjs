/* BB2 Stage (ii) — pure restore/import validation boundary.
 * Runs the frozen replay, then proves that an originally credit-eligible
 * NORMAL Finish carries its paired first credit event immediately after it.
 * Persistence remains responsible for saving both events atomically.
 */
'use strict';
const { foldBB2Block } = require('./ledger.cjs');
const fail = message => { throw Error('BB2 restore: ' + message); };

function validateBB2RestoredBlock(opening, chronologicalEvents) {
  // All closed-schema, ordinal, seal, consent, correction and credit rules
  // still come from the frozen Stage (i) replay.
  const final = foldBB2Block(opening, chronologicalEvents);
  const starts = new Map();
  for (const event of chronologicalEvents) {
    if (event.type === 'WORKOUT_STARTED') starts.set(event.sessionId, event);
    if (event.type !== 'WORKOUT_FINISHED') continue;
    const start = starts.get(event.sessionId);
    if (start?.kind !== 'NORMAL') continue;

    // Check eligibility using the original Finish ordinal. A correction
    // recorded later may revoke eligibility and its credit legitimately;
    // comparing against today's final history would misclassify that pair.
    const atFinish = foldBB2Block(opening,
      chronologicalEvents.slice(0, event.commitOrdinal));
    const status = atFinish.history.find(x => x.sessionId === event.sessionId)?.status;
    if (status !== 'COMPLETED_NORMAL_NONCREDIT' || atFinish.quotas[start.templateId] >= 8) {
      continue;
    }
    const paired = chronologicalEvents[event.commitOrdinal];
    if (!paired || paired.type !== 'CREDIT_GRANTED' ||
        paired.sessionId !== event.sessionId) {
      fail('eligible NORMAL Finish has no adjacent paired credit');
    }
  }
  return final;
}

// Collision-free durable identifier material. The caller must persist this
// alongside the event append; computing a key is NOT durable idempotence by
// itself. No wall-clock, randomness, or cross-device state is used here.
function bb2FinishRevisionKey(blockId, sessionId, eventRevision) {
  for (const [label, id] of [['block', blockId], ['session', sessionId]]) {
    if (typeof id !== 'string' || !id.trim() || id.includes('|')) fail('invalid ' + label + ' ID');
  }
  if (!Number.isSafeInteger(eventRevision) || eventRevision < 0) fail('invalid event revision');
  return JSON.stringify([blockId, sessionId, eventRevision]);
}

module.exports = { validateBB2RestoredBlock, bb2FinishRevisionKey };
