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
    positiveId(origin.sourceEventId, `${name} derived source`);
  } else if (!origin || typeof origin.value !== 'string' ||
    !['kg', 'lb'].includes(origin.unit) || canonicalGrams(origin.value, origin.unit) !== grams) {
    fail(`invalid ${name} origin`);
  }
  return clone(origin);
}
function resolveNumericSubmission(original, submitted, unit, intent) {
  if (!['PRESCRIPTION', 'ACTUAL', 'DIFFERENT_ACTUAL', 'INCREMENT'].includes(intent)) fail('invalid numeric intent');
  if (!original || !Number.isSafeInteger(original.grams)) fail('invalid canonical origin');
  validateMassOrigin(original.grams,
    { value: String(original.originalValue), unit: original.originalUnit }, 'canonical');
  if (intent !== 'DIFFERENT_ACTUAL' && unit === original.unit && sameDecimal(submitted, original.displayed)) {
    return { grams: original.grams,
      origin: { value: String(original.originalValue), unit: original.originalUnit },
      inherited: true, emitEvent: false };
  }
  if (intent === 'ACTUAL') fail('different actual requires explicit different-actual control');
  const grams = canonicalGrams(submitted, unit);
  const unchanged = (intent === 'PRESCRIPTION' || intent === 'INCREMENT') && grams === original.grams;
  return { grams: unchanged ? original.grams : grams,
    origin: unchanged ? { value: String(original.originalValue), unit: original.originalUnit } :
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
      integer(offer.valueG, 'carried offered grams');
      integer(offer.plannedG, 'carried planned grams');
      integer(offer.sourceRepSum, 'carried source rep sum', 1);
      if (typeof offer.sourceAllTop !== 'boolean') fail('invalid carried top-set evidence');
    } else if (offer.kind === 'DIFFICULTY') {
      positiveId(offer.variation, 'carried variation');
      if (typeof offer.assistance !== 'string') fail('invalid carried assistance');
      if (offer.addedWeightG !== undefined) integer(offer.addedWeightG, 'carried added weight');
    } else fail('invalid carried decision kind');
  }
}
function validateEventPayload(e) {
  const mass = (name, field, originField) => validateMassOrigin(e[field], e[originField], name);
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
      if (e.plannedG !== undefined) mass('planned', 'plannedG', 'plannedOrigin');
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
      break;
    case 'INCREMENT_EDITED': mass('increment', 'incrementG', 'incrementOrigin'); break;
    case 'SET_RECORDED':
    case 'EXTRA_SET_RECORDED':
    case 'SET_CORRECTED':
      if (e.actualG !== undefined) mass('actual', 'actualG', 'actualOrigin');
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
        validateMassOrigin(e.loadG, e.loadOrigin, 'replacement load');
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
  return p;
}
function validateSlot(s) {
  positiveId(s.roleSlotId, 'slot'); positiveId(s.exerciseId, 'exercise');
  integer(s.sets, 'prescribed set count', 1); integer(s.ceiling, 'rep ceiling', 1);
  if (s.equipment !== 'loaded' && s.equipment !== 'bodyweight') fail('invalid equipment');
  if (s.equipment === 'bodyweight' &&
      (typeof s.variation !== 'string' || !s.variation.trim() ||
       typeof s.assistance !== 'string')) fail('invalid bodyweight slot identity');
  if (s.plannedG !== undefined) validateMassOrigin(s.plannedG, s.plannedOrigin, 'planned');
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
  validateOpening(openingSnapshot); validateEvents(openingSnapshot, chronologicalEvents);
  const opening = clone(openingSnapshot);
  const { records, voidSessions } = effectiveRevisions(chronologicalEvents);
  const progress = Object.fromEntries(Object.entries(opening.progress).map(([k, v]) => [k, initialProgress(v)]));
  const sessions = new Map(), choices = [], boundaries = [], notes = new Map(), hidden = new Set();
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
    const prior = foldBB2Block(openingSnapshot, chronologicalEvents.slice(0, ordinal - 1));
    return !!prior.progress[identity(s.templateId, slot.roleSlotId, slot.exerciseId)]?.calibrated;
  };
  const epoch = (p, id, nextLoad, origin = null) => { if (p.loadG !== nextLoad) {
    p.loadG = nextLoad;
    p.loadOrigin = origin ? clone(origin) : { kind: 'DERIVED', sourceEventId: id };
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
            const historical = foldBB2Block(openingSnapshot,
              chronologicalEvents.slice(0, e.commitOrdinal - 1));
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
        for (const field of ['equipment', 'sets', 'ceiling', 'incrementG',
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
          const prior = foldBB2Block(openingSnapshot,
            chronologicalEvents.slice(0, e.commitOrdinal - 1));
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
        if (e.type === 'SET_RECORDED' && (e.setIndex >= slot.sets || e.prescribed !== true)) fail('set not prescribed');
        if (e.type === 'EXTRA_SET_RECORDED') {
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
            p.calibrated = true;
            const accepted = s.accepted.get(slot.roleSlotId);
            if (accepted) epoch(p, `calibration:${accepted.eventId}`, accepted.loadG, accepted.loadOrigin);
            else if (info.onPlan && !info.harder) epoch(p, `promote:${e.eventId}`, slot.plannedG ?? null, slot.plannedOrigin);
            // Retroactive first calibration can also be a qualified, independent
            // reaffirmation of its saved plan for historical consent precedence.
            // It must not earn an automatic first-exposure weight increase.
            if (info.onPlan && !info.harder) boundary(key, e.commitOrdinal, 'qualified-calibration');
            if (info.uniform && !info.harder && info.actualG === p.loadG) {
              p.bestReps = info.repSum; p.stallCount = 0;
            }
          } else if (info.onPlan && !info.harder) {
            if (p.loadG !== (slot.plannedG ?? null)) {
              epoch(p, `promote:${e.eventId}:${key}`, slot.plannedG ?? null, slot.plannedOrigin);
            }
            boundary(key, e.commitOrdinal, 'qualified-finish');
            const beforeStall = p.stallCount;
            if (slot.equipment === 'bodyweight' && info.allTop) {
              pending[key] = { kind: 'DIFFICULTY', sessionId: s.sessionId, variation: slot.variation,
                assistance: slot.assistance, addedWeightG: slot.plannedG };
            } else if (slot.equipment === 'loaded' && info.allTop) epoch(p, `earned:${e.eventId}:${key}`, p.loadG + p.incrementG);
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
                epoch(p, `earned-choice:${e.eventId}`, p.loadG + p.incrementG);
              }
            }
          } else {
            if (!['HOLD','DIFFICULTY_ACCEPT'].includes(e.decision)) fail('invalid carried difficulty decision');
            if (e.decision === 'DIFFICULTY_ACCEPT') {
              positiveId(e.variation, 'accepted carried difficulty variation');
              if (typeof e.assistance !== 'string') fail('invalid carried difficulty assistance');
              integer(e.addedWeightG, 'accepted carried added weight');
              p.variation = e.variation; p.assistance = e.assistance;
              epoch(p, `choice:${e.eventId}`, e.addedWeightG, e.addedWeightOrigin);
              p.epochId = `choice:${e.eventId}`; p.bestReps = null; p.stallCount = 0;
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
        const offeredOffPlan = sourceEligible && sourceEvidence.complete &&
          sourceEvidence.uniform && !sourceEvidence.harder && !sourceEvidence.onPlan &&
          slot.equipment === 'loaded';
        if (e.type === 'CHOICE_RESOLVED' && ['ACCEPT', 'KEEP'].includes(e.decision)) {
          if (!offeredOffPlan) fail('choice has no original eligible off-plan offer');
          if (e.decision === 'ACCEPT' && e.loadG !== sourceEvidence.actualG) {
            fail('accepted value differs from original off-plan offer');
          }
        }
        if (e.type === 'CHOICE_RESOLVED' && ['HOLD', 'DIFFICULTY_ACCEPT'].includes(e.decision)) {
          if (!(sourceEligible && sourceEvidence.complete && sourceEvidence.onPlan &&
                !sourceEvidence.harder && sourceEvidence.allTop && slot.equipment === 'bodyweight')) {
            fail('difficulty choice has no eligible bodyweight offer');
          }
        }
        if (e.type === 'CHOICE_RESOLVED') {
          // Resolution is a one-shot decision linked to the precise source,
          // never a generic future prescription edit. A later independent
          // working-value decision or qualified Finish makes the old offer
          // stale, whereas an increment-only edit does not.
          const offerId = `${s.sessionId}|${key}`;
          if (resolvedOffers.has(offerId)) fail('offer already resolved');
          if (boundaries.some(b => b.key === key &&
              b.ordinal > s.finishOrdinal && b.ordinal < e.commitOrdinal)) {
            fail('stale offer superseded by later prescription');
          }
          resolvedOffers.add(offerId);
        }
        const p = getProgress(key, slot);
        if (e.decision === 'ACCEPT' || e.decision === 'REPLACE') {
          integer(e.loadG, 'accepted grams'); epoch(p, `choice:${e.eventId}`, e.loadG, e.loadOrigin);
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
            if (info.allTop) epoch(p, `earned-choice:${e.eventId}`, p.loadG + p.incrementG);
          }
          choices.push({ eventId: e.eventId, ordinal: e.commitOrdinal, sourceSessionId: s.sessionId,
            key, valueG: e.loadG, validOffer, decision: e.decision });
          boundary(key, e.commitOrdinal, 'explicit');
        } else if (e.decision === 'DIFFICULTY_ACCEPT') {
          positiveId(e.variation, 'accepted difficulty variation');
          if (typeof e.assistance !== 'string') fail('missing accepted assistance');
          integer(e.addedWeightG, 'added bodyweight grams');
          p.variation = e.variation; p.assistance = e.assistance;
          epoch(p, `choice:${e.eventId}`, e.addedWeightG, e.addedWeightOrigin);
          p.epochId = `choice:${e.eventId}`; p.bestReps = null; p.stallCount = 0;
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
      case 'CHOICE_RECLASSIFIED': break; // audit only, original choice keeps original effective ordinal
      case 'CREDIT_GRANTED':
      case 'CREDIT_REGRANTED': {
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
        const historical = foldBB2Block(openingSnapshot,
          chronologicalEvents.slice(0, e.commitOrdinal - 1));
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
    ['SET_CORRECTED', 'SET_VOIDED', 'SESSION_VOIDED', 'CHOICE_RECLASSIFIED', 'CHOICE_REPLACED'].includes(e.type));
  // A missing active-workout answer is not equivalent to a verified clear.
  if (retrospective && guard.activeWorkout !== false) fail('active workout blocks correction');
  if (original.sealed && retrospective) fail('sealed block correction');
  const events = [...previousEvents, ...proposedEvents];
  const projection = foldBB2Block(opening, events);
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

function createNextBB2Opening(previousProjection, newBlockId) {
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
