/* GENERATED BB2 browser core — no direct edits. */
/* Source fingerprint SHA-256: 58f7a4d4c4a17ce7ef829562d465a6efd1f0f10e911604d373c3150aecd9a0c8 */
/* Regenerate: node scripts/build-bb2-browser.cjs */
/* Import has no app, storage, network or clock side effects. */
const factories = Object.create(null);
factories["./ledger.cjs"] = function (module, exports, require) {
/* BVOM BB2 Stage (i) — pure, local-only engine. Rev 3.5.1, fold rules v1.
 * No calls into the shipped app, BB1 state, storage, network, or cloud.
 */
'use strict';

const SCHEMA_VERSION = 1;
const FOLD_RULES_VERSION = 1;
const TEMPLATES = Object.freeze(['upper_a', 'lower_a', 'upper_b', 'lower_b']);
const EVENT_TYPES = Object.freeze([
  'BLOCK_CREATED', 'BLOCK_SEALED', 'WORKOUT_STARTED', 'EXERCISE_LOCKED',
  'CALIBRATION_PLAN_REVISED', 'CALIBRATION_ACCEPTED', 'SET_RECORDED',
  'EXTRA_SET_RECORDED', 'SET_CORRECTED', 'SET_VOIDED', 'WORKOUT_FINISHED',
  'WORKOUT_INCOMPLETE', 'WORKOUT_DISCARDED', 'SESSION_VOIDED',
  'CHOICE_RESOLVED', 'CHOICE_RECLASSIFIED', 'CHOICE_REPLACED',
  'PRESCRIPTION_EDITED', 'INCREMENT_EDITED', 'VARIATION_EDITED',
  'EXERCISE_SWAPPED', 'STALL_REDUCTION_ACCEPTED', 'UNIT_METADATA',
  'CREDIT_GRANTED', 'CREDIT_REVOKED', 'CREDIT_REGRANTED',
  'HISTORY_HIDDEN', 'HISTORY_UNHIDDEN', 'NOTE_EDITED',
  'STALL_OFFER_DISMISSED', 'TOMBSTONE'
]);
const TYPES = new Set(EVENT_TYPES);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clone = x => JSON.parse(JSON.stringify(x));
const fail = message => { throw new Error(`BB2: ${message}`); };
// Closed v1 payloads: imported/restored events may not smuggle unrecognised
// training inputs into saved session plans or future versioned projections.
const EVENT_FIELDS = Object.freeze({
  BLOCK_CREATED: ['ownerId', 'schemaVersion', 'foldRulesVersion', 'openingSnapshotVersion'],
  BLOCK_SEALED: ['sealId'],
  WORKOUT_STARTED: ['sessionId', 'templateId', 'kind', 'slots'],
  EXERCISE_LOCKED: ['sessionId', 'roleSlotId', 'exerciseId', 'plannedG', 'plannedOrigin',
    'incrementG', 'incrementOrigin', 'equipment', 'sets', 'floor', 'ceiling', 'variation', 'assistance'],
  CALIBRATION_PLAN_REVISED: ['sessionId', 'roleSlotId', 'exerciseId', 'plannedG', 'plannedOrigin'],
  CALIBRATION_ACCEPTED: ['sessionId', 'roleSlotId', 'exerciseId', 'loadG', 'loadOrigin'],
  SET_RECORDED: ['sessionId', 'roleSlotId', 'exerciseId', 'setIndex', 'reps', 'prescribed',
    'actualG', 'actualOrigin', 'variation', 'assistance', 'harderThanIntended'],
  EXTRA_SET_RECORDED: ['sessionId', 'roleSlotId', 'exerciseId', 'setIndex', 'reps', 'prescribed',
    'actualG', 'actualOrigin', 'variation', 'assistance', 'harderThanIntended'],
  SET_CORRECTED: ['sessionId', 'targetEventId', 'roleSlotId', 'exerciseId', 'setIndex',
    'reps', 'actualG', 'actualOrigin', 'variation', 'assistance', 'harderThanIntended'],
  SET_VOIDED: ['sessionId', 'targetEventId', 'roleSlotId', 'exerciseId', 'setIndex'],
  WORKOUT_FINISHED: ['sessionId'],
  WORKOUT_INCOMPLETE: ['sessionId'],
  WORKOUT_DISCARDED: ['sessionId'],
  SESSION_VOIDED: ['sessionId'],
  CHOICE_RESOLVED: ['sourceSessionId', 'sourceBlockId', 'roleSlotId', 'exerciseId',
    'decision', 'loadG', 'loadOrigin', 'variation', 'assistance',
    'addedWeightG', 'addedWeightOrigin'],
  CHOICE_RECLASSIFIED: ['targetEventId', 'decision'],
  CHOICE_REPLACED: ['targetEventId', 'sourceSessionId', 'sourceBlockId',
    'roleSlotId', 'exerciseId', 'decision', 'loadG', 'loadOrigin',
    'variation', 'assistance'],
  PRESCRIPTION_EDITED: ['sessionId', 'templateId', 'roleSlotId', 'exerciseId',
    'scope', 'loadG', 'loadOrigin'],
  INCREMENT_EDITED: ['sessionId', 'templateId', 'roleSlotId', 'exerciseId',
    'scope', 'incrementG', 'incrementOrigin'],
  VARIATION_EDITED: ['sessionId', 'templateId', 'roleSlotId', 'exerciseId',
    'scope', 'variation', 'assistance'],
  EXERCISE_SWAPPED: ['templateId', 'roleSlotId', 'exerciseId'],
  STALL_REDUCTION_ACCEPTED: ['sessionId', 'templateId', 'roleSlotId', 'exerciseId',
    'scope', 'loadG', 'loadOrigin', 'offerEpochId', 'offerStallCount'],
  UNIT_METADATA: ['unit'],
  CREDIT_GRANTED: ['sessionId', 'creditId'],
  CREDIT_REVOKED: ['sessionId', 'creditId'],
  CREDIT_REGRANTED: ['sessionId', 'creditId'],
  HISTORY_HIDDEN: ['sessionId'],
  HISTORY_UNHIDDEN: ['sessionId'],
  NOTE_EDITED: ['sessionId', 'text'],
  STALL_OFFER_DISMISSED: ['templateId', 'roleSlotId', 'exerciseId', 'epochId', 'stallCount'],
  TOMBSTONE: ['discardedSessionId']
});
const onlyFields = (object, names, context) => {
  const allowed = new Set(names);
  for (const key of Object.keys(object)) if (!allowed.has(key)) {
    fail(`unknown ${context} field: ${key}`);
  }
};
// Backup and JSONB object key order is not a training-state mutation.
// Compare JSON values structurally, preserving array order and exact scalars.
const sameCanonicalValue = (a, b) => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) &&
      a.length === b.length && a.every((v, i) => sameCanonicalValue(v, b[i]));
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a), other = Object.keys(b);
  return keys.length === other.length &&
    keys.every(key => own(b, key) && sameCanonicalValue(a[key], b[key]));
};
// Pipe is reserved for the stable template/slot/exercise and set-record keys.
// Allowing it inside an ID makes distinct session or exercise records alias.
const positiveId = (x, name) => {
  if (typeof x !== 'string' || !x.trim() || x.includes('|')) fail(`invalid ${name}`);
  return x;
};
const integer = (x, name, min = 0) => { if (!Number.isSafeInteger(x) || x < min) fail(`invalid ${name}`); return x; };
const identity = (templateId, roleSlotId, exerciseId) => {
  if (!TEMPLATES.includes(templateId)) fail('invalid BB2 template');
  return [templateId, positiveId(roleSlotId, 'slot'), positiveId(exerciseId, 'exercise')].join('|');
};

// Decimal arithmetic, no dependence on binary float equality. 1 lb = 453.59237 g.
function decimalParts(value) {
  const s = String(value).trim();
  if (!/^(?:\d+)(?:\.\d+)?$/.test(s)) fail('invalid decimal load');
  const [whole, fraction = ''] = s.split('.');
  return { n: BigInt(whole + fraction), d: 10n ** BigInt(fraction.length) };
}
function canonicalGrams(value, unit) {
  const { n, d } = decimalParts(value);
  if (!['kg', 'lb'].includes(unit)) fail('invalid mass unit');
  const numerator = n * (unit === 'kg' ? 1000n : 45359237n);
  const denominator = d * (unit === 'kg' ? 1n : 100000n);
  const grams = (numerator * 2n + denominator) / (2n * denominator);
  if (grams > BigInt(Number.MAX_SAFE_INTEGER)) fail('mass overflow');
  return Number(grams);
}
function sameDecimal(a, b) {
  const x = decimalParts(a), y = decimalParts(b);
  return x.n * y.d === y.n * x.d;
}
// Numeric event inputs carry the user's *entered* decimal and unit. A derived
// future prescription instead identifies the event that computed it. Never
// reconstruct an entered unit from a rounded canonical magnitude.
function validateMassOrigin(grams, origin, name, allowDerived = false) {
  integer(grams, `${name} grams`);
  if (allowDerived && origin?.kind === 'DERIVED') {
    onlyFields(origin, ['kind', 'sourceEventId'], `${name} origin`);
    positiveId(origin.sourceEventId, `${name} derived source`);
  } else if (!origin || typeof origin.value !== 'string' ||
    !['kg', 'lb'].includes(origin.unit) || canonicalGrams(origin.value, origin.unit) !== grams) {
    fail(`invalid ${name} origin`);
  } else {
    onlyFields(origin, ['value', 'unit'], `${name} origin`);
  }
  return clone(origin);
}
function resolveNumericSubmission(original, submitted, unit, intent) {
  if (!['PRESCRIPTION', 'ACTUAL', 'DIFFERENT_ACTUAL', 'INCREMENT'].includes(intent)) fail('invalid numeric intent');
  if (!original || !Number.isSafeInteger(original.grams)) fail('invalid canonical origin');
  // A calculated future load has DERIVED provenance, not a fictional typed
  // decimal. The UI can pass the saved origin object directly, while older
  // entered-load callers retain their originalValue/originalUnit interface.
  const savedOrigin = original.origin ||
    { value: String(original.originalValue), unit: original.originalUnit };
  validateMassOrigin(original.grams, savedOrigin, 'canonical', true);
  if (intent !== 'DIFFERENT_ACTUAL' && unit === original.unit && sameDecimal(submitted, original.displayed)) {
    return { grams: original.grams,
      origin: clone(savedOrigin),
      inherited: true, emitEvent: false };
  }
  if (intent === 'ACTUAL') fail('different actual requires explicit different-actual control');
  const grams = canonicalGrams(submitted, unit);
  const unchanged = (intent === 'PRESCRIPTION' || intent === 'INCREMENT') && grams === original.grams;
  return { grams: unchanged ? original.grams : grams,
    origin: unchanged ? clone(savedOrigin) :
      { value: String(submitted), unit },
    inherited: unchanged, emitEvent: !unchanged };
}

