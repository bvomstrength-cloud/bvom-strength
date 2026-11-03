// Actual application migration and portable-history regressions. No network or cloud writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as core from '../../bb2/browser-core.mjs';
import {validateBB2PortableCatalogue} from '../../bb2/cloud-coordinator.mjs';
const require=createRequire(import.meta.url),H=require('./lib/bvom_harness');
const root=new URL('../..',import.meta.url).pathname;
const copy=value=>JSON.parse(JSON.stringify(value));
function boot(build=H.loadBuild(root)){
 const h=H.boot(build);H.configureLP(h);
 h.ctx.location.origin='http://localhost:8000';h.ctx.location.search='?bb2Preview=1';
 h.ctx.__core=core;h.ev('bvomBb2PreviewModule=__core');return h;
}
function open(h,version=1){
 const setup=core.createBB2Setup({catalogueVersion:version,optionalUpperBCurls:true,
  ...(version>=3?{optionalUpperACurls:true}:{}),selections:{
   'upper_a|flat_press':'dumbbell_flat_press','lower_a|calf_raise':version===4?'standing_calf_raise':'bodyweight_calf_raise',
   'upper_b|biceps_curl':'cable_curl'}});
 h.ctx.__saved={setup:copy(setup),events:[],sealedBlocks:[],warmups:{retained:'ticks'},
  selectedProgram:false,exerciseDisplayOrder:{retained:['one','two']}};
 h.ev('state.bb2=__saved;save({durable:true,localOnly:true});'+
  'bvomBb2PreviewOpen=true;bvomBb2PreviewOriginalMode=state.programMode;'+
  'bvomBb2PreviewDraft=__core.createBB2Setup(state.bb2.setup);bvomBb2RenderPreview()');
 return setup;
}
function migrate(h){
 const previous=copy(h.S().bb2),raw=h.ls.getItem('bvom_data');
 assert.equal(h.ctx.bvomBb2UseLatestSetup(),true);
 assert.equal(h.ls.getItem('bvom_data'),raw,'migration preview is not a write');
 assert.deepEqual(copy(h.S().bb2),previous,'preview preserves old setup and all evidence');
 const draft=h.ev('bvomBb2PreviewDraft');
 assert.equal(draft.selections['upper_a|flat_press'],'dumbbell_flat_press');
 assert.equal(draft.selections['upper_b|biceps_curl'],'cable_curl');
 assert.equal(draft.optionalUpperBCurls,true);
 assert.equal(draft.optionalUpperACurls,previous.setup.optionalUpperACurls===true);
 assert.equal(draft.selections['lower_a|calf_raise'],'standing_calf_raise','only removed choice falls back');
 assert.equal(h.ctx.bvomBb2SaveSetup(),true,'explicit save persists idle migration');
 assert.equal(h.S().bb2.setup.catalogueVersion,5);
 const after=copy(h.S().bb2);delete after.setup;delete previous.setup;
 assert.deepEqual(after,previous,'non-setup BB2 data is byte-for-byte retained');
 assert.equal(JSON.parse(h.ls.getItem('bvom_data')).bb2.setup.catalogueVersion,5);
}
for(const version of [1,2,3,4]){const h=boot();open(h,version);migrate(h);}
console.log('PASS v1/v2/v3 idle migration preserves choices, flags and all unrelated evidence');
for(const [name,alter] of [
 ['live opening',h=>{h.S().bb2.opening={blockId:'existing'};}],
 ['event journal',h=>{h.S().bb2.events=[{type:'retained'}];}],
 ['archived block',h=>{h.S().bb2.sealedBlocks=[{opening:{blockId:'archive'},events:[]}];}],
 ['active workout',h=>{h.ev('bvomStateWorkoutActive=()=>true');}],
 ['lost permission',h=>{h.ev('bvomWorkoutActionAllowed=()=>false');}],
 ['program changed',h=>{h.S().programMode='hlm';}]
]){
 const h=boot();open(h);alter(h);
 const before=JSON.stringify(h.S().bb2),draft=JSON.stringify(h.ev('bvomBb2PreviewDraft'));
 assert.equal(h.ctx.bvomBb2UseLatestSetup(),false,name);
 assert.equal(JSON.stringify(h.S().bb2),before,name+' preserves saved state');
 assert.equal(JSON.stringify(h.ev('bvomBb2PreviewDraft')),draft,name+' preserves draft');
 if(['live opening','event journal','archived block'].includes(name)){
  h.ev('bvomBb2PreviewDraft=__core.createBB2Setup()');
  assert.equal(h.ctx.bvomBb2SaveSetup(),false,name+' cannot bypass migration guard via Save');
 }
}
console.log('PASS live/archive/activity/permission/program/host migration guards');
{
 const h=boot();open(h,3);const before=JSON.stringify(h.S().bb2),raw=h.ls.getItem('bvom_data');
 assert.equal(h.ctx.bvomBb2UseLatestSetup(),true);
 const write=h.ls.setItem.bind(h.ls);
 h.ls.setItem=(key,value)=>{if(key==='bvom_data')throw Error('simulated durable failure');return write(key,value);};
 assert.equal(h.ctx.bvomBb2SaveSetup(),false);
 assert.equal(JSON.stringify(h.S().bb2),before,'failed save restores original BB2 document');
 assert.equal(h.ls.getItem('bvom_data'),raw,'failed save preserves durable legacy setup');
}
console.log('PASS migration durable-save failure rolls back complete legacy state');
for(const a of [false,true])for(const b of [false,true])for(const day of ['upper_a','upper_b']){
 const setup=core.createBB2Setup({optionalUpperACurls:a,optionalUpperBCurls:b});
 const opening=core.createBB2Opening({ownerId:'portable-owner',blockId:'portable-block'});
 const slots=core.getBB2TemplatePrescription(setup,day).slots.map(s=>{
  const {roleSlotId,exerciseId,sets,floor,ceiling,equipment}=s;
  return {...{roleSlotId,exerciseId,sets,floor,ceiling,equipment},
   ...(equipment==='loaded'?{plannedG:60000,plannedOrigin:{value:'60',unit:'kg'},
    incrementG:1000,incrementOrigin:{value:'1',unit:'kg'}}:
    {variation:exerciseId,assistance:'none'})};
 });
 const event={type:'WORKOUT_STARTED',eventId:'start',commitOrdinal:1,blockId:opening.blockId,
  sessionId:'portable-session',kind:'NORMAL',templateId:day,slots};
 // Current toggles may differ from the immutable historical Start.
 const current=core.createBB2Setup({...setup,optionalUpperACurls:!a,optionalUpperBCurls:!b});
 assert.equal(validateBB2PortableCatalogue(current,[event],{opening}),true);
}
console.log('PASS v4 independent optional curls reconstruct each historical Start after preference changes');
// Prove the focused checks catch the original defects without altering source files.
{
 const build=H.loadBuild(root),mutant={...build,script:build.script.replace(
  'if(before?.setup&&before.setup.catalogueVersion!==snapshot.catalogueVersion&&',
  'if(before?.setup&&before.setup.catalogueVersion!==snapshot.catalogueVersion)return false;\n if(before?.setup&&before.setup.catalogueVersion!==snapshot.catalogueVersion&&')};
 assert.notEqual(mutant.script,build.script);const h=boot(mutant);open(h);
 assert.throws(()=>migrate(h),/explicit save persists idle migration/);
 const source=fs.readFileSync(new URL('../../bb2/cloud-coordinator.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('export function validateBB2PortableCatalogue'),
  source.indexOf('export function validateBB2PortableGenesis')).replace('export function','function')
  .replace('setup.catalogueVersion >= 3','setup.catalogueVersion === 3');
 const f=Function('validateBB2Setup','createBB2Setup','getBB2TemplatePrescription','BB2_BROWSER_MODULES',
  body+';return validateBB2PortableCatalogue;')(core.validateBB2Setup,core.createBB2Setup,
   core.getBB2TemplatePrescription,core.BB2_BROWSER_MODULES);
 const setup=core.createBB2Setup({optionalUpperACurls:true});
 assert.throws(()=>f(setup,[{type:'WORKOUT_STARTED',kind:'NORMAL',templateId:'upper_a',
  slots:core.getBB2TemplatePrescription(setup,'upper_a').slots}]),/incorrect catalogue slot count/);
}
console.log('PASS both original migration and v4 historical-curl mutations detected');
