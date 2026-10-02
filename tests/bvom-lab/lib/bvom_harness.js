'use strict';
// BVOM behavioural harness — boots a build's REAL inline application script in a Node vm.
// Only the platform is simulated (DOM shell, storage, timers, network client). All BVOM
// logic, including progression, persistence, rendering, finishing and boot/access gating,
// runs from the build under test. Modal *answers* are scripted; modal *code* is not replaced
// unless a helper explicitly says so.
const fs=require('fs'),path=require('path'),vm=require('vm'),nodeCrypto=require('crypto');

function extractAppScript(html){
  // The application script is the inline <script> block that follows the supabase-js CDN tag.
  const cdn=html.indexOf('supabase-js');
  const start=html.indexOf('<script>',cdn<0?0:cdn);
  const end=html.lastIndexOf('</script>');
  if(start<0||end<=start)throw new Error('inline application script not found');
  return html.slice(start+8,end);
}
function loadBuild(dir){
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  return {dir,html,script:extractAppScript(html),i18n:['i18n/en.js','i18n/ja.js'].map(f=>fs.readFileSync(path.join(dir,f),'utf8'))};
}
function memStore(init={}){const m=new Map(Object.entries(init));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size},_map:m}}
function mkEl(tag='div',initialClasses=[]){
  const cls=new Set(initialClasses),q={};
  const e={tagName:String(tag).toUpperCase(),children:[],style:{},dataset:{},attrs:{},value:'',checked:false,removed:false,
    classList:{add:(...a)=>a.forEach(x=>cls.add(x)),remove:(...a)=>a.forEach(x=>cls.delete(x)),toggle:(x,f)=>{const on=f===undefined?!cls.has(x):!!f;on?cls.add(x):cls.delete(x);return on},contains:x=>cls.has(x)},
    appendChild(c){this.children.push(c);return c},removeChild(){},remove(){this.removed=true},insertBefore(c){return c},append(){},prepend(){},
    setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]??null},removeAttribute(k){delete this.attrs[k]},
    addEventListener(){},removeEventListener(){},focus(){},blur(){},select(){},scrollIntoView(){},
    click(){if(this.onclick)this.onclick({preventDefault(){},stopPropagation(){}})},
    querySelector(s){return q[s]||(q[s]=mkEl())},querySelectorAll(){return[]},closest(){return null},
    insertAdjacentHTML(){},replaceChildren(){},getBoundingClientRect(){return{top:0,left:0,width:0,height:0}},contains(){return true},cloneNode(){return mkEl()},_inner:''};
  Object.defineProperty(e,'innerHTML',{get(){return this._inner},set(v){this._inner=String(v)}});
  Object.defineProperty(e,'textContent',{get(){return this._inner},set(v){this._inner=String(v)}});
  return e;
}
// Boot the real app. opts.supabase: 'inert' (default: client whose calls resolve empty),
// null (CDN script missing), or a supabase-js-shaped library object.
function boot(build,{ls=memStore(),supabase='inert',online=true}={}){
  // Mirror index.html: #app and #authgate start hidden.
  const els={'#app':mkEl('div',['hidden']),'#authgate':mkEl('div',['setup','hidden']),'#setup':mkEl('div',['setup'])};
  const log=[],timers=[];
  const document={body:mkEl('body'),documentElement:mkEl('html'),head:mkEl('head'),visibilityState:'visible',title:'',
    getElementById:id=>els['#'+id]||(els['#'+id]=mkEl()),querySelector:s=>els[s]||(els[s]=mkEl()),querySelectorAll:()=>[],
    createElement:t=>mkEl(t),createTextNode:t=>({nodeValue:t}),addEventListener(){}};
  const ctx={console:{log(){},warn(){},error(){},info(){},debug(){}},localStorage:ls,sessionStorage:memStore(),document,
    navigator:{language:'en-AU',onLine:online,userAgent:'bvom-harness'},
    location:{href:'https://bvom.test/',search:'',hash:'',origin:'https://bvom.test',pathname:'/',reload(){log.push(['reload'])},replace(){}},
    history:{replaceState(){},pushState(){}},
    setTimeout:(f)=>{timers.push(f);return timers.length},clearTimeout(){},setInterval:()=>1,clearInterval(){},requestAnimationFrame:()=>0,
    alert:m=>log.push(['alert',String(m)]),confirm:m=>{log.push(['confirm',String(m)]);return true},prompt:m=>{log.push(['prompt',String(m)]);return null},
    Date,Math,JSON,Promise,URL,URLSearchParams,crypto:nodeCrypto.webcrypto,
    fetch:async()=>{throw new TypeError('Failed to fetch')},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),
    Audio:function(){return{play(){return Promise.resolve()}}},addEventListener(){},removeEventListener(){},scrollTo(){},getComputedStyle:()=>({}),
    Blob:function(){},FileReader:function(){},performance:{now:()=>Date.now()}};
  ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;
  if(supabase==='inert')ctx.supabase={createClient:()=>new Proxy({},{get:()=>new Proxy(function(){},{get:()=>()=>Promise.resolve({data:null,error:null}),apply:()=>Promise.resolve({data:null,error:null})})})};
  else if(supabase)ctx.supabase=supabase;
  vm.createContext(ctx);
  for(const src of build.i18n)vm.runInContext(src,ctx);
  vm.runInContext(build.script+'\n;globalThis.__bvomHarnessEval=(expr)=>eval(expr);',ctx,{filename:'index.html#app'});
  const h={ctx,els,log,timers,ls,
    S:()=>ctx.__bvomHarnessEval('state'),
    ev:x=>ctx.__bvomHarnessEval(x),
    fn:n=>ctx[n],
    overlays:()=>document.body.children,
    lastOverlay:()=>document.body.children[document.body.children.length-1],
    flush(){for(let k=0;k<6;k++){const t=timers.splice(0);if(!t.length)break;for(const f of t){try{f()}catch(e){}}}},
    visible:sel=>!els[sel].classList.contains('hidden'),
    reps:[],choices:[]};
  // Scripted answers for BVOM's rep and choice modals (the dialog wrappers only).
  ctx.bvomRepModal=(title,w,target,initial,onSave)=>onSave(h.reps.length?h.reps.shift():initial,8);
  ctx.bvomChoiceModal=(title,body,l,r,onL,onR)=>{const pick=h.choices.length?h.choices.shift():'L';log.push(['choice',String(title),pick]);const f=pick==='R'?onR:onL;f&&f()};
  ctx.bvomSessionNoteModal=(initial,onSave)=>onSave('');
  ctx.bvomIncompleteConfirm=(onFinish)=>{log.push(['incompleteConfirm']);onFinish()};
  return h;
}
const text=html=>String(html||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const LP_W={Squat:100,'Bench Press':70,'Prone Row':60,'Overhead Press':45,Deadlift:120};
function configureLP(h,weights=LP_W){const S=h.S();Object.assign(S.weights,weights);S.configured=true;S.programMode='lprpt';S.day='A';S.session={};h.ev('ensureHLM()');h.ev('save()')}
function finish(h){h.ctx.__bvomFinishBusy=false;h.ctx.finishWorkout();h.flush()}
const BB_LOADS={machine_chest_press:60,hack_squat:100,chest_supported_row:50,seated_leg_curl:40,cable_lateral_raise:10,cable_pushdown:25,lat_pulldown:55,romanian_deadlift:80,incline_dumbbell_press:24,leg_extension:45,reverse_pec_deck:30,cable_curl:20};
function bbStart(h,{loads=BB_LOADS,incs={},onramp=false}={}){
  h.S().configured=true;h.ctx.chooseProgramMode('bodybuilding');h.ctx.__bvomBbSetupDraft=null;
  h.ctx.bvomBbOnRampSetupMode(onramp?'onramp':'manual');
  if(!onramp)for(const[id,l]of Object.entries(loads)){h.ctx.bvomBbSetupValue(id,'load',l);h.ctx.bvomBbSetupValue(id,'increment',incs[id]??2.5)}
  h.ctx.bvomBbCommitSetup();
}
const attr=(html,sel)=>(html.match(new RegExp('<input '+sel+'[^>]*value="([^"]*)"'))||[])[1]??'';
// Drive the REAL Bodybuilding set dialog: open it, fill its inputs, press RECORD.
function bbSet(h,id,i,{reps,load,hard=false,cal='about_right'}={}){
  h.ctx.bvomBbSetModal(id,i);const o=h.lastOverlay(),html=o.innerHTML;
  o.querySelector('[data-load]').value=String(load??attr(html,'data-load'));
  o.querySelector('[data-reps]').value=String(reps??attr(html,'data-reps'));
  o.querySelector('[data-hard]').checked=hard;
  o.querySelector('[data-res]').value=attr(html,'data-res')||'green band';
  o.querySelector('[data-cal]').value=html.includes('data-cal')?cal:undefined;
  if(!html.includes('data-cal'))o.querySelector('[data-cal]').value=undefined;
  o.querySelector('[data-save]').onclick();
}
// Drive the REAL On-Ramp set dialog.
function orSet(h,id,i,{reps,load,feel='about_right',inc='2.5'}={}){
  h.ctx.bvomBbOnRampSetModal(id,i);const o=h.lastOverlay(),html=o.innerHTML;
  o.querySelector('[data-load]').value=String(load??attr(html,'data-load'));
  o.querySelector('[data-inc]').value=String(attr(html,'data-inc')||inc);
  o.querySelector('[data-reps]').value=String(reps??attr(html,'data-reps'));
  o.querySelector('[data-res]').value='green band';
  o.querySelector('[data-feel]').value=html.includes('data-feel')?feel:undefined;
  o.querySelector('[data-save]').onclick();
}
function bbDayIds(h){const S=h.S(),on=h.ctx.bvomBbOnRampActive();return(on?h.ctx.bvomBbOnRampSlots(h.ctx.bvomBbOnRampDay()):h.ctx.bvomBbSlotsForDay(h.ctx.bvomBbDay())).map(s=>S.bodybuilding.selections[s])}
// Complete a whole main-block session through the real dialogs. Default: top 7 (hold), others at max.
function bbSession(h,override=()=>({})){for(const id of bbDayIds(h)){const rx=h.ctx.bvomBbPrescription(id);for(let i=0;i<rx.sets.length;i++)bbSet(h,id,i,{reps:rx.sets[i].type==='top'?7:rx.sets[i].maxReps,...override(id,i,rx.sets[i])})}finish(h)}
function orSession(h,override=()=>({})){for(const id of bbDayIds(h)){const e=h.ctx.bvomBbOnRampEx(id),n=h.ctx.bvomBbOnRampSetCount(id),first=e.state==='UNSET';for(let i=0;i<n;i++){const r=h.ctx.bvomBbOnRampTarget(id);orSet(h,id,i,{load:first&&i===0?BB_LOADS[id]:undefined,reps:Math.min(r[1],r[0]+1),...override(id,i,e)})}}finish(h)}
function withClock(fn){const real=Date.now;let t=Date.UTC(2026,8,30,8,0,0);Date.now=()=>t;const clock={advance:ms=>{t+=ms},now:()=>t};try{return fn(clock)}finally{Date.now=real}}
// Controlled Supabase-js v2 surface: auth session, entitlement RPC, bvom_data table.
function mockSupabase({net,user={id:'user-1',email:'lifter@example.com'},entitlement=[{status:'subscriber',user_id:'user-1'}],session=true,refreshImpossibleOffline=false,signOutFailsOffline=false}){
  const offline={data:null,error:{message:'TypeError: Failed to fetch'}};let row=null;const authListeners=[];
  const res=ok=>net.online?Promise.resolve(ok()):Promise.resolve(offline);
  const table=()=>{const q={op:'select'};const p=new Proxy({},{get(_,k){
    if(k==='then')return(a,b)=>res(()=>q.op==='select'?{data:row?[row]:[],error:null}:q.op==='insert'?(row={id:'r1',data:q.v.data,created_at:new Date().toISOString()},{data:{id:'r1'},error:null}):(row={...row,data:q.v.data},{data:{id:row.id},error:null})).then(a,b);
    if(k==='insert'||k==='update')return v=>{q.op=k;q.v=v;return p};return()=>p}});return p};
  const client={auth:{
      getSession:async()=>{if(!session)return{data:{session:null},error:null};if(refreshImpossibleOffline&&!net.online)return{data:{session:null},error:{message:'AuthRetryableFetchError: Failed to fetch'}};return{data:{session:{user,access_token:'t'}},error:null}},
      onAuthStateChange:(cb)=>{authListeners.push(cb);return{data:{subscription:{unsubscribe(){}}}}},
      signOut:async()=>signOutFailsOffline&&!net.online?{error:{message:'AuthRetryableFetchError: Failed to fetch'}}:{error:null}},
    rpc:()=>res(()=>({data:entitlement,error:null})),from:()=>table()};
  return {createClient:()=>client,_emitAuth(event,nextSession=null){for(const cb of authListeners)cb(event,nextSession)}};
}
async function launch(build,{ls,net,supabase}){const h=boot(build,{ls,supabase,online:net.online});await h.ctx.bvomCloudInit();for(let k=0;k<4;k++){await new Promise(r=>setImmediate(r));h.flush()}return h}
module.exports={loadBuild,extractAppScript,memStore,boot,text,configureLP,finish,bbStart,bbSet,orSet,bbDayIds,bbSession,orSession,withClock,mockSupabase,launch,LP_W,BB_LOADS};
