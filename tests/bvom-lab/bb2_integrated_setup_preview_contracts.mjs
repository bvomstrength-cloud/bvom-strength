// The real inline BVOM application, with a simulated DOM, composes the BB2
// catalogue in its existing chooser. No separate application or storage.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as catalogue from '../../bb2/browser-core.mjs';

const require=createRequire(import.meta.url);
const H=require('./lib/bvom_harness');
const path=require('node:path');
const root=path.resolve(import.meta.dirname,'../..');

function fixture(){
 const h=H.boot(H.loadBuild(root));H.configureLP(h);
 const before=h.ls.getItem('bvom_data');
 const document=h.ctx.document,query=document.querySelector;
 const row={children:[],appendChild(el){this.children.push(el);return el},
  querySelector(selector){return this.children.find(el=>selector==='[data-bb2-preview]'&&el.dataset.bb2Preview)||null}};
 document.querySelector=selector=>selector==='#setup [data-bb-program]'?{parentElement:row}:query(selector);
 return {h,before,row};
}

{
 const {h,row}=fixture();
 h.ctx.bvomBb2InjectProgramChoice();
 assert.equal(row.children.length,0,'ordinary BVOM does not expose the dev preview');
 h.ctx.location.origin='https://bvomstrength.com';
 h.ctx.location.search='?bb2Preview=1';
 h.ctx.bvomBb2InjectProgramChoice();
 assert.equal(row.children.length,0,'even a URL flag cannot expose BB2 on production');
 console.log('PASS: BB2 development preview not visible on normal or production URLs');
}

{
 const {h,before,row}=fixture();
 h.ctx.location.origin='http://localhost:8000';
 h.ctx.location.search='?bb2Preview=1';
 h.ctx.bvomBb2InjectProgramChoice();
 h.ctx.bvomBb2InjectProgramChoice();
 assert.equal(row.children.length,1,'one BB2 button next to existing Bodybuilding program');
 assert.equal(row.children[0].dataset.bb2Preview,'1');
 // Browser import itself is covered separately by the browser-core bundle test.
 // Supply the exact generated module and run the actual application renderer.
 h.ctx.__bb2CatalogueForTest=catalogue;
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest;'+
  'bvomBb2PreviewDraft=bvomBb2PreviewModule.createBB2Setup();'+
  'bvomBb2PreviewOpen=true;bvomBb2RenderPreview()');
 const html=()=>h.ctx.document.querySelector('#setup').innerHTML;
 assert.match(html(),/BODYBUILDING 2 · SETUP PREVIEW/);
 for(const template of ['upper_a','lower_a','upper_b','lower_b']){
  assert.match(html(),new RegExp(`data-bb2-template="${template}"`));
 }
 assert.doesNotMatch(html(),/data-bb2-role="upper_b\|biceps_curl"/,'no default optional curls');
 h.ctx.bvomBb2PreviewChoose('upper_a','shoulder_press','log_push_press');
 assert.match(html(),/2 × 4–6 reps/,'real specialist override from versioned catalogue');
 h.ctx.bvomBb2PreviewCurls(true);
 assert.match(html(),/data-bb2-role="upper_b\|biceps_curl"/);
 assert.equal(h.ls.getItem('bvom_data'),before,'editing the preview never writes BVOM state');
 h.ctx.bvomBb2ClosePreview();
 assert.equal(h.ls.getItem('bvom_data'),before,'closing cannot write a workout');
 assert.equal(h.S().programMode,'lprpt','active program remains LP');
 console.log('PASS: one chooser entry, four days, log override, optional curls, no persisted edits');
}

{
 const {h,row}=fixture();
 h.ctx.location.origin='http://127.0.0.1:8080';
 h.ctx.location.search='?bb2Preview=1';
 h.ev('state.session={Squat:{0:{reps:5,load:60}}}');
 h.ctx.bvomBb2InjectProgramChoice();
 assert.equal(row.children.length,1,'chooser can still render during active workout');
 await h.ctx.bvomBb2OpenPreview();
 assert.equal(h.ctx.document.querySelector('#setup').innerHTML.includes('BODYBUILDING 2 · SETUP PREVIEW'),false);
 console.log('PASS: active workout cannot open BB2 preview');
}

console.log('BB2 BVOM integrated setup preview: 3/3 PASS');