function createBB2Opening({ ownerId, blockId, progress = {}, sealRevision = 0 } = {}) {
  positiveId(ownerId, 'owner'); positiveId(blockId, 'block');
  integer(sealRevision, 'seal revision');
  return {
    schemaVersion: SCHEMA_VERSION, foldRulesVersion: FOLD_RULES_VERSION,
    openingSnapshotVersion: 1, ownerId, blockId, sealRevision,
    progress: clone(progress), pending: {}, previousQuotas: null, previousCreditIds: [], sealed: false
  };
}
function validateOpening(opening) {
  if (!opening || opening.schemaVersion !== SCHEMA_VERSION || opening.openingSnapshotVersion !== 1) fail('unsupported schema version');
  onlyFields(opening, ['schemaVersion', 'foldRulesVersion', 'openingSnapshotVersion',
    'ownerId', 'blockId', 'sealRevision', 'progress', 'pending', 'previousQuotas',
    'previousCreditIds', 'sealed', 'previousSealId', 'previousBlockId',
    'previousSchemaVersion', 'previousFoldRulesVersion',
    'previousOpeningSnapshotVersion', 'selections'], 'opening snapshot');
  if (opening.foldRulesVersion !== FOLD_RULES_VERSION) fail('unsupported foldRulesVersion');
  positiveId(opening.ownerId, 'owner'); positiveId(opening.blockId, 'block');
  integer(opening.sealRevision, 'seal revision');
  if (opening.sealed !== false) fail('opening snapshot must be unsealed');
  if (opening.previousSealId !== undefined) {
    positiveId(opening.previousSealId, 'previous seal');
    positiveId(opening.previousBlockId, 'previous block');
    if (opening.previousBlockId === opening.blockId) fail('next block must have a fresh ID');
    if (!opening.previousQuotas || !TEMPLATES.every(t => opening.previousQuotas[t] === 8)) fail('invalid prior quotas');
    if (!Array.isArray(opening.previousCreditIds) || opening.previousCreditIds.length !== 32 ||
        new Set(opening.previousCreditIds).size !== 32) fail('invalid prior credit IDs');
    opening.previousCreditIds.forEach(id => positiveId(id, 'previous credit'));
    if (opening.sealRevision < 1) fail('missing previous seal revision');
    if (opening.previousSchemaVersion !== SCHEMA_VERSION ||
        opening.previousFoldRulesVersion !== FOLD_RULES_VERSION ||
        opening.previousOpeningSnapshotVersion !== 1) fail('invalid prior snapshot version');
  }
  if (!opening.progress || typeof opening.progress !== 'object' || Array.isArray(opening.progress)) fail('invalid opening progress');
  for (const [key, item] of Object.entries(opening.progress)) {
    const parts = key.split('|');
    if (parts.length !== 3) fail('invalid opening progression identity');
    identity(...parts);
    initialProgress(item);
  }
  if (opening.selections !== undefined) {
    if (!opening.selections || typeof opening.selections !== 'object' ||
        Array.isArray(opening.selections)) fail('invalid opening selections');
    for (const [key, exerciseId] of Object.entries(opening.selections)) {
      const parts = key.split('|');
      if (parts.length !== 2 || !TEMPLATES.includes(parts[0]) ||
          !parts[1].trim() || typeof exerciseId !== 'string' ||
          !exerciseId.trim() || exerciseId.includes('|')) {
        fail('invalid opening selection identity');
      }
    }
  }
  if (!opening.pending || typeof opening.pending !== 'object' || Array.isArray(opening.pending)) {
    fail('invalid opening pending decisions');
  }
  if (Object.keys(opening.pending).length && !opening.previousSealId) {
    fail('pending decisions lack previous sealed block');
  }
  for (const [key, offer] of Object.entries(opening.pending)) {
    const parts = key.split('|');
    if (parts.length !== 3 || !TEMPLATES.includes(parts[0]) ||
        parts.some(x => !x.trim()) || !own(opening.progress, key) ||
        !offer || typeof offer !== 'object' || Array.isArray(offer)) {
      fail('invalid carried pending identity');
    }
    positiveId(offer.sourceBlockId, 'carried source block');
    positiveId(offer.sessionId, 'carried source session');
    if (offer.kind === 'OFF_PLAN') {
      onlyFields(offer, ['kind', 'sourceBlockId', 'sessionId', 'valueG',
        'plannedG', 'sourceRepSum', 'sourceAllTop'], 'carried pending');
      integer(offer.valueG, 'carried offered grams');
      integer(offer.plannedG, 'carried planned grams');
      integer(offer.sourceRepSum, 'carried source rep sum', 1);
      if (typeof offer.sourceAllTop !== 'boolean') fail('invalid carried top-set evidence');
    } else if (offer.kind === 'DIFFICULTY') {
      onlyFields(offer, ['kind', 'sourceBlockId', 'sessionId', 'variation',
        'assistance', 'addedWeightG'], 'carried pending');
      positiveId(offer.variation, 'carried variation');
      if (typeof offer.assistance !== 'string') fail('invalid carried assistance');
      if (offer.addedWeightG !== undefined) integer(offer.addedWeightG, 'carried added weight');
    } else fail('invalid carried decision kind');
  }
}
function validateEventPayload(e) {
  // Keep the established privacy-specific Tombstone error for restored
  // evidence, while the existing Tombstone branch enforces the same key set.
  if (e.type !== 'TOMBSTONE') {
    onlyFields(e, ['type', 'eventId', 'commitOrdinal', 'blockId', ...EVENT_FIELDS[e.type]],
      `${e.type} event`);
  }
  const mass = (name, field, originField, allowDerived = false) =>
    validateMassOrigin(e[field], e[originField], name, allowDerived);
  switch (e.type) {
    case 'WORKOUT_STARTED':
      positiveId(e.sessionId, 'session');
      if (!Array.isArray(e.slots) || !e.slots.length) fail('missing session slots');
      e.slots.forEach(validateSlot);
      break;
    case 'EXERCISE_LOCKED':
      positiveId(e.sessionId, 'session');
      // A qualitative bodyweight variation deliberately has no numeric
      // working load. Its lock records identity/order, not fictitious kg.
      // When numeric, original magnitude/unit evidence remains mandatory.
      if (e.plannedG !== undefined) mass('planned', 'plannedG', 'plannedOrigin', true);
      else if (e.plannedOrigin !== undefined) fail('qualitative lock cannot have numeric origin');
      break;
    case 'CALIBRATION_PLAN_REVISED': mass('planned', 'plannedG', 'plannedOrigin'); break;
    case 'STALL_REDUCTION_ACCEPTED':
      mass('working load', 'loadG', 'loadOrigin');
      positiveId(e.offerEpochId, 'stall reduction source epoch');
      integer(e.offerStallCount, 'stall reduction source count', 4);
      break;
    case 'CALIBRATION_ACCEPTED':
    case 'PRESCRIPTION_EDITED':
    case 'CHOICE_RESOLVED':
    case 'CHOICE_REPLACED':
      if (e.loadG !== undefined) mass('working load', 'loadG', 'loadOrigin');
      else if (e.loadOrigin !== undefined) fail('working load origin requires numeric load');
      break;
    case 'INCREMENT_EDITED': mass('increment', 'incrementG', 'incrementOrigin'); break;
    case 'SET_RECORDED':
    case 'EXTRA_SET_RECORDED':
    case 'SET_CORRECTED':
      if (e.actualG !== undefined) mass('actual', 'actualG', 'actualOrigin', true);
      else if (e.actualOrigin !== undefined) fail('actual origin requires numeric load');
      break;
    case 'NOTE_EDITED':
      if (typeof e.text !== 'string') fail('invalid note text');
      break;
    case 'STALL_OFFER_DISMISSED':
      if (!TEMPLATES.includes(e.templateId)) fail('invalid stall offer template');
      positiveId(e.roleSlotId, 'stall offer slot');
      positiveId(e.exerciseId, 'stall offer exercise');
      positiveId(e.epochId, 'stall offer epoch');
      integer(e.stallCount, 'stall offer count', 4);
      break;
    case 'UNIT_METADATA':
      if (!['kg', 'lb'].includes(e.unit)) fail('invalid display unit metadata');
      break;
    case 'BLOCK_CREATED':
      positiveId(e.ownerId, 'creator owner');
      integer(e.schemaVersion, 'block created schema version', 1);
      integer(e.foldRulesVersion, 'block created rules version', 1);
      integer(e.openingSnapshotVersion, 'block created snapshot version', 1);
      break;
    case 'BLOCK_SEALED': positiveId(e.sealId, 'seal ID'); break;
    case 'WORKOUT_DISCARDED': positiveId(e.sessionId, 'discarded session'); break;
    case 'TOMBSTONE':
      positiveId(e.discardedSessionId, 'discarded session');
      if (Object.keys(e).some(k => !['type', 'eventId', 'commitOrdinal', 'blockId', 'discardedSessionId'].includes(k))) {
        fail('tombstone cannot retain discarded session content');
      }
      break;
    default: break;
  }
  if (['SET_RECORDED', 'EXTRA_SET_RECORDED', 'SET_CORRECTED'].includes(e.type) &&
      own(e, 'harderThanIntended') && typeof e.harderThanIntended !== 'boolean') {
    fail('invalid harder-than-intended flag');
  }
  if (e.addedWeightG !== undefined) mass('added weight', 'addedWeightG', 'addedWeightOrigin');
}
function validateEvents(opening, events) {
  if (!Array.isArray(events)) fail('events must be an array');
  const ids = new Set();
  const acceptedChoices = new Map(), revisedChoices = new Set();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e || !TYPES.has(e.type)) fail('unsupported event type');
    positiveId(e.eventId, 'event ID');
    if (ids.has(e.eventId)) fail('duplicate event ID');
    ids.add(e.eventId);
    if (e.commitOrdinal !== i + 1) fail('missing, duplicate or non-consecutive event ordinal');
    if (e.blockId !== opening.blockId) fail('wrong block ID');
    validateEventPayload(e);
    // Consent revisions must identify exactly one earlier accepted choice;
    // a forged/duplicate target cannot erase historical consent obligations.
    if (e.type === 'CHOICE_RESOLVED' &&
        ['ACCEPT', 'DIFFICULTY_ACCEPT'].includes(e.decision)) {
      acceptedChoices.set(e.eventId, e);
    }
    if (e.type === 'CHOICE_RECLASSIFIED' || e.type === 'CHOICE_REPLACED') {
      const source = acceptedChoices.get(e.targetEventId);
      if (!source) fail('choice revision must target a prior ACCEPT');
      if (revisedChoices.has(e.targetEventId)) fail('duplicate choice revision');
      if (e.type === 'CHOICE_REPLACED') {
        if (e.decision !== 'REPLACE' ||
            e.sourceSessionId !== source.sourceSessionId ||
            e.roleSlotId !== source.roleSlotId ||
            e.exerciseId !== source.exerciseId) {
          fail('choice replacement source identity mismatch');
        }
        if (e.loadG === undefined) {
          if (source.decision !== 'DIFFICULTY_ACCEPT' || e.loadOrigin !== undefined) {
            fail('qualitative replacement requires a prior difficulty choice');
          }
        } else validateMassOrigin(e.loadG, e.loadOrigin, 'replacement load');
        if (source.decision === 'DIFFICULTY_ACCEPT') {
          positiveId(e.variation, 'replacement difficulty variation');
          if (typeof e.assistance !== 'string') fail('invalid replacement assistance');
        }
      }
      revisedChoices.add(e.targetEventId);
    }
    if (e.type === 'BLOCK_CREATED' &&
        (i !== 0 || e.ownerId !== opening.ownerId ||
         e.schemaVersion !== opening.schemaVersion ||
         e.foldRulesVersion !== opening.foldRulesVersion ||
         e.openingSnapshotVersion !== opening.openingSnapshotVersion)) {
      fail('block creation must match opening at first ordinal');
    }
  }
  // Discard replaces each session-local event with its minimal immutable
  // ID/ordinal tombstone. Neither isolated tombstones nor fake Discards
  // may be accepted as authoritative history.
  const discards = new Map();
  for (const e of events) if (e.type === 'WORKOUT_DISCARDED') {
    if (discards.has(e.sessionId)) fail('duplicate discard');
    discards.set(e.sessionId, e.commitOrdinal);
  }
  const counts = new Map();
  for (const e of events) if (e.type === 'TOMBSTONE') {
    const ordinal = discards.get(e.discardedSessionId);
    if (!ordinal || e.commitOrdinal >= ordinal) fail('unlinked discard tombstone');
    counts.set(e.discardedSessionId, (counts.get(e.discardedSessionId) || 0) + 1);
  }
  for (const id of discards.keys()) if (!counts.has(id)) fail('discard missing tombstones');
  // A discarded ID remains reserved. Every session-scoped event has already
  // been purged to a tombstone; only independently committed GLOBAL edits may
  // retain their session linkage (and their original event ordinal).
  const discardedSessionEvents = new Set([
    'WORKOUT_STARTED', 'EXERCISE_LOCKED', 'CALIBRATION_PLAN_REVISED',
    'CALIBRATION_ACCEPTED', 'SET_RECORDED', 'EXTRA_SET_RECORDED',
    'NOTE_EDITED'
  ]);
  for (const e of events) if (discards.has(e.sessionId) &&
      discardedSessionEvents.has(e.type)) {
    fail('discarded session event must be a tombstone');
  }
}
function initialProgress(v = {}, plan = {}) {
  onlyFields(v, ['loadG', 'loadOrigin', 'incrementG', 'incrementOrigin',
    'variation', 'assistance', 'calibrated', 'bestReps', 'stallCount',
    'epochId', 'lastNormalSessionId'], 'opening progress');
  // Restored/opening progress is authoritative training state. Do not coerce
  // a malformed calibration flag, identity or stall reference into a valid
  // progression record; a backup could otherwise bypass first exposure.
  if (own(v, 'calibrated') && typeof v.calibrated !== 'boolean') fail('invalid calibrated flag');
  if (own(v, 'epochId') && (typeof v.epochId !== 'string' || !v.epochId.trim())) {
    fail('invalid progression epoch');
  }
  if (own(v, 'lastNormalSessionId') && v.lastNormalSessionId !== null) {
    positiveId(v.lastNormalSessionId, 'last normal session');
  }
  if (own(v, 'variation') && v.variation !== null &&
      (typeof v.variation !== 'string' || !v.variation.trim())) {
    fail('invalid progression variation');
  }
  if (own(v, 'assistance') && v.assistance !== null &&
      typeof v.assistance !== 'string') fail('invalid progression assistance');
  if (v.loadOrigin != null && v.loadG == null) fail('orphan progress load origin');
  if (v.incrementOrigin !== undefined && v.incrementG === undefined) {
    fail('orphan progress increment origin');
  }
  const p = {
    loadG: v.loadG ?? plan.plannedG ?? null,
    loadOrigin: v.loadOrigin ?? plan.plannedOrigin ?? null,
    incrementG: v.incrementG ?? plan.incrementG ?? 2500,
    incrementOrigin: v.incrementOrigin ?? plan.incrementOrigin ?? { value: '2.5', unit: 'kg' },
    variation: v.variation ?? plan.variation ?? null,
    assistance: v.assistance ?? plan.assistance ?? null,
    calibrated: !!v.calibrated, bestReps: v.bestReps ?? null,
    stallCount: v.stallCount ?? 0,
    epochId: v.epochId ?? 'opening', lastNormalSessionId: v.lastNormalSessionId ?? null
  };
  if (p.loadG !== null) validateMassOrigin(p.loadG, p.loadOrigin, 'working load', true);
  validateMassOrigin(p.incrementG, p.incrementOrigin, 'increment', true);
  integer(p.incrementG, 'increment grams', 1);
  if (p.bestReps !== null) integer(p.bestReps, 'best reps', 1);
  integer(p.stallCount, 'stall count');
  if (p.bestReps === null && p.stallCount !== 0) fail('stall without baseline');
  return p;
}
function validateSlot(s) {
  onlyFields(s, ['roleSlotId', 'exerciseId', 'sets', 'floor', 'ceiling', 'equipment',
    'plannedG', 'plannedOrigin', 'incrementG', 'incrementOrigin',
    'variation', 'assistance'], 'workout slot');
  positiveId(s.roleSlotId, 'slot'); positiveId(s.exerciseId, 'exercise');
  integer(s.sets, 'prescribed set count', 1); integer(s.ceiling, 'rep ceiling', 1);
  // Historical plans must retain both ends of an explicitly selected rep
  // range. Older Stage (i) fixtures without a floor remain replayable;
  // Stage (ii)'s versioned catalogue will require it for newly saved Starts.
  if (s.floor !== undefined) {
    integer(s.floor, 'rep floor', 1);
    if (s.floor > s.ceiling) fail('rep floor exceeds ceiling');
  }
  if (s.equipment !== 'loaded' && s.equipment !== 'bodyweight') fail('invalid equipment');
  if (s.equipment === 'bodyweight' &&
      (typeof s.variation !== 'string' || !s.variation.trim() ||
       typeof s.assistance !== 'string')) fail('invalid bodyweight slot identity');
  if (s.plannedG === undefined && s.plannedOrigin !== undefined) {
    fail('orphan planned origin');
  }
  if (s.incrementG === undefined && s.incrementOrigin !== undefined) {
    fail('orphan increment origin');
  }
  if (s.plannedG !== undefined) validateMassOrigin(s.plannedG, s.plannedOrigin, 'planned', true);
  if (s.equipment === 'loaded' && s.plannedG === undefined) fail('missing planned grams');
  if (s.incrementG !== undefined) validateMassOrigin(s.incrementG, s.incrementOrigin, 'increment');
  integer(s.incrementG ?? 2500, 'increment grams', 1);
}
function validSet(record, slot) {
  if (!record || !Number.isSafeInteger(record.reps) || record.reps <= 0) return false;
  if (slot.equipment === 'loaded') return Number.isSafeInteger(record.actualG) && record.actualG >= 0;
  // Bodyweight work needs an explicit actual variation and assistance choice,
  // including the explicit 'none' value. Numeric added load must be valid when
  // the selected slot has a numeric plan; qualitative bodyweight variations
  // may omit it, but may never invent an invalid numeric magnitude.
  return typeof record.variation === 'string' && !!record.variation.trim() &&
    typeof record.assistance === 'string' &&
    (record.actualG === undefined
      ? slot.plannedG === undefined
      : Number.isSafeInteger(record.actualG) && record.actualG >= 0);
}
const sessionEligible = s => s.kind === 'NORMAL' || s.kind === 'EXTRA_NORMAL';
const difficultyActuallyChanges = (current, choice) => !!current &&
  (current.variation !== choice.variation ||
   current.assistance !== choice.assistance ||
   (current.loadG ?? null) !== (choice.addedWeightG ?? null));
