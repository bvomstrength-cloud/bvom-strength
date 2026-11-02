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
function sealCreditedBlock(core, opening) {
  const events = [];
  const add = (type, fields) => events.push({ type, eventId: 'event-' +
    opening.blockId + '-' + (events.length + 1),
    commitOrdinal: events.length + 1, blockId: opening.blockId, ...fields });
  const slot = { roleSlotId: 'synthetic_role', exerciseId: 'synthetic_lift',
    sets: 1, floor: 6, ceiling: 10, equipment: 'loaded', plannedG: 60000,
    plannedOrigin: { value: '60', unit: 'kg' }, incrementG: 2500,
    incrementOrigin: { value: '2.5', unit: 'kg' } };
  for (const day of ['upper_a', 'lower_a', 'upper_b', 'lower_b']) {
    for (let i = 0; i < 8; i++) {
      const sessionId = `${opening.blockId}-${day}-${i}`;
      add('WORKOUT_STARTED', { sessionId, templateId: day, kind: 'NORMAL', slots: [slot] });
      add('SET_RECORDED', { sessionId, roleSlotId: slot.roleSlotId,
        exerciseId: slot.exerciseId, setIndex: 0, reps: 6, prescribed: true,
        actualG: 60000, actualOrigin: { value: '60', unit: 'kg' } });
      add('WORKOUT_FINISHED', { sessionId });
      add('CREDIT_GRANTED', { sessionId, creditId: 'credit-' + sessionId });
    }
  }
  assert.deepEqual(Object.values(core.foldBB2Block(opening, events).quotas),
    [8, 8, 8, 8]);
  const sealId = 'seal:' + opening.blockId + ':' + (events.length + 1);
  add('BLOCK_SEALED', { sealId });
  assert.equal(core.foldBB2Block(opening, events).sealed, true);
  return { opening, events };
}

const fixture=require('./fixtures/bb2-android-history-shape.json');
function restored(){const h=boot();h.ctx.__data=copy(fixture.data);h.ev('state=__data;save({durable:true});renderAll()');return h}
{
 const h=restored(),original=copy(h.S()),data=h.ctx.bvomBb2HistoryProjection(),ref=h.ctx.bvomBb2HistoryRef(data.rows[0]),view=h.ctx.bvomHistoryRecord(ref);
 assert.equal(view.program,'bb2');assert.equal(view.exerciseMeta['flat_press|bench_press'].name,'Bench Press');assert.equal(view.session['flat_press|bench_press'][0].load,60);assert.deepEqual(copy(h.S()),original,'presentation is read-only');
 h.ctx.toggleHistoryWorkout(ref);const html=h.ctx.document.querySelector('#history').innerHTML;
 assert.match(html,/HIDE DETAILS/);for(const action of ['editHistoryNote','shareHistoryWorkout','deleteHistoryWorkout'])assert.ok(html.includes(action+'(&quot;'+ref+'&quot;)'));
 assert.doesNotMatch(html,/bb2HistoryDetails|data-bb2-correct-save/);assert.match(html,/8×60 kg/);
 const before=core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events);
 h.ctx.editHistoryNote(ref);answerNote(h,'Updated <shared> note');assert.equal(h.S().bb2.events.at(-1).type,'NOTE_EDITED');assert.equal(h.ctx.bvomHistoryRecord(ref).note,'Updated <shared> note');assert.deepEqual(copy(h.S().history),original.history);
 const payload=h.ctx.bvomShareWorkoutText(h.ctx.bvomHistoryRecord(ref));assert.match(payload,/Bodybuilding 2/);assert.match(payload,/Bench Press/);assert.match(payload,/8×60 kg/);assert.match(payload,/Updated <shared> note/);
 h.ctx.deleteHistoryWorkout(ref);h.lastOverlay().querySelector('[data-r]').onclick();assert.equal(h.S().bb2.events.at(-1).type,'HISTORY_HIDDEN');assert.equal(h.ctx.bvomHistoryRecord(ref),undefined);const after=core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events);assert.deepEqual(after.progress,before.progress);assert.deepEqual(after.quotas,before.quotas);assert.deepEqual(copy(h.S().history),original.history);
 const opened=restored();const r=opened.ctx.bvomBb2HistoryRef(opened.ctx.bvomBb2HistoryProjection().rows[0]);opened.ctx.deleteHistoryWorkout(r);const raw=opened.ls.getItem('bvom_data');opened.ev('window.__bvomAuthUserId="different-owner"');opened.lastOverlay().querySelector('[data-r]').onclick();assert.equal(opened.ls.getItem('bvom_data'),raw,'owner change cannot confirm a stale delete');
 const disk=restored(),dref=disk.ctx.bvomBb2HistoryRef(disk.ctx.bvomBb2HistoryProjection().rows[0]),saved=copy(disk.S().bb2),set=disk.ls.setItem;disk.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('quota');return set(k,v)};assert.equal(disk.ctx.bvomBb2HistoryAnnotation(dref,'NOTE_EDITED','never committed'),false);disk.ls.setItem=set;assert.deepEqual(copy(disk.S().bb2),saved,'failed annotation has no phantom note/event');
 console.log('PASS unified card/action adapter, real note/delete dialogs, shared share text, no materialisation, unchanged progression/credits, stale-owner and disk-failure rollback');
}
{
 const h=restored(),owner=h.S().bb2.opening.ownerId,first=sealCreditedBlock(core,core.createBB2Opening({ownerId:owner,blockId:'archived-ui'})),next=core.BB2_BROWSER_MODULES.ledger.createNextBB2Opening(first.opening,first.events,'current-ui');
 h.ctx.__archive=copy(first);h.ctx.__next=copy(next);h.ev('state.bb2={...state.bb2,opening:__next,events:[],sealedBlocks:[__archive]};save({durable:true})');
 const before=core.foldBB2Block(first.opening,first.events),record=h.ctx.bvomBb2HistoryProjection().archived[0],ref=h.ctx.bvomBb2HistoryRef(record);
 h.ctx.editHistoryNote(ref);answerNote(h,'Archived shared note');assert.equal(h.ctx.bvomHistoryRecord(ref).note,'Archived shared note');assert.match(h.ctx.bvomShareWorkoutText(h.ctx.bvomHistoryRecord(ref)),/Archived shared note/);h.ctx.deleteHistoryWorkout(ref);h.lastOverlay().querySelector('[data-r]').onclick();assert.equal(h.S().bb2.sealedBlocks[0].events.at(-1).type,'HISTORY_HIDDEN');
 const archived=h.S().bb2.sealedBlocks[0],after=core.foldBB2Block(archived.opening,archived.events);assert.deepEqual(copy(archived.events.slice(0,first.events.length)),first.events);assert.deepEqual(after.progress,before.progress);assert.deepEqual(after.quotas,before.quotas);assert.deepEqual(after.closingSnapshot,before.closingSnapshot);
 console.log('PASS archived History note/delete annotations retain sealed training, closing snapshot, all 32 credits and immutable event prefix');
}
