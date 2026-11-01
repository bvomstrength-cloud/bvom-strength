// Versioned catalogue through the actual application: earned loads, screens and file restore.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as core from '../../bb2/browser-core.mjs';
import {validateBB2PortableCatalogue,validateBB2PortableGenesis} from '../../bb2/cloud-coordinator.mjs';
const require=createRequire(import.meta.url),H=require('./lib/bvom_harness');
const catalogueVersion=process.argv.includes('--legacy-v3')?3:4;
const root=new URL('../..',import.meta.url).pathname,owner='11111111-1111-4111-8111-111111111111';
function boot(ls){
 const h=H.boot(H.loadBuild(root),ls?{ls}:{});if(!ls)H.configureLP(h);
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__core=core;h.ctx.__catalogueVersion=catalogueVersion;h.ctx.__bb2PortableCatalogueForTest={validateBB2PortableCatalogue,validateBB2PortableGenesis};h.ctx.__owner=owner;
 h.ev('bvomBb2PreviewModule=__core;window.__bvomAuthUserId=__owner;bvomCloud.user={id:__owner};bvomSetLocalOwnerId(__owner);bvomEntitlementAccessDecision=()=>({allowed:true})');
 const query=h.ctx.document.querySelector;
 h.ctx.document.querySelector=selector=>{
  const f=selector.match(/data-bb2-(load|inc|assist|reps|hard)="([^"]+)"/);
  if(f){const b=h.S().bb2,s=b?.events?.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===b.activeSessionId)?.slots[Number(f[2].split('|')[0])];
   return {value:f[1]==='load'?'60':f[1]==='inc'?'2.5':f[1]==='assist'?'none':String(s?.ceiling||8),checked:false};}
  return query(selector);
 };
 return h;
}
function open(h){h.ev('bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode;bvomBb2PreviewDraft=__core.createBB2Setup(state.bb2?.setup||{catalogueVersion:__catalogueVersion});bvomBb2PreviewSaved=!!state.bb2?.setup;bvomBb2RenderPreview()')}
function start(h){open(h);h.ctx.bvomBb2ChooseDay('upper_a');assert.equal(h.ctx.bvomBb2Begin(),true);return h.S().bb2.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===h.S().bb2.activeSessionId)}
function fill(h,s){for(const [i,slot]of s.slots.entries())for(let j=0;j<slot.sets;j++)assert.equal(h.ctx.bvomBb2Log(i,j),true);assert.equal(h.ctx.bvomBb2End('FINISH'),true)}
let h=boot();open(h);h.ctx.bvomBb2PreviewCurls(true,'upper_a');h.ctx.bvomBb2PreviewCurls(true,'upper_b');
h.ctx.bvomBb2PreviewChoose('upper_a','biceps_curl','barbell_curl');h.ctx.bvomBb2PreviewChoose('upper_b','biceps_curl','cable_curl');
assert.equal(h.ctx.bvomBb2SaveSetup(),true);
let s=start(h);assert.equal(s.slots.at(-1).exerciseId,'barbell_curl');
assert.equal(h.ctx.bvomBb2EditWorkingLoad(4),true);
let dialog=h.lastOverlay();dialog.querySelector('[data-bb-weight]').value='30';dialog.querySelector('[data-bb-increment]').value='1';
assert.equal(dialog.querySelector('[data-save]').onclick(),true);
fill(h,s);fill(h,start(h));
let b=h.S().bb2,p=core.foldBB2Block(b.opening,b.events),curlKey='upper_a|biceps_curl|barbell_curl';
assert.equal(p.progress[curlKey].loadG,31000);assert.equal(p.progress[curlKey].incrementG,1000);
assert.equal(p.progress[curlKey].loadOrigin.kind,'DERIVED');
s=start(h);h.ctx.renderWarm();
let warm=h.ctx.document.querySelector('#warmup').innerHTML;
assert.match(warm,/Working: 62\.5 kg/,'earned bench load is visible in Warm-up');
assert.match(warm,/Working: 31 kg/,'earned curl load is visible in Warm-up');
h.ctx.changeUnits('lb',true);h.ctx.renderWarm();warm=h.ctx.document.querySelector('#warmup').innerHTML;
assert.ok(warm.includes('Working: '+h.ctx.bvomBb2DisplayLoad(31000)+' lb'),'Warm-up working label follows display units without changing canonical grams');
h.ctx.changeUnits('kg',true);
assert.equal(h.ctx.bvomBb2Log(4,0),true);assert.equal(h.ctx.bvomBb2End('INCOMPLETE'),true);
h.ctx.renderHistory();
assert.match(h.ctx.document.querySelector('#history').innerHTML,/15 reps · 31 kg/,'History shows actual mass inherited from an earned prescription');
// Swaps retain both variants, increments and immutable historical plans.
open(h);h.ctx.bvomBb2PreviewChoose('upper_a','biceps_curl','dumbbell_curl');assert.equal(h.ctx.bvomBb2SaveSetup(),true);
open(h);h.ctx.bvomBb2PreviewChoose('upper_a','biceps_curl','barbell_curl');assert.equal(h.ctx.bvomBb2SaveSetup(),true);
assert.equal(core.foldBB2Block(h.S().bb2.opening,h.S().bb2.events).progress[curlKey].loadG,31000);
// Exercise the existing Export Backup and Restore Backup callbacks, not just a fold.
let exported;h.ctx.Blob=function(parts){exported=parts.join('')};h.ctx.URL.createObjectURL=()=> 'blob:disposable-test';h.ctx.URL.revokeObjectURL=()=>{};
h.ctx.exportBackup();const backup=JSON.parse(exported);assert.equal(backup.data.bb2.setup.catalogueVersion,catalogueVersion);
const saved=JSON.parse(JSON.stringify(backup.data.bb2));
let restored=boot(),reader,confirmRestore;
restored.ctx.FileReader=function(){reader=this;this.readAsText=()=>{}};
restored.ctx.bvomChoiceModal=(_t,_b,_l,_r,_cancel,accept)=>{confirmRestore=accept};
restored.ctx.importBackupFile({files:[{name:'v3-backup.json'}],value:'v3-backup.json'});reader.result=exported;await reader.onload();
assert.equal(typeof confirmRestore,'function','v3 backup reaches the real restore confirmation');confirmRestore();
assert.deepEqual(JSON.parse(restored.ls.getItem('bvom_data')).bb2,saved);
assert.ok(restored.ls.getItem('bvom_pre_restore'));
restored=boot(restored.ls);restored.ctx.renderHistory();
assert.match(restored.ctx.document.querySelector('#history').innerHTML,/15 reps · 31 kg/);
p=core.foldBB2Block(restored.S().bb2.opening,restored.S().bb2.events);assert.equal(p.progress[curlKey].loadG,31000);
assert.equal(p.progress[curlKey].incrementG,1000);assert.equal(restored.S().bb2.setup.optionalUpperACurls,true);assert.equal(restored.S().bb2.setup.optionalUpperBCurls,true);
assert.equal(restored.S().bb2.setup.selections['upper_b|biceps_curl'],'cable_curl');
assert.equal(restored.ctx.bvomCloudPayload().bb2,undefined);
console.log('PASS catalogue v'+catalogueVersion+' actual screens, per-day selections, exact earned increments, swaps, units, History and full Export/Restore/reload');