function evidenceFor(s, roleSlotId, effectiveSets) {
  const slot = s.slots.find(x => x.roleSlotId === roleSlotId);
  const rows = [];
  for (let i = 0; i < slot.sets; i++) {
    const row = effectiveSets.get(`${s.sessionId}|${roleSlotId}|${i}`);
    if (!validSet(row, slot)) return { complete: false, rows: [] };
    rows.push(row);
  }
  const harder = rows.some(x => x.harderThanIntended);
  const uniform = slot.equipment === 'loaded'
    ? rows.every(x => x.actualG === rows[0].actualG)
    : rows.every(x => x.variation === rows[0].variation && x.assistance === rows[0].assistance && x.actualG === rows[0].actualG);
  const onPlan = uniform && (slot.equipment === 'loaded' ? rows[0].actualG === slot.plannedG :
    rows[0].variation === slot.variation && rows[0].assistance === slot.assistance && rows[0].actualG === slot.plannedG);
  return { complete: true, rows, harder, uniform, onPlan,
    actualG: rows[0]?.actualG ?? null, repSum: rows.reduce((n, x) => n + x.reps, 0),
    allTop: rows.every(x => x.reps >= slot.ceiling) };
}
function effectiveRevisions(events) {
  const records = new Map(), originals = new Map(), targets = new Map(), voidSessions = new Set();
  for (const e of events) {
    if (e.type === 'SET_RECORDED' || e.type === 'EXTRA_SET_RECORDED') {
      if (!Number.isSafeInteger(e.setIndex) || e.setIndex < 0) fail('invalid set index');
      const key = `${e.sessionId}|${e.roleSlotId}|${e.setIndex}`;
      if (records.has(key)) fail('duplicate set index');
      records.set(key, { ...e }); originals.set(key, { ...e }); targets.set(e.eventId, key);
    }
    if (e.type === 'SET_CORRECTED' || e.type === 'SET_VOIDED') {
      const key = targets.get(e.targetEventId);
      if (!key || !key.startsWith(`${e.sessionId}|`)) fail('invalid correction target');
      const original = originals.get(key);
      if ((e.roleSlotId !== undefined && e.roleSlotId !== original.roleSlotId) ||
          (e.exerciseId !== undefined && e.exerciseId !== original.exerciseId) ||
          (e.setIndex !== undefined && e.setIndex !== original.setIndex)) {
        fail('correction target identity mismatch');
      }
      if (e.type === 'SET_CORRECTED') {
        integer(e.reps, 'corrected reps', 1);
        // A reps/effort/variation-only revision inherits existing load and
        // immutable originating input metadata. Qualitative bodyweight sets
        // have no numeric mass to fabricate during correction.
        if (own(e, 'actualG')) integer(e.actualG, 'corrected grams');
      }
      // A reps/load-only revision must not erase bodyweight identity or effort.
      // Explicit values (including false) take precedence; omitted values
      // inherit the last revision, falling back to original after a void.
      const prior = records.get(key) || originals.get(key);
      if (e.type === 'SET_CORRECTED' && e.actualOrigin?.kind === 'DERIVED') {
        // A corrected set cannot impersonate an earned load: it may only
        // restore provenance already recorded for this exact original set.
        const original = originals.get(key);
        if (![prior, original].some(row => row?.actualG === e.actualG &&
            sameCanonicalValue(row.actualOrigin, e.actualOrigin))) {
          fail('corrected derived actual must inherit its recorded source');
        }
      }
      records.set(key, e.type === 'SET_VOIDED' ? null : { ...prior,
        reps: e.reps,
        actualG: own(e, 'actualG') ? e.actualG : prior.actualG,
        actualOrigin: own(e, 'actualG') ? clone(e.actualOrigin) : prior.actualOrigin,
        harderThanIntended: own(e, 'harderThanIntended') ? e.harderThanIntended : prior.harderThanIntended,
        variation: own(e, 'variation') ? e.variation : prior.variation,
        assistance: own(e, 'assistance') ? e.assistance : prior.assistance });
    }
    if (e.type === 'SESSION_VOIDED') {
      if (voidSessions.has(e.sessionId)) fail('duplicate session void');
      voidSessions.add(e.sessionId);
    }
  }
  return { records, voidSessions };
}
function foldBB2Block(openingSnapshot, chronologicalEvents) {
  // Every top-level replay owns its prefix cache: never reuse a cached result
  // across distinct corrected event streams, even when their lengths match.
  return foldBB2BlockCached(openingSnapshot, chronologicalEvents, new Map());
}
function foldBB2BlockCached(openingSnapshot, chronologicalEvents, prefixCache) {
  validateOpening(openingSnapshot); validateEvents(openingSnapshot, chronologicalEvents);
  // Historical legality must be checked against the exact original prefix.
  // Without shared memoisation, nested prefix checks recursively revisit the
  // same earlier calibrations/consents and grow exponentially.
  const replayBefore = ordinal => {
    const length = ordinal - 1;
    if (!prefixCache.has(length)) {
      prefixCache.set(length, foldBB2BlockCached(openingSnapshot,
        chronologicalEvents.slice(0, length), prefixCache));
    }
    return prefixCache.get(length);
  };
  const opening = clone(openingSnapshot);
  const { records, voidSessions } = effectiveRevisions(chronologicalEvents);
  const progress = Object.fromEntries(Object.entries(opening.progress).map(([k, v]) => [k, initialProgress(v)]));
  const sessions = new Map(), choices = [], boundaries = [], notes = new Map(), hidden = new Set();
  // A retrospective void/correction can turn a historically second workout
  // into this exercise's first qualifying exposure. Preserve that calibration
  // identity until its previously valid choice is replayed: accepting an
  // off-plan first exposure may seed a baseline but must not earn an increase.
  const firstCalibrationExposures = new Set();
  const resolvedOffers = new Set();
  // Discard purges the session Start into a minimal tombstone, while separate
  // pre-lock GLOBAL edits retain their original ordinal and session linkage.
  // Restrict the missing-session exception to that original Discard window.
  const discardedEditWindows = new Map();
  for (const event of chronologicalEvents) if (event.type === 'WORKOUT_DISCARDED') {
    const tombstones = chronologicalEvents.filter(x =>
      x.type === 'TOMBSTONE' && x.discardedSessionId === event.sessionId &&
      x.commitOrdinal < event.commitOrdinal);
    if (tombstones.length) discardedEditWindows.set(event.sessionId, {
      firstOrdinal: Math.min(...tombstones.map(x => x.commitOrdinal)),
      discardOrdinal: event.commitOrdinal
    });
  }
  const selections = clone(opening.selections || {}), unitMetadata = [];
  // Non-training presentation decisions are persisted as ledger events.
  // Dismissals only hide the *same* epoch/count offer; a worse stall or new
  // accepted prescription creates a new actionable state without load edits.
  const stallDismissals = new Map();
  // Progression-eligible finished sessions, not dates or recovery/incomplete
  // work, define the optional four-session multi-stall review window.
  const eligibleNormalFinishes = [], stallNoteMilestones = [];
  const grants = new Map(), activeCredits = new Map(), pending = clone(opening.pending || {});
  const quotas = Object.fromEntries(TEMPLATES.map(x => [x, 0]));
  let sealed = !!opening.sealed, sealId = null;
  // Credit events must be valid at their own chronological ordinal, not only
  // against the retrospective final effective sets. A later correction cannot
  // legitimise a grant or regrant that was premature when recorded.
  const creditEligibleAt = (s, ordinal) => {
    if (!s || s.kind !== 'NORMAL' || s.outcome !== 'FINISH') return false;
    const prior = effectiveRevisions(chronologicalEvents.slice(0, ordinal - 1));
    if (prior.voidSessions.has(s.sessionId)) return false;
    const prescribed = s.slots.reduce((sum, slot) => sum + slot.sets, 0);
    const valid = s.slots.reduce((sum, slot) => sum +
      Array.from({ length: slot.sets }, (_, i) =>
        validSet(prior.records.get(`${s.sessionId}|${slot.roleSlotId}|${i}`), slot))
        .filter(Boolean).length, 0);
    return valid >= Math.ceil(0.70 * prescribed);
  };
  // Discard may tombstone the original Start while leaving an independently
  // committed GLOBAL edit at its ordinal; that edit has no live session slot.
  const getProgress = (key, plan) => progress[key] ||= initialProgress({}, plan || {});
  // Calibration permission is historical: a later correction may make an
  // earlier exercise eligible without invalidating a trial that was legal
  // when originally recorded. Evaluate the original event prefix, not the
  // final retrospectively corrected projection.
  const hasPriorCalibrationAt = (s, slot, ordinal) => {
    const prior = replayBefore(ordinal);
    return !!prior.progress[identity(s.templateId, slot.roleSlotId, slot.exerciseId)]?.calibrated;
  };
  // An accepted choice can be reclassified/replaced only when an already
  // committed correction has made that exact historical acceptance operative
  // but invalid. Never allow an early consent event to pre-authorise some
  // future correction. Check the original event prefix, not later evidence.
  const requiresCorrectionConsentAt = (choiceEventId, ordinal) => {
    const prior = replayBefore(ordinal);
    return prior.requiredConsent.some(request => request.choiceEventId === choiceEventId);
  };
  const epoch = (p, id, nextLoad, origin = null, force = false) => { if (force || p.loadG !== nextLoad) {
    p.loadG = nextLoad;
    p.loadOrigin = nextLoad === null ? null :
      (origin ? clone(origin) : { kind: 'DERIVED', sourceEventId: id });
    p.epochId = id; p.bestReps = null; p.stallCount = 0;
  } };
  const boundary = (key, ordinal, kind) => boundaries.push({ key, ordinal, kind });
  const findSlot = (s, e) => {
    const slot = s?.slots.find(x => x.roleSlotId === e.roleSlotId && x.exerciseId === e.exerciseId);
    if (!slot) fail('event references missing session slot');
    return slot;
  };
  for (const e of chronologicalEvents) {
    // Sealing freezes *all* training-authoritative events in this block,
    // not just corrections. Notes and History visibility remain editable.
    if (sealed && !['NOTE_EDITED', 'HISTORY_HIDDEN', 'HISTORY_UNHIDDEN'].includes(e.type)) {
      fail('sealed block training state is read-only');
    }
    switch (e.type) {
      case 'WORKOUT_STARTED': {
        positiveId(e.sessionId, 'session');
        if (sessions.has(e.sessionId)) fail('duplicate session ID');
        if ([...sessions.values()].some(x => !x.outcome)) fail('another workout is active');
        if (!TEMPLATES.includes(e.templateId) || !['NORMAL', 'EXTRA_NORMAL', 'RECOVERY'].includes(e.kind)) fail('invalid workout type');
        if (e.kind === 'NORMAL' && quotas[e.templateId] >= 8) fail('normal quota full; use EXTRA NORMAL');
        if (e.kind === 'EXTRA_NORMAL' && quotas[e.templateId] < 8) fail('EXTRA NORMAL requires filled template quota');
        if (e.kind === 'EXTRA_NORMAL' && TEMPLATES.every(t => quotas[t] === 8)) {
          fail('block complete; start next block before extra normal training');
        }
        if (sealed && e.kind !== 'RECOVERY') fail('sealed block only permits recovery');
        if (!Array.isArray(e.slots) || !e.slots.length) fail('missing session slots');
        const slots = clone(e.slots), names = new Set();
        for (const s of slots) {
          validateSlot(s); if (names.has(s.roleSlotId)) fail('duplicate role slot'); names.add(s.roleSlotId);
          const key = identity(e.templateId, s.roleSlotId, s.exerciseId);
          if (pending[key]) {
            // A later correction may create a pending offer *retroactively*
            // at an earlier Finish. A historical Start that was legal when
            // committed must not be invalidated by that later correction.
            // Evaluate the offer using the ledger prefix at this Start's
            // original ordinal; new Starts still see today's unresolved offer.
            const historical = replayBefore(e.commitOrdinal);
            if (historical.pending[key]) fail('unresolved choice blocks same exercise');
          }
        }
        sessions.set(e.sessionId, { sessionId: e.sessionId, templateId: e.templateId, kind: e.kind, slots,
          initialSlots: clone(slots), locks: new Set(), lockSnapshots: new Map(),
          seenSets: new Set(), accepted: new Map(), outcome: null,
          finishOrdinal: null, note: '' });
        break;
      }
      case 'EXERCISE_LOCKED': {
        const s = sessions.get(e.sessionId), slot = findSlot(s, e);
        if (s.outcome) fail('exercise lock after workout outcome');
        if (s.locks.has(slot.roleSlotId)) fail('duplicate exercise lock');
        if (s.seenSets.has(slot.roleSlotId)) fail('late exercise lock');
        if (e.plannedG !== slot.plannedG) fail('lock plan differs from committed plan');
        // Every supplied field in a saved lock is evidence, not a chance to
        // silently alter the original Start or a permitted pre-lock edit.
        for (const field of ['equipment', 'sets', 'floor', 'ceiling', 'incrementG',
          'variation', 'assistance']) {
          if (own(e, field) && e[field] !== slot[field]) {
            fail('lock field differs from effective session plan: ' + field);
          }
        }
        if (own(e, 'plannedOrigin')) {
          const expected = slot.plannedOrigin;
          const actual = e.plannedOrigin;
          if (!expected || !actual ||
              Object.keys(actual).length !== Object.keys(expected).length ||
              Object.keys(actual).some(field => !own(expected, field) ||
                actual[field] !== expected[field])) {
            fail('lock original load metadata differs from saved plan');
          }
        }
        if (own(e, 'incrementOrigin')) {
          const expected = slot.incrementOrigin;
          const actual = e.incrementOrigin;
          if (!expected || !actual ||
              Object.keys(actual).length !== Object.keys(expected).length ||
              Object.keys(actual).some(field => !own(expected, field) ||
                actual[field] !== expected[field])) {
            fail('lock increment origin differs from saved plan');
          }
        }
        s.lockSnapshots.set(slot.roleSlotId, clone(slot));
        s.locks.add(slot.roleSlotId); break;
      }
      case 'PRESCRIPTION_EDITED':
      case 'INCREMENT_EDITED':
      case 'VARIATION_EDITED':
      case 'STALL_REDUCTION_ACCEPTED': {
        if (e.scope && e.scope !== 'GLOBAL') fail('non-global edit');
        const session = e.sessionId ? sessions.get(e.sessionId) : null;
        if (session && e.templateId !== undefined && e.templateId !== session.templateId) {
          fail('session template mismatch on global edit');
        }
        const templateId = e.templateId ?? session?.templateId;
        // A standalone global edit for the exercise being trained would
        // bypass its session lock and leave the saved plan out of sync.
        // Require explicit linkage so the ordinary pre-lock check applies.
        const activeSession = [...sessions.values()].find(x => !x.outcome);
        if (!session && activeSession && activeSession.templateId === templateId &&
            activeSession.slots.some(s => s.roleSlotId === e.roleSlotId && s.exerciseId === e.exerciseId)) {
          fail('active session requires linked global edit');
        }
        const key = identity(templateId, e.roleSlotId, e.exerciseId);
        const window = e.sessionId ? discardedEditWindows.get(e.sessionId) : null;
        const preservedDiscardEdit = window && e.scope === 'GLOBAL' &&
          e.commitOrdinal > window.firstOrdinal && e.commitOrdinal < window.discardOrdinal;
        if (e.sessionId && !session && !preservedDiscardEdit) fail('edit references unknown session');
        if (session?.outcome) fail('session edit after workout outcome');
        const slot = session ? findSlot(session, e) : null;
        if (slot && (session.locks.has(slot.roleSlotId) || session.seenSets.has(slot.roleSlotId))) fail('edit after lock');
        const p = getProgress(key, slot);
        if (e.type === 'STALL_REDUCTION_ACCEPTED') {
          // A stalled-weight acceptance is not a generic manual weight edit.
          // Prove that an offer existed at the exact ordinal of acceptance,
          // so a later correction cannot erase a legitimate user decision.
          const prior = replayBefore(e.commitOrdinal);
          const offered = prior.stallSignals[key];
          const previousLoad = prior.progress[key]?.loadG;
          if (!offered || offered.kind !== 'OFFER' || offered.dismissed ||
              offered.epochId !== e.offerEpochId ||
              offered.stallCount !== e.offerStallCount) {
            fail('stall reduction lacks matching original offer');
          }
          if (!Number.isSafeInteger(previousLoad) || previousLoad <= 0 ||
              e.loadG >= previousLoad) {
            fail('stall reduction must lower the offered numeric load');
          }
        }
        if (e.type === 'INCREMENT_EDITED') {
          integer(e.incrementG, 'increment grams', 1);
          if (p.incrementG === e.incrementG) fail('no-op increment event');
          p.incrementG = e.incrementG; p.incrementOrigin = clone(e.incrementOrigin);
          if (slot) { slot.incrementG = e.incrementG; slot.incrementOrigin = clone(e.incrementOrigin); }
        } else if (e.type === 'VARIATION_EDITED') {
          positiveId(e.variation, 'variation');
          if (own(e, 'assistance') && typeof e.assistance !== 'string') {
            fail('invalid variation assistance');
          }
          const nextAssistance = own(e, 'assistance') ? e.assistance : p.assistance;
          if (p.variation === e.variation && p.assistance === nextAssistance) {
            fail('no-op variation event');
          }
          p.variation = e.variation; p.assistance = nextAssistance;
          p.bestReps = null; p.stallCount = 0; p.epochId = `event:${e.eventId}`;
          if (slot) { slot.variation = e.variation; slot.assistance = nextAssistance; }
          boundary(key, e.commitOrdinal, 'explicit');
        } else {
          integer(e.loadG, 'working grams');
          if (p.loadG === e.loadG) fail('no-op prescription event');
          epoch(p, `event:${e.eventId}`, e.loadG, e.loadOrigin);
          if (slot) { slot.plannedG = e.loadG; slot.plannedOrigin = clone(e.loadOrigin); }
          boundary(key, e.commitOrdinal, 'explicit');
        }
        // A deliberate future-load or variation change supersedes an
        // unresolved carried offer for that *same* identity; increment-only
        // edits do not decide a pending working-load/variation question.
        if (e.type === 'PRESCRIPTION_EDITED' || e.type === 'VARIATION_EDITED' ||
            e.type === 'STALL_REDUCTION_ACCEPTED') delete pending[key];
        break;
      }
      case 'SET_RECORDED':
      case 'EXTRA_SET_RECORDED': {
        const s = sessions.get(e.sessionId), slot = findSlot(s, e);
        if (s.outcome) fail('set after outcome');
        if (e.actualOrigin?.kind === 'DERIVED' &&
            (e.actualG !== slot.plannedG ||
             !sameCanonicalValue(e.actualOrigin, slot.plannedOrigin))) {
          fail('derived actual must inherit the saved exercise plan');
        }
        if (e.type === 'SET_RECORDED' && (e.setIndex >= slot.sets || e.prescribed !== true)) fail('set not prescribed');
        if (e.type === 'EXTRA_SET_RECORDED') {
          // Explicitly calling an extra set prescribed would contradict its
          // immutable non-gating index even if the projection ignores the flag.
          if (e.prescribed === true) fail('extra set cannot be prescribed');
          // Match BB1's hard maximum of 30 extra working sets per exercise.
          // A void/correction retains the original slot index for audit; it
          // must not free that ordinal for a second independent recorded set.
          if (e.setIndex < slot.sets) fail('extra set uses prescribed index');
          if (e.setIndex >= slot.sets + 30) fail('extra working set index exceeds limit');
        }
        if (!validSet(e, slot)) fail('invalid recorded set');
        // First working set implicitly locks the effective plan before
        // any session-only calibration trial can revise it.
        if (!s.lockSnapshots.has(slot.roleSlotId)) {
          s.lockSnapshots.set(slot.roleSlotId, clone(slot));
        }
        s.seenSets.add(slot.roleSlotId); s.locks.add(slot.roleSlotId); break;
      }
      case 'CALIBRATION_PLAN_REVISED': {
        const s = sessions.get(e.sessionId), slot = findSlot(s, e);
        if (s.outcome || !s.seenSets.has(slot.roleSlotId)) fail('invalid calibration trial');
        if (hasPriorCalibrationAt(s, slot, e.commitOrdinal)) {
          fail('calibration trial is permitted only on first exposure');
        }
        integer(e.plannedG, 'calibration grams');
        // Trial is session-only; it does not rewrite the historical initial or existing actuals.
        slot.calibrationTrialG = e.plannedG;
        slot.calibrationTrialOrigin = clone(e.plannedOrigin);
        break;
      }
      case 'CALIBRATION_ACCEPTED': {
        const s = sessions.get(e.sessionId), slot = findSlot(s, e);
        if (s.outcome) fail('calibration choice after outcome');
        if (!s.seenSets.has(slot.roleSlotId)) fail('calibration needs a recorded trial set');
        if (hasPriorCalibrationAt(s, slot, e.commitOrdinal)) {
          fail('calibration acceptance is permitted only on first exposure');
        }
        if (s.accepted.has(slot.roleSlotId)) fail('duplicate calibration acceptance');
        integer(e.loadG, 'accepted calibration grams');
        s.accepted.set(slot.roleSlotId, { loadG: e.loadG, loadOrigin: clone(e.loadOrigin), eventId: e.eventId });
        break;
      }
      case 'WORKOUT_FINISHED':
      case 'WORKOUT_INCOMPLETE': {
        const s = sessions.get(e.sessionId);
        if (!s || s.outcome) fail('invalid or duplicate Finish');
        s.outcome = e.type === 'WORKOUT_FINISHED' ? 'FINISH' : 'INCOMPLETE';
        s.finishOrdinal = e.commitOrdinal;
        const count = s.slots.reduce((n, slot) => n + slot.sets, 0);
        const validCount = s.slots.reduce((n, slot) => n + Array.from({ length: slot.sets }, (_, i) =>
          validSet(records.get(`${s.sessionId}|${slot.roleSlotId}|${i}`), slot) ? 1 : 0).filter(Boolean).length, 0);
        // Finish legality is frozen at its original ordinal. Later corrections
        // can revoke eligibility, but cannot retroactively legitimise a Finish
        // that was below threshold when the trainee pressed the button.
        const originalSets = chronologicalEvents.filter(x =>
          x.sessionId === s.sessionId && x.type === 'SET_RECORDED' &&
          x.commitOrdinal < e.commitOrdinal);
        const originalValidCount = s.slots.reduce((total, item) =>
          total + originalSets.filter(x =>
            x.roleSlotId === item.roleSlotId && x.exerciseId === item.exerciseId &&
            x.setIndex < item.sets && validSet(x, item)).length, 0);
        const minimumValid = Math.ceil(.70 * count);
        if (s.outcome === 'FINISH' && sessionEligible(s) && originalValidCount < minimumValid) {
          fail('Finish below 70 percent gate');
        }
        s.prescribedCount = count; s.validCount = validCount;
        s.eligible = s.outcome === 'FINISH' && sessionEligible(s) &&
          validCount >= minimumValid && !voidSessions.has(s.sessionId);
        if (s.eligible) for (const slot of s.slots) {
          const key = identity(s.templateId, slot.roleSlotId, slot.exerciseId), info = evidenceFor(s, slot.roleSlotId, records);
          if (!info.complete) continue;
          const p = getProgress(key, slot), first = !p.calibrated;
          if (first) {
            firstCalibrationExposures.add(`${s.sessionId}|${key}`);
            p.calibrated = true;
            const accepted = s.accepted.get(slot.roleSlotId);
            if (accepted) epoch(p, `calibration:${accepted.eventId}`, accepted.loadG, accepted.loadOrigin);
            else if (info.onPlan && !info.harder) {
              const historicIdentityDiffers = p.loadG !== (slot.plannedG ?? null) ||
                (slot.equipment === 'bodyweight' &&
                  (p.variation !== slot.variation || p.assistance !== slot.assistance));
              if (historicIdentityDiffers) {
                epoch(p, `promote:${e.eventId}`, slot.plannedG ?? null,
                  slot.plannedOrigin, true);
                if (slot.equipment === 'bodyweight') {
                  p.variation = slot.variation;
                  p.assistance = slot.assistance;
                }
              }
            }
            // Retroactive first calibration can also be a qualified, independent
            // reaffirmation of its saved plan for historical consent precedence.
            // It must not earn an automatic first-exposure weight increase.
            if (info.onPlan && !info.harder) boundary(key, e.commitOrdinal, 'qualified-calibration');
            const matchesFinalIdentity = info.actualG === p.loadG &&
              (slot.equipment !== 'bodyweight' || info.rows.every(row =>
                row.variation === p.variation && row.assistance === p.assistance));
            if (info.uniform && !info.harder && matchesFinalIdentity) {
              p.bestReps = info.repSum; p.stallCount = 0;
            }
          } else if (info.onPlan && !info.harder) {
            const historicIdentityDiffers = p.loadG !== (slot.plannedG ?? null) ||
              (slot.equipment === 'bodyweight' &&
                (p.variation !== slot.variation || p.assistance !== slot.assistance));
            if (historicIdentityDiffers) {
              epoch(p, `promote:${e.eventId}:${key}`, slot.plannedG ?? null,
                slot.plannedOrigin, true);
              if (slot.equipment === 'bodyweight') {
                p.variation = slot.variation;
                p.assistance = slot.assistance;
              }
            }
            boundary(key, e.commitOrdinal, 'qualified-finish');
            const beforeStall = p.stallCount;
            if (slot.equipment === 'bodyweight' && info.allTop) {
              pending[key] = { kind: 'DIFFICULTY', sessionId: s.sessionId, variation: slot.variation,
                assistance: slot.assistance, addedWeightG: slot.plannedG };
            } else if (slot.equipment === 'loaded' && info.allTop) {
              epoch(p, `earned:${e.eventId}:${key}`, p.loadG + p.incrementG,
                { kind: 'DERIVED', sourceEventId: e.eventId });
            }
            else if (p.bestReps === null || info.repSum > p.bestReps) { p.bestReps = info.repSum; p.stallCount = 0; }
            else p.stallCount++;
            if (beforeStall < 3 && p.stallCount === 3) {
              stallNoteMilestones.push({ key, sessionId: s.sessionId,
                epochId: p.epochId, ordinal: e.commitOrdinal });
            }
            if (slot.equipment !== 'bodyweight' || !info.allTop) delete pending[key];
          } else if (info.uniform && !info.harder && !info.onPlan && slot.equipment === 'loaded') {
            pending[key] = { kind: 'OFF_PLAN', sessionId: s.sessionId, valueG: info.actualG, plannedG: slot.plannedG };
          }
          p.lastNormalSessionId = s.sessionId;
        }
        if (s.eligible) eligibleNormalFinishes.push(s.sessionId);
        break;
      }
      case 'CHOICE_RESOLVED':
      case 'CHOICE_REPLACED': {
        const s = sessions.get(e.sourceSessionId);
        if (s && e.sourceBlockId !== undefined && e.sourceBlockId !== opening.blockId) {
          fail('choice source block mismatch');
        }
        if (e.type === 'CHOICE_REPLACED' &&
            !requiresCorrectionConsentAt(e.targetEventId, e.commitOrdinal)) {
          fail('correction-time consent not required for choice replacement');
        }
        if (!s && e.type === 'CHOICE_RESOLVED') {
          // The source workout belongs to an already-sealed older block.
          // Its pending offer and source identity were pinned into the next
          // opening snapshot, so no old sealed sets are replayed or amended.
          const matches = Object.entries(pending).filter(([key, offer]) =>
            offer.sourceBlockId === e.sourceBlockId &&
            offer.sessionId === e.sourceSessionId &&
            key.endsWith('|'+e.roleSlotId+'|'+e.exerciseId));
          if (matches.length !== 1) fail('missing or stale carried choice offer');
          const [key, offer] = matches[0];
          const p = progress[key];
          if (!p) fail('carried choice missing prior prescription');
          if (offer.kind === 'OFF_PLAN') {
            if (!['ACCEPT','KEEP'].includes(e.decision)) fail('invalid carried numeric decision');
            if (e.decision === 'ACCEPT') {
              if (e.loadG !== offer.valueG) fail('carried acceptance differs from sealed offer');
              epoch(p, `choice:${e.eventId}`, e.loadG, e.loadOrigin);
              p.bestReps = offer.sourceRepSum; p.stallCount = 0;
              if (offer.sourceAllTop && p.calibrated) {
                epoch(p, `earned-choice:${e.eventId}`, p.loadG + p.incrementG,
                  { kind: 'DERIVED', sourceEventId: e.eventId });
              }
            }
          } else {
            if (!['HOLD','DIFFICULTY_ACCEPT'].includes(e.decision)) fail('invalid carried difficulty decision');
            if (e.decision === 'DIFFICULTY_ACCEPT') {
              positiveId(e.variation, 'accepted carried difficulty variation');
              if (typeof e.assistance !== 'string') fail('invalid carried difficulty assistance');
              if (e.addedWeightG !== undefined) integer(e.addedWeightG, 'accepted carried added weight');
              if (!difficultyActuallyChanges(p, e)) {
                fail('difficulty acceptance must change variation, assistance or added load');
              }
              // A qualitative source may deliberately choose new added weight,
              // or a loaded bodyweight exercise may switch to band-only work.
              // Only the user's actual new choice supplies a numeric mass.
              p.variation = e.variation; p.assistance = e.assistance;
              epoch(p, `choice:${e.eventId}`, e.addedWeightG ?? null,
                e.addedWeightOrigin, true);
            }
          }
          boundary(key, e.commitOrdinal, 'explicit');
          delete pending[key];
          break;
        }
        if (!s || !s.finishOrdinal || e.commitOrdinal <= s.finishOrdinal) fail('choice before source Finish');
        const slot = findSlot(s, e), key = identity(s.templateId, slot.roleSlotId, slot.exerciseId);
        if (!['ACCEPT', 'KEEP', 'HOLD', 'DIFFICULTY_ACCEPT'].includes(e.decision) &&
            !(e.type === 'CHOICE_REPLACED' && e.decision === 'REPLACE')) fail('invalid decision');
        if (e.type === 'CHOICE_RESOLVED' && e.targetEventId !== undefined) fail('resolution may not target prior choice');
        if (e.type === 'CHOICE_RESOLVED') {
          const offerId = `${s.sessionId}|${key}`;
          if (resolvedOffers.has(offerId)) fail('offer already resolved');
          if (boundaries.some(b => b.key === key &&
              b.ordinal > s.finishOrdinal && b.ordinal < e.commitOrdinal)) {
            fail('stale offer superseded by later prescription');
          }
        }
        // A user may later correct the source; the explicit decision must still
        // have been earned by the evidence committed at its *own* ordinal.
        // Never validate a historical ACCEPT against the final corrected sets.
        const atChoice = effectiveRevisions(chronologicalEvents.slice(0, e.commitOrdinal - 1));
        const sourceEligible = sessionEligible(s) && s.outcome === 'FINISH' &&
          !atChoice.voidSessions.has(s.sessionId) &&
          s.slots.reduce((n, item) =>
            n + Array.from({ length: item.sets }, (_, i) =>
              validSet(atChoice.records.get(`${s.sessionId}|${item.roleSlotId}|${i}`), item))
              .filter(Boolean).length, 0) >=
          Math.ceil(.70 * s.slots.reduce((n, item) => n + item.sets, 0));
        const sourceEvidence = evidenceFor(s, slot.roleSlotId, atChoice.records);
        // Validate the offer at its *original* choice ordinal. A correction
        // appended later may invalidate present-day pending state but must
        // not rewrite a genuinely earned historical consent event. Most
        // importantly, first-exposure calibration never issues an off-plan
        // ACCEPT/KEEP or bodyweight difficulty offer.
        const historicalChoiceState = e.type === 'CHOICE_RESOLVED' ?
          replayBefore(e.commitOrdinal) : null;
        const originalOffer = historicalChoiceState?.pending[key];
        const offeredOffPlan = sourceEligible && sourceEvidence.complete &&
          sourceEvidence.uniform && !sourceEvidence.harder && !sourceEvidence.onPlan &&
          slot.equipment === 'loaded' && originalOffer?.kind === 'OFF_PLAN' &&
          originalOffer.sessionId === s.sessionId;
        if (e.type === 'CHOICE_RESOLVED' && ['ACCEPT', 'KEEP'].includes(e.decision)) {
          if (!offeredOffPlan) fail('choice has no original eligible off-plan offer');
          if (e.decision === 'ACCEPT' && e.loadG !== sourceEvidence.actualG) {
            fail('accepted value differs from original off-plan offer');
          }
        }
        if (e.type === 'CHOICE_RESOLVED' && ['HOLD', 'DIFFICULTY_ACCEPT'].includes(e.decision)) {
          if (!(sourceEligible && sourceEvidence.complete && sourceEvidence.onPlan &&
                !sourceEvidence.harder && sourceEvidence.allTop && slot.equipment === 'bodyweight' &&
                originalOffer?.kind === 'DIFFICULTY' && originalOffer.sessionId === s.sessionId)) {
            fail('difficulty choice has no eligible bodyweight offer');
          }
          if (e.decision === 'DIFFICULTY_ACCEPT' &&
              !difficultyActuallyChanges(historicalChoiceState.progress[key], e)) {
            fail('difficulty acceptance must change variation, assistance or added load');
          }
        }
        if (e.type === 'CHOICE_RESOLVED') {
          // Only the fully validated, one-shot original offer can be consumed.
          resolvedOffers.add(`${s.sessionId}|${key}`);
        }
        const p = getProgress(key, slot);
        if (e.decision === 'ACCEPT' || e.decision === 'REPLACE') {
          const qualitativeReplacement = e.type === 'CHOICE_REPLACED' &&
            slot.equipment === 'bodyweight' && e.loadG === undefined;
          if (!qualitativeReplacement) integer(e.loadG, 'accepted grams');
          epoch(p, `choice:${e.eventId}`,
            qualitativeReplacement ? null : e.loadG, e.loadOrigin,
            e.decision === 'REPLACE');
          if (e.type === 'CHOICE_REPLACED' && slot.equipment === 'bodyweight') {
            positiveId(e.variation, 'replacement difficulty variation');
            if (typeof e.assistance !== 'string') fail('invalid replacement assistance');
            p.variation = e.variation; p.assistance = e.assistance;
            p.bestReps = null; p.stallCount = 0; p.epochId = `choice:${e.eventId}`;
          }
          const info = evidenceFor(s, slot.roleSlotId, records);
          const validOffer = s.eligible && info.complete && info.uniform && !info.harder && info.actualG === e.loadG && !info.onPlan;
          if (e.decision === 'ACCEPT' && validOffer) {
            p.bestReps = info.repSum; p.stallCount = 0;
            if (info.allTop && !firstCalibrationExposures.has(`${s.sessionId}|${key}`)) {
              epoch(p, `earned-choice:${e.eventId}`, p.loadG + p.incrementG,
              { kind: 'DERIVED', sourceEventId: e.eventId });
            }
          }
          choices.push({ eventId: e.eventId, ordinal: e.commitOrdinal, sourceSessionId: s.sessionId,
            key, valueG: qualitativeReplacement ? undefined : e.loadG,
            validOffer, decision: e.decision });
          boundary(key, e.commitOrdinal, 'explicit');
        } else if (e.decision === 'DIFFICULTY_ACCEPT') {
          positiveId(e.variation, 'accepted difficulty variation');
          if (typeof e.assistance !== 'string') fail('missing accepted assistance');
          if (e.addedWeightG !== undefined) integer(e.addedWeightG, 'added bodyweight grams');
          p.variation = e.variation; p.assistance = e.assistance;
          epoch(p, `choice:${e.eventId}`, e.addedWeightG ?? null,
            e.addedWeightOrigin, true);
          // An accepted harder variation is an authoritative choice even if
          // a later set correction removes the qualifying all-at-top result.
          // Consent is evaluated against the corrected hypothetical replay.
          const info = evidenceFor(s, slot.roleSlotId, records);
          const validOffer = s.eligible && info.complete && info.onPlan &&
            !info.harder && info.allTop && slot.equipment === 'bodyweight';
          choices.push({ eventId: e.eventId, ordinal: e.commitOrdinal,
            sourceSessionId: s.sessionId, key, valueG: e.addedWeightG,
            variation: e.variation, assistance: e.assistance,
            validOffer, decision: e.decision });
          boundary(key, e.commitOrdinal, 'explicit');
        } else if (e.decision === 'KEEP') boundary(key, e.commitOrdinal, 'explicit');
        delete pending[key];
        break;
      }
      case 'CHOICE_RECLASSIFIED': {
        if (!requiresCorrectionConsentAt(e.targetEventId, e.commitOrdinal)) {
          fail('correction-time consent not required for choice reclassification');
        }
        break; // audit only, original choice keeps original effective ordinal
      }
      case 'CREDIT_GRANTED':
      case 'CREDIT_REGRANTED': {
        if ([...sessions.values()].some(x => !x.outcome)) {
          fail('active workout blocks historical credit change');
        }
        const s = sessions.get(e.sessionId);
        if (!s || s.kind !== 'NORMAL' || s.outcome !== 'FINISH') fail('credit without normal Finish');
        positiveId(e.creditId, 'credit ID');
        if (grants.has(e.creditId) || activeCredits.has(e.sessionId)) fail('duplicate credit');
        if (!creditEligibleAt(s, e.commitOrdinal)) fail('credit grant without eligible session revision');
        const priorCredits = [...grants.values()].filter(g => g.sessionId === e.sessionId);
        if (e.type === 'CREDIT_GRANTED' && priorCredits.length) fail('second first-grant; use regrant');
        if (e.type === 'CREDIT_REGRANTED' &&
            (!priorCredits.length || priorCredits[priorCredits.length - 1].active)) {
          fail('regrant without prior revoke');
        }
        if (quotas[s.templateId] >= 8) fail('template credit quota full');
        grants.set(e.creditId, { sessionId: e.sessionId, templateId: s.templateId,
          active: true, grantEventId: e.eventId, grantOrdinal: e.commitOrdinal,
          previousCreditId: priorCredits.length ? [...grants.entries()].filter(([,g]) => g.sessionId === e.sessionId).at(-1)[0] : null });
        activeCredits.set(e.sessionId, e.creditId); quotas[s.templateId]++; break;
      }
      case 'CREDIT_REVOKED': {
        if ([...sessions.values()].some(x => !x.outcome)) {
          fail('active workout blocks historical credit change');
        }
        const g = grants.get(e.creditId);
        if (!g || !g.active || g.sessionId !== e.sessionId) fail('invalid credit revocation');
        if (creditEligibleAt(sessions.get(e.sessionId), e.commitOrdinal)) {
          fail('credit revoke without ineligible session revision');
        }
        g.active = false; g.revokeEventId = e.eventId; g.revokeOrdinal = e.commitOrdinal;
        activeCredits.delete(e.sessionId); quotas[g.templateId]--; break;
      }
      case 'HISTORY_HIDDEN':
      case 'HISTORY_UNHIDDEN':
      case 'NOTE_EDITED': {
        if (!sessions.has(e.sessionId)) fail('History change targets unknown session');
        if (e.type !== 'NOTE_EDITED' && !sessions.get(e.sessionId).outcome) {
          fail('History visibility requires finished session');
        }
        if (e.type === 'HISTORY_HIDDEN') hidden.add(e.sessionId);
        if (e.type === 'HISTORY_UNHIDDEN') hidden.delete(e.sessionId);
        if (e.type === 'NOTE_EDITED') notes.set(e.sessionId, e.text);
        break;
      }
      case 'EXERCISE_SWAPPED': {
        if (!TEMPLATES.includes(e.templateId)) fail('invalid swap template');
        positiveId(e.roleSlotId, 'swap slot'); positiveId(e.exerciseId, 'selected exercise');
        if (e.sessionId || [...sessions.values()].some(x => !x.outcome)) {
          fail('exercise swap while workout active');
        }
        const selectedKey = `${e.templateId}|${e.roleSlotId}`;
        if (selections[selectedKey] === e.exerciseId) fail('no-op exercise swap');
        selections[selectedKey] = e.exerciseId;
        break;
      }
      case 'UNIT_METADATA': unitMetadata.push({ eventId: e.eventId, ordinal: e.commitOrdinal, unit: e.unit }); break;
      case 'SESSION_VOIDED': {
        if (!sessions.has(e.sessionId) || !sessions.get(e.sessionId).outcome) fail('void unknown/unfinished session');
        if ([...sessions.values()].some(x => !x.outcome)) fail('retrospective revision during active workout');
        break;
      }
      case 'BLOCK_SEALED': {
        if (sealed) fail('duplicate block seal');
        if (!TEMPLATES.every(x => quotas[x] === 8)) fail('cannot seal incomplete block');
        if ([...sessions.values()].some(x => !x.outcome)) fail('cannot seal with unfinished workout');
        sealed = true; sealId = positiveId(e.sealId, 'seal ID'); break;
      }
      case 'SET_CORRECTED':
      case 'SET_VOIDED': {
        if (!sessions.get(e.sessionId)?.outcome) fail('correction before Finish');
        if ([...sessions.values()].some(x => !x.outcome)) fail('retrospective revision during active workout');
        break;
      }
      case 'STALL_OFFER_DISMISSED': {
        const key = identity(e.templateId, e.roleSlotId, e.exerciseId);
        // Evidence is checked at the original commit ordinal. A later
        // retrospective correction can remove that offer without turning a
        // historically valid user dismissal into a forged event.
        const historical = replayBefore(e.commitOrdinal);
        const offer = historical.stallSignals[key];
        if (!offer || offer.kind !== 'OFFER' ||
            offer.epochId !== e.epochId || offer.stallCount !== e.stallCount) {
          fail('stall dismissal without original actionable offer');
        }
        stallDismissals.set(key, { epochId: e.epochId, stallCount: e.stallCount });
        break;
      }
      case 'BLOCK_CREATED':
      case 'WORKOUT_DISCARDED':
      case 'TOMBSTONE': break;
      default: fail('unsupported event handling');
    }
  }
  // A corrected-ineligible credit must be explicitly revoked; never silently reallocate.
  for (const [sessionId] of activeCredits) if (!sessions.get(sessionId)?.eligible) fail('ineligible active credit requires revoke');
  const requiredConsent = [];
  for (const choice of choices) {
    if (!['ACCEPT', 'DIFFICULTY_ACCEPT'].includes(choice.decision) || choice.validOffer) continue;
    const superseded = boundaries.some(b => b.key === choice.key && b.ordinal > choice.ordinal);
    const classified = chronologicalEvents.some(e => e.type === 'CHOICE_RECLASSIFIED' && e.targetEventId === choice.eventId && e.decision === 'KEEP_AS_MANUAL');
    const replaced = chronologicalEvents.some(e => e.type === 'CHOICE_REPLACED' && e.targetEventId === choice.eventId);
    if (!superseded && !classified && !replaced) {
      const request = { choiceEventId: choice.eventId,
        sourceSessionId: choice.sourceSessionId, key: choice.key, valueG: choice.valueG };
      if (choice.decision === 'DIFFICULTY_ACCEPT') {
        request.variation = choice.variation;
        request.assistance = choice.assistance;
      }
      requiredConsent.push(request);
    }
  }
  for (const e of chronologicalEvents.filter(x => x.type === 'CHOICE_RECLASSIFIED')) {
    if (e.decision !== 'KEEP_AS_MANUAL' || !choices.some(c => c.eventId === e.targetEventId && c.ordinal < e.commitOrdinal)) fail('invalid consent reclassification');
  }
  // Even a restored or imported event stream must not close a block with
  // invalidated, still-operative user choices awaiting explicit consent.
  // The transaction guard catches this for new saves; the fold guards replay.
  if (sealed && requiredConsent.length) fail('cannot seal with unresolved correction consent');
  const history = [...sessions.values()].filter(s => s.outcome).map(s => ({
    sessionId: s.sessionId, blockId: opening.blockId, templateId: s.templateId, kind: s.kind,
    finishOrdinal: s.finishOrdinal,
    status: voidSessions.has(s.sessionId) ? 'VOID' : s.outcome === 'INCOMPLETE' ? 'INCOMPLETE' :
      s.eligible ? (s.kind === 'RECOVERY' ? 'LOW_STRESS_RECOVERY' : s.kind === 'EXTRA_NORMAL' ? 'COMPLETED_EXTRA_NORMAL' :
        activeCredits.has(s.sessionId) ? 'COMPLETED_NORMAL' : 'COMPLETED_NORMAL_NONCREDIT') :
        s.kind === 'RECOVERY' ? 'LOW_STRESS_RECOVERY' : 'INCOMPLETE_CORRECTED',
    creditId: activeCredits.get(s.sessionId) ?? null, prescribedCount: s.prescribedCount,
    validCount: s.validCount,
    // Original Start plan and effective first-lock plan are separate audit
    // snapshots. Keep legacy `slots` unchanged for existing projections.
    initialSlots: clone(s.initialSlots),
    effectiveSlots: s.slots.map(slot => clone(s.lockSnapshots.get(slot.roleSlotId) || slot)),
    slots: clone(s.slots), hidden: hidden.has(s.sessionId), note: notes.get(s.sessionId) || '',
    sets: s.slots.flatMap(slot => [...records.entries()].filter(([k, record]) =>
      k.startsWith(`${s.sessionId}|${slot.roleSlotId}|`) && record).map(([, record]) => ({
      roleSlotId: slot.roleSlotId, exerciseId: slot.exerciseId, setIndex: record.setIndex,
      prescribed: record.setIndex < slot.sets, reps: record.reps, actualG: record.actualG,
      actualOrigin: record.actualOrigin,
      variation: record.variation, assistance: record.assistance,
      harderThanIntended: !!record.harderThanIntended
    })).sort((a, b) => a.setIndex - b.setIndex))
  }));
  // Derived hints are presentation-only; never feed them back into progress,
  // quota, canonical sets, or the sealed closing training snapshot.
  const stallSignals = {};
  for (const [key, p] of Object.entries(progress)) {
    if (!p.calibrated || p.stallCount < 3) continue;
    const dismiss = stallDismissals.get(key);
    if (p.stallCount === 3) {
      stallSignals[key] = { kind: 'NOTE', epochId: p.epochId, stallCount: 3 };
    } else {
      const dismissed = !!dismiss && dismiss.epochId === p.epochId &&
        dismiss.stallCount === p.stallCount;
      stallSignals[key] = { kind: 'OFFER', epochId: p.epochId,
        stallCount: p.stallCount, dismissed,
        actions: ['REDUCE_ABOUT_10_PERCENT', 'SWAP_MOVEMENT', 'RECOVERY_SESSION'] };
    }
  }
  const recentEligibleSessionIds = eligibleNormalFinishes.slice(-4);
  const recentEligibleSet = new Set(recentEligibleSessionIds);
  const relevantMilestones = new Map();
  for (const milestone of stallNoteMilestones) {
    const p = progress[milestone.key];
    if (recentEligibleSet.has(milestone.sessionId) && p &&
        p.stallCount >= 3 && p.epochId === milestone.epochId) {
      relevantMilestones.set(milestone.key, milestone);
    }
  }
  const multiStallRecovery = relevantMilestones.size >= 2 ? {
    kind: 'OPTIONAL_RECOVERY',
    windowSize: 4,
    sessionIds: recentEligibleSessionIds,
    identities: [...relevantMilestones.keys()].sort()
  } : null;
  return { schemaVersion: SCHEMA_VERSION, foldRulesVersion: FOLD_RULES_VERSION, blockId: opening.blockId,
    ownerId: opening.ownerId, headOrdinal: chronologicalEvents.length, sealRevision: opening.sealRevision + (sealId ? 1 : 0),
    sealId, sealed, progress, quotas, activeCredits: Object.fromEntries(activeCredits),
    creditLedger: Object.fromEntries(grants), selections, unitMetadata,
    pending, requiredConsent, stallSignals, multiStallRecovery, history,
    closingSnapshot: sealed ? { schemaVersion: SCHEMA_VERSION, foldRulesVersion: FOLD_RULES_VERSION,
      openingSnapshotVersion: 1, progress: clone(progress), selections: clone(selections),
      pending: Object.fromEntries(Object.entries(pending).map(([key, offer]) => {
        if (offer.sourceBlockId) return [key, clone(offer)];
        if (offer.kind === 'OFF_PLAN') {
          const source = sessions.get(offer.sessionId), [,roleSlotId] = key.split('|');
          const evidence = source && evidenceFor(source, roleSlotId, records);
          if (!evidence?.complete || !evidence.uniform) fail('cannot seal incomplete pending evidence');
          return [key, { ...clone(offer), sourceBlockId: opening.blockId,
            sourceRepSum: evidence.repSum, sourceAllTop: evidence.allTop }];
        }
        return [key, { ...clone(offer), sourceBlockId: opening.blockId }];
      })),
      priorQuotas: clone(quotas), priorCreditIds: [...activeCredits.values()],
      sealId, sealedBlockId: opening.blockId } : null };
}

