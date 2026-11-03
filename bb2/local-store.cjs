/* BB2 Stage (ii) — dormant, owner-scoped, single-key local writer.
 * Host supplies localStorage-like I/O AND a true exclusive cross-tab lock.
 * No globals, BB1 state, network, cloud payload, or runtime registration.
 */
'use strict';

const { createBB2Opening, foldBB2Block, planBB2Finish,
  commitBB2Transaction } = require('./ledger.cjs');
const { createBB2Setup, validateBB2Setup } = require('./catalogue.cjs');
const { commitBB2Start } = require('./start.cjs');
const { validateBB2RestoredBlock, bb2FinishRevisionKey } = require('./restore.cjs');

const VERSION = 1;
const PREFIX = 'bvom.bb2.local.v1.';
const fail = message => { throw Error('BB2 local: ' + message); };
const copy = value => JSON.parse(JSON.stringify(value));
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const only = (value, fields, label) => {
  if (!plain(value) || Object.keys(value).some(k => !fields.includes(k))) {
    fail('invalid or unknown ' + label + ' field');
  }
};
// Backup/JSON object property order is not a setup change. Array order still
// matters; this comparison never mutates the saved setup or its revision.
const equal = (a, b) => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) &&
    Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (!plain(a) || !plain(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length &&
    keys.every(k => own(b, k) && equal(a[k], b[k]));
};

function validateEnvelope(envelope, ownerId) {
  only(envelope, ['storeVersion', 'ownerId', 'revision', 'setup', 'opening',
    'events', 'finishKeys'], 'saved envelope');
  if (envelope.storeVersion !== VERSION || envelope.ownerId !== ownerId ||
      !Number.isSafeInteger(envelope.revision) || envelope.revision < 0) {
    fail('storage version, owner or revision mismatch');
  }
  validateBB2Setup(envelope.setup);
  if (envelope.opening?.ownerId !== ownerId || !Array.isArray(envelope.events)) {
    fail('foreign or malformed saved BB2 ledger');
  }
  const projection = validateBB2RestoredBlock(envelope.opening, envelope.events);
  only(envelope.finishKeys, Object.keys(envelope.finishKeys || {}), 'Finish keys');
  for (const [key, marker] of Object.entries(envelope.finishKeys)) {
    let tuple;
    try { tuple = JSON.parse(key); } catch { fail('malformed Finish key'); }
    if (!Array.isArray(tuple) || tuple.length !== 3 ||
        bb2FinishRevisionKey(...tuple) !== key ||
        tuple[0] !== envelope.opening.blockId || tuple[2] > envelope.revision) {
      fail('invalid stored Finish key identity');
    }
    only(marker, ['outcome', 'committedHead'], 'Finish marker');
    if (!['FINISH', 'INCOMPLETE'].includes(marker.outcome) ||
        !Number.isSafeInteger(marker.committedHead) || marker.committedHead < 1 ||
        marker.committedHead > envelope.events.length ||
        !envelope.events.slice(0, marker.committedHead).some(e =>
          e.sessionId === tuple[1] && e.type ===
            (marker.outcome === 'FINISH' ? 'WORKOUT_FINISHED' : 'WORKOUT_INCOMPLETE'))) {
      fail('orphan or invalid stored Finish marker');
    }
  }
  return projection;
}

function createBB2LocalStore({ storage, ownerId, withExclusiveLock }) {
  if (typeof ownerId !== 'string' || !ownerId.trim() || ownerId.includes('|')) {
    fail('invalid owner identity');
  }
  if (!storage || typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function' || typeof withExclusiveLock !== 'function') {
    fail('storage and an exclusive lock provider are required');
  }
  const key = PREFIX + encodeURIComponent(ownerId);
  const read = () => {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return null;
    let saved;
    try { saved = JSON.parse(raw); } catch { fail('corrupt local BB2 JSON'); }
    validateEnvelope(saved, ownerId);
    return saved;
  };
  const publish = envelope => {
    validateEnvelope(envelope, ownerId);
    const serialized = JSON.stringify(envelope);
    try { storage.setItem(key, serialized); }
    catch { fail('LOCAL WRITE FAILED OR UNCERTAIN; re-read before retry'); }
    let readback;
    try { readback = storage.getItem(key); }
    catch { fail('LOCAL WRITE UNVERIFIED; re-read before retry'); }
    if (readback !== serialized) fail('LOCAL WRITE UNVERIFIED; re-read before retry');
    return { snapshot: copy(envelope), noOp: false };
  };
  const locked = fn => withExclusiveLock(key, fn);
  const getRequired = () => {
    const saved = read();
    if (!saved) fail('local BB2 setup has not been persisted');
    return saved;
  };
  const requireRevision = (saved, expectedRevision) => {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== saved.revision) {
      fail('stale local revision');
    }
  };
  const guardFor = (saved, activeWorkout) => ({
    ownerId, blockId: saved.opening.blockId,
    foldRulesVersion: saved.opening.foldRulesVersion,
    expectedHead: saved.events.length,
    sealRevision: foldBB2Block(saved.opening, saved.events).sealRevision,
    activeWorkout
  });

  return Object.freeze({
    key,
    read: () => { const value = read(); return value ? copy(value) : null; },

    initialize: (blockId, setup = createBB2Setup()) => locked(async () => {
      const existing = read();
      if (existing) {
        if (existing.opening.blockId !== blockId) fail('cannot silently replace existing block');
        return { snapshot: copy(existing), noOp: true };
      }
      validateBB2Setup(setup);
      const opening = createBB2Opening({ ownerId, blockId });
      return publish({ storeVersion: VERSION, ownerId, revision: 0,
        setup: copy(setup), opening, events: [], finishKeys: {} });
    }),

    saveSetup: (setup, { expectedRevision, activeWorkout } = {}) => locked(async () => {
      const saved = getRequired(); requireRevision(saved, expectedRevision);
      if (activeWorkout !== false ||
          saved.events.some(e => e.type === 'WORKOUT_STARTED' &&
            !saved.events.some(x => x.sessionId === e.sessionId &&
              ['WORKOUT_FINISHED', 'WORKOUT_INCOMPLETE', 'WORKOUT_DISCARDED'].includes(x.type)))) {
        fail('cannot change setup during active workout');
      }
      validateBB2Setup(setup);
      if (equal(saved.setup, setup)) return { snapshot: copy(saved), noOp: true };
      return publish({ ...saved, revision: saved.revision + 1, setup: copy(setup) });
    }),

    commitStart: (startEvent, { expectedRevision, activeWorkout, priorSealedBlock } = {}) => locked(async () => {
      const saved = getRequired(); requireRevision(saved, expectedRevision);
      const transaction = commitBB2Start(saved.opening, saved.events, saved.setup,
        startEvent, guardFor(saved, activeWorkout), { priorSealedBlock });
      return publish({ ...saved, revision: saved.revision + 1, events: transaction.events });
    }),

    appendEvents: (proposedEvents, { expectedRevision, activeWorkout } = {}) => locked(async () => {
      const saved = getRequired(); requireRevision(saved, expectedRevision);
      if (!Array.isArray(proposedEvents) || proposedEvents.some(e =>
          ['WORKOUT_STARTED', 'WORKOUT_FINISHED', 'CREDIT_GRANTED', 'BLOCK_SEALED'].includes(e?.type))) {
        fail('Start, Finish, first credit or Seal bypasses its guarded planner');
      }
      const transaction = commitBB2Transaction(saved.opening, saved.events,
        proposedEvents, guardFor(saved, activeWorkout));
      return publish({ ...saved, revision: saved.revision + 1, events: transaction.events });
    }),

    commitFinish: (sessionId, outcome, { expectedRevision, eventRevision, activeWorkout } = {}) => locked(async () => {
      const saved = getRequired();
      const finishKey = bb2FinishRevisionKey(saved.opening.blockId, sessionId, eventRevision);
      if (own(saved.finishKeys, finishKey)) return { snapshot: copy(saved), noOp: true };
      requireRevision(saved, expectedRevision);
      if (eventRevision !== saved.revision) fail('Finish event revision does not match saved state');
      const planned = planBB2Finish(saved.opening, saved.events, sessionId, outcome);
      if (planned.noOp) return { snapshot: copy(saved), noOp: true };
      const proposed = planned.events.slice(saved.events.length);
      const transaction = commitBB2Transaction(saved.opening, saved.events, proposed,
        guardFor(saved, activeWorkout));
      const finishKeys = { ...saved.finishKeys, [finishKey]: {
        outcome, committedHead: transaction.events.length
      } };
      return publish({ ...saved, revision: saved.revision + 1,
        events: transaction.events, finishKeys });
    })
  });
}

module.exports = { VERSION, PREFIX, validateEnvelope, createBB2LocalStore };
