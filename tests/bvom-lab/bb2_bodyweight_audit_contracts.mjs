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
  const f=selector.match(/data-bb2-(load|inc|reps|hard|assist|bw-variation|bw-assist|bw-added)="([^"]+)"/);
  if(f){const b=h.S().bb2,start=b?.events?.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===b.activeSessionId),slot=start?.slots[Number(f[2].split('|')[0])];
   return {value:f[1]==='load'?'60':f[1]==='inc'?'2.5':f[1]==='assist'||f[1]==='bw-assist'?'none':f[1]==='bw-variation'?slot?.variation||'chinup':f[1]==='bw-added'?'':String(slot?.ceiling||8),checked:false};}
  return query(selector);
 };
 return h;
}
function start(h,fail=false,day='upper_a'){
 h.ctx.bvomStartingSetupModal();h.lastOverlay().querySelector('[data-r]').onclick();
 assert.equal(h.S().configured,false,'normal Starting Setup opens an unconfigured draft');
 h.ev('bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode;'+
  'bvomBb2PreviewDraft=__core.createBB2Setup(state.bb2?.setup);bvomBb2PreviewSaved=!!state.bb2?.setup;bvomBb2RenderPreview()');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true);h.ctx.bvomBb2ChooseDay(day);h.ctx.activateTab('history');
 if(fail){
  const before=h.ls.getItem('bvom_data'),set=h.ls.setItem;
  h.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('simulated Start quota');return set(key,value)};
  assert.equal(h.ctx.bvomBb2Begin(),false);assert.equal(h.S().configured,false);assert.equal(h.ls.getItem('bvom_data'),before);assert.ok(!h.S().bb2.activeSessionId);return null;
 }
 assert.equal(h.ctx.bvomBb2Begin(),true);
 assert.equal(h.S().configured,true,'BB2 Start durably completes normal Starting Setup');
 assert.equal(JSON.parse(h.ls.getItem('bvom_data')).configured,true);
 assert.equal(h.ctx.document.querySelector('#workout').classList.contains('hidden'),false,'Start opens Workout even when setup was entered from History');
 return h.S().bb2.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===h.S().bb2.activeSessionId);
}
function answerNote(h,text){const o=h.lastOverlay();assert.match(o.innerHTML,/data-note/);o.querySelector('[data-note]').value=text;o.querySelector('[data-save]').onclick();}
const catalogue=require('../../bb2/catalogue.cjs');let count=0;const names=new Set();
for(const version of [2,3,4,5])for(const day of catalogue.TEMPLATE_ORDER)for(const role of catalogue.getBB2Catalogue(version)[day])for(const option of role.options.filter(o=>o.equipment==='bodyweight')){
 const h=boot();h.ctx.bvomActualBodyweightRead=()=>82.75;
 h.ev('bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode;bvomBb2PreviewDraft=__core.createBB2Setup({catalogueVersion:'+version+'});bvomBb2PreviewSaved=false;bvomBb2RenderPreview()');
 h.ctx.bvomBb2PreviewChoose(day,role.roleSlotId,option.id);assert.equal(h.ctx.bvomBb2SaveSetup(),true);h.ctx.bvomBb2ChooseDay(day);
 assert.match(h.ctx.document.querySelector('#setup').innerHTML,/Actual trainee bodyweight/);
 assert.equal(h.ctx.bvomBb2Begin(),true);const b=h.S().bb2,start=b.events.find(e=>e.type==='WORKOUT_STARTED'),i=start.slots.findIndex(s=>s.roleSlotId===role.roleSlotId);
 assert.equal(start.slots[i].actualBodyweightKg,82.75);assert.match(h.ctx.document.querySelector('#workout').innerHTML,/Edit Bodyweight Plan/);
 for(const [n,slot]of start.slots.entries())for(let j=0;j<slot.sets;j++)assert.equal(h.ctx.bvomBb2Log(n,j),true);
 assert.equal(h.ctx.bvomBb2End('FINISH'),true);const saved=copy(h.S().bb2),p=core.foldBB2Block(saved.opening,saved.events);
 assert.ok(p.history[0].sets.filter(s=>s.exerciseId===option.id).every(s=>s.actualBodyweightKg===82.75));
 const stripped=copy(saved);for(const e of stripped.events){delete e.actualBodyweightKg;for(const s of e.slots||[])delete s.actualBodyweightKg}
 const old=core.foldBB2Block(stripped.opening,stripped.events);assert.deepEqual(p.progress,old.progress);assert.deepEqual(p.quotas,old.quotas);
 const restored=boot(h);assert.deepEqual(copy(restored.S().bb2),saved);names.add(option.id);count++;
}
console.log('PASS '+count+' bodyweight catalogue/slot combinations across versions 2–5: '+[...names].join(', '));
console.log('PASS actual bodyweight setup, working-set metadata, History, durable reopen and identical progression/quotas with metadata removed');
