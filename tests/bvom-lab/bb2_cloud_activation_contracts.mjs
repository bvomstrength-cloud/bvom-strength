// Final catalogue, normal entry and unchanged historical catalogue contracts.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as core from '../../bb2/browser-core.mjs';
import {validateBB2PortableCatalogue} from '../../bb2/cloud-coordinator.mjs';
const require=createRequire(import.meta.url),H=require('./lib/bvom_harness');
const root=new URL('../..',import.meta.url).pathname;
const c=core.BB2_BROWSER_MODULES.catalogue;
assert.equal(c.CATALOGUE_VERSION,5);
const setup=core.createBB2Setup();
assert.deepEqual(c.TEMPLATE_ORDER.map(d=>core.getBB2TemplatePrescription(setup,d).prescribedCount),[10,10,13,9]);
assert.throws(()=>c.chooseBB2Exercise(setup,'upper_a','shoulder_press','log_push_press'),/finite catalogue/);
for(const day of ['lower_a','lower_b']){
 const next=c.chooseBB2Exercise(setup,day,'calf_raise','single_leg_calf_raise');
 const slot=core.getBB2TemplatePrescription(next,day).slots.find(s=>s.roleSlotId==='calf_raise');
 assert.deepEqual([slot.sets,slot.floor,slot.ceiling,slot.equipment],[2,10,20,'loaded']);
}
for(const version of [1,2,3,4]){
 const old=core.createBB2Setup({catalogueVersion:version});
 const log=c.chooseBB2Exercise(old,'upper_a','shoulder_press','log_push_press');
 const before=JSON.stringify(log);
 assert.equal(core.createBB2Setup(JSON.parse(before)).catalogueVersion,version);
 assert.equal(JSON.stringify(log),before);
 assert.equal(core.getBB2TemplatePrescription(log,'upper_a').slots.find(s=>s.roleSlotId==='shoulder_press').floor,4);
 assert.throws(()=>c.chooseBB2Exercise(old,'lower_a','calf_raise','single_leg_calf_raise'),/finite catalogue/);
}
// New single-leg choices pass the same portable/backup validator as all loads.
for(const day of ['lower_a','lower_b']){
 const next=c.chooseBB2Exercise(setup,day,'calf_raise','single_leg_calf_raise');
 const opening=core.createBB2Opening({ownerId:'owner',blockId:'block-'+day});
 const slots=core.getBB2TemplatePrescription(next,day).slots.map(s=>({
  roleSlotId:s.roleSlotId,exerciseId:s.exerciseId,sets:s.sets,floor:s.floor,ceiling:s.ceiling,equipment:s.equipment,
  ...(s.equipment==='loaded'?{plannedG:60000,plannedOrigin:{value:'60',unit:'kg'},incrementG:1000,incrementOrigin:{value:'1',unit:'kg'}}:
   {variation:s.exerciseId,assistance:'none'})}));
 assert.equal(validateBB2PortableCatalogue(next,[{type:'WORKOUT_STARTED',eventId:'start',commitOrdinal:1,
  blockId:opening.blockId,sessionId:'session',kind:'NORMAL',templateId:day,slots}],{opening}),true);
}
const h=H.boot(H.loadBuild(root));H.configureLP(h);
h.ctx.location.origin='https://app.bvomstrength.com';h.ctx.location.search='';
assert.equal(h.ctx.bvomBb2PreviewEnabled(),true,'normal programme entry needs no preview URL');
h.ctx.__core=core;
h.ev('bvomBb2PreviewModule=__core;bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode;'+
 'bvomBb2PreviewDraft=__core.createBB2Setup();bvomBb2RenderPreview()');
