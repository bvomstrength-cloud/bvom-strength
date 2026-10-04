#!/usr/bin/env node
'use strict';
// Validates the behavioural tests themselves.
//  1. Mutation pass: each known-bad mutation is applied to a THROWAWAY COPY of the candidate build;
//     the targeted behavioural tests must pass on the unmutated candidate and FAIL on the mutant.
//  2. Known-bad reference pass (optional --known-bad <dir>): applicable historical defect contracts must FAIL on
//     the v2.8.0 reference. Later regressions introduced by hardening are explicitly provenance-exempt.
// Usage: node mutation_check.js <candidate-build-dir> [--known-bad <v2.8.0-build-dir>]
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const args=process.argv.slice(2),dir=args.find((a,i)=>!a.startsWith('--')&&args[i-1]!=='--known-bad');
const kbIdx=args.indexOf('--known-bad'),knownBad=kbIdx>=0?args[kbIdx+1]:null;
if(!dir){console.error('Usage: node mutation_check.js <candidate-build-dir> [--known-bad <v2.8.0-build-dir>]');process.exit(2)}
const guard=path.join(__dirname,'behaviour_guard.js');

// replace exactly one occurrence of `from`, searching only inside the function/region starting at `region`
function inRegion(region,from,to){return src=>{const r=src.indexOf(region);if(r<0)return null;const i=src.indexOf(from,r);if(i<0||i-r>20000)return null;return src.slice(0,i)+to+src.slice(i+from.length)}}
const MUTATIONS=[
 {id:'LP-PRESCRIBED-TARGET',why:'historical 22 Sep bug: rescue built from the prescribed target instead of achieved reps',targets:['LP-RESCUE-LIVE'],
  apply:inRegion('function genericSetPlan(','rescueBase=Math.max(1,Number(done.reps)+1)','rescueBase=Math.max(1,Number(q.target)+1)')},
 {id:'LP-LIVE-IGNORES-LOGGED-SETS',why:'live getSetPlan stops passing logged sets to the rescue planner (preview never updates)',targets:['LP-RESCUE-LIVE'],
  apply:inRegion('function genericSetPlan(','let out=genericSetPlan(n,p,ss);','let out=genericSetPlan(n,p,{});')},
 {id:'CORE-ROUNDING-REMOVED',why:'derived core loads no longer rounded to loadable increments',targets:['LP-RESCUE-LIVE'],
  apply:inRegion('function bvomDerivedCoreLoad(','return Math.max(bar,bvomRoundForSession(n,x))','return Math.max(bar,x)')},
 {id:'LP-SUCCESS-NO-PROGRESS',why:'successful LP lift no longer progresses',targets:['LP-PROGRESSION'],
  apply:inRegion('function advanceAfterExercise(n){\n if(isIntermediate())','if(!r.failed&&!r.close){state.weights[n]=bvomRoundForSession(n,baseWeight+c.increment)','if(!r.failed&&!r.close){state.weights[n]=bvomRoundForSession(n,baseWeight)')},
 {id:'HLM-ENTRY-WRAPPER-BROKEN',why:'a live chooseProgramMode wrapper swallows HLM entry',targets:['HLM-ENTRY-LIVE','HLM-HEAVY-DRIVER'],
  apply:inRegion('chooseProgramMode=function(mode){if(mode===\'bodybuilding\')','chooseProgramMode=function(mode){',"chooseProgramMode=function(mode){if(mode==='hlm')return;")},
 {id:'MEDIUM-COUNTS-AS-FAILURE',why:'medium/light exposures treated like Heavy failures',targets:['HLM-HEAVY-DRIVER','FOURDAY-DRIVERS'],
  apply:inRegion('function advanceAfterExercise(n){\n if(isIntermediate())',"if(p.kind==='hlmLight'||p.kind==='hlmMedium'){save();return;}","if(p.kind==='hlmLight'||p.kind==='hlmMedium'){if(coreResult(n).complete&&(state.session[n]?.[0]?.reps??99)<p.targets[0])state.hlm.failCount[n]=(state.hlm.failCount[n]||0)+1;save();return;}")},
 {id:'WARMUP-COUNTS-AS-WORK',why:'completing a warm-up starts the workout clock / marks work activity',targets:['WARMUP-DISPLAY-ONLY'],
  apply:src=>{const i=src.indexOf('function completeWarmup(');if(i<0)return null;const j=src.indexOf('{',i);return src.slice(0,j+1)+"state.session[name]=state.session[name]||{};state.session[name][99]={reps:1,load:1};"+src.slice(j+1)}},
 {id:'BB-BACKOFF-DRIVES',why:'BB primary decision reads a back-off set instead of the top set',targets:['BB-CORE-DECISIONS'],
  apply:inRegion('function bvomBbDecide(','const top=sets[0];','const top=sets[1]||sets[0];')},
 {id:'BB-INCOMPLETE-CONSUMES',why:'incomplete BB workout consumes one of the 24',targets:['BB-INCOMPLETE-NOT-CONSUMED'],
  apply:inRegion('function bvomBbFinish(','if(complete){state.bodybuilding.completedSessions=Math.min(24','if(true){state.bodybuilding.completedSessions=Math.min(24')},
 {id:'BB-BLOCK-LENGTH-23',why:'block boundary off by one',targets:['BB-24-COMPLETION'],
  apply:inRegion('function bvomBbDay(','return n>=24?null','return n>=23?null')},
 {id:'ONRAMP-HANDOFF-DELETES-REFS',why:'On-Ramp handoff discards historical performance references',targets:['BB-ONRAMP-HANDOFF'],
  apply:inRegion('function bvomBbOnRampHandoff(',"o.status='handed_off';","o.status='handed_off';delete b.performanceRefs;")},
 {id:'ONRAMP-HANDOFF-UNCALIBRATED',why:'handoff no longer carries CONFIRMED into calibrated',targets:['BB-ONRAMP-HANDOFF'],
  apply:inRegion('function bvomBbOnRampHandoff(',"p.calibrated=e.state==='CONFIRMED'","p.calibrated=false")},
 {id:'REF-RESET-DISABLED',why:'performance-reference reset after a reduction is ignored',targets:['BB-REF-RESET-SUPPRESSION'],
  apply:inRegion('function bvomBbPerformanceRefResetPending(','{','{return false;')},
 {id:'BB-UNITS-OMITTED',why:'Bodybuilding state skipped during unit conversion',targets:['BB-UNITS-CONVERTED','F5-LB-PRACTICAL'],
  apply:inRegion("const bvomBbBaseChangeUnits=changeUnits;","if((state.unit||'kg')===before||before===to||!state.bodybuilding)return;const steps={};","if((state.unit||'kg')===before||before===to||!state.bodybuilding)return;return;const steps={};")},
 {id:'BB-ACCESSORY-PROGRESSES',why:'Bodybuilding accessory taps mutate accessory weight',targets:['BB-ACCESSORY-NEUTRAL'],
  apply:inRegion('const bvomBbBaseTapAccessory=tapAccessory;','bvomMarkThisTabAsWorkoutOwner();','bvomMarkThisTabAsWorkoutOwner();a.weight=Number(a.weight)+Number(a.increment||2.5);')},
 {id:'CUSTOM-LEAKS-PROGRESSION',why:'Custom Training finish bumps structured-program weights',targets:['CUSTOM-NO-LEAK'],
  apply:inRegion('function bvomFtFinish(','state.backupWorkoutCount=(state.backupWorkoutCount||0)+1;','state.backupWorkoutCount=(state.backupWorkoutCount||0)+1;state.weights.Squat+=2.5;')},
 {id:'GPP-PAUSE-COUNTS-INTERRUPTION',why:'resume restarts from the pause moment, so the paused interval is counted',targets:['GPP-PAUSE-RESUME'],
  apply:src=>{const s1=inRegion('function bvomPauseGppTimer(','t.startedAt=null;',"t.pausedAt=Date.now();t.startedAt=null;")(src);if(!s1)return null;return inRegion('function bvomResumeGppTimer(','t.startedAt=Date.now();','t.startedAt=t.pausedAt||Date.now();')(s1)}},
 {id:'GPP-STOPPED-DISCARDED',why:'Finish discards even stopped timed GPP results',targets:['F6-STOP-THEN-FINISH'],
  apply:inRegion('function bvomGppResultSnapshot(',"x.timing.status!=='stopped')continue;","x.timing)continue;")},
 {id:'DROP-SAFEGUARD-ALTERS-DECISION',why:'the ≥30% safeguard overrides the normal decision',targets:['F3-DECISION-UNCHANGED'],
  apply:inRegion('function bvomBbFinish(','bvomBbApplyDecision(id,d,working);',"bvomBbApplyDecision(id,drop?.triggered?{action:'hold',reason:'drop'}:d,working);")},
 {id:'FINGERPRINT-INCLUDES-SESSION',why:'cloud comparison stops stripping unsaved session data (false conflicts)',targets:['CLOUD-FINGERPRINT'],
  apply:inRegion('function bvomCloudNormalizeForCompare(','d.session={};','')},
 {id:'BB-RELAUNCH-DROPS-WORKOUT',why:'relaunching into Bodybuilding discards the in-progress workout',targets:['BB-RESUME-AFTER-RELOAD'],
  apply:inRegion('bvomBbEnsure();if(isBodybuilding())state.day=bvomBbDay();','state.day=bvomBbDay();','state.day=bvomBbDay();state.session={};')},
 {id:'ENTITLEMENT-ALWAYS-ALLOW',why:'an over-broad offline fix that grants everyone',targets:['F12-NEG-NEVER-VERIFIED','F12-NEG-EXPIRED'],
  apply:inRegion('function bvomEntitlementAccessDecision(','{',"{return {allowed:true,reason:'mutant',row:null,fromCache:false};")},
 {id:'ENTITLEMENT-UNVERIFIED-GRANTED',why:'a naive offline fix that treats "no record" as allowed',targets:['F12-NEG-NEVER-VERIFIED'],
  apply:inRegion('function bvomEntitlementOfflineAccessDecision(',"if(!userId||!owner||owner!==userId||!cached)return {allowed:false,","if(!userId||!owner||owner!==userId||!cached)return {allowed:true,")},
 {id:'AUTH-GATE-SKIPPED',why:'boot shows the app without any session',targets:['F12-NEG-NEVER-AUTHENTICATED'],
  apply:inRegion('async function bvomCloudInit(','const c=bvomCloudClient();if(!c){if(!bvomOpenVerifiedOfflineOwner())bvomShowAuthGate();return}','const c=bvomCloudClient();if(!c){showApp();return}')},
 {id:'SIGNOUT-KEEPS-OFFLINE-ACCESS',why:'explicit sign-out leaves the verified entitlement cache eligible for offline relaunch',targets:['F12-NEG-SIGNED-OUT','F12-NEG-SIGNOUT-OFFLINE'],
  apply:inRegion('async function bvomCloudSignOut()',"bvomEntitlementCacheClear(signedOutUser);",'')},
 {id:'SIGNEDOUT-EVENT-KEEPS-OFFLINE-ACCESS',why:'a SIGNED_OUT auth event gates the open app but leaves cached offline entitlement eligible for a later relaunch',targets:['F12-NEG-SIGNED-OUT-EVENT'],
  apply:inRegion('c.auth.onAuthStateChange(',"if(_event==='SIGNED_OUT')bvomEntitlementCacheClear(old||owner);",'')},
 {id:'OFFLINE-LOCAL-CLOUD-ASSESS',why:'synthetic offline-owner state is allowed to assess/enable cloud sync before a real session exists',targets:['F12-OFFLINE-NO-CLOUD-WITHOUT-SESSION'],
  apply:inRegion('async function bvomCloudAssessSync()','if(!bvomCloud.user||bvomCloud.offlineLocalAccess||bvomCloud.assessing)return;','if(!bvomCloud.user||bvomCloud.assessing)return;')},
 {id:'OFFLINE-OWNER-CHECK-REMOVED',why:'cached entitlement for one account is allowed to unlock a different local data owner',targets:['F12-NEG-OWNER-MISMATCH'],
  apply:src=>{const s1=inRegion('function bvomEntitlementOfflineAccessDecision(',"if(!userId||!owner||owner!==userId||!cached)return {allowed:false,","if(!userId||!owner||!cached)return {allowed:false,")(src);if(!s1)return null;return inRegion('function bvomOpenVerifiedOfflineOwner()',"bvomEntitlementOfflineAccessDecision(owner)","bvomEntitlementOfflineAccessDecision('user-1')")(s1)}},
 {id:'OFFLINE-GRACE-CHECK-REMOVED',why:'stale cached verification remains eligible beyond the offline grace period',targets:['F12-NEG-GRACE-EXPIRED'],
  apply:inRegion('function bvomEntitlementOfflineAccessDecision(',"if(!Number.isFinite(verifiedAt)||age<-(5*60*1000)||age>BVOM_ENTITLEMENT_OFFLINE_GRACE_MS)return {allowed:false,","if(!Number.isFinite(verifiedAt)||age<-(5*60*1000))return {allowed:false,")},
 {id:'F24-INTERMEDIATE-SNAPSHOT-HLM-CONVERSION-REMOVED',why:'unit conversion updates live intermediate state but leaves restorable processedSnapshots.hlm driver/nextHeavy in the old unit',targets:['F24-INTERMEDIATE-SNAPSHOT-UNIT-CONVERSION-ATOMIC'],
  apply:inRegion('for(const snap of Object.values(state.processedSnapshots||{}))',"if(snap.hlm){for(const [name,map] of [['driver',snap.hlm.driver],['nextHeavy',snap.hlm.nextHeavy]])for(const n of Object.keys(map||{}))if(map[n]!=null)map[n]=cvr(snap,'hlm.'+name+'.'+n,map[n])}",'')},
 {id:'F24-SNAPSHOT-INCREMENT-ROUNDTRIP-METADATA-REMOVED',why:'processed snapshot increments use one-way nearest-option conversion and drift after kg→lb→kg',targets:['F24-INTERMEDIATE-SNAPSHOT-UNIT-CONVERSION-ATOMIC'],
  apply:inRegion('for(const snap of Object.values(state.processedSnapshots||{}))',"snap.cfg.increment=bvomConvertIncrementRoundTrip(snap.cfg,snap.cfg.increment??2.5,from,to)","snap.cfg.increment=convertIncrement(snap.cfg.increment??2.5,to)")},
 {id:'F25-ONRAMP-INCREMENT-ROUNDTRIP-METADATA-REMOVED',why:'On-Ramp exercise increments use one-way practical conversion and drift across kg→lb→kg',targets:['F25-ONRAMP-UNIT-ROUNDTRIP-HANDOFF-REVERSIBLE'],
  apply:inRegion('const bvomBbDev36ChangeUnitsBase=changeUnits;',"const step=bvomConvertIncrementRoundTrip(e,e.increment??2.5,before,to);","const step=bvomBbConvertPracticalIncrement(e.increment??2.5,to);")},
 {id:'F25-ONRAMP-LOAD-ROUNDTRIP-METADATA-REMOVED',why:'On-Ramp exercise loads are re-rounded from the converted value on return instead of restoring an unchanged original practical load',targets:['F25-ONRAMP-UNIT-ROUNDTRIP-HANDOFF-REVERSIBLE'],
  apply:inRegion('const bvomBbDev36ChangeUnitsBase=changeUnits;',"e.load=bvomBbConvertLoadRoundTrip(e,e.load,before,to,step)","e.load=bvomBbConvertLoadToStep(e.load,to,step)")},
 {id:'F23-NOOP-SETTINGS-SNAPSHOT-GUARD-REMOVED',why:'a no-op post-completion Advanced Settings save rewrites the original rollback snapshot',targets:['F23-NOOP-POSTCOMPLETE-SETTINGS-PRESERVE-ROLLBACK'],
  apply:inRegion('function saveLiftSettings(n){\n ensurePlateModes();',"if(active&&hasRecorded&&beforeSettings!==afterSettings){","if(active&&state.processed?.[n]&&beforeSettings===afterSettings){delete state.processedSnapshots[n];processedSnapshot(n);}if(active&&hasRecorded&&beforeSettings!==afterSettings){")},
 {id:'F21-ONRAMP-FAILED-HANDOFF-GUARD-REMOVED',why:'failed manual Bodybuilding validation still hands off an active On-Ramp',targets:['F21-ONRAMP-FAILED-HANDOFF-VALIDATION-NONDESTRUCTIVE'],
  apply:inRegion('const bvomBbDev36CommitBase=bvomBbCommitSetup;',"if(exiting&&window.__bvomBbSetupDraft===null&&state.bodybuilding)","if(exiting&&state.bodybuilding)")},
 {id:'F22-OPTIONAL-SINGLE-PROCESSED-GUARD-REMOVED',why:'skipping the optional Deadlift single advances without snapshotting/marking the completed lift as processed',targets:['F22-OPTIONAL-DEADLIFT-SKIP-CORRECTION-ATOMIC'],
  apply:inRegion('function skipOptionalSingle(n)',"state.processed=state.processed||{};if(!state.processed[n]){processedSnapshot(n);state.processed[n]=true;}",'')},
 {id:'F20-STARTING-SETUP-GUARD-REMOVED',why:'Run Starting Setup Again is allowed to enter setup during an active workout and can erase the live session',targets:['F20-STARTING-SETUP-ACTIVE-WORKOUT-GUARD'],
  apply:src=>{const g="if(bvomStateWorkoutActive(state)){bvomBeeModal(hlmTxt('FINISH WORKOUT FIRST','先にワークアウトを終了してください'),hlmTxt('Finish or exit the current workout before running Starting Setup again.','Starting Setupを再実行する前に、現在のワークアウトを終了または中止してください。'));return}";const f='function bvomStartingSetupModal(){'+g,i=src.lastIndexOf(f);if(i<0)return null;const j=i+'function bvomStartingSetupModal(){'.length;return src.slice(0,j)+src.slice(j+g.length)}},
 {id:'F20-HLM-SETUP-BYPASSES-GUARD',why:'HLM strength-block completion enters Starting Setup directly during the active workout instead of using the guarded entry',targets:['F20-STARTING-SETUP-ACTIVE-WORKOUT-GUARD'],
  apply:inRegion('function bvomPresentPendingHlmRepChoice(){',"hlmTxt('RUN STARTING SETUP','STARTING SETUPを実行'),()=>{close();bvomClearPendingHlmRepChoice(n);save()},()=>{close();bvomStartingSetupModal()});return;","hlmTxt('RUN STARTING SETUP','STARTING SETUPを実行'),()=>{close();bvomClearPendingHlmRepChoice(n);save()},()=>{close();state.configured=false;save();showSetup()});return;")},
 {id:'F26-ACCESSORY-CORRECTION-ROLLBACK-REMOVED',why:'editing an already-processed accessory skips restoring its pre-result snapshot, leaving stale progression in place',targets:['F26-ACCESSORY-CORRECTION-RECOMPUTES-PROGRESSION'],
  apply:inRegion('function tapAccessory(id,i){',"if(existing&&wasProcessed)restoreProcessedSnapshot(key);","if(existing&&wasProcessed){}")},
 {id:'F27-ACCESSORY-LIVE-REMOVE-GUARD-REMOVED',why:'recorded accessory work can be deleted with its template before Finish/History',targets:['F27-RECORDED-OPTIONAL-WORK-REMOVAL-PRESERVES-LIVE-DATA'],
  apply:inRegion("function removeAccessory(id){\n const a=(state.accessoryList||[]).find(x=>x.id===id);if(!a)return;","if(live){bvomBeeModal(","if(false){bvomBeeModal(")},
 {id:'F27-GPP-LIVE-REMOVE-GUARD-REMOVED',why:'recorded GPP work can be deleted with its template before Finish/History',targets:['F27-RECORDED-OPTIONAL-WORK-REMOVAL-PRESERVES-LIVE-DATA'],
  apply:inRegion('function removeGpp(id){const g=state.gppList.find(x=>x.id===id);if(!g)return;',"if(live){bvomBeeModal(","if(false){bvomBeeModal(")},
 {id:'F28-CORE-POSTRESULT-CONFIG-ROLLBACK-GUARD-REMOVED',why:'an increment-only settings edit after earned progression replaces the pre-result snapshot and lets correction price the same performance again',targets:['F28-CORE-POSTRESULT-INCREMENT-EDIT-PRESERVES-EARNED-PROGRESSION'],
  apply:inRegion('function saveLiftSettings(n){\n ensurePlateModes();',"const snap=state.processedSnapshots[n]||(state.processedSnapshots[n]=preEditSnap||bvomMakeProcessedSnapshot(n))","const snap=(state.processedSnapshots[n]=bvomMakeProcessedSnapshot(n))")},
 {id:'F29-ACCESSORY-POSTRESULT-INCREMENT-ROLLBACK-REMOVED',why:'accessory correction restores the old load but leaves the newly edited increment in place, repricing the already-earned result',targets:['F29-ACCESSORY-POSTRESULT-INCREMENT-EDIT-PRESERVES-EARNED-PROGRESSION'],
  apply:inRegion("if(String(n).startsWith('ACC:')&&snap.kind==='accessory'){","if(snap.increment!=null)a.increment=Number(snap.increment);","")},
 {id:'F30-INTERMEDIATE-NEXTHEAVY-PRESERVE-GUARD-REMOVED',why:'an increment-only HLM/4-Day settings save clears an already-earned nextHeavy even though the driver itself is unchanged',targets:['F30-INTERMEDIATE-INCREMENT-EDIT-PRESERVES-EARNED-NEXTHEAVY'],
  apply:inRegion('function saveLiftSettings(n){\n ensurePlateModes();',"if(Number(w)!==oldDriver)state.hlm.nextHeavy[n]=null;","state.hlm.nextHeavy[n]=null;")},
 {id:'F31-ONRAMP-CONFIRMATION-PROVENANCE-GUARD-REMOVED',why:'correction of the exact exposure that established On-Ramp confirmation is treated like an ordinary confirmed-set edit, leaving stale calibration in place',targets:['F31-ONRAMP-CORRECTION-REVOKES-SUPERSEDED-CONFIRMATION'],
  apply:inRegion('function bvomBbOnRampSetModal(',"if(i===0&&(e.state!=='CONFIRMED'||wasConfirming)){","if(i===0&&e.state!=='CONFIRMED'){")},
 {id:'F32-ONRAMP-FAILED-VALIDATION-LIVE-MUTATION-RESTORED',why:'a rejected numeric On-Ramp entry mutates the live exercise load before increment validation succeeds, allowing rejected input to leak into a later save',targets:['F32-ONRAMP-FAILED-SET-VALIDATION-ATOMIC'],
  apply:inRegion('function bvomBbOnRampSetModal(',"rec.load=load;const inc=Number(o.querySelector('[data-inc]')?.value);if(!(inc>0)){alert('Enter the smallest practical increase for this equipment.');return}e.load=load;e.increment=inc","rec.load=load;e.load=load;const inc=Number(o.querySelector('[data-inc]')?.value);if(!(inc>0)){alert('Enter the smallest practical increase for this equipment.');return}e.increment=inc")},
 {id:'F33-LOAD-ROUNDTRIP-ORIGIN-RESTORE-REMOVED',why:'unchanged converted loads no longer restore their exact original physical value on the reverse unit change',targets:['F33-NO-TRAINING-UNIT-ROUNDTRIP-PRESERVES-LEGITIMATE-ARBITRARY-STATE'],
  apply:inRegion('function bvomConvertLoadRoundTripField(',"if(m&&m.unit===to","if(false&&m&&m.unit===to")},
 {id:'F33-ARBITRARY-INCREMENT-ORIGIN-RESTORE-RESTRICTED',why:'round-trip metadata only restores increments on the predefined policy grid, so legitimate arbitrary equipment increments drift',targets:['F33-NO-TRAINING-UNIT-ROUNDTRIP-PRESERVES-LEGITIMATE-ARBITRARY-STATE'],
  apply:inRegion('function bvomConvertIncrementRoundTrip(',"&&Number.isFinite(Number(m.value))&&Number(m.value)>0)","&&bvomIncrementOptions(to).includes(Number(m.value)))")},
 {id:'F34-ACTIVE-CORE-LIVE-LOCK-REMOVED',why:'Advanced Settings are allowed to replace the live prescription after core work has already been recorded',targets:['F34-ACTIVE-CORE-PRESCRIPTION-IMMUTABLE-AFTER-SETTINGS-EDIT'],
  apply:inRegion('function bvomCoreLiveLock(n){',"return snap?.livePrescriptionLock&&bvomCoreSessionHasActivity(n)?snap:null","return null")},
 {id:'F35-POSTCOMPLETE-SNAPSHOT-REPLACED',why:'a completed lift settings edit replaces the original pre-result rollback snapshot with the edited future state',targets:['F35-POSTCOMPLETE-SETTINGS-WEIGHT-EDIT-CORRECTION-SAFE'],
  apply:inRegion('function saveLiftSettings(n){\n ensurePlateModes();',"const snap=state.processedSnapshots[n]||(state.processedSnapshots[n]=preEditSnap||bvomMakeProcessedSnapshot(n))","const snap=false||(state.processedSnapshots[n]=preEditSnap||bvomMakeProcessedSnapshot(n))")},
 {id:'F36-F37-HLM-ACTIVE-SETTINGS-SNAPSHOT-REMOVED',why:'HLM/4-Day settings changes immediately rewrite the current live workout instead of being staged for the next applicable workout',targets:['F36-OPTIONAL-SINGLES-SETTING-DOES-NOT-REWRITE-LIVE-DEADLIFT-EXPOSURE','F37-HLM-NEXT-WORKOUT-SETTINGS-DO-NOT-ALTER-PARTIAL-CURRENT-PRESCRIPTION'],
  apply:inRegion('function saveHlmSettings(){',"if(bvomStateWorkoutActive(state))bvomCaptureHlmSettingsForActiveWorkout();","if(bvomStateWorkoutActive(state)){}")},
 {id:'F38-CORE-EARNED-WEIGHT-ROLLBACK-REMOVED',why:'post-result correction leaves an already-earned LP load in place instead of revoking it before recalculation',targets:['F38-CORE-CORRECTION-RECOMPUTES-EARNED-STATE-THEN-MERGES-FUTURE-SETTINGS'],
  apply:inRegion('function bvomRollbackLockedEarnedStateForCorrection(',"if(snap.postEditWeight==null)state.weights[n]=Number(snap.weight);","if(snap.postEditWeight==null){}")},
 {id:'F38-INTERMEDIATE-EARNED-NEXTHEAVY-ROLLBACK-REMOVED',why:'post-result HLM/4-Day correction retains stale earned nextHeavy after the underlying successful result is corrected to a failure',targets:['F38-CORE-CORRECTION-RECOMPUTES-EARNED-STATE-THEN-MERGES-FUTURE-SETTINGS'],
  apply:inRegion('function bvomRollbackLockedEarnedStateForCorrection(',"if(snap.postEditWeight==null)state.hlm.nextHeavy[n]=snap.hlm.nextHeavy?.[n]==null?null:Number(snap.hlm.nextHeavy[n]);","if(snap.postEditWeight==null){}")},
 {id:'F39-ACCESSORY-FUTURE-WEIGHT-METADATA-REMOVED',why:'a persisted post-result accessory weight edit is not recorded as an explicit future override, so later correction overwrites it',targets:['F39-ACCESSORY-CORRECTION-PRESERVES-EXPLICIT-FUTURE-TEMPLATE-OVERRIDE'],
  apply:inRegion('function openAccessoryBuilder(editId=null){ensureAccessories();',"if(Number(values.weight)!==oldWeight)snap.postEditWeight=Number(values.weight);","if(Number(values.weight)!==oldWeight){}")},
 {id:'F39-ACCESSORY-FUTURE-WEIGHT-MERGE-REMOVED',why:'accessory correction recomputes the old result but fails to merge the explicit future weight override afterward',targets:['F39-ACCESSORY-CORRECTION-PRESERVES-EXPLICIT-FUTURE-TEMPLATE-OVERRIDE'],
  apply:inRegion('const applyPostEditAccessoryOverrides=',"if(postEditWeight!=null)a.weight=Number(postEditWeight);","if(postEditWeight!=null){}")},
 {id:'F39-ACCESSORY-PENDING-OVERRIDE-FINISH-MERGE-REMOVED',why:'resolving a workout while an accessory correction is still incomplete clears the rollback snapshot before its explicit future override is merged',targets:['F39-ACCESSORY-CORRECTION-PRESERVES-EXPLICIT-FUTURE-TEMPLATE-OVERRIDE'],
  apply:src=>{const a=src.indexOf('function finishWorkout(){');if(a<0)return null;const b=src.indexOf('function renderWorkout(){',a);if(b<0)return null;const mid=src.slice(a,b),next=mid.replace(/bvomApplyPendingAccessoryFutureOverrides\(\);/g,'');if(next===mid)return null;return src.slice(0,a)+next+src.slice(b)}},
 {id:'F40-HLM-CROSS-LIFT-ROLLBACK-SCOPE-REMOVED',why:'correcting one HLM Heavy lift restores whole-program HLM maps and erases another processed lift\'s independently earned nextHeavy',targets:['F40-HLM-CROSS-LIFT-CORRECTION-ISOLATION'],
  apply:inRegion('function processedSnapshot(n){state.processedSnapshots=state.processedSnapshots||{};if(state.processedSnapshots[n])return;',"if(snap.hlm&&state.hlm){for(const k of ['driver','nextHeavy','rep','failCount']){const src=snap.hlm[k];if(src&&Object.prototype.hasOwnProperty.call(src,n)){state.hlm[k]=state.hlm[k]||{};state.hlm[k][n]=JSON.parse(JSON.stringify(src[n]));}}}","if(snap.hlm&&state.hlm){state.hlm.driver=JSON.parse(JSON.stringify(snap.hlm.driver));state.hlm.nextHeavy=JSON.parse(JSON.stringify(snap.hlm.nextHeavy));state.hlm.rep=JSON.parse(JSON.stringify(snap.hlm.rep));state.hlm.failCount=JSON.parse(JSON.stringify(snap.hlm.failCount));}")},
 {id:'F41-BB-ACTUAL-ROUNDTRIP-FINAL-REROUND-RESTORED',why:'the final Bodybuilding active-session conversion layer re-rounds an exact reverse-roundtrip restoration back onto the equipment grid, mutating an already-recorded actual load',targets:['F41-BB-ACTUAL-LOAD-ROUNDTRIP-EXACT'],
  apply:inRegion('const bvomBbDev36ChangeUnitsBase=changeUnits;',"if(x.roundTrip)continue;","if(x.roundTrip){}")},
 {id:'F42-HLM-PENDING-THIRD-FAILURE-STATE-REMOVED',why:'the HLM third-failure threshold resets before the user chooses, leaving no persisted decision to recover after reload',targets:['F42-HLM-THIRD-FAILURE-DECISION-PERSISTS'],
  apply:inRegion('function offerHlmRepChoice(n){',"state.hlm.pendingRepChoice={lift:n,current,next};save();bvomPresentPendingHlmRepChoice()","state.hlm.failCount[n]=0;bvomPresentPendingHlmRepChoice()")},
 {id:'F42-HLM-PENDING-DECISION-RENDER-RESUME-REMOVED',why:'the persisted HLM third-failure decision is not re-presented after reload, leaving a processed lift with an unresolved progression choice hidden',targets:['F42-HLM-THIRD-FAILURE-DECISION-PERSISTS'],
  apply:inRegion('function renderAll(){bvomApplyShell();',"bvomPresentPendingHlmRepChoice();","")},
 {id:'F43-LP-PENDING-CLOSE-MISS-STATE-REMOVED',why:'the LP/RPT close-miss choice is shown transiently but no persisted decision exists to recover after reload',targets:['F43-LP-CLOSE-MISS-DECISION-PERSISTS'],
  apply:inRegion('function offerCloseMissChoice(n,baseWeight,increment){',"state.pendingCloseMissChoice={lift:n,nextWeight:bvomRoundForSession(n,Number(baseWeight)+Number(increment))};save();bvomPresentPendingCloseMissChoice()","save();bvomPresentPendingCloseMissChoice()")},
 {id:'F43-LP-PENDING-CLOSE-MISS-RENDER-RESUME-REMOVED',why:'the persisted LP/RPT close-miss choice is not re-presented after reload, silently leaving neither REPEAT nor PROGRESS ANYWAY committed',targets:['F43-LP-CLOSE-MISS-DECISION-PERSISTS'],
  apply:inRegion('function renderAll(){bvomApplyShell();',"bvomPresentPendingCloseMissChoice();","")},
];
function run(buildDir,ids){const r=spawnSync(process.execPath,[guard,buildDir,'--json',...(ids?['--only='+ids.join(',')]:[])],{encoding:'utf8',maxBuffer:1<<26});
  try{return JSON.parse(r.stdout)}catch(e){return {error:(r.stderr||r.stdout||'').slice(0,400)}}}