function commitBB2Transaction(opening, previousEvents, proposedEvents, guard) {
  validateOpening(opening);
  if (!Array.isArray(proposedEvents) || !proposedEvents.length) fail('invalid empty event transaction');
  const original = foldBB2Block(opening, previousEvents);
  if (!guard || guard.ownerId !== opening.ownerId) fail('owner mismatch');
  if (guard.blockId !== opening.blockId || guard.foldRulesVersion !== opening.foldRulesVersion) {
    fail('stale correction preview block or rules version');
  }
  if (guard.expectedHead !== original.headOrdinal || guard.sealRevision !== original.sealRevision) fail('stale correction preview or seal');
  const retrospective = !!guard.retrospective || proposedEvents.some(e =>
    ['SET_CORRECTED', 'SET_VOIDED', 'SESSION_VOIDED', 'CHOICE_RECLASSIFIED',
      'CHOICE_REPLACED', 'CREDIT_REVOKED', 'CREDIT_REGRANTED'].includes(e.type));
  // A missing active-workout answer is not equivalent to a verified clear.
  if (retrospective && guard.activeWorkout !== false) fail('active workout blocks correction');
  if (original.sealed && retrospective) fail('sealed block correction');
  const events = [...previousEvents, ...proposedEvents];
  const projection = foldBB2Block(opening, events);
  // Finish and its first quota credit are one atomic save. Without this
  // pairing a caller could persist a complete NORMAL session without credit;
  // later idempotent Finish retries would correctly no-op and never repair it.
  for (const finish of proposedEvents.filter(e => e.type === 'WORKOUT_FINISHED')) {
    const started = events.find(e => e.type === 'WORKOUT_STARTED' &&
      e.sessionId === finish.sessionId);
    if (started?.kind !== 'NORMAL') continue;
    const atFinish = foldBB2Block(opening, events.slice(0, finish.commitOrdinal));
    const status = atFinish.history.find(h => h.sessionId === finish.sessionId)?.status;
    if (status === 'COMPLETED_NORMAL_NONCREDIT' &&
        atFinish.quotas[started.templateId] < 8 &&
        !proposedEvents.some(e => e.type === 'CREDIT_GRANTED' &&
          e.sessionId === finish.sessionId)) {
      fail('NORMAL Finish requires CREDIT_GRANTED in same transaction');
    }
  }
  if (projection.requiredConsent.length) fail('unresolved correction consent');
  return { events: clone(events), projection };
}