const html=h.ctx.document.querySelector('#setup').innerHTML;
assert.match(html,/42 core working sets/);assert.match(html,/32 credits/);
assert.match(html,/sync through your BVOM account/);
assert.match(html,/Single-Leg Calf Raise/);assert.doesNotMatch(html,/Log Push Press/);
assert.doesNotMatch(html,/cloud.*disabled|not sent to BVOM Cloud|SETUP PREVIEW|DEVELOPMENT START/);
assert.equal(h.ctx.bvomBb2SaveSetup(),true);
assert.equal(h.S().bb2.setup.catalogueVersion,5);
assert.equal(h.ctx.bvomCloudPayload().bb2,undefined,'legacy clients cannot overwrite BB2 storage');
// JSONB reorders object keys. A downloaded setup is semantically unchanged,
// and must remain idempotent to Save and trainable without rewriting history.
h.ev('state.bb2.setup=JSON.parse(bvomCloudStable(state.bb2.setup));save({durable:true,localOnly:true});'+
 'bvomBb2PreviewDraft=__core.createBB2Setup(state.bb2.setup);bvomBb2PreviewSaved=true');
const raw=h.ls.getItem('bvom_data');
assert.equal(h.ctx.bvomBb2SaveSetup(),true);
assert.equal(h.ls.getItem('bvom_data'),raw,'cloud key order must not cause an unnecessary setup write');
const query=h.ctx.document.querySelector;
h.ctx.document.querySelector=selector=>{
 if(/data-bb2-load=/.test(selector))return {value:'60'};
 if(/data-bb2-inc=/.test(selector))return {value:'2.5'};
 return query(selector);
};
h.ev("bvomBb2PreviewDraft=__core.BB2_BROWSER_MODULES.catalogue.chooseBB2Exercise(bvomBb2PreviewDraft,'upper_a','flat_press','dumbbell_flat_press')");
assert.equal(h.ctx.bvomBb2Begin(),false,'a genuinely unsaved exercise change still blocks Start');
assert.equal(h.ls.getItem('bvom_data'),raw);
h.ev('bvomBb2PreviewDraft=__core.createBB2Setup(state.bb2.setup)');
assert.equal(h.ctx.bvomBb2Begin(),true,'a downloaded JSONB setup can start offline');
assert.ok(h.S().bb2.activeSessionId);
console.log('PASS BB2 v5: 42 sets, both calf choices, historical Log compatibility, normal entry, setup explanation and legacy transport isolation');

