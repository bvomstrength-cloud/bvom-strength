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
 // Monkey 026: default A is a view-only preference; canonical workout slots
 // remain unchanged for prescription and History compatibility.
 {id:'BB-M026-A-DEFAULT-REVERTS-CANONICAL',why:'New Bodybuilding A starts Bench before Squat and Laterals before Triceps again',targets:['BB-M026-DEFAULT-A-ONRAMP','BB-M026-DEFAULT-A-BLOCK'],apply:inRegion('function bvomOrderDefault(', "return ['A2','A1','A3','A4','A6','A5'];", "return canonical;")},
 // Monkey 025: the weight-moved explanation must sit under its input,
 // not under the unrelated Assistance / variation field.
 {id:'BB-M025-ESTIMATE-HELP-AFTER-ASSISTANCE',why:'Builder places estimated-weight explanation under Assistance again',targets:['BB-M025-ESTIMATED-WEIGHT-HELP-EN','BB-M025-ESTIMATED-WEIGHT-HELP-JA'],apply:inRegion('function openAccessoryBuilder(editId=null){if(!bvomWorkoutActionAllowed())return;ensureAccessories();', "</label><div class=\"small\">${bvomT('bodyweight.estimateHelp')}</div><label>${bvomT('bodyweight.assistance')}<input id=\"accBwResistance\" type=\"text\" maxlength=\"80\" value=\"${bvomEsc(existing?.resistance??'')}\"></label>", "</label><label>${bvomT('bodyweight.assistance')}<input id=\"accBwResistance\" type=\"text\" maxlength=\"80\" value=\"${bvomEsc(existing?.resistance??'')}\"></label><div class=\"small\">${bvomT('bodyweight.estimateHelp')}</div>")},
 // Monkey 024: invalid bodyweight set-entry values must be shown inside the
 // existing workout modal, never by the browser's native site-says alert.
 {id:'BB-M024-ONRAMP-NATIVE-ALERT-RESTORED',why:'Nordic Curl On-Ramp invalid input again triggers a browser alert',targets:['BB-M024-BW-INLINE-ERROR-ONRAMP'],apply:inRegion('function bvomBbOnRampSetModal(', 'bvomBwRead(o,(message,field)=>bvomBbInputNotice(o,message,field))', 'bvomBwRead(o)')},
 {id:'BB-M024-BLOCK-NATIVE-ALERT-RESTORED',why:'Nordic Curl Bodybuilding invalid input again triggers a browser alert',targets:['BB-M024-BW-INLINE-ERROR-BLOCK'],apply:inRegion('function bvomBbSetModal(', 'bvomBwRead(o,(message,field)=>bvomBbInputNotice(o,message,field))', 'bvomBwRead(o)')},
 // Codex PR57 P1: GPP scope and program mode must be durably committed together.
 {id:'BB-M023-GPP-INTERMEDIATE-LP-MODE',why:'A GPP owner change persists a temporary LP/RPT mode',targets:['BB-M023-GPP-ONRAMP-POSTCOMMIT-CREATE','BB-M023-GPP-BLOCK-POSTCOMMIT-EDIT'],apply:inRegion('function openGppBuilder(id=null)', "if(!save({durable:true})){state=before;return false}", "state.programMode='lprpt';if(!save({durable:true})){state=before;return false}")},
 {id:'BB-M023-GPP-CREATE-SCOPE-LEAK',why:'A new Bodybuilding GPP activity is assigned to unrelated programs',targets:['BB-M023-GPP-ONRAMP-POSTCOMMIT-CREATE','BB-M023-GPP-BLOCK-POSTCOMMIT-CREATE'],apply:inRegion('function openGppBuilder(id=null)', "for(const field of fields)item[field]=g?g[field]:BVOM_BB_SENTINEL;", "for(const field of fields)item[field]=g?g[field]:'Any';")},
 {id:'BB-M023-GPP-REJECT-LEAK',why:'Rejected single-blob GPP save leaves phantom assignment in live state',targets:['BB-M023-GPP-ONRAMP-REJECT-ATOMIC','BB-M023-GPP-BLOCK-REJECT-ATOMIC'],apply:inRegion('function openGppBuilder(id=null)', "if(!save({durable:true})){state=before;return false}", "if(!save({durable:true})){return false}")},
 // Monkey 023 follow-up: the On-Ramp's computed A/B day differs from state.day.
 {id:'BB-M023-GPP-ONRAMP-USES-BLOCK-DAY',why:'On-Ramp B incorrectly uses Bodybuilding day A to select GPP',targets:['BB-M023-GPP-ONRAMP-DAY-FILTER'],apply:inRegion('const bvomBbBaseGppAssigned=bvomGppAssigned;', 'const day=bvomBbOnRampActive()?bvomBbOnRampDay():bvomBbDay();', 'const day=bvomBbDay();')},
 {id:'BB-M023-GPP-EDITOR-HIDDEN-AGAIN',why:'GPP editor hides its Bodybuilding A/B selector again',targets:['BB-M023-GPP-ONRAMP-EDITOR','BB-M023-GPP-BLOCK-EDITOR'],apply:inRegion('function bvomGppBuilderAssignments(g)', 'const bbField=isBodybuilding()?', 'const bbField=false?')},
 {id:'BB-M023-GPP-EDITOR-RESETS-ANY',why:'Bodybuilding GPP editor discards selected A/B and saves Any',targets:['BB-M023-GPP-ONRAMP-EDITOR','BB-M023-GPP-BLOCK-EDITOR','BB-M023-GPP-ONRAMP-NEW-ASSIGNMENT','BB-M023-GPP-BLOCK-NEW-ASSIGNMENT'],apply:inRegion('function openGppBuilder(id=null)', "bbAssignment:bodybuild?(o.querySelector('[data-bb]')?.value||'Any'):(g?.bbAssignment??null)", "bbAssignment:'Any'")},
 // Monkey 023: both Bodybuilding modes must expose their existing GPP entry UI.
 {id:'BB-M023-GPP-ONRAMP-HIDDEN',why:'On-Ramp workout drops the GPP section again',targets:['BB-M023-GPP-ONRAMP-VISIBLE'],apply:inRegion('function bvomBbOnRampRenderWorkout(){', "h+=renderAccessories17();h+=renderGpp17();document.querySelector('#workout').innerHTML=h}", "h+=renderAccessories17();document.querySelector('#workout').innerHTML=h}")},
 {id:'BB-M023-GPP-BLOCK-HIDDEN',why:'24-session Bodybuilding workout drops the GPP section again',targets:['BB-M023-GPP-BLOCK-VISIBLE'],apply:inRegion('function bvomBbRenderFoundationWorkout(){bvomBbEnsure();', "h+=renderAccessories17();h+=renderGpp17();el.innerHTML=h}", "h+=renderAccessories17();el.innerHTML=h}")},
 // Codex PR57 P1: optional On-Ramp sets/GPP must remain finishable and archived.
 {id:'BB-M022-OPTIONAL-TRAP-RESTORED',why:'On-Ramp Finish again refuses accessory-only or GPP-only work',targets:['BB-M022-ONRAMP-ACCESSORY-ONLY','BB-M022-ONRAMP-GPP-ONLY'],apply:inRegion('function bvomBbOnRampFinish(approvedIncomplete=false)', 'if(!bvomSessionHasActivity())return;', 'if(!ids.some(bvomBbOnRampExerciseTouched))return;')},
 {id:'BB-M022-GPP-HISTORY-DROPPED',why:'On-Ramp Finish discards GPP results while clearing the live session',targets:['BB-M022-ONRAMP-GPP-ONLY'],apply:inRegion('function bvomBbOnRampFinish(approvedIncomplete=false)', "session:historySession,gpp,note:'Bodybuilding On-Ramp'", "session:historySession,note:'Bodybuilding On-Ramp'")},
 {id:'BB-M019-FINISH-IGNORES-REJECT',why:'Bodybuilding FINISH advances despite a rejected durable training write',targets:['BB-M019-REJECT-NORMAL'],apply:inRegion('function bvomBbFinish(approvedIncomplete=false)', 'if(!save({durable:true})){state=before;', 'if(false){state=before;')},
 {id:'BB-M019-ONRAMP-IGNORES-REJECT',why:'On-Ramp FINISH advances despite a rejected durable training write',targets:['BB-M019-REJECT-ONRAMP'],apply:inRegion('function bvomBbOnRampFinish(approvedIncomplete=false)', 'if(!save({durable:true})){', 'if(false){')},

 {id:'BW-STAGE2-INCOMPLETE-CORE-SUPPRESSED',why:'FINISH ANYWAY suppresses an earned accessory increase merely because core sets are missing',targets:['BW-STAGE2-INCOMPLETE-CORE-ACCEPT'],apply:inRegion('function finishWorkout(){', 'bvomIncompleteConfirm(offerBodyweight,', 'bvomIncompleteConfirm(()=>askNote([]),')},
 {id:'BW-STAGE2-OPT-IN-IGNORED',why:'opted-out Bodyweight accessories generate progression offers',targets:['BW-STAGE2-DEFAULT-OFF'],apply:inRegion('function bvomBwProgressEligible(', '&&a?.bwProgressOptIn===true', '')},
 {id:'BW-STAGE2-RPE-VETO-REMOVED',why:'an RPE9 first set incorrectly earns more hanging weight',targets:['BW-STAGE2-HARD-HOLD'],apply:inRegion('function bvomBwProgressCandidate(', 'rpe<=8', 'rpe<=10')},
 {id:'BW-STAGE2-DOUBLE-INCREMENT',why:'one earned set applies two increments',targets:['BW-STAGE2-EARNED-ACCEPT'],apply:inRegion('function bvomBwProgressCandidate(', "next=load+step;", "next=load+step*2;")},
 {id:'BW-STAGE2-HOLD-BECOMES-ACCEPT',why:'HOLD silently increases next weight',targets:['BW-STAGE2-EARNED-HOLD'],apply:inRegion('function bvomBwConfirmOffers(', '()=>visit(i+1),()=>{accepted.push(x);visit(i+1)}', '()=>{accepted.push(x);visit(i+1)},()=>{accepted.push(x);visit(i+1)}')},
 {id:'BW-STAGE2-ALL-SETS-WEIGHTED',why:'back-off sets incorrectly inherit the top set belt load',targets:['BW-STAGE2-EARNED-ACCEPT'],apply:inRegion('const bvomFtBaseAccessoryPlan17=accessoryPlan17;', "i>0&&bvomBwProgressEligible(a)?0", "false?0")},

 {id:'BW-ESTIMATE-VOLUME-REMOVED',why:'estimated weight moved disappears from volume',targets:['BW-REFINE-VOLUME'],apply:inRegion('function bvomSetVolume(', 'load+(Number.isFinite(estimate)&&estimate>0?estimate:0)', 'load')},
 {id:'BW-ESTIMATE-DOUBLED',why:'bodyweight volume incorrectly uses two-sided maths',targets:['BW-REFINE-VOLUME'],apply:inRegion('function bvomSetVolume(', '))*reps;', '))*reps*2;')},
 {id:'BW-APPROXIMATE-FLAG-REMOVED',why:'estimated volume is presented as measured tonnage',targets:['BW-REFINE-HISTORY'],apply:inRegion('function bvomHistoryExportMeta(', 'bvomVolumeApproximate(session)?{volumeApproximate:true}:{}', 'false?{volumeApproximate:true}:{}')},
 {id:'BW-ARBITRARY-INCREMENT-LOST',why:'bodyweight user increment replaced by numeric selector',targets:['BW-REFINE-INCREMENT'],apply:inRegion("function updateEquip(){let e=equipment.value,bw=e==='bodyweight'", 'increment:bw?bwIncrement:', 'increment:bw?5:')},
 {id:'BW-RECORDING-ROUTE-REMOVED',why:'new bodyweight accessories enter legacy progression',targets:['BW-STAGE1-RECORD'],apply:inRegion('const bvomBbBaseTapAccessory=', "if((state.accessoryList||[]).find(a=>a.id===id)?.equipment==='bodyweight')return bvomBwAccessoryModal(id,i);", '')},
 {id:'BW-ZERO-EXPORT-REMOVED',why:'zero added load disappears from export',targets:['BW-STAGE1-HISTORY'],apply:inRegion('function bvomExportV1Set(', "||(rec.bodyweight===true&&load===0)", '')},
 {id:'BW-EXACT-CONVERSION-REMOVED',why:'bodyweight actual load is snapped to numeric equipment grid',targets:['BW-STAGE1-UNITS'],apply:inRegion('function changeUnits(to,quiet=false)', "set.bodyweight===true?v=>convertLoad(v,to):undefined", 'undefined')},
 {id:'BW-FAILED-SAVE-ROLLBACK-REMOVED',why:'unsaved bodyweight correction leaks into memory',targets:['BW-STAGE1-ATOMIC'],apply:inRegion('state.session[key][i]={...bw,reps,rpe,target:planned.target', 'if(!save({durable:true})){state=before;return}', 'if(!save({durable:true})){return}')},
 {id:'BW-M020-APPEND-ONLY-INDEX',why:'removed extra slots remain unavailable and long sessions hit a phantom cap',targets:['BW-EXTRA-M020-HOLE-REUSE'],apply:inRegion('function bvomBwNextExtraSetIndex(', 'let next=planned;while(used.has(next))next++;', 'let next=Math.max(planned,...[...used].map(n=>n+1));')},
 {id:'BW-M020-CAP-BY-NEXT-INDEX',why:'30 retained sparse extras bypass the limit when an early slot is vacant',targets:['BW-EXTRA-M020-SPARSE-CAP'],apply:inRegion('function bvomBwAddExtraSet(id)', 'if(bvomBwExtraSetIndices(a,ss).length>=30)', 'if(bvomBwNextExtraSetIndex(a)>=accessoryPlan17(a).length+30)')},
 {id:'BW-M020-DIRECT-MODAL-BYPASS',why:'direct entry opens a 31st extra despite a full retained-set limit',targets:['BW-EXTRA-M020-SPARSE-CAP'],apply:inRegion('function bvomBwAccessoryModal(id,i)', '||bvomBwExtraSetIndices(a,state.session?.[key]).length>=30', '')},
 {id:'BW-EXTRA-REMOVE-ROLLBACK-REMOVED',why:'rejected extra-set removal discards saved actuals in memory',targets:['BW-EXTRA-REMOVE-REJECT'],apply:inRegion("if(extra&&existing)o.querySelector('[data-remove]').onclick", 'if(!save({durable:true})){state=before;return}', 'if(!save({durable:true})){return}')},
 {id:'BW-NEGATIVE-LOAD-VALIDATION-REMOVED',why:'negative added weight is accepted',targets:['BW-STAGE1-ATOMIC'],apply:inRegion('function bvomBwRead(', '||load<0', '')},

 {id:'SW-WORKOUT-VISIBILITY-GUARD-REMOVED',why:'pending update covers recorded workout controls',targets:['F100-SW-UPDATE-WORKOUT-VISIBILITY'],apply:inRegion('function bvomSwUpdateBlocked()', 'bvomAnyWorkoutActive()||', '')},
 {id:'SW-CRITICAL-GUARDS-REMOVED',why:'Finish, dialogs or rejected saves allow update reload',targets:['F101-SW-UPDATE-CRITICAL-GUARDS'],apply:inRegion('function bvomSwUpdateBlocked()', "||!!window.__bvomFinishBusy||bvomPersistenceBlocked()||!!document.querySelector('.bvomModalOverlay')", '')},
 {id:'SW-PENDING-UPDATE-RETENTION-REMOVED',why:'hidden update cannot return when registration.waiting clears',targets:['F102-SW-UPDATE-RETAIN-ACTIVATED'],apply:inRegion('function bvomShowServiceWorkerUpdate(reg)', 'if(reg?.waiting)bvomSwPendingUpdate={reg,worker:waiting};', 'if(reg?.waiting){}')},
 {id:'SW-CRITICAL-WORK-CONSENT-CANCEL-REMOVED',why:'activation after a completed workout reloads without a fresh tap',targets:['F103-SW-UPDATE-CONSENT-CANCELLED'],apply:inRegion('function bvomRefreshServiceWorkerUpdate()', 'if(blocked&&bvomSwUpdateBusy){', 'if(false){')},
 {id:'SETUP-INTENT-ONLY-SCHEDULE-GUARD-REMOVED',why:'local intent cancellation earns an unexpected upload',targets:['F84-DEFERRED-INGRESS-AND-RECONCILIATION'],apply:inRegion('bvomCloudMaybeScheduleFromSave=function(previous){', 'if(previous&&', 'if(false&&previous&&')},
 {id:'SETUP-LOCAL-PAYLOAD-EXCLUSION-REMOVED',why:'deferred setup propagates to another device',targets:['F78-DEFERRED-CLOUD-BOUNDARY'],apply:inRegion('function bvomCloudPayload(){', 'delete d.setupAfterFinish;', '')},
 {id:'SETUP-COMPARE-EXCLUSION-REMOVED',why:'a local request creates false cloud conflicts',targets:['F78-DEFERRED-CLOUD-BOUNDARY'],apply:inRegion('function bvomCloudNormalizeForCompare(v){', 'delete d.setupAfterFinish;', '')},
 {id:'SETUP-FINISH-DURABILITY-REMOVED',why:'failed Finish pretends History is committed',targets:['F80-DEFERRED-SAVE-FAILURES'],apply:inRegion('function finishWorkout(){', 'if(!save({durable:true})){state=before;bvomCloud.deferWorkoutCommit=oldDefer;', 'if(false){state=before;bvomCloud.deferWorkoutCommit=oldDefer;')},
 {id:'SETUP-CORRECTION-WITHDRAWAL-REMOVED',why:'terminal correction retains stale intent/decision',targets:['F82-DEFERRED-CORRECTION-AND-COLLISION'],apply:inRegion('function bvomWithdrawDeferredForCorrection(n){', 'delete state.setupAfterFinish;if(state.hlm.pendingRepChoice?.lift===n)delete state.hlm.pendingRepChoice;', '')},
 {id:'SETUP-PENDING-COLLISION-GUARD-REMOVED',why:'a second driver overwrites the first decision',targets:['F82-DEFERRED-CORRECTION-AND-COLLISION'],apply:inRegion('function bvomPersistPendingChoice(kind,pending){', "if(kind==='hlm'&&state.hlm?.pendingRepChoice&&state.hlm.pendingRepChoice.lift!==pending.lift){bvomDeferredCollisionNotice();return false}", '')},
 {id:'SETUP-DRAFT-VALIDATION-REMOVED',why:'invalid setup publishes rejected inputs',targets:['F79-DEFERRED-FINISH-AND-DRAFT'],apply:inRegion('async function bvomCommitDeferredDraft(){', "if(mode!=='free'&&mode!=='bodybuilding'&&names.some", 'if(false&&names.some')},
 {id:'SETUP-DRAFT-AWAIT-INPUT-RECHECK-REMOVED',why:'input changed after validation is committed',targets:['F81-DEFERRED-DRAFT-OPTIONS-AND-AWAIT'],apply:inRegion('async function bvomCommitDeferredDraft(){', 'validated!==JSON.stringify({d,bb})||', '')},
 {id:'SETUP-CLOUD-INGRESS-STRIPPING-REMOVED',why:'foreign cloud intent becomes active locally',targets:['F84-DEFERRED-INGRESS-AND-RECONCILIATION'],apply:inRegion('bvomCloudValidData=function(d){', 'if(valid)delete d.setupAfterFinish;', '')},
 {id:'RECOVERY-PASSIVE-CLOCK-RESET',why:'renders/rest saves postpone abandonment',targets:['F70-MEANINGFUL-ACTIVITY-CLOCK'],apply:inRegion('function save(options)', 'options?.activity||bvomRecordedActivityChanged(persisted,state)', 'true')},
 {id:'RECOVERY-BB-CONSUMES-SESSION',why:'incomplete expiry consumes a completed BB session',targets:['F71-INCOMPLETE-EXPIRY-PROGRAMS'],apply:inRegion('function bvomRecoveryCheck()', 'state.history.push(record);', 'state.history.push(record);if(isBodybuilding())state.bodybuilding.completedSessions++;')},
 {id:'RECOVERY-PENDING-HOLD-REMOVED',why:'expiry discards an unresolved decision',targets:['F72-EXPIRY-PENDING-GPP-HOLD'],apply:inRegion('function bvomRecoveryHold()', "if(state.pendingCloseMissChoice||state.hlm?.pendingRepChoice)return 'choice';", '')},
 {id:'RECOVERY-FAILED-WRITE-ROLLBACK-REMOVED',why:'memory reports incomplete while stored session remains active',targets:['F74-EXPIRY-SAVE-FAILURE-ROLLBACK'],apply:inRegion('// Recheck all fencing', 'state=before;', '')},
 {id:'RECOVERY-LEGACY-GRACE-REMOVED',why:'missing clock immediately expires',targets:['F75-LEGACY-AND-CLOCK-GRACE'],apply:inRegion('function bvomRecoveryCheck()', 'state.workoutLastActivityAt=now;', 'state.workoutLastActivityAt=now-BVOM_INACTIVITY_MS;')},
 {id:'RECOVERY-LOCK-ACTION-GUARD-REMOVED',why:'denied document can mutate memory before a rejected save',targets:['F73-LOCK-AND-ACCOUNT-FENCING'],apply:inRegion('function bvomWorkoutActionAllowed()', 'if(!bvomWindowLockOwned||bvomRecoveryLegacyBlocked)', 'if(bvomRecoveryLegacyBlocked)')},
 {id:'ERASE-AUTH-EVENT-TRACKING-REMOVED',why:'account transition during await escapes snapshot validation',targets:['F69-ERASE-NATIVE-AUTH-CALLBACK'],apply:inRegion('c.auth.onAuthStateChange(', 'bvomEraseAuthEvent(_event,old||null,next);', '')},
 {id:'ERASE-SNAPSHOT-RECHECK-REMOVED',why:'post-signout erase deletes changed saved data',targets:['F65-ERASE-STALE-AWAIT'],apply:inRegion('async function bvomEraseModal(', '||!bvomEraseStillCurrent(op)', '')},
 {id:'ERASE-CANCEL-INVALIDATION-REMOVED',why:'Cancel only hides the modal while deletion continues',targets:['F66-ERASE-CANCEL-AWAIT'],apply:inRegion('async function bvomEraseModal(', 'if(op.cancelled||closed||!bvomEraseStillCurrent(op))', 'if(!bvomEraseStillCurrent(op))')},
 {id:'HISTORY-IDENTITY-CHECK-REMOVED',why:'stale record confirmation deletes a different or changed record',targets:['F67-HISTORY-EXACT-TARGET'],apply:inRegion('function deleteHistoryWorkout(', 'if(matches.length!==1||state.history[matches[0]]!==h||', 'if(false&&matches.length!==1||false&&state.history[matches[0]]!==h||')},

 {id:'DELAYED-RESTORE-RECHECK-REMOVED',why:'stale backup callback overwrites a foreign active workout',targets:['F58-DELAYED-BACKUP-COMMIT'],apply:inRegion('function bvomRestoreCommitAllowed(', 'if(!bvomWorkoutActionAllowed())return false;', 'return true;')},
 {id:'HISTORY-CALLBACK-GUARD-REMOVED',why:'late History deletion mutates memory before validation',targets:['F59-DEFERRED-MUTATION-COMMIT'],apply:src=>{const a=inRegion('function deleteHistoryWorkout(', 'if(!bvomWorkoutActionAllowed())return;const matches=', 'const matches=')(src);return a&&inRegion('function deleteHistoryWorkout(', 'if(!save({durable:true})){state=before;return}', 'save();')(a)}},
 {id:'CUSTOM-ACCESSORY-CALLBACK-GUARD-REMOVED',why:'late accessory removal leaks into another write',targets:['F59-DEFERRED-MUTATION-COMMIT'],apply:src=>{const a=inRegion('const bvomFtBaseRemoveAccessory=', 'apply=()=>{if(!bvomWorkoutActionAllowed())return;', 'apply=()=>{')(src);return a&&inRegion('const bvomFtBaseRemoveAccessory=', 'if(!save({durable:true})){state=before;return}', 'save();')(a)}},
 {id:'CUSTOM-GPP-CALLBACK-GUARD-REMOVED',why:'late GPP removal leaks into another write',targets:['F59-DEFERRED-MUTATION-COMMIT'],apply:src=>{const a=inRegion('const bvomFtBaseRemoveGpp=', 'apply=()=>{if(!bvomWorkoutActionAllowed())return;', 'apply=()=>{')(src);return a&&inRegion('const bvomFtBaseRemoveGpp=', 'if(!save({durable:true})){state=before;return}', 'save();')(a)}},
 {id:'POSTCOMMIT-OWNER-FALSE-RESTORED',why:'a committed choice is wrongly rolled back in memory',targets:['F60-POSTCOMMIT-OWNER-FAILURE'],apply:inRegion('function save(options)', 'catch(e){bvomPostCommitOwnerFailureNotice();return true}', 'catch(e){bvomPostCommitOwnerFailureNotice();return false}')},
 {id:'PENDING-CREATION-EARLY-PROCESSED-WRITE',why:'pending failure leaves processed true without a choice',targets:['F61-PENDING-CREATION-DURABILITY'],apply:inRegion('function bvomProcessRequiredCoreChoice(', 'state.processed[n]=true;', 'state.processed[n]=true;save();')},
 {id:'PENDING-CREATION-RELOAD-RESUME-REMOVED',why:'saved complete unprocessed work never recovers its required choice',targets:['F61-PENDING-CREATION-DURABILITY'],apply:inRegion('function bvomResumeRequiredCoreChoices(', '{', '{return;')},
 {id:'CLOUD-COMMIT-RECHECK-REMOVED',why:'cloud confirmation erases newly recorded local work',targets:['F62-DELAYED-CLOUD-AND-SETUP'],apply:src=>{const a=src.indexOf('async function bvomCloudRestore('),b=src.indexOf('async function bvomCloudSignOut(',a);if(a<0||b<0)return null;const mid=src.slice(a,b),next=mid.replaceAll('bvomRestoreCommitAllowed(token,true)','true');return next===mid?null:src.slice(0,a)+next+src.slice(b)}},
 {id:'SETUP-AWAIT-RECHECK-REMOVED',why:'setup continues mutating after await despite changed ownership',targets:['F62-DELAYED-CLOUD-AND-SETUP'],apply:inRegion('async function completeSetup(', 'if(!entitlementOk||!bvomWorkoutActionAllowed())return;', 'if(!entitlementOk)return;')},
 {id:'TIMER-SOUND-ASSIGNED-GUARD-REMOVED',why:'assigned DOM callback mutates secondary memory',targets:['F64-ASSIGNED-TIMER-SOUND-GUARD'],apply:src=>{const a=inRegion('const bvomRenderSettingsV24Base=', 'if(!bvomWorkoutActionAllowed()){e.target.checked=state.timerSound!==false;return}', '')(src);return a&&inRegion('const bvomRenderSettingsV24Base=', 'if(!save({durable:true})){state.timerSound=before;e.target.checked=before!==false}', 'save();')(a)}},
 {id:'SECONDARY-WARMUP-GUARD-REMOVED',why:'non-owner warm-up changes memory before write protection',targets:['F51-SECONDARY-WARMUP-NO-LEAK'],apply:inRegion('function completeWarmup(', 'if(!bvomWorkoutActionAllowed())return;', '')},
 {id:'SECONDARY-MARKER-STEAL-RESTORED',why:'direct acquisition steals a live owner even on rejected stale save',targets:['F52-SECONDARY-STALE-CLAIM-ORDER'],apply:inRegion('function bvomMarkThisTabAsWorkoutOwner()', "return bvomWorkoutActionAllowed()?bvomTabId():''", "localStorage.setItem(BVOM_WORKOUT_TAB_OWNER_KEY,bvomTabId());return bvomTabId()")},
 {id:'PENDING-OWNER-CHECK-REMOVED',why:'secondary pending answer is mistaken for a durable no-op',targets:['F50-SECONDARY-PENDING-ANSWER-ATOMIC'],apply:src=>{const a=inRegion('function bvomWorkoutActionAllowed()', 'if(owner&&owner!==id&&', 'if(false&&owner&&owner!==id&&')(src);return a&&inRegion('function save(options)', 'if(bvomSecondaryTabWriteBlocked())return false;', '')(a)}},
 {id:'PENDING-ANSWER-ROLLBACK-REMOVED',why:'failed critical save leaves rejected progression in memory',targets:['F53-PENDING-SAVE-FAILURE-KEEPS-DECISION'],apply:inRegion('function bvomCommitPendingChoice(', 'state=before;return false;', 'return false;')},
 {id:'PENDING-STRICT-SAVE-RECHECK-REMOVED',why:'ownership change at commit is mistaken for a durable save',targets:['F56-CRITICAL-COMMIT-RECHECKS-OWNERSHIP'],apply:src=>{const a=inRegion('function save(options)', 'if(!bvomWorkoutActionAllowed())return false;', '')(src);return a&&inRegion('function save(options)', 'if(bvomSecondaryTabWriteBlocked())return false;', '')(a)}},
 {id:'OWNER-RELEASE-BEFORE-WRITE-RESTORED',why:'failed Finish relinquishes original ownership',targets:['F56-CRITICAL-COMMIT-RECHECKS-OWNERSHIP'],apply:inRegion('function save(options)', 'const next=JSON.stringify(state);', 'if(!bvomStateWorkoutActive(state))bvomReleaseWorkoutTabOwnerIfThisTab();const next=JSON.stringify(state);')},

 {id:'LP-PRESCRIBED-TARGET',why:'historical 22 Sep bug: rescue built from the prescribed target instead of achieved reps',targets:['LP-RESCUE-LIVE'],
  apply:inRegion('function genericSetPlan(','rescueBase=Math.max(1,Number(done.reps)+1)','rescueBase=Math.max(1,Number(q.target)+1)')},
 {id:'LP-LIVE-IGNORES-LOGGED-SETS',why:'live getSetPlan stops passing logged sets to the rescue planner (preview never updates)',targets:['LP-RESCUE-LIVE'],
  apply:inRegion('function genericSetPlan(','let out=genericSetPlan(n,p,ss);','let out=genericSetPlan(n,p,{});')},
 {id:'CORE-ROUNDING-REMOVED',why:'derived core loads no longer rounded to loadable increments',targets:['LP-RESCUE-LIVE'],
  apply:inRegion('function bvomDerivedCoreLoad(','return Math.max(bar,bvomRoundForSession(n,x))','return Math.max(bar,x)')},
 {id:'LP-SUCCESS-NO-PROGRESS',why:'successful LP lift no longer progresses',targets:['LP-PROGRESSION'],
  apply:inRegion('function advanceAfterExercise(n){\n if(isIntermediate())','if(!r.failed&&!r.close){state.weights[n]=bvomRoundForSession(n,baseWeight+c.increment)','if(!r.failed&&!r.close){state.weights[n]=bvomRoundForSession(n,baseWeight)')},
 {id:'HLM-ENTRY-WRAPPER-BROKEN',why:'a live chooseProgramMode wrapper swallows HLM entry',targets:['HLM-ENTRY-LIVE','HLM-HEAVY-DRIVER'],
  apply:inRegion('const bvomBbBaseChooseProgramMode=chooseProgramMode;','chooseProgramMode=function(mode){',"chooseProgramMode=function(mode){if(mode==='hlm')return;")},
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
  apply:inRegion('function bvomBbOnRampPrepareHandoff(',"o.status='handed_off';","o.status='handed_off';delete b.performanceRefs;")},
 {id:'ONRAMP-HANDOFF-UNCALIBRATED',why:'handoff no longer carries CONFIRMED into calibrated',targets:['BB-ONRAMP-HANDOFF'],
  apply:inRegion('function bvomBbOnRampPrepareHandoff(',"p.calibrated=e.state==='CONFIRMED'","p.calibrated=false")},
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
  apply:inRegion('async function bvomCloudAssessSync()',"if(!bvomCloud.user||bvomCloud.offlineLocalAccess||bvomCloud.startupState==='VERIFYING'||bvomCloud.assessing)return;","if(!bvomCloud.user||bvomCloud.startupState==='VERIFYING'||bvomCloud.assessing)return;")},
 {id:'OFFLINE-OWNER-CHECK-REMOVED',why:'cached entitlement for one account is allowed to unlock a different local data owner',targets:['F12-NEG-OWNER-MISMATCH'],
  apply:src=>{const s1=inRegion('function bvomEntitlementOfflineAccessDecision(',"if(!userId||!owner||owner!==userId||!cached)return {allowed:false,","if(!userId||!owner||!cached)return {allowed:false,")(src);if(!s1)return null;return inRegion('function bvomOpenVerifiedOfflineOwner()',"bvomEntitlementOfflineAccessDecision(owner)","bvomEntitlementOfflineAccessDecision('user-1')")(s1)}},
 {id:'OFFLINE-GRACE-CHECK-REMOVED',why:'stale cached verification remains eligible beyond the offline grace period',targets:['F12-NEG-GRACE-EXPIRED'],
  apply:inRegion('function bvomEntitlementOfflineAccessDecision(',"if(!Number.isFinite(verifiedAt)||age<-(5*60*1000)||age>BVOM_ENTITLEMENT_OFFLINE_GRACE_MS)return {allowed:false,","if(!Number.isFinite(verifiedAt)||age<-(5*60*1000))return {allowed:false,")},
 {id:'FASTBOOT-TRUSTED-LOCAL-DISABLED',why:'trusted verified local state no longer opens before hanging live startup checks',targets:['F46-FASTBOOT-ENTITLEMENT-HANG','F47-FASTBOOT-CLOUD-HANG'],
  apply:inRegion('function bvomOpenTrustedLocalForSignedInUser(',"if(mode!=='session')return null;","return null;")},
 {id:'FASTBOOT-REFRESHES-GRACE',why:'optimistic local startup incorrectly extends the 7-day verification window without a live server response',targets:['F48-FASTBOOT-DOES-NOT-EXTEND-GRACE'],
  apply:inRegion('function bvomOpenTrustedLocalForSignedInUser(',"bvomEntitlement.record=decision.row;","bvomEntitlementCacheWrite(decision.row);bvomEntitlement.record=decision.row;")},
 {id:'FASTBOOT-REVOCATION-INTERRUPTS-ACTIVE',why:'a delayed live revocation immediately gates and interrupts an active locally opened workout',targets:['F49-FASTBOOT-REVOCATION-ACTIVE-WORKOUT'],
  apply:inRegion('async function bvomPublicContinueAfterSignIn(',"if(fastLocalDecision&&bvomAnyWorkoutActive()){","if(false){")},
 {id:'F24-INTERMEDIATE-SNAPSHOT-HLM-CONVERSION-REMOVED',why:'unit conversion updates live intermediate state but leaves restorable processedSnapshots.hlm driver/nextHeavy in the old unit',targets:['F24-INTERMEDIATE-SNAPSHOT-UNIT-CONVERSION-ATOMIC'],
  apply:inRegion('for(const snap of Object.values(state.processedSnapshots||{}))',"if(snap.hlm){for(const [name,map] of [['driver',snap.hlm.driver],['nextHeavy',snap.hlm.nextHeavy]])for(const n of Object.keys(map||{}))if(map[n]!=null)map[n]=cvr(snap,'hlm.'+name+'.'+n,map[n])}",'')},
 {id:'F24-SNAPSHOT-INCREMENT-ROUNDTRIP-METADATA-REMOVED',why:'processed snapshot increments use one-way nearest-option conversion and drift after kg→lb→kg',targets:['F24-INTERMEDIATE-SNAPSHOT-UNIT-CONVERSION-ATOMIC'],
  apply:inRegion('for(const snap of Object.values(state.processedSnapshots||{}))',"snap.cfg.increment=bvomConvertIncrementRoundTrip(snap.cfg,snap.cfg.increment??2.5,from,to)","snap.cfg.increment=convertIncrement(snap.cfg.increment??2.5,to)")},
 {id:'F25-ONRAMP-INCREMENT-ROUNDTRIP-METADATA-REMOVED',why:'On-Ramp exercise increments use one-way practical conversion and drift across kg→lb→kg',targets:['F25-ONRAMP-UNIT-ROUNDTRIP-HANDOFF-REVERSIBLE'],
  apply:inRegion('const bvomBbDev36ChangeUnitsBase=changeUnits;',"const step=bvomConvertIncrementRoundTrip(e,e.increment??2.5,before,to);","const step=bvomBbConvertPracticalIncrement(e.increment??2.5,to);")},
 {id:'F25-ONRAMP-LOAD-ROUNDTRIP-METADATA-REMOVED',why:'On-Ramp exercise loads are re-rounded from the converted value on return instead of restoring an unchanged original practical load',targets:['F25-ONRAMP-UNIT-ROUNDTRIP-HANDOFF-REVERSIBLE'],
  apply:inRegion('const bvomBbDev36ChangeUnitsBase=changeUnits;',"e.load=bvomBbConvertLoadRoundTrip(e,e.load,before,to,step)","e.load=bvomBbConvertLoadToStep(e.load,to,step)")},
 {id:'F23-NOOP-SETTINGS-SNAPSHOT-GUARD-REMOVED',why:'a no-op post-completion Advanced Settings save rewrites the original rollback snapshot',targets:['F23-NOOP-POSTCOMPLETE-SETTINGS-PRESERVE-ROLLBACK'],
  apply:inRegion('function saveLiftSettings(n){if(!bvomWorkoutActionAllowed())return;\n ensurePlateModes();',"if(active&&hasRecorded&&beforeSettings!==afterSettings){","if(active&&state.processed?.[n]&&beforeSettings===afterSettings){delete state.processedSnapshots[n];processedSnapshot(n);}if(active&&hasRecorded&&beforeSettings!==afterSettings){")},
 {id:'F21-ONRAMP-FAILED-HANDOFF-GUARD-REMOVED',why:'failed manual Bodybuilding validation still hands off an active On-Ramp',targets:['F21-ONRAMP-FAILED-HANDOFF-VALIDATION-NONDESTRUCTIVE'],
  apply:inRegion('const bvomBbDev36CommitBase=bvomBbCommitSetup;',"if(exiting&&window.__bvomBbSetupDraft===null&&state.bodybuilding)","if(exiting&&state.bodybuilding)")},
 {id:'F22-OPTIONAL-SINGLE-PROCESSED-GUARD-REMOVED',why:'skipping the optional Deadlift single advances without snapshotting/marking the completed lift as processed',targets:['F22-OPTIONAL-DEADLIFT-SKIP-CORRECTION-ATOMIC'],
  apply:inRegion('function skipOptionalSingle(n)',"state.processed=state.processed||{};if(!state.processed[n]){processedSnapshot(n);state.processed[n]=true;}",'')},
 {id:'F20-STARTING-SETUP-GUARD-REMOVED',why:'Run Starting Setup Again is allowed to enter setup during an active workout and can erase the live session',targets:['F20-STARTING-SETUP-ACTIVE-WORKOUT-GUARD'],
  apply:src=>{const g="if(bvomStateWorkoutActive(state)){bvomBeeModal(hlmTxt('FINISH WORKOUT FIRST','先にワークアウトを終了してください'),hlmTxt('Finish or exit the current workout before running Starting Setup again.','Starting Setupを再実行する前に、現在のワークアウトを終了または中止してください。'));return}";const f='function bvomStartingSetupModal(){if(!bvomWorkoutActionAllowed())return;'+g,i=src.lastIndexOf(f);if(i<0)return null;const j=i+'function bvomStartingSetupModal(){if(!bvomWorkoutActionAllowed())return;'.length;const next=src.slice(0,j)+src.slice(j+g.length);return next.slice(0,i)+next.slice(i).replace('if(bvomStateWorkoutActive(state)||bvomStoredWorkoutActive()){bvomWorkoutReadOnlyNotice();return}', '')}},
 {id:'F20-HLM-SETUP-BYPASSES-GUARD',why:'HLM strength-block completion enters Starting Setup directly during the active workout instead of using the guarded entry',targets:['F20-STARTING-SETUP-ACTIVE-WORKOUT-GUARD'],
  apply:inRegion('function bvomPresentPendingHlmRepChoice(){',"bvomRequestDeferredSetup(p,()=>{terminal?.remove();close()});return false", "close();state.configured=false;save();showSetup();return true")},
 {id:'F26-ACCESSORY-CORRECTION-ROLLBACK-REMOVED',why:'editing an already-processed accessory skips restoring its pre-result snapshot, leaving stale progression in place',targets:['F26-ACCESSORY-CORRECTION-RECOMPUTES-PROGRESSION'],
  apply:inRegion('function tapAccessory(id,i){',"if(existing&&wasProcessed)restoreProcessedSnapshot(key);","if(existing&&wasProcessed){}")},
 {id:'F27-ACCESSORY-LIVE-REMOVE-GUARD-REMOVED',why:'recorded accessory work can be deleted with its template before Finish/History',targets:['F27-RECORDED-OPTIONAL-WORK-REMOVAL-PRESERVES-LIVE-DATA'],
  apply:inRegion("function removeAccessory(id){if(!bvomWorkoutActionAllowed())return;\n const a=(state.accessoryList||[]).find(x=>x.id===id);if(!a)return;","if(live){bvomBeeModal(","if(false){bvomBeeModal(")},
 {id:'F27-GPP-LIVE-REMOVE-GUARD-REMOVED',why:'recorded GPP work can be deleted with its template before Finish/History',targets:['F27-RECORDED-OPTIONAL-WORK-REMOVAL-PRESERVES-LIVE-DATA'],
  apply:inRegion('function removeGpp(id){if(!bvomWorkoutActionAllowed())return;const g=state.gppList.find(x=>x.id===id);if(!g)return;',"if(live){bvomBeeModal(","if(false){bvomBeeModal(")},
 {id:'F28-CORE-POSTRESULT-CONFIG-ROLLBACK-GUARD-REMOVED',why:'an increment-only settings edit after earned progression replaces the pre-result snapshot and lets correction price the same performance again',targets:['F28-CORE-POSTRESULT-INCREMENT-EDIT-PRESERVES-EARNED-PROGRESSION'],
  apply:inRegion('function saveLiftSettings(n){if(!bvomWorkoutActionAllowed())return;\n ensurePlateModes();',"const snap=state.processedSnapshots[n]||(state.processedSnapshots[n]=preEditSnap||bvomMakeProcessedSnapshot(n))","const snap=(state.processedSnapshots[n]=bvomMakeProcessedSnapshot(n))")},
 {id:'F29-ACCESSORY-POSTRESULT-INCREMENT-ROLLBACK-REMOVED',why:'accessory correction restores the old load but leaves the newly edited increment in place, repricing the already-earned result',targets:['F29-ACCESSORY-POSTRESULT-INCREMENT-EDIT-PRESERVES-EARNED-PROGRESSION'],
  apply:inRegion("if(String(n).startsWith('ACC:')&&snap.kind==='accessory'){","if(snap.increment!=null)a.increment=Number(snap.increment);","")},
 {id:'F30-INTERMEDIATE-NEXTHEAVY-PRESERVE-GUARD-REMOVED',why:'an increment-only HLM/4-Day settings save clears an already-earned nextHeavy even though the driver itself is unchanged',targets:['F30-INTERMEDIATE-INCREMENT-EDIT-PRESERVES-EARNED-NEXTHEAVY'],
  apply:inRegion('function saveLiftSettings(n){if(!bvomWorkoutActionAllowed())return;\n ensurePlateModes();',"if(Number(w)!==oldDriver)state.hlm.nextHeavy[n]=null;","state.hlm.nextHeavy[n]=null;")},
 {id:'F31-ONRAMP-CONFIRMATION-PROVENANCE-GUARD-REMOVED',why:'correction of the exact exposure that established On-Ramp confirmation is treated like an ordinary confirmed-set edit, leaving stale calibration in place',targets:['F31-ONRAMP-CORRECTION-REVOKES-SUPERSEDED-CONFIRMATION'],
  apply:inRegion('function bvomBbOnRampSetModal(',"if(i===0&&(e.state!=='CONFIRMED'||wasConfirming)){","if(i===0&&e.state!=='CONFIRMED'){")},
 {id:'F32-ONRAMP-FAILED-VALIDATION-LIVE-MUTATION-RESTORED',why:'a rejected numeric On-Ramp entry mutates the live exercise load before increment validation succeeds, allowing rejected input to leak into a later save',targets:['F32-ONRAMP-FAILED-SET-VALIDATION-ATOMIC'],
  apply:inRegion('function bvomBbOnRampSetModal(',"rec.load=load;const inc=Number(o.querySelector('[data-inc]')?.value);if(!(inc>0)){bvomBbInputNotice(o,'Enter the smallest practical increase for this equipment.','[data-inc]');return}e.load=load;e.increment=inc","rec.load=load;e.load=load;const inc=Number(o.querySelector('[data-inc]')?.value);if(!(inc>0)){bvomBbInputNotice(o,'Enter the smallest practical increase for this equipment.','[data-inc]');return}e.increment=inc")},
 {id:'F33-LOAD-ROUNDTRIP-ORIGIN-RESTORE-REMOVED',why:'unchanged converted loads no longer restore their exact original physical value on the reverse unit change',targets:['F33-NO-TRAINING-UNIT-ROUNDTRIP-PRESERVES-LEGITIMATE-ARBITRARY-STATE'],
  apply:inRegion('function bvomConvertLoadRoundTripField(',"if(m&&m.unit===to","if(false&&m&&m.unit===to")},
 {id:'F33-ARBITRARY-INCREMENT-ORIGIN-RESTORE-RESTRICTED',why:'round-trip metadata only restores increments on the predefined policy grid, so legitimate arbitrary equipment increments drift',targets:['F33-NO-TRAINING-UNIT-ROUNDTRIP-PRESERVES-LEGITIMATE-ARBITRARY-STATE'],
  apply:inRegion('function bvomConvertIncrementRoundTrip(',"&&Number.isFinite(Number(m.value))&&Number(m.value)>0)","&&bvomIncrementOptions(to).includes(Number(m.value)))")},
 {id:'F34-ACTIVE-CORE-LIVE-LOCK-REMOVED',why:'Advanced Settings are allowed to replace the live prescription after core work has already been recorded',targets:['F34-ACTIVE-CORE-PRESCRIPTION-IMMUTABLE-AFTER-SETTINGS-EDIT'],
  apply:inRegion('function bvomCoreLiveLock(n){',"return snap?.livePrescriptionLock&&bvomCoreSessionHasActivity(n)?snap:null","return null")},
 {id:'F35-POSTCOMPLETE-SNAPSHOT-REPLACED',why:'a completed lift settings edit replaces the original pre-result rollback snapshot with the edited future state',targets:['F35-POSTCOMPLETE-SETTINGS-WEIGHT-EDIT-CORRECTION-SAFE'],
  apply:inRegion('function saveLiftSettings(n){if(!bvomWorkoutActionAllowed())return;\n ensurePlateModes();',"const snap=state.processedSnapshots[n]||(state.processedSnapshots[n]=preEditSnap||bvomMakeProcessedSnapshot(n))","const snap=false||(state.processedSnapshots[n]=preEditSnap||bvomMakeProcessedSnapshot(n))")},
 {id:'F36-F37-HLM-ACTIVE-SETTINGS-SNAPSHOT-REMOVED',why:'HLM/4-Day settings changes immediately rewrite the current live workout instead of being staged for the next applicable workout',targets:['F36-OPTIONAL-SINGLES-SETTING-DOES-NOT-REWRITE-LIVE-DEADLIFT-EXPOSURE','F37-HLM-NEXT-WORKOUT-SETTINGS-DO-NOT-ALTER-PARTIAL-CURRENT-PRESCRIPTION'],
  apply:inRegion('function saveHlmSettings(){',"if(bvomStateWorkoutActive(state))bvomCaptureHlmSettingsForActiveWorkout();","if(bvomStateWorkoutActive(state)){}")},
 {id:'F38-CORE-EARNED-WEIGHT-ROLLBACK-REMOVED',why:'post-result correction leaves an already-earned LP load in place instead of revoking it before recalculation',targets:['F38-CORE-CORRECTION-RECOMPUTES-EARNED-STATE-THEN-MERGES-FUTURE-SETTINGS'],
  apply:inRegion('function bvomRollbackLockedEarnedStateForCorrection(',"if(snap.postEditWeight==null)state.weights[n]=Number(snap.weight);","if(snap.postEditWeight==null){}")},
 {id:'F38-INTERMEDIATE-EARNED-NEXTHEAVY-ROLLBACK-REMOVED',why:'post-result HLM/4-Day correction retains stale earned nextHeavy after the underlying successful result is corrected to a failure',targets:['F38-CORE-CORRECTION-RECOMPUTES-EARNED-STATE-THEN-MERGES-FUTURE-SETTINGS'],
  apply:inRegion('function bvomRollbackLockedEarnedStateForCorrection(',"if(snap.postEditWeight==null)state.hlm.nextHeavy[n]=snap.hlm.nextHeavy?.[n]==null?null:Number(snap.hlm.nextHeavy[n]);","if(snap.postEditWeight==null){}")},
 {id:'F39-ACCESSORY-FUTURE-WEIGHT-METADATA-REMOVED',why:'a persisted post-result accessory weight edit is not recorded as an explicit future override, so later correction overwrites it',targets:['F39-ACCESSORY-CORRECTION-PRESERVES-EXPLICIT-FUTURE-TEMPLATE-OVERRIDE'],
  apply:inRegion('function openAccessoryBuilder(editId=null){if(!bvomWorkoutActionAllowed())return;ensureAccessories();',"if(Number(values.weight)!==oldWeight)snap.postEditWeight=Number(values.weight);","if(Number(values.weight)!==oldWeight){}")},
 {id:'F39-ACCESSORY-FUTURE-WEIGHT-MERGE-REMOVED',why:'accessory correction recomputes the old result but fails to merge the explicit future weight override afterward',targets:['F39-ACCESSORY-CORRECTION-PRESERVES-EXPLICIT-FUTURE-TEMPLATE-OVERRIDE'],
  apply:inRegion('const applyPostEditAccessoryOverrides=',"if(postEditWeight!=null)a.weight=Number(postEditWeight);","if(postEditWeight!=null){}")},
 {id:'F39-ACCESSORY-PENDING-OVERRIDE-FINISH-MERGE-REMOVED',why:'resolving a workout while an accessory correction is still incomplete clears the rollback snapshot before its explicit future override is merged',targets:['F39-ACCESSORY-CORRECTION-PRESERVES-EXPLICIT-FUTURE-TEMPLATE-OVERRIDE'],
  apply:src=>{const a=src.indexOf('function finishWorkout(){');if(a<0)return null;const b=src.indexOf('function renderWorkout(){',a);if(b<0)return null;const mid=src.slice(a,b),next=mid.replace(/bvomApplyPendingAccessoryFutureOverrides\(\);/g,'');if(next===mid)return null;return src.slice(0,a)+next+src.slice(b)}},
 {id:'F40-HLM-CROSS-LIFT-ROLLBACK-SCOPE-REMOVED',why:'correcting one HLM Heavy lift restores whole-program HLM maps and erases another processed lift\'s independently earned nextHeavy',targets:['F40-HLM-CROSS-LIFT-CORRECTION-ISOLATION'],
  apply:inRegion('function processedSnapshot(n){state.processedSnapshots=state.processedSnapshots||{};if(state.processedSnapshots[n])return;',"if(snap.hlm&&state.hlm){for(const k of ['driver','nextHeavy','rep','failCount']){const src=snap.hlm[k];if(src&&Object.prototype.hasOwnProperty.call(src,n)){state.hlm[k]=state.hlm[k]||{};state.hlm[k][n]=JSON.parse(JSON.stringify(src[n]));}}}","if(snap.hlm&&state.hlm){state.hlm.driver=JSON.parse(JSON.stringify(snap.hlm.driver));state.hlm.nextHeavy=JSON.parse(JSON.stringify(snap.hlm.nextHeavy));state.hlm.rep=JSON.parse(JSON.stringify(snap.hlm.rep));state.hlm.failCount=JSON.parse(JSON.stringify(snap.hlm.failCount));}")},
 {id:'F41-BB-ACTUAL-ROUNDTRIP-FINAL-REROUND-RESTORED',why:'the final Bodybuilding active-session conversion layer re-rounds an exact reverse-roundtrip restoration back onto the equipment grid, mutating an already-recorded actual load',targets:['F41-BB-ACTUAL-LOAD-ROUNDTRIP-EXACT'],
  apply:inRegion('const bvomBbDev36ChangeUnitsBase=changeUnits;',"if(x.roundTrip)continue;","if(x.roundTrip){}")},
 {id:'F42-HLM-PENDING-THIRD-FAILURE-STATE-REMOVED',why:'the HLM third-failure threshold resets before the user chooses, leaving no persisted decision to recover after reload',targets:['F42-HLM-THIRD-FAILURE-DECISION-PERSISTS'],
  apply:inRegion('function offerHlmRepChoice(n){',"if(bvomPersistPendingChoice('hlm',{lift:n,current,next})){bvomPresentPendingHlmRepChoice();return true}return false","state.hlm.failCount[n]=0;bvomPresentPendingHlmRepChoice()")},
 {id:'F42-HLM-PENDING-DECISION-RENDER-RESUME-REMOVED',why:'the persisted HLM third-failure decision is not re-presented after reload, leaving a processed lift with an unresolved progression choice hidden',targets:['F42-HLM-THIRD-FAILURE-DECISION-PERSISTS'],
  apply:inRegion('function renderAll(){bvomApplyShell();',"bvomPresentPendingHlmRepChoice();","")},
 {id:'F43-LP-PENDING-CLOSE-MISS-STATE-REMOVED',why:'the LP/RPT close-miss choice is shown transiently but no persisted decision exists to recover after reload',targets:['F43-LP-CLOSE-MISS-DECISION-PERSISTS'],
  apply:inRegion('function offerCloseMissChoice(n,baseWeight,increment){',"if(bvomPersistPendingChoice('lp',{lift:n,nextWeight:bvomRoundForSession(n,Number(baseWeight)+Number(increment))})){bvomPresentPendingCloseMissChoice();return true}return false","save();bvomPresentPendingCloseMissChoice()")},
 {id:'F43-LP-PENDING-CLOSE-MISS-RENDER-RESUME-REMOVED',why:'the persisted LP/RPT close-miss choice is not re-presented after reload, silently leaving neither REPEAT nor PROGRESS ANYWAY committed',targets:['F43-LP-CLOSE-MISS-DECISION-PERSISTS'],
  apply:inRegion('function renderAll(){bvomApplyShell();',"bvomPresentPendingCloseMissChoice();","")},
];
function run(buildDir,ids){const r=spawnSync(process.execPath,[guard,buildDir,'--json',...(ids?['--only='+ids.join(',')]:[])],{encoding:'utf8',maxBuffer:1<<26});
  if(r.error)return {error:r.error.message};
  try{return JSON.parse(r.stdout)}catch(e){return {error:(r.stderr||r.stdout||'behaviour process produced no JSON').slice(0,400)}}}
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
    // Issue #55 Stage A is a forward-only, unwired warm-up feature absent from v2.8.0.
    // Candidate still MUST pass each test; historical reference can only be N/A.
    'BB-STAGE-A-CATALOGUE','BB-STAGE-A-CORE-UNCHANGED','BB-STAGE-A-FREEBAR',
    'BB-STAGE-A-MACHINE','BB-STAGE-A-LIGHT-ROWS-HINGES','BB-STAGE-A-DB-ONRAMP-ACCESSORY','BB-STAGE-A-IMPERIAL',
    'BB-STAGE-A-BEGINNER-MACHINES','BB-STAGE-A-NO-ROW-RDL-CLIFF','BB-STAGE-A-CUSTOM-BAR',
    // Stage B post-v2.9.12 feature contracts do not exist on historical v2.8.0.
    'BB-STAGE-B-RENDER','BB-STAGE-B-TAP-ATOMIC','BB-STAGE-B-UNDO-AND-LAST',
    'BB-STAGE-B-RELOAD-FINGERPRINT','BB-STAGE-B-FAILED-SAVE','BB-STAGE-B-SECONDARY',
    'BB-STAGE-B-ONRAMP-GUIDANCE','BB-STAGE-B-ORDER-COMPAT',
    'BB-STAGE-B-RECOVERY-CLOCK','BB-STAGE-B-RECOVERY-FAILED-SAVE',
    'BB-M022-ONRAMP-HANDOFF-PRESERVES-SETS','BB-M022-ONRAMP-EMPTY-HANDOFF','BB-M022-BODYWEIGHT-HOLD',
    'BB-M022-BODYWEIGHT-ACCEPT','BB-M022-BODYWEIGHT-EASIER','BB-M022-BODYWEIGHT-FAIL-SAVE',
    'BB-M022-ONRAMP-ACCESSORY-ONLY','BB-M022-ONRAMP-GPP-ONLY','BB-M022-ONRAMP-OPTIONAL-ATOMIC-EMPTY',
    'BB-M023-GPP-ONRAMP-VISIBLE','BB-M023-GPP-BLOCK-VISIBLE',
    'BB-M023-GPP-ONRAMP-DAY-FILTER','BB-M023-GPP-BLOCK-DAY-FILTER','BB-M023-GPP-ONRAMP-EDITOR','BB-M023-GPP-BLOCK-EDITOR',
    'BB-M023-GPP-ONRAMP-NEW-ASSIGNMENT','BB-M023-GPP-BLOCK-NEW-ASSIGNMENT',
    'BB-M023-GPP-ONRAMP-POSTCOMMIT-CREATE','BB-M023-GPP-ONRAMP-POSTCOMMIT-EDIT',
    'BB-M023-GPP-BLOCK-POSTCOMMIT-CREATE','BB-M023-GPP-BLOCK-POSTCOMMIT-EDIT',
    'BB-M023-GPP-ONRAMP-REJECT-ATOMIC','BB-M023-GPP-BLOCK-REJECT-ATOMIC',
    'BB-M024-BW-INLINE-ERROR-ONRAMP','BB-M024-BW-INLINE-ERROR-BLOCK',
    'BB-M025-ESTIMATED-WEIGHT-HELP-EN','BB-M025-ESTIMATED-WEIGHT-HELP-JA',
    'BB-M026-DEFAULT-A-ONRAMP','BB-M026-DEFAULT-A-BLOCK',
    // Stage 1 forward-feature contracts: RED on exact v2.9.7 dbaad6ef.
    'BW-REFINE-VOLUME','BW-REFINE-HISTORY','BW-REFINE-INCREMENT','BW-REFINE-INCOMPLETE-GPP',
    'BW-STAGE1-RECORD','BW-STAGE1-HISTORY','BW-STAGE1-UNITS','BW-STAGE1-BUILDER','BW-STAGE1-BB','BW-STAGE1-ATOMIC','BW-STAGE1-CORRECTION-CLOUD','BW-STAGE1-OWNER','BW-STAGE1-ONRAMP',
    // Monkey 020 fix contracts are RED against exact v2.9.12 e81f864, not applicable to historical v2.8.0.
    'BW-EXTRA-M020-HOLE-REUSE','BW-EXTRA-M020-CHURN-FIVE-MODES','BW-EXTRA-M020-SPARSE-CAP','BW-EXTRA-M020-FULL-CAP',
    // Issue #52 forward-feature contracts are RED/not implemented on v2.9.11, not applicable to historical v2.8.0.
    'BW-EXTRA-MODES','BW-EXTRA-MULTIPLE','BW-EXTRA-CANCEL-CORRECT-REMOVE','BW-EXTRA-DURABLE-REJECT','BW-EXTRA-REMOVE-REJECT','BW-EXTRA-STALE-OWNER','BW-EXTRA-RELOAD','BW-EXTRA-HISTORY','BW-EXTRA-PROGRESSION-ISOLATED','BW-EXTRA-PLANNED-INCOMPLETE','BW-EXTRA-FINISH-CHOICE',
    // Monkey 019 is RED on current v2.9.10 main and cannot apply to historical v2.8.0.
    'BB-M019-REJECT-NORMAL','BB-M019-REJECT-ONRAMP','BB-M019-REJECT-SIXTH','BB-M019-REJECT-DIRECT-HANDOFF','BB-M019-SIXTH-HANDOFF-SUCCESS','BB-M019-POSTCOMMIT-OWNER-FAIL',
    // Stage 2A RED on exact v2.9.8 Stage 1 head a44991f; no Bodyweight in historical v2.8.0.
    'BW-STAGE2-OPT-IN-UI','BW-STAGE2-EARNED-ACCEPT','BW-STAGE2-EARNED-HOLD','BW-STAGE2-HARD-HOLD','BW-STAGE2-SEVEN-HOLD','BW-STAGE2-BELOW-RANGE','BW-STAGE2-INCOMPLETE-CORE-ACCEPT','BW-STAGE2-INCOMPLETE-CORE-HOLD','BW-STAGE2-INCOMPLETE-CORE-BACK','BW-STAGE2-INCOMPLETE-ACCESSORY-HOLD','BW-STAGE2-DEFAULT-OFF','BW-STAGE2-CUSTOM-NEVER-AUTO',
    'BW-STAGE2-DURABLE-ROLLBACK','BW-STAGE2-STRUCTURED-MODES','BW-STAGE2-PARTIAL-ACCESSORY',
    'F23-NOOP-POSTCOMPLETE-SETTINGS-PRESERVE-ROLLBACK',
    'F25-ONRAMP-UNIT-ROUNDTRIP-HANDOFF-REVERSIBLE',
    // Forward feature contract added after v2.8.0; the old reference is not expected to implement it.
    'EXPORT-HISTORY-METADATA',
    'EXPORT-V1-TRANSLATOR',
    'STRAVA-ADAPTER-V1',
    'STRAVA-OAUTH-CLIENT-V1',
    // Monkey 007 red proof is pinned v2.9.0; v2.8.0 lacks this ownership contract.
    'F50-SECONDARY-PENDING-ANSWER-ATOMIC','F51-SECONDARY-WARMUP-NO-LEAK','F52-SECONDARY-STALE-CLAIM-ORDER','F53-PENDING-SAVE-FAILURE-KEEPS-DECISION','F54-SHARED-PROGRAM-ACTION-GUARDS','F55-HLM-FOURDAY-SECONDARY-DECISIONS','F56-CRITICAL-COMMIT-RECHECKS-OWNERSHIP','F57-OPEN-DIALOG-PERMISSION-RECHECK',
    // Monkey 009 proof is exact pre-009 PR e6631e4, not historical v2.8.0.
    'F58-DELAYED-BACKUP-COMMIT','F59-DEFERRED-MUTATION-COMMIT','F60-POSTCOMMIT-OWNER-FAILURE','F61-PENDING-CREATION-DURABILITY','F62-DELAYED-CLOUD-AND-SETUP','F63-STORAGE-ORDER-AND-NESTED-CHOICE','F64-ASSIGNED-TIMER-SOUND-GUARD',
    // Monkey 011 red proof is exact pre-011 f75202f, not historical v2.8.0.
    'F65-ERASE-STALE-AWAIT','F66-ERASE-CANCEL-AWAIT','F67-HISTORY-EXACT-TARGET','F68-ERASE-LEGITIMATE-CONTROLS','F69-ERASE-NATIVE-AUTH-CALLBACK',
    // New recovery contracts are RED on pre-recovery PR 42710195, not v2.8.0.
    'F70-MEANINGFUL-ACTIVITY-CLOCK','F71-INCOMPLETE-EXPIRY-PROGRAMS','F72-EXPIRY-PENDING-GPP-HOLD','F73-LOCK-AND-ACCOUNT-FENCING','F74-EXPIRY-SAVE-FAILURE-ROLLBACK','F75-LEGACY-AND-CLOCK-GRACE','F76-UNCOORDINATED-LEGACY-FAIL-CLOSED',
    // Monkey 018 red provenance is exact v2.9.1 a134ef5, not v2.8.0.
    'F77-DEFERRED-SETUP-GENUINE-TERMINAL','F78-DEFERRED-CLOUD-BOUNDARY','F79-DEFERRED-FINISH-AND-DRAFT','F80-DEFERRED-SAVE-FAILURES','F81-DEFERRED-DRAFT-OPTIONS-AND-AWAIT','F82-DEFERRED-CORRECTION-AND-COLLISION','F83-DEFERRED-OWNERSHIP-FENCES','F84-DEFERRED-INGRESS-AND-RECONCILIATION','F85-DEFERRED-EN-JA-AND-INCOMPLETE'
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