// Generates a single Finish/credit transaction for callers to commit durably.
// A second Finish for the same stable ID is a no-op, never another quota grant.
function planBB2Finish(opening, previousEvents, sessionId, outcome = 'FINISH') {
  if (!['FINISH', 'INCOMPLETE'].includes(outcome)) fail('invalid Finish intent');
  const prior = foldBB2Block(opening, previousEvents);
  const start = previousEvents.find(e => e.type === 'WORKOUT_STARTED' && e.sessionId === sessionId);
  if (!start) fail('Finish without session Start');
  const existing = prior.history.find(h => h.sessionId === sessionId);
  if (existing) return { events: clone(previousEvents), projection: prior, noOp: true };
  const events = clone(previousEvents);
  events.push({ type: outcome === 'FINISH' ? 'WORKOUT_FINISHED' : 'WORKOUT_INCOMPLETE',
    eventId: `finish:${sessionId}`, commitOrdinal: events.length + 1, blockId: opening.blockId, sessionId });
  let projected = foldBB2Block(opening, events);
  if (outcome === 'FINISH' && start.kind === 'NORMAL' && projected.history.find(h => h.sessionId === sessionId)?.status === 'COMPLETED_NORMAL_NONCREDIT') {
    if (projected.quotas[start.templateId] >= 8) fail('normal quota full; choose EXTRA NORMAL');
    events.push({ type: 'CREDIT_GRANTED', eventId: `grant:${sessionId}`, commitOrdinal: events.length + 1,
      blockId: opening.blockId, sessionId, creditId: `credit:${sessionId}` });
    projected = foldBB2Block(opening, events);
  }
  return { events, projection: projected, noOp: false };
}

