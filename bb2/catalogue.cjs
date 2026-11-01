/* BVOM BB2 Stage (ii) — pure, versioned setup/catalogue contracts.
 * No storage, BB1 imports, app shell or runtime enablement.
 * Exercise identities and rep/set overrides are independent of fold rules v1.
 */
'use strict';

const CATALOGUE_VERSION = 4;
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
const LEGACY_CATALOGUE = Object.freeze({
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

// Keep v1 intact for saved setups, immutable Starts and historical backups.
// New setups use the owner's 1 November 2026 prescription. Never reinterpret
// a saved v1 session with v2 counts, rep ranges, defaults or ordering.
const { DAYS, OPTIONAL_CURL } = require('./approved-programme-v2.cjs');
const V2_CATALOGUE = Object.freeze(Object.fromEntries(TEMPLATE_ORDER.map(day => {
  const rows = [...DAYS[day], ...(day === 'upper_b' ? [OPTIONAL_CURL] : [])];
  return [day, Object.freeze(rows.map(([id, sets, floor, ceiling, defaultId]) => {
    const old = LEGACY_CATALOGUE[day].find(role => role.roleSlotId === id);
    const options = old.options.map(option => {
      // The approved Nordic range is 6–10; retain its qualitative preparation.
      if (day === 'lower_a' && id === 'hamstring_curl' && option.id === 'nordic_curl') {
        const { floor: ignoredFloor, ceiling: ignoredCeiling, ...rest } = option;
        return E(rest.id, rest.equipment, { warmup: rest.warmup });
      }
      return option;
    });
    options.sort((a,b) => Number(b.id === defaultId) - Number(a.id === defaultId));
    const warmup = day === 'lower_b' && id === 'quad' ? 'FULL' : old.warmup;
    return R(id, sets, floor, ceiling, warmup, options, old.optional);
  }))];
})));
// Catalogue v3 adds Upper A curls without changing saved v1/v2 prescriptions.
const curlRole = V2_CATALOGUE.upper_b.find(role => role.roleSlotId === 'biceps_curl');
const CATALOGUE = Object.freeze({ ...V2_CATALOGUE,
  upper_a: Object.freeze([...V2_CATALOGUE.upper_a, curlRole]) });
// v4 changes only new setup choices. Earlier catalogues remain immutable for saved history.
const CATALOGUE_V4 = Object.freeze(Object.fromEntries(TEMPLATE_ORDER.map(day => [
  day, Object.freeze(CATALOGUE[day].map(role => {
    if (role.roleSlotId === 'calf_raise') {
      const options = role.options.filter(option => option.id !== 'bodyweight_calf_raise');
      return R(role.roleSlotId, role.sets, role.floor, role.ceiling, role.warmup, options, role.optional);
    }
    if (role.roleSlotId === 'squat' || role.roleSlotId === 'quad') {
      const options = [...role.options, E('safety_bar_squat')];
      return R(role.roleSlotId, role.sets, role.floor, role.ceiling, role.warmup, options, role.optional);
    }
    return role;
  }))
])));
function getBB2Catalogue(version = CATALOGUE_VERSION) {
  if (version === 1) return LEGACY_CATALOGUE;
  if (version === 2) return V2_CATALOGUE;
  if (version === 3) return CATALOGUE;
  if (version === 4) return CATALOGUE_V4;
  fail('unsupported catalogue version');
}

const selectionKey = (templateId, roleSlotId) => `${templateId}|${roleSlotId}`;
const allRoles = version => TEMPLATE_ORDER.flatMap(templateId =>
  getBB2Catalogue(version)[templateId].map(role => ({ templateId, ...role })));
const selectionsDefault = version => Object.fromEntries(allRoles(version).map(role =>
  [selectionKey(role.templateId, role.roleSlotId), role.defaultExerciseId]));

function validateBB2Setup(setup) {
  if (setup && ![1,2,3,4].includes(setup.catalogueVersion)) fail('unsupported catalogue version');
  only(setup, ['catalogueVersion', 'optionalUpperBCurls', 'selections',
    ...(setup?.catalogueVersion >= 3 ? ['optionalUpperACurls'] : [])], 'setup');
  if (![1, 2, 3, 4].includes(setup.catalogueVersion)) fail('unsupported catalogue version');
  if (typeof setup.optionalUpperBCurls !== 'boolean') fail('invalid optional curls selection');
  if (setup.catalogueVersion >= 3 && typeof setup.optionalUpperACurls !== 'boolean') fail('invalid optional Upper A curls selection');
  const expected = selectionsDefault(setup.catalogueVersion);
  only(setup.selections, Object.keys(expected), 'setup selections');
  if (Object.keys(setup.selections).length !== Object.keys(expected).length) fail('incomplete setup selections');
  for (const role of allRoles(setup.catalogueVersion)) {
    const selected = setup.selections[selectionKey(role.templateId, role.roleSlotId)];
    if (typeof selected !== 'string' || !role.options.some(option => option.id === selected)) {
      fail('exercise is not in finite catalogue: ' + selectionKey(role.templateId, role.roleSlotId));
    }
  }
  return setup;
}

function createBB2Setup({ catalogueVersion = CATALOGUE_VERSION, optionalUpperBCurls = false, optionalUpperACurls = false, selections = {} } = {}) {
  if (catalogueVersion < 3 && optionalUpperACurls !== false) fail('optional Upper A curls need catalogue version 3');
  only(selections, Object.keys(selectionsDefault(catalogueVersion)), 'setup selections');
  const result = { catalogueVersion, optionalUpperBCurls,
    ...(catalogueVersion >= 3 ? { optionalUpperACurls } : {}),
    selections: { ...selectionsDefault(catalogueVersion), ...selections } };
  validateBB2Setup(result);
  return Object.freeze({ ...result, selections: Object.freeze(result.selections) });
}

function chooseBB2Exercise(setup, templateId, roleSlotId, exerciseId) {
  validateBB2Setup(setup);
  if (!getBB2Catalogue(setup.catalogueVersion)[templateId]?.some(role => role.roleSlotId === roleSlotId)) {
    fail('invalid exercise role');
  }
  return createBB2Setup({ ...setup, optionalUpperBCurls: setup.optionalUpperBCurls,
    selections: { ...setup.selections, [selectionKey(templateId, roleSlotId)]: exerciseId } });
}

function setBB2OptionalCurls(setup, enabled, templateId = 'upper_b') {
  validateBB2Setup(setup);
  if (!['upper_a','upper_b'].includes(templateId) ||
      (templateId === 'upper_a' && setup.catalogueVersion < 3)) fail('optional curls unavailable for this template/version');
  if (typeof enabled !== 'boolean') fail('invalid optional curls selection');
  return createBB2Setup({ ...setup,
    [templateId === 'upper_a' ? 'optionalUpperACurls' : 'optionalUpperBCurls']: enabled });
}

function getBB2TemplatePrescription(setup, templateId) {
  validateBB2Setup(setup);
  const catalogue = getBB2Catalogue(setup.catalogueVersion);
  if (!own(catalogue, templateId)) fail('unknown template');
  const prescribed = catalogue[templateId].filter(role =>
    !role.optional || (templateId === 'upper_a' ? setup.optionalUpperACurls : setup.optionalUpperBCurls)).map((role, originalIndex) => {
    const exerciseId = setup.selections[selectionKey(templateId, role.roleSlotId)];
    const variant = role.options.find(option => option.id === exerciseId);
    return { roleSlotId: role.roleSlotId, exerciseId,
      sets: variant.sets ?? role.sets, floor: variant.floor ?? role.floor,
      ceiling: variant.ceiling ?? role.ceiling, equipment: variant.equipment,
      warmup: variant.warmup ?? role.warmup, originalIndex };
  });
  // Both screens share the same order. Preserve v1 numerical-first sorting;
  // v2 follows the explicit owner-approved exercise order, even after swaps.
  if (setup.catalogueVersion === 1) prescribed.sort((a, b) => WARMUP_ORDER.indexOf(a.warmup) - WARMUP_ORDER.indexOf(b.warmup) ||
    a.originalIndex - b.originalIndex);
  const slots = prescribed.map(({ originalIndex, ...slot }) => Object.freeze(slot));
  const setCount = slots.reduce((sum, slot) => sum + slot.sets, 0);
  return Object.freeze({ catalogueVersion: setup.catalogueVersion, templateId,
    slots: Object.freeze(slots), prescribedCount: setCount,
    minimumToFinish: Math.ceil(.70 * setCount) });
}

module.exports = { CATALOGUE_VERSION, TEMPLATE_ORDER, WARMUP_ORDER, CATALOGUE, getBB2Catalogue,
  createBB2Setup, validateBB2Setup, chooseBB2Exercise,
  setBB2OptionalCurls, getBB2TemplatePrescription };
