/* BB2 Stage (ii) — guarded new NORMAL / EXTRA_NORMAL Start boundary.
 * Historical Stage (i) streams remain replayable without catalogue checks.
 * This pure boundary does not persist, sync, or enable workouts in the app.
 */
'use strict';

const { canonicalGrams, identity, foldBB2Block, createNextBB2Opening,
  commitBB2Transaction, sharedProgressFor, sharedRecipe } = require('./ledger.cjs');
const { validateBB2Setup, getBB2TemplatePrescription, getBB2Catalogue } = require('./catalogue.cjs');

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

function buildBB2SharedPolicy(opening,previousEvents,setup,{sealedBlocks=[],priorSealedBlock=null}={}){
 validateBB2Setup(setup);
 const prescriptions=[];
 for(const [templateId,roles] of Object.entries(getBB2Catalogue(setup.catalogueVersion)))for(const role of roles)for(const option of role.options)
  prescriptions.push({templateId,roleSlotId:role.roleSlotId,exerciseId:option.id,sets:option.sets??role.sets,floor:option.floor??role.floor,ceiling:option.ceiling??role.ceiling,equipment:option.equipment});
 prescriptions.sort((a,b)=>{const x=`${a.templateId}|${a.roleSlotId}|${a.exerciseId}`,y=`${b.templateId}|${b.roleSlotId}|${b.exerciseId}`;return x<y?-1:x>y?1:0});
 const projection=foldBB2Block(opening,previousEvents);
 if(projection.sharedProgression&&equal(projection.sharedProgression.prescriptions,prescriptions))return null;
 if(projection.sealed||projection.requiredConsent.length||Object.keys(projection.pending).length)fail('resolve existing decisions before enabling shared progression');
 if(previousEvents.some(e=>e.type==='WORKOUT_STARTED'&&!previousEvents.some(x=>x.sessionId===e.sessionId&&['WORKOUT_FINISHED','WORKOUT_INCOMPLETE','WORKOUT_DISCARDED'].includes(x.type))))fail('cannot enable sharing during a workout');
 const order=Object.keys(opening.progress).sort(),touch=key=>{if(!own(opening.progress,key))return;const i=order.indexOf(key);if(i>=0)order.splice(i,1);order.push(key)};
 const archives=sealedBlocks.length?sealedBlocks:priorSealedBlock?[priorSealedBlock]:[];
 if(opening.previousSealId&&!archives.length)fail('shared migration needs verified sealed predecessor');
 for(const [index,block] of archives.entries()){
  const next=archives[index+1]?.opening||opening;
  if(!equal(createNextBB2Opening(block.opening,block.events,next.blockId),next))fail('shared migration has invalid sealed ancestry');
  const p=foldBB2Block(block.opening,block.events),sessions=new Map();
  if(!p.sealed||p.ownerId!==opening.ownerId)fail('shared migration requires verified sealed history');
  for(const e of block.events){
   if(e.type==='WORKOUT_STARTED')sessions.set(e.sessionId,e);
   if(e.type==='WORKOUT_FINISHED'&&sessions.get(e.sessionId)?.kind!=='RECOVERY')for(const slot of sessions.get(e.sessionId).slots){
    const key=`${sessions.get(e.sessionId).templateId}|${slot.roleSlotId}|${slot.exerciseId}`;
    if(p.progress[key]?.lastNormalSessionId===e.sessionId)touch(key);
   }
   if(['PRESCRIPTION_EDITED','INCREMENT_EDITED','VARIATION_EDITED','STALL_REDUCTION_ACCEPTED'].includes(e.type))touch(`${e.templateId??sessions.get(e.sessionId)?.templateId}|${e.roleSlotId}|${e.exerciseId}`);
   if(['CHOICE_RESOLVED','CHOICE_REPLACED'].includes(e.type)){
    if(sessions.get(e.sourceSessionId))touch(`${sessions.get(e.sourceSessionId).templateId}|${e.roleSlotId}|${e.exerciseId}`);
    else for(const [key,value] of Object.entries(opening.progress))if(value.loadOrigin?.sourceEventId===e.eventId||['choice:','earned-choice:','difficulty:'].some(prefix=>value.epochId===prefix+e.eventId))touch(key);
   }
  }
  for(const key of p.sharedProgression?.order||[])touch(key);
 }
 return {type:'PROGRESSION_SHARED',eventId:'shared-policy:'+opening.blockId+':'+(previousEvents.length+1),commitOrdinal:previousEvents.length+1,
  blockId:opening.blockId,version:1,catalogueVersion:setup.catalogueVersion,prescriptions,openingOrder:order};
}
function validateBB2SharedPolicy(opening,previousEvents,setup,event,evidence={}){
 const expected=buildBB2SharedPolicy(opening,previousEvents,setup,evidence);
 if(!expected||!equal(expected,event))fail('shared progression migration differs from verified catalogue/history');
 return true;
}
function prepareBB2SharedProgression(opening,events,setup,evidence={}){
 const policy=buildBB2SharedPolicy(opening,events,setup,evidence),effective=policy?[...events,policy]:events;
 return {policy,events:effective,projection:foldBB2Block(opening,effective)};
}
function earningKey(events,event,fallback,recorded){
 const start=events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===(event.type==='WORKOUT_FINISHED'?event.sessionId:event.sourceSessionId));
 if(!start)return fallback;
 const slot=start.slots.find(s=>s.exerciseId===recorded.exerciseId&&(event.type==='WORKOUT_FINISHED'||s.roleSlotId===event.roleSlotId)&&
  (sharedRecipe(s)===sharedRecipe(recorded)||`${start.templateId}|${s.roleSlotId}|${s.exerciseId}`===fallback));
 if(!slot)fail('shared DERIVED source has incompatible prescription');
 return `${start.templateId}|${slot.roleSlotId}|${slot.exerciseId}`;
}
function validateBB2NewStart(opening, previousEvents, setup, startEvent,
  { priorSealedBlock, sealedBlocks } = {}) {
  validateBB2Setup(setup);
  if (!startEvent || startEvent.type !== 'WORKOUT_STARTED' ||
      !['NORMAL', 'EXTRA_NORMAL'].includes(startEvent.kind)) {
    fail('expected NORMAL or EXTRA_NORMAL Start; recovery needs separate planner');
  }
  if (startEvent.blockId !== opening?.blockId ||
      startEvent.commitOrdinal !== previousEvents.length + 1) {
    fail('Start block or head is stale');
  }
  // Several slots can share one earning event. Reuse only this call's pure
  // prefix projections; no cached result survives an edit, restore or account.
  const prefixes = new Map();
  const replay = head => {
    if (!prefixes.has(head)) prefixes.set(head,
      foldBB2Block(opening, previousEvents.slice(0, head)));
    return prefixes.get(head);
  };
  const projection = replay(previousEvents.length);
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
      'plannedG', 'plannedOrigin', 'incrementG', 'incrementOrigin', 'variation', 'assistance', 'actualBodyweightKg'];
    if (Object.keys(recorded).some(k => !allowed.includes(k))) {
      fail('Start slot contains a non-catalogue field');
    }
    const key = identity(startEvent.templateId, recorded.roleSlotId, recorded.exerciseId);
    const previous = sharedProgressFor(projection,key,recorded).progress;
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
        if (!source) {
          let carriedKey=key;
          if(projection.sharedProgression&&(!opening.progress[key]||!equal(opening.progress[key].loadOrigin,previous.loadOrigin))){
            carriedKey=Object.keys(opening.progress).find(candidate=>{
              const d=projection.sharedProgression.prescriptions.find(d=>`${d.templateId}|${d.roleSlotId}|${d.exerciseId}`===candidate);
              return d&&sharedRecipe(d)===sharedRecipe(recorded)&&opening.progress[candidate].loadG===previous.loadG&&equal(opening.progress[candidate].loadOrigin,previous.loadOrigin);
            });
            if(!carriedKey)fail('shared DERIVED load has no verified carried source');
          }
          carriedDerivedProvenance(opening,carriedKey,opening.progress[carriedKey],priorSealedBlock);
        }
        else if (!['WORKOUT_FINISHED', 'CHOICE_RESOLVED'].includes(source.type)) {
          fail('DERIVED source is not an earning event');
        } else {
          const before = replay(source.commitOrdinal - 1);
          const after = replay(source.commitOrdinal);
          const sourceKey=projection.sharedProgression?earningKey(previousEvents,source,key,recorded):key;
          const result = after.progress[sourceKey];
          if (!equal(result?.loadOrigin, previous.loadOrigin) ||
              result.loadG === (before.progress[sourceKey]?.loadG ?? null)) {
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

function commitBB2Start(opening, previousEvents, setup, startEvent, guard, evidence={}) {
  if (guard?.activeWorkout !== false) fail('Start requires explicit inactive-workout guard');
  const policy=evidence.sharingPolicy;
  if(policy)validateBB2SharedPolicy(opening,previousEvents,setup,policy,evidence);
  const effective=policy?[...previousEvents,policy]:previousEvents;
  validateBB2NewStart(opening,effective,setup,startEvent,evidence);
  return commitBB2Transaction(opening,previousEvents,policy?[policy,startEvent]:[startEvent],guard);
}

module.exports = { validateBB2NewStart, commitBB2Start, buildBB2SharedPolicy, validateBB2SharedPolicy, prepareBB2SharedProgression };