function createNextBB2Opening(previousOpening, previousEvents, newBlockId) {
  // Never let a caller supply a projection, even one whose internal fields
  // have been forged to agree. The only authority is the opening + exact
  // sealed chronological stream replayed by this implementation.
  if (!Array.isArray(previousEvents)) {
    fail('next block requires verified opening and events');
  }
  const previousProjection = foldBB2Block(previousOpening, previousEvents);
  return createNextBB2OpeningFromProjection(previousProjection, newBlockId);
}

// Pure snapshot-integrity check retained behind the verified public boundary.
// Export only createNextBB2Opening; cold tests may inspect this private guard
// in an isolated source evaluation, never as a production entry point.
function createNextBB2OpeningFromProjection(previousProjection, newBlockId) {
  const closing = previousProjection?.closingSnapshot;
  if (!previousProjection?.sealed || !closing?.sealId) fail('unsealed previous block');
  positiveId(newBlockId, 'next block');
  if (newBlockId === previousProjection.blockId) fail('next block must have a fresh ID');
  if (previousProjection.sealId !== closing.sealId ||
      previousProjection.blockId !== closing.sealedBlockId ||
      previousProjection.schemaVersion !== closing.schemaVersion ||
      previousProjection.foldRulesVersion !== closing.foldRulesVersion ||
      closing.openingSnapshotVersion !== 1 ||
      !sameCanonicalValue(previousProjection.progress, closing.progress) ||
      !sameCanonicalValue(previousProjection.selections, closing.selections) ||
      !sameCanonicalValue(Object.keys(previousProjection.pending || {}).sort(),
        Object.keys(closing.pending || {}).sort()) ||
      !TEMPLATES.every(t => previousProjection.quotas?.[t] === 8 &&
        closing.priorQuotas?.[t] === 8) ||
      !Array.isArray(closing.priorCreditIds) ||
      closing.priorCreditIds.length !== 32 ||
      new Set(closing.priorCreditIds).size !== 32 ||
      closing.priorCreditIds.some(id => !positiveId(id, 'prior credit') ||
        !Object.values(previousProjection.activeCredits || {}).includes(id))) {
    fail('invalid sealed block ancestry');
  }
  // Seal transition consumes a just-folded projection. A closing snapshot
  // must not quietly invent or retarget a pending offer while retaining the
  // same visible key; compare each source field against the current fold.
  for (const [key, offered] of Object.entries(previousProjection.pending || {})) {
    const carried = closing.pending?.[key];
    if (!carried || Object.entries(offered).some(([field, value]) =>
        carried[field] !== value) ||
        carried.sourceBlockId !== (offered.sourceBlockId || previousProjection.blockId)) {
      fail('invalid sealed pending provenance');
    }
    if (!offered.sourceBlockId && offered.kind === 'OFF_PLAN') {
      const [, roleSlotId] = key.split('|');
      const source = previousProjection.history?.find(h =>
        h.sessionId === offered.sessionId && h.blockId === previousProjection.blockId);
      const slot = source?.slots.find(x => x.roleSlotId === roleSlotId);
      const records = source?.sets.filter(x =>
        x.roleSlotId === roleSlotId && x.prescribed && x.setIndex < slot?.sets);
      if (!slot || records?.length !== slot.sets ||
          carried.sourceRepSum !== records.reduce((sum, x) => sum + x.reps, 0) ||
          carried.sourceAllTop !== records.every(x => x.reps >= slot.ceiling)) {
        fail('invalid sealed pending source evidence');
      }
    }
  }
  const next = createBB2Opening({ ownerId: previousProjection.ownerId, blockId: newBlockId,
    progress: closing.progress, sealRevision: previousProjection.sealRevision });
  next.selections = clone(closing.selections);
  next.pending = clone(closing.pending || {});
  next.previousQuotas = clone(closing.priorQuotas);
  next.previousCreditIds = clone(closing.priorCreditIds);
  next.previousSealId = closing.sealId;
  next.previousBlockId = closing.sealedBlockId;
  next.previousSchemaVersion = closing.schemaVersion;
  next.previousFoldRulesVersion = closing.foldRulesVersion;
  next.previousOpeningSnapshotVersion = closing.openingSnapshotVersion;
  validateOpening(next);
  return next;
}

