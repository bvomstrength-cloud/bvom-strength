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
const positiveId = (x, name) => { if (typeof x !== 'string' || !x.trim()) fail(`invalid ${name}`); return x; };
const integer = (x, name, min = 0) => { if (!Number.isSafeInteger(x) || x < min) fail(`invalid ${name}`); return x; };
const identity = (templateId, roleSlotId, exerciseId) =>
  [positiveId(templateId, 'template'), positiveId(roleSlotId, 'slot'), positiveId(exerciseId, 'exercise')].join('|');

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
    progress: clone(progress), previousQuotas: null, previousCreditIds: [], sealed: false
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
  for (const item of Object.values(opening.progress)) initialProgress(item);
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
      mass('planned', 'plannedG', 'plannedOrigin');
      break;
    case 'CALIBRATION_PLAN_REVISED': mass('planned', 'plannedG', 'plannedOrigin'); break;
    case 'CALIBRATION_ACCEPTED':
    case 'PRESCRIPTION_EDITED':
    case 'STALL_REDUCTION_ACCEPTED':
    case 'CHOICE_RESOLVED':
    case 'CHOICE_REPLACED':
      if (e.loadG !== undefined) mass('working load', 'loadG', 'loadOrigin');
      break;
    case 'INCREMENT_EDITED': mass('increment', 'incrementG', 'incrementOrigin'); break;
    case 'SET_RECORDED':
    case 'EXTRA_SET_RECORDED':
    case 'SET_CORRECTED':
      if (e.actualG !== undefined) mass('actual', 'actualG', 'actualOrigin');
      break;
    case 'NOTE_EDITED':
      if (typeof e.text !== 'string') fail('invalid note text');
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
    if (e.type === 'CHOICE_RESOLVED' && e.decision === 'ACCEPT') {
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
  if (s.plannedG !== undefined) validateMassOrigin(s.plannedG, s.plannedOrigin, 'planned');
  if (s.equipment === 'loaded' && s.plannedG === undefined) fail('missing planned grams');
  if (s.incrementG !== undefined) validateMassOrigin(s.incrementG, s.incrementOrigin, 'increment');
  integer(s.incrementG ?? 2500, 'increment grams', 1);
}
function validSet(record, slot) {
  if (!record || !Number.isSafeInteger(record.reps) || record.reps <= 0) return false;
  if (slot.equipment === 'loaded') return Number.isSafeInteger(record.actualG) && record.actualG >= 0;
  return typeof record.variation === 'string' && record.variation.length > 0;
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
        integer(e.actualG, 'corrected grams');
      }
      // A reps/load-only revision must not erase bodyweight identity or effort.
      // Explicit values (including false) take precedence; omitted values
      // inherit the last revision, falling back to original after a void.
      const prior = records.get(key) || originals.get(key);
      records.set(key, e.type === 'SET_VOIDED' ? null : { ...prior,
        reps: e.reps, actualG: e.actualG, actualOrigin: clone(e.actualOrigin),
        harderThanIntended: own(e, 'harderThanIntended') ? e.harderThanIntended : prior.harderThanIntended,
        variation: own(e, 'variation') ? e.variation : prior.variation,
        assistance: own(e, 'assistance') ? e.assistance : prior.assistance });
    }
    if (e.type === 'SESSION_VOIDED') voidSessions.add(e.sessionId);
  }
  return { records, voidSessions };
}
function foldBB2Block(openingSnapshot, chronologicalEvents) {
  validateOpening(openingSnapshot); validateEvents(openingSnapshot, chronologicalEvents);
  const opening = clone(openingSnapshot);
  const { records, voidSessions } = effectiveRevisions(chronologicalEvents);
  const progress = Object.fromEntries(Object.entries(opening.progress).map(([k, v]) => [k, initialProgress(v)]));
  const sessions = new Map(), choices = [], boundaries = [], notes = new Map(), hidden = new Set();
  const selections = clone(opening.selections || {}), unitMetadata = [];
  const grants = new Map(), activeCredits = new Map(), pending = {};
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
  const getProgress = (key, plan) => progress[key] ||= initialProgress({}, plan);
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
        if (!TEMPLATES.includes(e.templateId) || !['NORMAL', 'EXTRA_NORMAL', 'RECOVERY'].includes(e.kind)) fail('invalid workout type');
        if (e.kind === 'NORMAL' && quotas[e.templateId] >= 8) fail('normal quota full; use EXTRA NORMAL');
        if (e.kind === 'EXTRA_NORMAL' && quotas[e.templateId] < 8) fail('EXTRA NORMAL requires filled template quota');
        if (sealed && e.kind !== 'RECOVERY') fail('sealed block only permits recovery');
        if (!Array.isArray(e.slots) || !e.slots.length) fail('missing session slots');
        const slots = clone(e.slots), names = new Set();
        for (const s of slots) {
          validateSlot(s); if (names.has(s.roleSlotId)) fail('duplicate role slot'); names.add(s.roleSlotId);
          const key = identity(e.templateId, s.roleSlotId, s.exerciseId);
          if (pending[key]) fail('unresolved choice blocks same exercise');
        }
        sessions.set(e.sessionId, { sessionId: e.sessionId, templateId: e.templateId, kind: e.kind, slots,
          initialSlots: clone(slots), locks: new Set(), seenSets: new Set(), accepted: new Map(), outcome: null,
          finishOrdinal: null, note: '' });
        break;
      }
      case 'EXERCISE_LOCKED': {
        const s = sessions.get(e.sessionId), slot = findSlot(s, e);
        if (s.locks.has(slot.roleSlotId)) fail('duplicate exercise lock');
        if (s.seenSets.has(slot.roleSlotId)) fail('late exercise lock');
        if (e.plannedG !== slot.plannedG) fail('lock plan differs from committed plan');
        s.locks.add(slot.roleSlotId); break;
      }
      case 'PRESCRIPTION_EDITED':
      case 'INCREMENT_EDITED':
      case 'VARIATION_EDITED':
      case 'STALL_REDUCTION_ACCEPTED': {
        if (e.scope && e.scope !== 'GLOBAL') fail('non-global edit');
        const templateId = e.templateId ?? sessions.get(e.sessionId)?.templateId;
        const key = identity(templateId, e.roleSlotId, e.exerciseId);
        const session = e.sessionId ? sessions.get(e.sessionId) : null;
        const slot = session ? findSlot(session, e) : null;
        if (slot && (session.locks.has(slot.roleSlotId) || session.seenSets.has(slot.roleSlotId))) fail('edit after lock');
        const p = getProgress(key, slot);
        if (e.type === 'INCREMENT_EDITED') {
          integer(e.incrementG, 'increment grams', 1);
          if (p.incrementG === e.incrementG) fail('no-op increment event');
          p.incrementG = e.incrementG; p.incrementOrigin = clone(e.incrementOrigin);
          if (slot) { slot.incrementG = e.incrementG; slot.incrementOrigin = clone(e.incrementOrigin); }
        } else if (e.type === 'VARIATION_EDITED') {
          positiveId(e.variation, 'variation');
          if (p.variation === e.variation) fail('no-op variation event');
          p.variation = e.variation; p.bestReps = null; p.stallCount = 0; p.epochId = `event:${e.eventId}`;
          if (slot) slot.variation = e.variation;
          boundary(key, e.commitOrdinal, 'explicit');
        } else {
          integer(e.loadG, 'working grams');
          if (p.loadG === e.loadG) fail('no-op prescription event');
          epoch(p, `event:${e.eventId}`, e.loadG, e.loadOrigin);
          if (slot) { slot.plannedG = e.loadG; slot.plannedOrigin = clone(e.loadOrigin); }
          boundary(key, e.commitOrdinal, 'explicit');
        }
        break;
      }
      case 'SET_RECORDED':
      case 'EXTRA_SET_RECORDED': {
        const s = sessions.get(e.sessionId), slot = findSlot(s, e);
        if (s.outcome) fail('set after outcome');
        if (e.type === 'SET_RECORDED' && (e.setIndex >= slot.sets || e.prescribed !== true)) fail('set not prescribed');
        if (e.type === 'EXTRA_SET_RECORDED' && e.setIndex < slot.sets) fail('extra set uses prescribed index');
        if (!validSet(e, slot)) fail('invalid recorded set');
        s.seenSets.add(slot.roleSlotId); s.locks.add(slot.roleSlotId); break;
      }
      case 'CALIBRATION_PLAN_REVISED': {
        const s = sessions.get(e.sessionId), slot = findSlot(s, e);
        if (s.outcome || !s.seenSets.has(slot.roleSlotId)) fail('invalid calibration trial');
        integer(e.plannedG, 'calibration grams');
        // Trial is session-only; it does not rewrite the historical initial or existing actuals.
        slot.calibrationTrialG = e.plannedG;
        slot.calibrationTrialOrigin = clone(e.plannedOrigin);
        break;
      }
      case 'CALIBRATION_ACCEPTED': {
        const s = sessions.get(e.sessionId), slot = findSlot(s, e);
        if (s.outcome) fail('calibration choice after outcome');
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
            else if (info.onPlan && !info.harder) epoch(p, `promote:${e.eventId}`, slot.plannedG, slot.plannedOrigin);
            // Retroactive first calibration can also be a qualified, independent
            // reaffirmation of its saved plan for historical consent precedence.
            // It must not earn an automatic first-exposure weight increase.
            if (info.onPlan && !info.harder) boundary(key, e.commitOrdinal, 'qualified-calibration');
            if (info.uniform && !info.harder && info.actualG === p.loadG) {
              p.bestReps = info.repSum; p.stallCount = 0;
            }
          } else if (info.onPlan && !info.harder) {
            if (p.loadG !== slot.plannedG) epoch(p, `promote:${e.eventId}:${key}`, slot.plannedG, slot.plannedOrigin);
            boundary(key, e.commitOrdinal, 'qualified-finish');
            if (slot.equipment === 'bodyweight' && info.allTop) {
              pending[key] = { kind: 'DIFFICULTY', sessionId: s.sessionId, variation: slot.variation,
                assistance: slot.assistance, addedWeightG: slot.plannedG };
            } else if (slot.equipment === 'loaded' && info.allTop) epoch(p, `earned:${e.eventId}:${key}`, p.loadG + p.incrementG);
            else if (p.bestReps === null || info.repSum > p.bestReps) { p.bestReps = info.repSum; p.stallCount = 0; }
            else p.stallCount++;
            if (slot.equipment !== 'bodyweight' || !info.allTop) delete pending[key];
          } else if (info.uniform && !info.harder && !info.onPlan && slot.equipment === 'loaded') {
            pending[key] = { kind: 'OFF_PLAN', sessionId: s.sessionId, valueG: info.actualG, plannedG: slot.plannedG };
          }
          p.lastNormalSessionId = s.sessionId;
        }
        break;
      }
      case 'CHOICE_RESOLVED':
      case 'CHOICE_REPLACED': {
        const s = sessions.get(e.sourceSessionId);
        if (!s || !s.finishOrdinal || e.commitOrdinal <= s.finishOrdinal) fail('choice before source Finish');
        const slot = findSlot(s, e), key = identity(s.templateId, slot.roleSlotId, slot.exerciseId);
        if (!['ACCEPT', 'KEEP', 'HOLD', 'DIFFICULTY_ACCEPT', 'REPLACE'].includes(e.decision)) fail('invalid decision');
        const p = getProgress(key, slot);
        if (e.decision === 'ACCEPT' || e.decision === 'REPLACE') {
          integer(e.loadG, 'accepted grams'); epoch(p, `choice:${e.eventId}`, e.loadG, e.loadOrigin);
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
        if (e.type === 'HISTORY_HIDDEN') hidden.add(e.sessionId);
        if (e.type === 'HISTORY_UNHIDDEN') hidden.delete(e.sessionId);
        if (e.type === 'NOTE_EDITED') notes.set(e.sessionId, e.text);
        break;
      }
      case 'EXERCISE_SWAPPED': {
        if (!TEMPLATES.includes(e.templateId)) fail('invalid swap template');
        positiveId(e.roleSlotId, 'swap slot'); positiveId(e.exerciseId, 'selected exercise');
        if (e.sessionId) fail('exercise swap after Start');
        selections[`${e.templateId}|${e.roleSlotId}`] = e.exerciseId;
        break;
      }
      case 'UNIT_METADATA': unitMetadata.push({ eventId: e.eventId, ordinal: e.commitOrdinal, unit: e.unit }); break;
      case 'SESSION_VOIDED': {
        if (!sessions.has(e.sessionId) || !sessions.get(e.sessionId).outcome) fail('void unknown/unfinished session'); break;
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
        break;
      }
      case 'BLOCK_CREATED':
      case 'WORKOUT_DISCARDED':
      case 'STALL_OFFER_DISMISSED':
      case 'TOMBSTONE': break;
      default: fail('unsupported event handling');
    }
  }
  // A corrected-ineligible credit must be explicitly revoked; never silently reallocate.
  for (const [sessionId] of activeCredits) if (!sessions.get(sessionId)?.eligible) fail('ineligible active credit requires revoke');
  const requiredConsent = [];
  for (const choice of choices) {
    if (choice.decision !== 'ACCEPT' || choice.validOffer) continue;
    const superseded = boundaries.some(b => b.key === choice.key && b.ordinal > choice.ordinal);
    const classified = chronologicalEvents.some(e => e.type === 'CHOICE_RECLASSIFIED' && e.targetEventId === choice.eventId && e.decision === 'KEEP_AS_MANUAL');
    const replaced = chronologicalEvents.some(e => e.type === 'CHOICE_REPLACED' && e.targetEventId === choice.eventId);
    if (!superseded && !classified && !replaced) requiredConsent.push({ choiceEventId: choice.eventId, sourceSessionId: choice.sourceSessionId, key: choice.key, valueG: choice.valueG });
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
    validCount: s.validCount, slots: clone(s.slots), hidden: hidden.has(s.sessionId), note: notes.get(s.sessionId) || '',
    sets: s.slots.flatMap(slot => [...records.entries()].filter(([k, record]) =>
      k.startsWith(`${s.sessionId}|${slot.roleSlotId}|`) && record).map(([, record]) => ({
      roleSlotId: slot.roleSlotId, exerciseId: slot.exerciseId, setIndex: record.setIndex,
      prescribed: record.setIndex < slot.sets, reps: record.reps, actualG: record.actualG,
      actualOrigin: record.actualOrigin,
      variation: record.variation, assistance: record.assistance,
      harderThanIntended: !!record.harderThanIntended
    })).sort((a, b) => a.setIndex - b.setIndex))
  }));
  return { schemaVersion: SCHEMA_VERSION, foldRulesVersion: FOLD_RULES_VERSION, blockId: opening.blockId,
    ownerId: opening.ownerId, headOrdinal: chronologicalEvents.length, sealRevision: opening.sealRevision + (sealId ? 1 : 0),
    sealId, sealed, progress, quotas, activeCredits: Object.fromEntries(activeCredits),
    creditLedger: Object.fromEntries(grants), selections, unitMetadata,
    pending, requiredConsent, history,
    closingSnapshot: sealed ? { schemaVersion: SCHEMA_VERSION, foldRulesVersion: FOLD_RULES_VERSION,
      openingSnapshotVersion: 1, progress: clone(progress), selections: clone(selections),
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
      !TEMPLATES.every(t => previousProjection.quotas?.[t] === 8 &&
        closing.priorQuotas?.[t] === 8) ||
      !Array.isArray(closing.priorCreditIds) ||
      closing.priorCreditIds.length !== 32 ||
      new Set(closing.priorCreditIds).size !== 32 ||
      closing.priorCreditIds.some(id => !positiveId(id, 'prior credit') ||
        !Object.values(previousProjection.activeCredits || {}).includes(id))) {
    fail('invalid sealed block ancestry');
  }
  const next = createBB2Opening({ ownerId: previousProjection.ownerId, blockId: newBlockId,
    progress: closing.progress, sealRevision: previousProjection.sealRevision });
  next.selections = clone(closing.selections);
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
    'CALIBRATION_ACCEPTED', 'SET_RECORDED', 'EXTRA_SET_RECORDED']);
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
