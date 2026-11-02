'use strict';
// Real DOM journey. Only identity/bootstrap fixtures and the rest-clock offset
// are injected. Programme choices, inputs, sets, decisions, Finish and restore
// use shipped controls. Read-only prescriptions/projections provide assertions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const profiles=[
 {name:'Male',seed:730901,bodyweight:90,weights:{Squat:140,'Bench Press':100,'Prone Row':85,'Overhead Press':60,Deadlift:180,'Supine Row':70},increment:2.5,small:1.5,bbLoad:70},
 {name:'Female',seed:730902,bodyweight:65,weights:{Squat:60,'Bench Press':35,'Prone Row':32.5,'Overhead Press':22.5,Deadlift:80,'Supine Row':27.5},increment:1.25,small:.5,bbLoad:25}
];
const clone=x=>JSON.parse(JSON.stringify(x));
function knownLoad(profile,id){
 const f=profile.name==='Female',db=/dumbbell/.test(id);
 if(/lateral|pec_deck|reverse_fly|rear_delt/.test(id))return f?4:8;
 if(/calf/.test(id))return f?30:80;
 if(/deadlift|romanian/.test(id))return f?55:120;
 if(/bulgarian|split_squat/.test(id))return f?10:20;
 if(db&&/curl/.test(id))return f?7.5:12.5;
 if(/squat|leg_press/.test(id))return f?55:125;
 if(/bench|chest_press|flat_press|incline_press/.test(id))return db?(f?15:32.5):(f?35:90);
 if(/overhead|shoulder_press/.test(id))return db?(f?10:22.5):(f?22.5:55);
 if(/row/.test(id))return db?(f?12.5:30):(f?30:75);
 if(/leg_curl|leg_extension/.test(id))return f?20:45;
 if(/curl|pushdown|extension/.test(id))return f?10:25;
 if(/abdominal|crunch/.test(id))return f?5:15;
 return f?20:50;
}
async function stored(p){return p.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')))}
async function tab(p,name){await p.locator('.tab[data-tab="'+name+'"]').click()}
async function runJourney({page:p,profile,checkpoint,reconnect,offlineBB2,handleConflict,output,smoke=false,uiOnly=false}){
 let lastFinishedSets=0,allowSeal=false,accessoryId;let seed=profile.seed;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const report={profile:profile.name,bodyweight:profile.bodyweight,seed:profile.seed,mode:uiOnly?'UI-ONLY':smoke?'SMOKE':'FULL',verdict:'RUNNING',counts:{},sets:0,setsByProgramme:{},progression:{increases:0,reductions:0,holds:0,missedRepSets:0,failedAttempts:0},skippedOptionalSets:0,transitions:[],checks:[],workouts:[],actions:[],defects:[]};
 const file=path.join(output,profile.name.toLowerCase()+'.json');
 const write=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
 const action=label=>{report.actions.push(label);write()};
 const pass=label=>{report.checks.push(label);console.log('PASS MONKEY '+profile.name+': '+label);write()};
 const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',async d=>{if(allowSeal&&d.type()==='confirm'){action('Explicitly confirm sealing the completed BB2 block');await d.accept();return}errors.push('Unexpected '+d.type()+': '+d.message());await d.dismiss()});
 const healthy=()=>assert.deepEqual(errors,[],'no uncaught errors or unexpected native dialogs');
 async function rest(seconds=90){
  assert.ok((await stored(p)).timerStart,'recording must start the shared rest timer');
  report.restSecondsSimulated=(report.restSecondsSimulated||0)+seconds;
  await p.evaluate(seconds=>{window.__monkeyRestMs=(window.__monkeyRestMs||0)+seconds*1000;sessionStorage.setItem('monkey-rest-ms',String(window.__monkeyRestMs))},seconds);
  if(report.sets===1)await p.waitForFunction(seconds=>{const text=document.querySelector('#clock').textContent.split(':').map(Number),elapsed=text[0]*60+text[1];return elapsed>=seconds&&elapsed<=seconds+3},seconds);
 }
 // Accelerate rest elapsed time only. Calendar timestamps remain real; no
 // programme counters, weights or decisions are injected or fast-forwarded.
 const installClock=()=>{
  const RealDate=Date;window.__monkeyRestMs=Number(sessionStorage.getItem('monkey-rest-ms'))||0;
  class RestDate extends RealDate{constructor(...args){super(...(args.length?args:[RealDate.now()+(window.__monkeyRestMs||0)]))}static now(){return RealDate.now()+(window.__monkeyRestMs||0)}}
  window.Date=RestDate;
 };
 await p.context().addInitScript(installClock);await p.evaluate(installClock);
 async function decisions(){
  for(let n=0;n<12;n++){
   const modal=p.locator('.bvomModalOverlay').last();if(!await modal.count())return;
   if(await modal.locator('[data-note],[data-reps],[data-v]').count())return;
   const title=(await modal.textContent()).trim();action('Decision: '+title.slice(0,180));
   if(await modal.locator('[data-ok]').count()){await modal.locator('[data-ok]').click();continue}
   if(await modal.locator('[data-accept]').count()){
    const number=modal.locator('[data-number]');if(await number.isVisible())await number.fill('1');
    await modal.locator('[data-accept]').click();continue;
   }
   if(await modal.locator('[data-settings]').count()&&handleConflict){await handleConflict(p,report);continue;}
   // Explicitly retain the existing plan for optional near-miss/rep choices.
   if(await modal.locator('[data-l]').count()){await modal.locator('[data-l]').click();continue}
   if(await modal.locator('[data-cancel]').count()){await modal.locator('[data-cancel]').click();continue}
   throw Error('Unrecognised decision UI: '+title.slice(0,400));
  }throw Error('Decision UI did not settle');
 }
 async function finish(stage,n,{incomplete=false,onramp=false}={}){
  const before=await stored(p),old=before.history.length,events=before.bb2?.events?.filter(e=>e.type==='WORKOUT_FINISHED'||e.type==='WORKOUT_INCOMPLETE').length||0;
  action(stage+' '+n+' fixed FINISH');await tab(p,'workout');await p.locator('#timerbar .finish:not([disabled])').click();
  if(incomplete){const q=p.locator('.bvomModalOverlay').last();await q.locator('[data-finish],[data-r],[data-accept]').click()}
  const note=profile.name+' '+stage+' '+n+' seed '+profile.seed;
  if(!onramp){await p.locator('.bvomModalOverlay [data-note]').fill(note);await p.evaluate(()=>document.querySelector('#timerbar .finish').click());assert.equal(await p.locator('.bvomModalOverlay [data-note]').count(),1);await p.locator('.bvomModalOverlay [data-save]').click();}
  if(stage.startsWith('BB2')){
   const work=before.bb2.events.filter(e=>e.sessionId===before.bb2.activeSessionId&&['SET_RECORDED','EXTRA_SET_RECORDED'].includes(e.type)),known=work.every(e=>Number.isSafeInteger(e.actualG)&&!e.variation);
   const text=await p.locator('.bvomModalOverlay .savedStats .num').nth(1).textContent();
   if(known){assert.ok(!text.includes('~'),'BB2 must not inherit a previous programme approximation flag');assert.ok(Math.abs(Number(text.split(' ')[0])-work.reduce((n,e)=>n+e.actualG/1000*e.reps,0))<.011,'shared saved volume matches actual BB2 working sets');}
   else assert.ok(text.includes('—'),'unestimated bodyweight volume is not shown as zero');
  }
  await decisions();await p.waitForTimeout(600);await decisions();
  const after=await stored(p);
  if(stage.startsWith('BB2')){
   const ended=after.bb2.events.filter(e=>e.type==='WORKOUT_FINISHED'||e.type==='WORKOUT_INCOMPLETE');assert.equal(ended.length,events+1);
   assert.equal(after.history.length,old,'BB2 must not create a second legacy journal');
   const projection=await p.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events));assert.equal(projection.history.at(-1).note,note);
  }else{assert.equal(after.history.length,old+1);if(!onramp)assert.equal(after.history.at(-1).note,note);assert.equal(!!after.history.at(-1).incomplete,incomplete);}
  const snapshot=JSON.stringify(after.history),bb=JSON.stringify(after.bb2?.events);
  await p.evaluate(()=>document.querySelector('#timerbar .finish').click());assert.equal(JSON.stringify((await stored(p)).history),snapshot);assert.equal(JSON.stringify((await stored(p)).bb2?.events),bb);
  await tab(p,'history');if(!onramp)assert.ok((await p.locator('#history').textContent()).includes(note),'normal History shows the note');
  assert.equal(after.history.slice(0,old).length,before.history.length);assert.deepEqual(after.history.slice(0,old),before.history,'previous History immutable');
  const workingSets=report.sets-lastFinishedSets;lastFinishedSets=report.sets;report.setsByProgramme[stage]=(report.setsByProgramme[stage]||0)+workingSets;report.counts[stage]=(report.counts[stage]||0)+1;report.workouts.push({stage,n,sets:workingSets,history:after.history.length,note:onramp?null:note,day:before.day});
  healthy();console.log('MONKEY '+profile.name+' '+stage+' '+n+' saved; total sets '+report.sets);write();
 }
 async function warm(stage){
  await tab(p,'warmup');let buttons;
  if(stage==='BB2')buttons=p.locator('#warmup [data-bb2-warm-card="0"] button.set');
  else buttons=p.locator('#warmup > .exercise').first().locator('button.set');
  const count=await buttons.count();if(!count){pass(stage+' has no numeric warm-up for this prescription');await tab(p,'workout');return}
  await buttons.first().click();await rest();if(count>1)await buttons.nth(count-1).click();
  assert.equal(await p.locator('#workout').evaluate(e=>e.classList.contains('hidden')),false,'last warm-up opens Workout');
  assert.equal(await p.locator('#timerbar .cancel').isVisible(),true);await p.locator('#timerbar .cancel').click();assert.equal((await stored(p)).timerStart,null);
  pass(stage+' warm-up rest, navigation and timer Cancel');
 }
 async function repModal(reps){const m=p.locator('.bvomModalOverlay').last();let v=Number(await m.locator('[data-v]').textContent());while(v>reps){await m.locator('[data-m]').click();v--}while(v<reps){await m.locator('[data-p]').click();v++}await m.locator('[data-ok]').click();}
 async function coreSet(name,i,reps){await tab(p,'workout');await p.locator('#workout button[onclick="tapSet(\''+name+'\','+i+')"]').click();await repModal(reps);assert.equal((await stored(p)).session[name]?.[i]?.reps,reps,'actual core set is durably recorded');report.sets++;await rest((await stored(p)).session[name][i].load>=100?180:120);await decisions();}
 async function legacyWorkout(stage,n,{incomplete=false}={}){
  action(stage+' '+n+' begin');await decisions();await tab(p,'workout');
  const before=await stored(p);if(n===1||n%4===0)await warm(stage);
  if(stage==='LP/RPT'&&n===6){await tab(p,'workout');await p.locator('#work-Squat .weight').click();await p.locator('.bvomModalOverlay [data-w]').fill(String(before.weights.Squat*.9));await p.locator('.bvomModalOverlay [data-s]').click();action('Manual 10% Squat deload after repeated failed targets');}

  const names=await p.evaluate(()=>program().map(x=>x[0]));
  for(const name of names){
   await tab(p,'workout');const skip=p.locator('#workout button[onclick="skipOptionalSingle(\''+name+'\')"]');
   if(n%3===0&&await skip.isVisible()){await skip.click();report.skippedOptionalSets++;}
   for(let i=0;i<12;i++){
   const plan=await p.evaluate(name=>getSetPlan(name),name);if(i>=plan.length)break;
   const fail=n>=3&&n<=5;const reps=fail?Math.max(0,plan[i].target-2):plan[i].target+(random()>.7&&plan[i].amrap?1:0);
   if(fail)report.progression.missedRepSets++;
   await coreSet(name,i,reps);if(incomplete)break;
  }if(incomplete)break;}
  if(stage==='LP/RPT'&&!incomplete){if(n%3!==0)await accessorySets(n);else{report.skippedOptionalSets+=2;action('Skip two optional bodyweight accessory sets');}}
  if(n===2){const saved=clone((await stored(p)).session);await p.reload();await p.waitForSelector('#app:not(.hidden)');await p.waitForFunction(()=>bvomWindowLockOwned===true);await reconnect(p);assert.deepEqual((await stored(p)).session,saved);pass(stage+' interrupted workout reload retains actual sets');}
  await finish(stage,n,{incomplete});const after=await stored(p);
  for(const name of names){const a=before.hlm?.driver?.[name]&&stage!=='LP/RPT'?before.hlm.driver[name]:before.weights[name],b=after.hlm?.nextHeavy?.[name]&&stage!=='LP/RPT'?after.hlm.nextHeavy[name]:after.weights[name];report.progression[b>a?'increases':b<a?'reductions':'holds']++;
   if((after.attempts?.[name]||0)>(before.attempts?.[name]||0)||(after.hlm?.failCount?.[name]||0)>(before.hlm?.failCount?.[name]||0))report.progression.failedAttempts++;
  }

  if(!incomplete&&stage!=='4-Day Split'){
   const day=stage==='HLM'?['H','L','M'][n%3]:n%2?'B':'A';await tab(p,'workout');await p.locator('#workout button[onclick="switchDay(\''+day+'\')"]').click();
  }  if(!uiOnly)await p.waitForTimeout(1500);await decisions();
 }
 async function openSetup(){await tab(p,'settings');await p.locator('#settings button[onclick="bvomStartingSetupModal()"]').click();await p.locator('.bvomModalOverlay [data-r]').click();}
 async function setup(mode,initial=false){
  const before=await stored(p);action('Choose '+mode+' through normal programme setup');
  if(!initial)await openSetup();
  await p.locator('#setup button[onclick="chooseProgramMode(\''+mode+'\')"]').click();
  if(mode!=='lprpt')await p.locator('.bvomModalOverlay [data-r]').click();
  if(initial){await p.locator('#setup button[onclick*="setupMode=\'guided\'"]').click();await p.locator('#setup button[onclick*="profileLabel=\''+profile.name+'\'"]').click();}
  const manual=p.locator('#setup button[onclick*="setupMode=\'manual\'"]');await manual.click();
  for(const input of await p.locator('#setup .startw').all()){const name=await input.getAttribute('data-name');await input.fill(String(initial?profile.weights[name]:before.weights[name]));}
  await p.locator('#setup button[onclick="completeSetup()"]').click();await p.waitForSelector('#app:not(.hidden)');await tab(p,'workout');
  const after=await stored(p);assert.deepEqual(after.history,before.history);assert.deepEqual(after.pbs,before.pbs);
  report.transitions.push({to:mode,history:after.history.length});pass('Transition to '+mode+' preserves History and PBs without phantom workouts');
 }
 async function increments(){
  await tab(p,'settings');
  for(const value of [.25,.5]){const b=p.locator('#settings button[onclick="togglePlate('+value+',\'enabledMicro\')"]');if(!await b.evaluate(e=>e.classList.contains('on')))await b.click();}
  for(const name of ['Bench Press','Overhead Press']){const id=name.replace(/\W/g,'');const details=p.locator('details').filter({has:p.locator('#inc'+id)});if(!await details.evaluate(e=>e.open))await details.locator('summary').click();await p.locator('#plateMode'+id).selectOption('micro');await p.locator('#mode'+id).selectOption('rpt');await p.locator('#inc'+id).selectOption(String(profile.small));await p.locator('button[onclick="saveLiftSettings(\''+name+'\')"]').click();await decisions();}
  pass('custom fractional increments accepted through Advanced Settings');
 }
 async function addAccessory(){
  await tab(p,'workout');await p.locator('#workout button[onclick="openAccessoryBuilder()"]').click();
  await p.locator('#accName').selectOption('Custom');await p.locator('#accCustom').fill('Monkey assisted chin-up');await p.locator('#accAssign').selectOption('Both');await p.locator('#accEquipment').selectOption('bodyweight');
  await p.locator('#accSets').fill('2');await p.locator('#accReps').fill('8');await p.locator('#accWeight').fill('0');await p.locator('#accBwInc').fill(String(profile.small));await p.locator('#accBwEstimate').fill(String(profile.bodyweight));await p.locator('#accBwResistance').fill(profile.name==='Female'?'green band':'light band');await p.locator('#accSave').click();
  accessoryId=(await stored(p)).accessoryList.find(a=>a.name==='Monkey assisted chin-up').id;pass('bodyweight and assistance configured through the normal builder');
 }
 async function accessorySets(n){
  await tab(p,'workout');for(let i=0;i<(n===1?3:2);i++){
   const selector=i===2?'#workout button[onclick="bvomBwAddExtraSet(\''+accessoryId+'\')"]':'#workout button[onclick="tapAccessory(\''+accessoryId+'\','+i+')"],#workout button[onclick="bvomBwAccessoryModal(\''+accessoryId+'\','+i+')"]';
   await p.locator(selector).click();const m=p.locator('.bvomModalOverlay').last();await m.locator('[data-load]').fill(String(n===1?0:profile.small));await m.locator('[data-reps]').fill('8');await m.locator('[data-rpe]').fill('8');await m.locator('[data-save]').click();await m.waitFor({state:'detached'});report.sets++;await rest();
   const saved=(await stored(p)).session['ACC:'+accessoryId][i];assert.equal(saved.approximateBodyweight,profile.bodyweight);assert.ok(saved.resistance.includes('band'));
  }
 }
 async function backup(label){
  action('Verify automatic cloud before backup '+label);await decisions();if(!uiOnly)await checkpoint(p,report,label);
  action('Backup/export and actual file restore '+label);await tab(p,'settings');
  const downloadEvent=p.waitForEvent('download');await p.locator('#settings button[onclick="exportBackup()"]').click();const dl=await downloadEvent;
  const bytes=fs.readFileSync(await dl.path()),data=JSON.parse(bytes);const before=await stored(p);assert.deepEqual(data.data.history,before.history);
  fs.writeFileSync(path.join(output,profile.name.toLowerCase()+'-'+label.replace(/\W/g,'_')+'-backup.json'),bytes);
  const reload=p.waitForEvent('domcontentloaded');await p.locator('#settings input[type="file"]').setInputFiles({name:'monkey-backup.json',mimeType:'application/json',buffer:bytes});await p.locator('.bvomModalOverlay [data-r]').click();await reload;await p.waitForSelector('#app:not(.hidden)');await p.waitForFunction(()=>bvomWindowLockOwned===true);await reconnect(p);
  const after=await stored(p);for(const k of ['history','weights','core','hlm','pbs','bodybuilding','accessoryList','accessoryProgress','plateMode','barByLift','enabledMicro','enabledStandard','profile','profileLabel','unit'])assert.deepEqual(after[k],before[k],'backup restores '+k);
  if(before.bb2)assert.deepEqual(after.bb2.events,before.bb2.events);pass(label+' downloaded backup and file restore retain all programme data');
  if(!uiOnly){await checkpoint(p,report,label);pass(label+' actual stored cloud and second-device data verified')}else pass(label+' UI-only debug: authenticated cloud NOT TESTED');
 }
 async function bbSetup(){
  const before=await stored(p);await openSetup();await p.locator('#setup [data-bb-program]').click();
  // Equipment selection is genuinely available to both profiles; choose a home
  // barbell map for A and mixed dumbbells/barbell for B using real selects.
  const selections=profile.name==='Male'?{A1:'barbell_bench_press',A2:'high_bar_squat',A3:'barbell_row',A4:'slider_leg_curl',A5:'dumbbell_lateral_raise',A6:'lying_barbell_triceps_extension',B1:'chin_up',B2:'romanian_deadlift',B3:'incline_barbell_press',B4:'split_squat',B5:'dumbbell_rear_delt_raise',B6:'barbell_curl'}:{A1:'dumbbell_bench_press',A2:'high_bar_squat',A3:'chest_supported_dumbbell_row',B1:'chin_up',B2:'romanian_deadlift'};
  for(const [slot,id]of Object.entries(selections)){const sel=p.locator('#setup select[onchange*="bvomBbSetupSelect(\''+slot+'\'"]');const options=await sel.locator('option').evaluateAll(es=>es.map(e=>e.value));assert.ok(options.includes(id),'approved equipment choice '+id);await sel.selectOption(id);}
  await p.locator('#setup button[onclick="bvomBbOnRampSetupMode(\'onramp\')"]').click();
  for(const input of await p.locator('#setup input[oninput*="increment"]').all())await input.fill(String(profile.increment));
  await p.locator('#setup button[onclick="bvomBbCommitSetup()"]').click();await p.waitForSelector('#app:not(.hidden)');await tab(p,'workout');
  assert.deepEqual((await stored(p)).history,before.history);report.transitions.push({to:'BB1 On-Ramp',history:before.history.length});
 }
 async function bbWorkout(n,onramp=false){
  const stage=onramp?'BB1 On-Ramp':'BB1',priorProgress=clone((await stored(p)).bodybuilding.progression);action(stage+' '+n+' begin');await decisions();await tab(p,'workout');
  for(let k=0;k<12;k++){
   const card=p.locator('#workout [data-bb-difficulty]').first();if(!await card.count())break;const id=await card.getAttribute('data-bb-difficulty');
   if(n%4===0){await card.locator('button[onclick="bvomBbDifficultyHold(\''+id+'\')"]').click();action('HOLD earned bodyweight difficulty '+id);}
   else{await card.locator('button[onclick="bvomBbDifficultyAccept(\''+id+'\')"]').click();const m=p.locator('.bvomModalOverlay').last();await m.locator('[data-difficulty-value]').fill('chosen band assistance '+n);await m.locator('[data-accept]').click();action('ACCEPT explicit bodyweight assistance change '+id);}
  }
  if(n===1&&!onramp)await warm(stage);
  const slots=await p.evaluate(onramp=>{const ss=onramp?bvomBbOnRampSlots(bvomBbOnRampDay()):bvomBbSlotsForDay(bvomBbDay());return ss.map(slot=>{const id=state.bodybuilding.selections[slot];return {slot,id,numeric:bvomBbNumericExercise(id),equipment:BVOM_BB_EXERCISES[id].equipment,sets:onramp?Array.from({length:bvomBbOnRampSetCount(id)},()=>({maxReps:bvomBbOnRampTarget(id)[1]})):bvomBbPrescription(id).sets}})},onramp);
  for(const s of slots)for(let j=0;j<s.sets.length;j++){
   await tab(p,'workout');const fn=onramp?'bvomBbOnRampSetModal':'bvomBbSetModal';await p.locator('#workout button[onclick="'+fn+'(\''+s.id+'\','+j+')"]').click();const m=p.locator('.bvomModalOverlay').last();
   if(onramp&&s.numeric){await m.locator('[data-load]').fill(String(knownLoad(profile,s.id)));await m.locator('[data-inc]').fill(String(profile.increment));}
   if(await m.locator('[data-res]').count()&&!(await m.locator('[data-res]').inputValue()).trim())await m.locator('[data-res]').fill(profile.name==='Female'?'green band assistance':'bodyweight');
   if(await m.locator('[data-bw-estimate]').count())await m.locator('[data-bw-estimate]').fill(String(profile.bodyweight));
   const target=s.sets[j].maxReps??s.sets[j].target??8,reps=onramp?target:n%6===3?Math.max(1,target-3):target;
   await m.locator('[data-reps]').fill(String(reps));await m.locator('[data-save]').click();await m.waitFor({state:'detached'});report.sets++;if(!onramp&&n%6===3)report.progression.missedRepSets++;await rest(onramp?90:s.numeric&&s.sets.length===3?120:90);
  }
  if(n===2){const live=clone((await stored(p)).session);await p.reload();await p.waitForSelector('#app:not(.hidden)');await p.waitForFunction(()=>bvomWindowLockOwned);await reconnect(p);assert.deepEqual((await stored(p)).session,live);pass(stage+' interrupted reload preserves all actual sets');}
  await finish(stage,n,{onramp});
  if(!onramp)for(const[id,now]of Object.entries((await stored(p)).bodybuilding.progression)){const old=priorProgress[id];if(old&&Number.isFinite(old.load)&&Number.isFinite(now.load))report.progression[now.load>old.load?'increases':now.load<old.load?'reductions':'holds']++;}
  if(!uiOnly)await p.waitForTimeout(1500);await decisions();
 }
 async function bb2Setup(){
  const before=await stored(p);await openSetup();await p.locator('#setup [data-bb2-preview]').click();
  for(const key of ['data-bb2-curls-a','data-bb2-curls'])await p.locator('#setup ['+key+']').check();
  if(profile.name==='Male'){await p.locator('#setup [data-bb2-role="upper_a|horizontal_row"]').selectOption('barbell_row');await p.locator('#setup [data-bb2-role="upper_a|shoulder_press"]').selectOption('overhead_press');await p.locator('#setup [data-bb2-role="upper_b|horizontal_row"]').selectOption('barbell_row');}
  if(profile.name==='Female'){const sel=p.locator('#setup [data-bb2-role="upper_a|flat_press"]');const value=await sel.locator('option').evaluateAll(es=>es.find(e=>/Dumbbell/i.test(e.textContent))?.value);assert.ok(value,'dumbbell option exists for both profiles');await sel.selectOption(value);}
  await p.locator('#setup [data-bb2-save]').click();const after=await stored(p);for(const key of ['history','weights','core','hlm','pbs','bodybuilding','accessoryList','accessoryProgress'])assert.deepEqual(after[key],before[key],'BB2 setup preserves previous '+key);
  report.transitions.push({to:'BB2',history:before.history.length});pass('BB2 transition retains BB1 and all prior journals; no calibration stage');
 }

 async function swapBB2(){
  await tab(p,'workout');await p.locator('#workout [data-bb2-next-workout]').click();
  const before=await p.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events)),old=(await stored(p)).bb2.setup.selections['upper_a|horizontal_row'];
  await p.locator('#setup [data-bb2-role="upper_a|horizontal_row"]').selectOption('dumbbell_row');await p.locator('#setup [data-bb2-save]').click();
  const after=await p.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events));assert.deepEqual(after.history,before.history);assert.equal(after.progress['upper_a|horizontal_row|'+old].loadG,before.progress['upper_a|horizontal_row|'+old].loadG);
  pass('mid-block exercise substitution preserves prior History and per-exercise working weight');
 }
 async function sealBB2(){
  await tab(p,'workout');await p.locator('#workout [data-bb2-next-workout]').click();
  for(let i=0;i<30;i++){const b=p.locator('#setup [data-bb2-choice-keep],#setup [data-bb2-choice-hold]').first();if(!await b.count())break;await b.click();}
  const before=await stored(p),old=before.bb2,history=await p.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events).history);
  await p.locator('#setup [data-bb2-next-block]').click();allowSeal=true;await p.locator('#setup [data-bb2-next-commit]').click();allowSeal=false;
  const after=await stored(p);assert.equal(after.bb2.sealedBlocks.length,(old.sealedBlocks?.length||0)+1);assert.equal(after.bb2.activeSessionId,null);assert.deepEqual(after.history,before.history);
  const folded=await p.evaluate(()=>{const b=state.bb2,last=b.sealedBlocks.at(-1);return {old:bvomBb2PreviewModule.foldBB2Block(last.opening,last.events),next:bvomBb2PreviewModule.foldBB2Block(b.opening,b.events)}});
  assert.equal(folded.old.sealed,true);assert.deepEqual(folded.old.history,history);assert.deepEqual(Object.values(folded.next.quotas),[0,0,0,0]);assert.equal(folded.next.history.length,0);
  await p.locator('#setup [data-bb2-day="upper_a"]').click();assert.equal(await p.evaluate(()=>bvomBb2Day),'upper_a');await p.locator('#setup [data-bb2-back]').click();
  report.sealedBlocks=after.bb2.sealedBlocks.length;pass('32-credit block sealed, complete History retained, next block starts at zero without phantom workouts');await backup('BB2-next-block');
 }

 async function bb2Workout(day,n,{kind='NORMAL',incomplete=false,threshold=false}={}){
  action('BB2 '+day+' '+kind+' '+n+' begin');const recoveryBefore=kind==='RECOVERY'?await p.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events).progress):null;if(!await p.locator('#setup [data-bb2-start]').isVisible()){await tab(p,'workout');await p.locator('#workout [data-bb2-next-workout]').click();}
  for(let k=0;k<20;k++){const b=p.locator('#setup [data-bb2-choice-keep],#setup [data-bb2-choice-hold]').first();if(!await b.count())break;await b.click();}
  await p.locator('#setup [data-bb2-day="'+day+'"]').click();await p.locator('#setup [data-bb2-kind="'+kind+'"]').click();
  const plan=await p.evaluate(()=>bvomBb2PreviewModule.getBB2TemplatePrescription(state.bb2.setup,bvomBb2Day).slots);
  for(const el of await p.locator('#setup [data-bb2-load]:not([disabled])').all())if(!(await el.inputValue()))await el.fill(String(knownLoad(profile,plan[Number(await el.getAttribute('data-bb2-load'))].exerciseId)));
  for(const el of await p.locator('#setup [data-bb2-inc]').all())if(!(await el.inputValue()))await el.fill(String(profile.increment));
  for(const input of await p.locator('#setup [data-bb2-assist]').all())await input.fill(kind==='RECOVERY'?'strong band recovery':profile.name==='Female'?'green band':'none');
  if(kind==='RECOVERY')for(const input of await p.locator('#setup [data-bb2-bw-variation]').all())await input.fill('easier supported recovery');
  await p.locator('#setup [data-bb2-start]').click();await p.waitForSelector('#workout [data-bb2-set]');assert.equal(await p.locator('[data-bb2-trial-save]').count(),0);
  if(n===1&&day==='upper_a'&&kind==='NORMAL')await warm('BB2');
  const before=await p.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events));
  const slots=await p.evaluate(()=>state.bb2.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===state.bb2.activeSessionId).slots);
  const required=Math.ceil(.7*slots.reduce((sum,s)=>sum+s.sets,0)),all=slots.flatMap((s,i)=>Array.from({length:s.sets},(_,j)=>({s,i,j})));
  if(kind==='RECOVERY')assert.ok(slots.every(s=>s.sets<=2),'recovery reduces per-slot working volume');
  const selected=incomplete?all.slice(0,required-1):threshold?all.slice(0,required):all;
  for(const {s,i,j}of selected){await tab(p,'workout');const key=i+'|'+j;await p.locator('[data-bb2-set="'+key+'"]').click();const m=p.locator('.bvomModalOverlay').last();
   const reps=kind==='RECOVERY'?s.floor:n%5===3?s.floor-1:n%5===4?s.floor:s.ceiling;
   await m.locator('[data-bb2-reps="'+key+'"]').fill(String(reps));
   await m.locator('[data-save]').click();await m.waitFor({state:'detached'});report.sets++;if(reps<s.floor)report.progression.missedRepSets++;await rest(kind==='RECOVERY'?60:s.plannedG>=100000?180:s.sets>=3?120:90);
  }
  if(incomplete){const live=clone((await stored(p)).bb2);await p.reload();await p.waitForSelector('#app:not(.hidden)');await p.waitForSelector('#workout [data-bb2-set].done');await p.waitForFunction(()=>bvomWindowLockOwned);await reconnect(p);assert.deepEqual((await stored(p)).bb2.events,live.events);assert.equal((await stored(p)).bb2.activeSessionId,live.activeSessionId);pass('BB2 normal Starting Setup and interrupted reload retain the active journal');}
  if(!incomplete&&kind==='NORMAL'&&n===1&&day==='upper_a'){await tab(p,'workout');await p.locator('[data-bb2-extra-add="0"]').click();const m=p.locator('.bvomModalOverlay').last();await m.locator('[data-bb2-reps]').fill(String(slots[0].floor));await m.locator('[data-save]').click();await m.waitFor({state:'detached'});report.sets++;await rest();pass('additional BB2 set recorded separately from prescribed count');}
  await finish(incomplete?'BB2 incomplete':kind==='RECOVERY'?'BB2 recovery':'BB2',n,{incomplete});
  const after=await p.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events));
  const quota=x=>Object.values(x.quotas).reduce((a,b)=>a+b,0);assert.equal(quota(after),quota(before)+(kind==='NORMAL'&&!incomplete?1:0));
  if(incomplete||kind==='RECOVERY')assert.deepEqual(after.progress,recoveryBefore||before.progress,'incomplete/recovery cannot progress loads');
  else {
   for(const [i,s]of slots.entries())if(s.equipment==='loaded'&&selected.filter(x=>x.i===i).length===s.sets&&n%5!==3&&n%5!==4){const key=day+'|'+s.roleSlotId+'|'+s.exerciseId;assert.equal(after.progress[key].loadG,s.plannedG+s.incrementG,'complete on-plan ceiling sets earn exactly one increment per exercise/slot');}
   for(const [key,v]of Object.entries(after.progress)){const old=before.progress[key]?.loadG;if(old!=null&&v.loadG!=null)report.progression[v.loadG>old?'increases':v.loadG<old?'reductions':'holds']++;}
  }
 }
 try{
  assert.equal((await stored(p)).history.length,0,'no workout fixture injection');
  await setup('lprpt',true);await increments();await addAccessory();
  for(let n=1;n<=(smoke?1:12);n++)await legacyWorkout('LP/RPT',n);
  if(smoke){report.verdict='WATCH';pass('SMOKE ONLY: not full-journey release evidence');return report}
  await legacyWorkout('LP/RPT incomplete',13,{incomplete:true});await backup('LP');
  await setup('hlm');for(let n=1;n<=12;n++)await legacyWorkout('HLM',n);await backup('HLM');
  await setup('fourday');for(let n=1;n<=16;n++)await legacyWorkout('4-Day Split',n);await backup('FourDay');
  await bbSetup();for(let n=1;n<=6&&await p.evaluate(()=>bvomBbOnRampActive());n++)await bbWorkout(n,true);
  assert.equal(await p.evaluate(()=>bvomBbOnRampActive()),false,'actual On-Ramp hands off');
  for(let n=1;n<=24;n++)await bbWorkout(n);assert.equal((await stored(p)).bodybuilding.completedSessions,24);await backup('BB1');
  await bb2Setup();await bb2Workout('upper_a',0,{incomplete:true});
  for(let week=1;week<=8;week++){
   for(const day of ['upper_a','lower_a','upper_b','lower_b']){const offline=week===3&&day==='lower_a';if(offline&&!uiOnly)await offlineBB2('before',p,report);await bb2Workout(day,week,{threshold:week===2&&day==='upper_a'});if(offline&&!uiOnly)await offlineBB2('after',p,report);}
   if(week===4){if(!uiOnly)await checkpoint(p,report,'BB2-mid');await swapBB2();}
   if(week===2||week===6)for(const day of ['upper_a','lower_a','upper_b','lower_b'])await bb2Workout(day,week,{kind:'RECOVERY'});
  }
  const projection=await p.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events));assert.deepEqual(Object.values(projection.quotas),[8,8,8,8]);assert.equal(report.counts.BB2,32);for(const[stage,min]of Object.entries({'LP/RPT':12,HLM:12,'4-Day Split':16,BB1:24,BB2:32}))assert.ok(report.counts[stage]>=min,'minimum actual completed workouts '+stage);await backup('BB2');await sealBB2();
  healthy();report.verdict=uiOnly||report.watches?.length?'WATCH':'PASS';pass('complete five-programme UI journey and 32 BB2 credits'+(uiOnly?' — authenticated cloud NOT TESTED':''));
 }catch(e){report.verdict='FAIL';fs.writeFileSync(path.join(output,profile.name.toLowerCase()+'-error.txt'),e.stack||String(e));fs.writeFileSync(path.join(output,profile.name.toLowerCase()+'-failure-state.json'),JSON.stringify(await stored(p),null,2));report.defects.push({message:e.message.slice(0,1800),stack:e.stack?.slice(-2200),lastActions:report.actions.slice(-12)});console.error('MONKEY UI DIAGNOSTIC',await p.evaluate(()=>({configured:state.configured,program:state.programMode,day:state.day,entitlementError:bvomEntitlement.error,bb2Cloud:typeof bvomBb2AccountStatus==='function'?bvomBb2AccountStatus():null,bb2Upload:bvomBb2AccountBinding?.lastUpload?.status,bb2UploadError:bvomBb2AccountBinding?.lastUpload?.error?.message,modal:document.querySelector('.bvomModalOverlay')?.textContent?.slice(0,700)})).catch(()=>({})));console.error('MONKEY '+profile.name+' FAIL:',e.message.slice(0,1200),e.stack?.split('\n').filter(l=>/^\s+at /.test(l)).join('\n'));await p.screenshot({path:path.join(output,profile.name.toLowerCase()+'-failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(output,profile.name.toLowerCase()+'-failure.html'),await p.content().catch(()=>''));}
 finally{write()}
 return report;
}
module.exports={profiles,runJourney,stored};
