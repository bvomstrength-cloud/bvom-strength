import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as core from '../../bb2/browser-core.mjs';
const require=createRequire(import.meta.url),H=require('./lib/bvom_harness');
const root=new URL('../..',import.meta.url).pathname,build=H.loadBuild(root);
const copy=x=>JSON.parse(JSON.stringify(x));
function boot(previous){
 const h=H.boot(build,previous?{ls:previous.ls,ss:previous.ctx.sessionStorage}:{});if(!previous)H.configureLP(h);
 h.ctx.__core=core;h.ev('bvomBb2PreviewModule=__core');
 h.ctx.bvomSessionNoteModal=h.realSessionNoteModal;h.ctx.bvomChoiceModal=h.realChoiceModal;
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const f=selector.match(/data-bb2-(load|inc|reps|hard|assist)="([^"]+)"/);
  if(f){const b=h.S().bb2,start=b?.events?.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===b.activeSessionId),slot=start?.slots[Number(f[2].split('|')[0])];
   return {value:f[1]==='load'?'60':f[1]==='inc'?'2.5':f[1]==='assist'?'none':String(slot?.ceiling||8),checked:false};}
  return query(selector);
 };
 return h;
}
function start(h){
 h.ctx.bvomStartingSetupModal();h.lastOverlay().querySelector('[data-r]').onclick();
 assert.equal(h.S().configured,false,'normal Starting Setup opens an unconfigured draft');
 h.ev('bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode;'+
  'bvomBb2PreviewDraft=__core.createBB2Setup(state.bb2?.setup);bvomBb2PreviewSaved=!!state.bb2?.setup;bvomBb2RenderPreview()');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);h.ctx.activateTab('history');
 assert.equal(h.ctx.bvomBb2Begin(),true);
 assert.equal(h.S().configured,true,'BB2 Start durably completes normal Starting Setup');
 assert.equal(JSON.parse(h.ls.getItem('bvom_data')).configured,true);
 assert.equal(h.ctx.document.querySelector('#workout').classList.contains('hidden'),false,'Start opens Workout even when setup was entered from History');
 return h.S().bb2.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===h.S().bb2.activeSessionId);
}
function answerNote(h,text){const o=h.lastOverlay();assert.match(o.innerHTML,/data-note/);o.querySelector('[data-note]').value=text;o.querySelector('[data-save]').onclick();}
let h=boot();const originalLegacy=copy(h.S().history),s=start(h);
assert.equal(h.ctx.document.querySelector('#timerbar .finish').disabled,true);
assert.doesNotMatch(h.ctx.document.querySelector('#workout').innerHTML,/data-bb2-finish|data-bb2-incomplete|data-bb2-discard|ACCEPT CALIBRATION|calibrates this lift/);
h.ctx.activateTab('warmup');const ledgerBefore=JSON.stringify(h.S().bb2.events);
const slot=s.slots[0],role=core.getBB2TemplatePrescription(h.S().bb2.setup,s.templateId).slots[0];
const plan=h.ctx.bvomBb2WarmupPlan(slot,role);assert.ok(plan.sets.length);
for(let i=0;i<plan.sets.length;i++)assert.equal(h.ctx.bvomBb2WarmupMark(0,i),true);
assert.ok(h.S().timerStart);assert.equal(JSON.parse(h.ls.getItem('bvom_data')).timerStart,h.S().timerStart);
assert.equal(JSON.stringify(h.S().bb2.events),ledgerBefore,'preparation cannot create working sets or progression');
assert.equal(h.ctx.document.querySelector('#workout').classList.contains('hidden'),false);
assert.doesNotMatch(h.ctx.document.querySelector('#warmup').innerHTML,/class="notice"/);
for(const [i,slot]of s.slots.entries())for(let j=0;j<slot.sets;j++)assert.equal(h.ctx.bvomBb2Log(i,j),true);
assert.equal(h.ctx.document.querySelector('#timerbar .finish').disabled,false,'the actual shared FINISH is enabled');
const saved=copy(h.S().bb2);h=boot(h);assert.deepEqual(copy(h.S().bb2),saved,'interrupted session survives reload');
h.ctx.renderAll();assert.equal(h.ctx.finishWorkout(),true);
const dialog=h.lastOverlay();assert.equal(h.ctx.finishWorkout(),false,'repeated Finish cannot open another note dialog');
assert.equal(h.lastOverlay(),dialog);assert.equal(h.S().bb2.events.filter(e=>e.type==='WORKOUT_FINISHED').length,0);
answerNote(h,'Normal Finish — retained note');
const b=h.S().bb2,p=core.foldBB2Block(b.opening,b.events);
assert.equal(p.quotas.upper_a,1);assert.equal(p.progress['upper_a|flat_press|bench_press'].loadG,62500,'configured load progresses on first qualifying exposure');
assert.equal(p.history.length,1);assert.equal(p.history[0].note,'Normal Finish — retained note');assert.ok(p.history[0].completedAt);
assert.equal(b.events.filter(e=>e.type==='CALIBRATION_ACCEPTED'||e.type==='CALIBRATION_PLAN_REVISED').length,0);
assert.deepEqual(copy(h.S().history),originalLegacy,'no duplicate legacy journal is invented');
assert.match(h.ctx.document.querySelector('#history').innerHTML,/Normal Finish — retained note/);
assert.doesNotMatch(h.ctx.document.querySelector('#history').innerHTML,/No workouts saved yet/);
assert.doesNotMatch(h.ctx.document.querySelector('#workout').innerHTML,/SWITCH PROGRAM|audited progression/);
const committed=h.ls.getItem('bvom_data');h.ctx.finishWorkout();h.ctx.finishWorkout();assert.equal(h.ls.getItem('bvom_data'),committed);
h=boot(h);h.ctx.renderAll();assert.equal(core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events).history[0].note,'Normal Finish — retained note');
console.log('PASS shared Finish, note, durable History, restart, first-exposure progression, warm-up timer/navigation and idempotence');
{
 const x=boot();start(x);assert.equal(x.ctx.bvomBb2Log(0,0),true);
 const before=x.ls.getItem('bvom_data');assert.equal(x.ctx.finishWorkout(),true);
 x.lastOverlay().querySelector('[data-l]').onclick();assert.equal(x.ls.getItem('bvom_data'),before);
 assert.equal(x.ctx.finishWorkout(),true);x.lastOverlay().querySelector('[data-r]').onclick();answerNote(x,'Stopped early');
 const p=core.foldBB2Block(x.S().bb2.opening,x.S().bb2.events);
 assert.equal(p.history[0].status,'INCOMPLETE');assert.equal(p.history[0].note,'Stopped early');assert.equal(p.quotas.upper_a,0);
}
{
 const x=boot(),s=start(x);for(const[i,slot]of s.slots.entries())for(let j=0;j<slot.sets;j++)x.ctx.bvomBb2Log(i,j);
 const before=x.ls.getItem('bvom_data');x.ctx.finishWorkout();const set=x.ls.setItem;
 x.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('simulated quota');return set(key,value)};
 answerNote(x,'Must not be partly committed');
 assert.equal(x.ls.getItem('bvom_data'),before);assert.ok(x.S().bb2.activeSessionId);
 assert.equal(x.S().bb2.events.filter(e=>e.type==='WORKOUT_FINISHED').length,0);
}
console.log('PASS separately confirmed incomplete flow and failed-Finish transaction retention');