function copyBuild(src){const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bvom-mut-'));fs.cpSync(src,tmp,{recursive:true});return tmp}
let failures=0;const line=(s)=>console.log(s);
line(`MUTATION CHECK — candidate: ${path.resolve(dir)}`);
const allTargets=[...new Set(MUTATIONS.flatMap(m=>m.targets))];
const base=run(dir,allTargets);if(base.error){console.error('behaviour_guard failed to run: '+base.error);process.exit(2)}
const baseMap=Object.fromEntries(base.map(r=>[r.id,r]));
const html0=fs.readFileSync(path.join(dir,'index.html'),'utf8');
for(const m of MUTATIONS){
  const pre=m.targets.filter(t=>!baseMap[t]?.pass);
  if(pre.length){line(`N/A     ${m.id} — target(s) already failing on candidate: ${pre.join(',')}`);continue}
  const mutated=m.apply(html0);
  if(mutated==null||mutated===html0){line(`STALE   ${m.id} — mutation anchor not found; update this mutation for the new build`);failures++;continue}
  const tmp=copyBuild(dir);let res;try{fs.writeFileSync(path.join(tmp,'index.html'),mutated);res=run(tmp,m.targets)}finally{fs.rmSync(tmp,{recursive:true,force:true})}
  if(res.error){line(`CAUGHT? ${m.id} — mutant failed to boot (${res.error.split('\n')[0]}); counts as detected`);continue}
  const survived=res.filter(r=>r.pass).map(r=>r.id);
  if(survived.length){line(`SURVIVED ${m.id} — known-bad passed: ${survived.join(',')}  [${m.why}]`);failures++}
  else line(`KILLED  ${m.id} → ${m.targets.join(', ')} failed  [${m.why}]`);
}
const origAfter=fs.readFileSync(path.join(dir,'index.html'),'utf8');if(origAfter!==html0){line('ERROR candidate build was modified!');failures++}
if(knownBad){
  // v2.8.0 is the original known-bad reference, not a universal ancestor of every later regression.
  // These defects were introduced by later hardening, so passing them on v2.8.0 does not make the
  // contracts toothless. Keep provenance exceptions explicit instead of weakening the contracts.
  const notApplicableToV280=new Set([
    'F23-NOOP-POSTCOMPLETE-SETTINGS-PRESERVE-ROLLBACK',
    'F25-ONRAMP-UNIT-ROUNDTRIP-HANDOFF-REVERSIBLE',
    // Forward feature contract added after v2.8.0; the old reference is not expected to implement it.
    'EXPORT-HISTORY-METADATA',
    'EXPORT-V1-TRANSLATOR',
    'STRAVA-ADAPTER-V1',
    'STRAVA-OAUTH-CLIENT-V1'
  ]);
  line(`\nKNOWN-BAD REFERENCE — ${path.resolve(knownBad)} (expected: applicable DEFECT contracts fail; CONTROL/NEGATIVE pass)`);
  const r=run(knownBad);if(r.error){line('reference run error: '+r.error);failures++}
  else{
    const eligible=r.filter(x=>x.kind==='DEFECT'&&!notApplicableToV280.has(x.id));
    const exempt=r.filter(x=>notApplicableToV280.has(x.id));
    const bad=eligible.filter(x=>x.pass),brokenCtl=r.filter(x=>x.kind!=='DEFECT'&&!notApplicableToV280.has(x.id)&&!x.pass);
    line(`Applicable DEFECT contracts failing on reference: ${eligible.filter(x=>!x.pass).length}/${eligible.length}`);
    if(exempt.length)line(`Reference N/A (historical provenance): ${exempt.map(x=>x.id).join(', ')}`);
    for(const x of bad){line(`TOOTHLESS ${x.id} passes on the known-bad reference`);failures++}
    for(const x of brokenCtl){line(`REFERENCE-CONTROL-FAIL ${x.id} — ${x.detail}`);failures++}
  }
}
line(`\nMUTATION RESULT: ${failures?failures+' problem(s)':'all mutations killed'}${knownBad?'; known-bad reference checked':''}`);
process.exit(failures?1:0);