function discardBB2Session(events, sessionId) {
  positiveId(sessionId, 'session');
  if (!events.some(e => e.type === 'WORKOUT_STARTED' && e.sessionId === sessionId)) fail('discard unknown session');
  if (events.some(e => e.sessionId === sessionId && ['WORKOUT_FINISHED', 'WORKOUT_INCOMPLETE'].includes(e.type))) fail('cannot discard completed session');
  const localOnly = new Set(['WORKOUT_STARTED', 'EXERCISE_LOCKED', 'CALIBRATION_PLAN_REVISED',
    'CALIBRATION_ACCEPTED', 'SET_RECORDED', 'EXTRA_SET_RECORDED', 'NOTE_EDITED']);
  const next = events.map(e => e.sessionId === sessionId && localOnly.has(e.type) ?
    { type: 'TOMBSTONE', eventId: e.eventId, commitOrdinal: e.commitOrdinal, blockId: e.blockId, discardedSessionId: sessionId } : clone(e));
  next.push({ type: 'WORKOUT_DISCARDED', eventId: `discard:${sessionId}:${events.length + 1}`,
    commitOrdinal: events.length + 1, blockId: events[0].blockId, sessionId });
  return next;
}

module.exports = { SCHEMA_VERSION, FOLD_RULES_VERSION, TEMPLATES, EVENT_TYPES,
  identity, canonicalGrams, resolveNumericSubmission, createBB2Opening,
  foldBB2Block, commitBB2Transaction, planBB2Finish, createNextBB2Opening,
  discardBB2Session };
};
factories["./catalogue.cjs"] = function (module, exports, require) {
/* BVOM BB2 Stage (ii) — pure, versioned setup/catalogue contracts.
 * No storage, BB1 imports, app shell or runtime enablement.
 * Exercise identities and rep/set overrides are independent of fold rules v1.
 */
'use strict';

const CATALOGUE_VERSION = 1;
const TEMPLATE_ORDER = Object.freeze(['upper_a', 'lower_a', 'upper_b', 'lower_b']);
const WARMUP_ORDER = Object.freeze(['FULL', 'FEEDER', 'QUALITATIVE', 'NONE']);
const fail = message => { throw Error('BB2 catalogue: ' + message); };
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const only = (value, fields, description) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid ' + description);
  for (const field of Object.keys(value)) if (!fields.includes(field)) {
    fail('unknown ' + description + ' field: ' + field);
  }
};
const E = (id, equipment = 'loaded', overrides = {}) => Object.freeze({ id, equipment, ...overrides });
const R = (roleSlotId, sets, floor, ceiling, warmup, options, optional = false) =>
  Object.freeze({ roleSlotId, sets, floor, ceiling, warmup,
    defaultExerciseId: options[0].id, options: Object.freeze(options), optional });

