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
assert.doesNotMatch(html,/cloud.*disabled|not sent to BVOM Cloud|SETUP PREVIEW/);
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