// One cloud interface: programme issues must never hide behind a success line
// or introduce a second card or manual programme-only controls.
{
 const ui=H.boot(H.loadBuild(root));H.configureLP(ui);ui.ctx.__setup=setup;
 ui.ev("state.bb2={setup:__setup,events:[],sealedBlocks:[]};bvomCloud.user={id:'owner'};"+
  "bvomCloud.syncReady=true;bvomCloud.cloudExists=true;bvomCloud.message='Synced.';"+
  "bvomBb2AccountBinding={lastDownload:{status:'up_to_date'},lastUpload:null,syncing:false}");
 for(const status of ['conflict','uncertain','unavailable','incompatible','up_to_date']){
  ui.ctx.__status=status;ui.ev('bvomBb2AccountBinding.lastDownload={status:__status}');
  const card=ui.ctx.bvomCloudCard();
  assert.equal((card.match(/<b>BVOM Cloud<\/b>/g)||[]).length,1);
  assert.doesNotMatch(card,/BB2 CLOUD|CHECK BB2 CLOUD|data-bb2-sync|data-bb2-use-cloud/);
  assert.match(card,/onclick="bvomCloudSaveNow\(\)"/);
  assert.match(card,/onclick="bvomCloudRestore\(\)"/);
  if(status!=='up_to_date'){
   assert.match(card,/data-cloud-programme-notice/);
   assert.doesNotMatch(card,/Cloud and device match|Synced\./,'no misleading success alongside a programme hold');
  }
  if(status==='conflict')assert.match(card,/USE CLOUD COPY/);
 }
 ui.ctx.document.querySelector('#settings').classList.add('hidden');
 const originalQuery=ui.ctx.document.querySelector;
 ui.ctx.document.querySelector=selector=>selector==='#settings:not(.hidden)'?null:originalQuery(selector);
 ui.ev('bvomBb2AccountBinding.lastDownload={status:"unavailable"}');
 ui.ctx.bvomBb2AccountStatusRender();
 assert.match(ui.ctx.document.querySelector('#settings').innerHTML,/Bodybuilding 2 could not sync/);
 ui.ev('bvomBb2AccountBinding.lastDownload={status:"conflict"}');
 ui.ctx.bvomBb2AccountStatusRender();
 assert.match(ui.ctx.document.querySelector('#settings').innerHTML,/Sync paused/,
  'a background status change must be current when the normal Settings tab opens');
 assert.doesNotMatch(ui.ctx.document.querySelector('#settings').innerHTML,/Bodybuilding 2 could not sync/);
 ui.ev('state.bb2=undefined;bvomBb2AccountBinding.lastDownload={status:"unavailable"}');
 assert.match(ui.ctx.bvomCloudStatusText(),/Cloud and device match/,'unused BB2 transport does not change other programme status');
 ui.ev('bvomBb2AccountBinding=null');
 assert.doesNotMatch(ui.ctx.bvomCloudCard(),/data-cloud-programme-notice/);
 // A legacy conflict blocks the BB2 coordinator. The common Restore action
 // must resolve that legacy boundary first, rather than trapping both copies.
 let legacyLookups=0,programmeRecoveries=0;
 ui.ctx.__client={from(){legacyLookups++;throw Error('isolated lookup stopped')}};
 ui.ctx.bvomBb2AccountUseCloud=()=>{programmeRecoveries++};
 ui.ev("state.bb2={setup:__setup};bvomCloud.client=__client;bvomCloud.offlineLocalAccess=false;"+
  "bvomCloud.accountSwitchDeferred=false;bvomCloud.conflict=true;"+
  "bvomBb2AccountBinding={lastDownload:{status:'conflict'},lastUpload:null,syncing:false}");
 assert.match(ui.ctx.bvomCloudCard(),/Resolve the other saved-data conflict first/);
 await ui.ctx.bvomCloudRestore();
 assert.equal(legacyLookups,1,'legacy recovery remains reachable with simultaneous conflicts');
 assert.equal(programmeRecoveries,0);
 ui.ev('bvomCloud.conflict=false');
 await ui.ctx.bvomCloudRestore();
 assert.equal(programmeRecoveries,1,'programme-only conflict uses the same Restore action');
 ui.ev("state.bb2.activeSessionId='retained-active-workout'");
 await ui.ctx.bvomCloudRestore();
 assert.match(ui.ev('bvomCloud.message'),/Finish the current workout/);
 assert.equal(programmeRecoveries,1,'active workout never enters conflict replacement');
 assert.equal(legacyLookups,1,'active workout never fetches a replacement');
 assert.equal(ui.S().bb2.activeSessionId,'retained-active-workout');
}
console.log('PASS unified BVOM Cloud card, errors, conflict actions and existing-program isolation');

// Candidate release markers and shared EN/JA programme information.
{
 const info=H.boot(H.loadBuild(root));H.configureLP(info);
 assert.equal(info.ev('BVOM_BUILD'),'3.0.2');
 for(const lang of ['en','ja']){
  info.ctx.__lang=lang;info.ev('state.language=__lang;renderInfo()');
  const copy=info.ctx.bvomBb2ProgrammeInfo();
  const help=info.ctx.document.querySelector('#info').innerHTML;
  assert.ok(help.includes('<p data-bb2-programme-info><b>'+copy.title+'</b><br>'+copy.body+'</p>'));
  assert.equal(help.split(copy.title).length-1,1,'one programme explanation beside its siblings');
  info.ctx.__core=core;
  info.ev('bvomBb2PreviewModule=__core;bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode;'+
   'bvomBb2PreviewDraft=__core.createBB2Setup();bvomBb2RenderPreview()');
  const setupHtml=info.ctx.document.querySelector('#setup').innerHTML;
  assert.ok(setupHtml.includes(copy.title));assert.ok(setupHtml.includes(copy.body));
  if(lang==='en'){assert.match(copy.body,/Monday, Tuesday, Thursday and Friday/);assert.match(copy.body,/Wednesday for recovery/);assert.match(copy.body,/32 qualifying workouts/);}
 }
}
console.log('PASS v3.0.2 candidate and consistent EN/JA programme help/setup copy');