// The prescribed counts, ranges, and the four specialist overrides are from
// Rev 3.5.1 §§3,6. Other equipment choices are a finite initial setup list;
// extending that list later requires catalogue-version/compatibility review.
const CATALOGUE = Object.freeze({
  upper_a: Object.freeze([
    R('flat_press', 3, 6, 10, 'FULL', [E('bench_press'), E('dumbbell_flat_press'), E('machine_chest_press')]),
    R('horizontal_row', 3, 8, 12, 'FEEDER', [E('chest_supported_row'), E('barbell_row'), E('dumbbell_row'), E('cable_row')]),
    R('shoulder_press', 2, 8, 12, 'FEEDER', [E('overhead_press'), E('dumbbell_shoulder_press'),
      E('machine_shoulder_press'), E('log_push_press', 'loaded', { sets: 2, floor: 4, ceiling: 6, warmup: 'FULL' })]),
    R('vertical_pull', 2, 8, 12, 'QUALITATIVE', [E('pullup', 'bodyweight'), E('chinup', 'bodyweight'),
      E('lat_pulldown', 'loaded', { warmup: 'FEEDER' })]),
    R('triceps_extension', 2, 10, 15, 'NONE', [E('lying_barbell_triceps_extension'),
      E('dumbbell_triceps_extension'), E('cable_triceps_pushdown')])
  ]),
  lower_a: Object.freeze([
    R('squat', 3, 6, 8, 'FULL', [E('high_bar_squat'), E('front_squat'), E('goblet_squat'), E('leg_press')]),
    R('unilateral_quad', 2, 8, 12, 'FULL', [E('bulgarian_split_squat'), E('walking_lunge'),
      E('supported_split_squat', 'loaded', { warmup: 'FEEDER' })]),
    R('hamstring_curl', 2, 8, 15, 'NONE', [E('lying_leg_curl'),
      E('nordic_curl', 'bodyweight', { floor: 4, ceiling: 8, warmup: 'QUALITATIVE' }),
      E('assisted_nordic_curl', 'bodyweight', { warmup: 'QUALITATIVE' }),
      E('slider_leg_curl', 'bodyweight', { warmup: 'QUALITATIVE' })]),
    R('calf_raise', 2, 10, 20, 'NONE', [E('standing_calf_raise'), E('seated_calf_raise'),
      E('bodyweight_calf_raise', 'bodyweight')]),
    R('abdominal', 2, 10, 15, 'NONE', [E('weighted_crunch'), E('hanging_knee_raise', 'bodyweight'),
      E('cable_crunch')])
  ]),
  upper_b: Object.freeze([
    R('incline_press', 3, 6, 10, 'FULL', [E('incline_barbell_press'), E('incline_dumbbell_press'),
      E('incline_machine_press')]),
    R('vertical_pull', 3, 8, 12, 'QUALITATIVE', [E('chinup', 'bodyweight'), E('pullup', 'bodyweight'),
      E('lat_pulldown', 'loaded', { warmup: 'FULL' })]),
    R('horizontal_row', 2, 8, 12, 'FEEDER', [E('chest_supported_row'), E('barbell_row'),
      E('dumbbell_row'), E('cable_row')]),
    R('secondary_chest', 2, 10, 15, 'FEEDER', [E('dumbbell_fly'), E('machine_fly'),
      E('pushup', 'bodyweight', { warmup: 'QUALITATIVE' })]),
    R('lateral_raise', 3, 12, 20, 'NONE', [E('dumbbell_lateral_raise'),
      E('cable_lateral_raise'), E('machine_lateral_raise')]),
    R('biceps_curl', 2, 10, 15, 'NONE', [E('barbell_curl'), E('dumbbell_curl'),
      E('cable_curl')], true)
  ]),
  lower_b: Object.freeze([
    R('hip_hinge', 3, 6, 10, 'FULL', [E('romanian_deadlift'),
      E('conventional_deadlift', 'loaded', { sets: 2, floor: 4, ceiling: 6 })]),
    R('quad', 3, 8, 12, 'FEEDER', [E('front_squat'), E('leg_press'), E('hack_squat'), E('goblet_squat')]),
    R('hamstring_curl', 2, 10, 15, 'NONE', [E('lying_leg_curl'),
      E('nordic_curl', 'bodyweight', { floor: 4, ceiling: 8, warmup: 'QUALITATIVE' }),
      E('assisted_nordic_curl', 'bodyweight', { warmup: 'QUALITATIVE' }),
      E('slider_leg_curl', 'bodyweight', { warmup: 'QUALITATIVE' })]),
    R('calf_raise', 2, 10, 20, 'NONE', [E('standing_calf_raise'), E('seated_calf_raise'),
      E('bodyweight_calf_raise', 'bodyweight')]),
    R('abdominal', 2, 10, 15, 'NONE', [E('weighted_crunch'), E('hanging_knee_raise', 'bodyweight'),
      E('cable_crunch')])
  ])
});

const selectionKey = (templateId, roleSlotId) => `${templateId}|${roleSlotId}`;
const allRoles = TEMPLATE_ORDER.flatMap(templateId =>
  CATALOGUE[templateId].map(role => ({ templateId, ...role })));
const selectionsDefault = () => Object.fromEntries(allRoles.map(role =>
  [selectionKey(role.templateId, role.roleSlotId), role.defaultExerciseId]));

function validateBB2Setup(setup) {
  only(setup, ['catalogueVersion', 'optionalUpperBCurls', 'selections'], 'setup');
  if (setup.catalogueVersion !== CATALOGUE_VERSION) fail('unsupported catalogue version');
  if (typeof setup.optionalUpperBCurls !== 'boolean') fail('invalid optional curls selection');
  const expected = selectionsDefault();
  only(setup.selections, Object.keys(expected), 'setup selections');
  if (Object.keys(setup.selections).length !== Object.keys(expected).length) fail('incomplete setup selections');
  for (const role of allRoles) {
    const selected = setup.selections[selectionKey(role.templateId, role.roleSlotId)];
    if (typeof selected !== 'string' || !role.options.some(option => option.id === selected)) {
      fail('exercise is not in finite catalogue: ' + selectionKey(role.templateId, role.roleSlotId));
    }
  }
  return setup;
}

function createBB2Setup({ optionalUpperBCurls = false, selections = {} } = {}) {
  only(selections, Object.keys(selectionsDefault()), 'setup selections');
  const result = { catalogueVersion: CATALOGUE_VERSION, optionalUpperBCurls,
    selections: { ...selectionsDefault(), ...selections } };
  validateBB2Setup(result);
  return Object.freeze({ ...result, selections: Object.freeze(result.selections) });
}

function chooseBB2Exercise(setup, templateId, roleSlotId, exerciseId) {
  validateBB2Setup(setup);
  if (!CATALOGUE[templateId]?.some(role => role.roleSlotId === roleSlotId)) {
    fail('invalid exercise role');
  }
  return createBB2Setup({ optionalUpperBCurls: setup.optionalUpperBCurls,
    selections: { ...setup.selections, [selectionKey(templateId, roleSlotId)]: exerciseId } });
}

function setBB2OptionalCurls(setup, enabled) {
  validateBB2Setup(setup);
  return createBB2Setup({ optionalUpperBCurls: enabled, selections: setup.selections });
}

function getBB2TemplatePrescription(setup, templateId) {
  validateBB2Setup(setup);
  if (!own(CATALOGUE, templateId)) fail('unknown template');
  const prescribed = CATALOGUE[templateId].filter(role =>
    !role.optional || setup.optionalUpperBCurls).map((role, originalIndex) => {
    const exerciseId = setup.selections[selectionKey(templateId, role.roleSlotId)];
    const variant = role.options.find(option => option.id === exerciseId);
    return { roleSlotId: role.roleSlotId, exerciseId,
      sets: variant.sets ?? role.sets, floor: variant.floor ?? role.floor,
      ceiling: variant.ceiling ?? role.ceiling, equipment: variant.equipment,
      warmup: variant.warmup ?? role.warmup, originalIndex };
  });
  // One shared stable order for future Workout and Warm-up rendering; FULL
  // and FEEDER numeric preparation precedes qualitative and small work.
  prescribed.sort((a, b) => WARMUP_ORDER.indexOf(a.warmup) - WARMUP_ORDER.indexOf(b.warmup) ||
    a.originalIndex - b.originalIndex);
  const slots = prescribed.map(({ originalIndex, ...slot }) => Object.freeze(slot));
  const setCount = slots.reduce((sum, slot) => sum + slot.sets, 0);
  return Object.freeze({ catalogueVersion: CATALOGUE_VERSION, templateId,
    slots: Object.freeze(slots), prescribedCount: setCount,
    minimumToFinish: Math.ceil(.70 * setCount) });
}

module.exports = { CATALOGUE_VERSION, TEMPLATE_ORDER, WARMUP_ORDER, CATALOGUE,
  createBB2Setup, validateBB2Setup, chooseBB2Exercise,
  setBB2OptionalCurls, getBB2TemplatePrescription };
};
factories["./start.cjs"] = function (module, exports, require) {
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
};
factories["./restore.cjs"] = function (module, exports, require) {
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
};
factories["./local-store.cjs"] = function (module, exports, require) {
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
};
const cache = Object.create(null);
function load(id) {
  if (!Object.hasOwn(factories, id)) throw Error("BB2 browser: unknown module " + id);
  if (Object.hasOwn(cache, id)) return cache[id].exports;
  const module = { exports: {} };
  cache[id] = module;
  factories[id](module, module.exports, load);
  return module.exports;
}
export const BB2_BROWSER_SOURCE_SHA256 = "58f7a4d4c4a17ce7ef829562d465a6efd1f0f10e911604d373c3150aecd9a0c8";
export const BB2_BROWSER_MODULES = Object.freeze({
  ledger: Object.freeze(load("./ledger.cjs")),
  catalogue: Object.freeze(load("./catalogue.cjs")),
  start: Object.freeze(load("./start.cjs")),
  restore: Object.freeze(load("./restore.cjs")),
  localStore: Object.freeze(load("./local-store.cjs"))
});
export const createBB2LocalStore = BB2_BROWSER_MODULES.localStore.createBB2LocalStore;
export const createBB2Setup = BB2_BROWSER_MODULES.catalogue.createBB2Setup;
export const validateBB2Setup = BB2_BROWSER_MODULES.catalogue.validateBB2Setup;
export const setBB2OptionalCurls = BB2_BROWSER_MODULES.catalogue.setBB2OptionalCurls;
export const getBB2TemplatePrescription = BB2_BROWSER_MODULES.catalogue.getBB2TemplatePrescription;
export const createBB2Opening = BB2_BROWSER_MODULES.ledger.createBB2Opening;
export const foldBB2Block = BB2_BROWSER_MODULES.ledger.foldBB2Block;
export const planBB2Finish = BB2_BROWSER_MODULES.ledger.planBB2Finish;
export const validateBB2RestoredBlock = BB2_BROWSER_MODULES.restore.validateBB2RestoredBlock;
export const bb2FinishRevisionKey = BB2_BROWSER_MODULES.restore.bb2FinishRevisionKey;
