'use strict';
// Targeted contracts run the shipped inline application. Only DOM/platform are
// simulated here; separate Chromium and real-Auth tests prove the user paths.
const fs=require('node:fs'),path=require('node:path'),a=require('node:assert/strict');
const H=require('../bvom-lab/lib/bvom_harness');
const root=path.resolve(process.env.BVOM_APP_ROOT||path.join(__dirname,'../..'));
const build=H.loadBuild(root),copy=x=>JSON.parse(JSON.stringify(x)),checks=[];
// Fixed time makes full-state comparisons include ownership/activity metadata.
const originalNow=Date.now;Date.now=()=>Date.UTC(2026,10,15,8);
function eq(label,actual,expected){a.deepEqual(copy(actual),copy(expected),label);checks.push({label,pass:true})}
function boot(mode='lprpt',day='A'){
 const h=H.boot(build,{supabase:null,online:false});H.configureLP(h);Object.assign(h.S(),{programMode:mode,day,accessoryList:[],gppList:[]});h.ev('ensureHLM();save()');return h;
}
function complete(h,n){for(let i=0;i<h.ctx.getSetPlan(n).length;i++){h.reps.push(h.ctx.getSetPlan(n)[i].target);h.ctx.tapSet(n,i)}}
function extra(h,n){h.ctx.bvomCoreAddExtraSet(n);const o=h.lastOverlay();o.querySelector('[data-load]').value='63.75';o.querySelector('[data-reps]').value='4';o.querySelector('[data-save]').onclick()}
function noOp(h,n,i,rpe=h.S().session[n][i].rpe??8){h.ctx.bvomRepModal=(_t,_w,_target,initial,save)=>save(initial,rpe);h.ctx.tapSet(n,i)}
for(const [mode,days]of [['lprpt',['A','B']],['hlm',['H','L','M']],['fourday',['1','2','3','4']]])for(const day of days)for(const rpt of [false,true]){
 let h=boot(mode,day);
 for(const [n]of h.ctx.program()){
  if(mode==='lprpt')h.S().core[n].mode=rpt?'rpt':'straight';
  extra(h,n);complete(h,n);extra(h,n);
  const before=copy(h.S()),raw=h.ls.getItem('bvom_data');
  for(const i of Object.keys(before.session[n]).filter(k=>/^\d+$/.test(k))){
   noOp(h,n,Number(i));eq(`A01 ${mode}/${day}/${rpt}/${n}/${i} entire state`,h.S(),before);
   eq('A01 unchanged save causes no storage write',h.ls.getItem('bvom_data'),raw);
  }
  if(mode!=='lprpt'){
   const rpe=before.session[n][0].rpe===9?8:9;noOp(h,n,0,rpe);const effort=copy(before);effort.session[n][0].rpe=rpe;
   eq('A01 RPE-only preserves every other field',h.S(),effort);
   eq('A01 RPE-only durable',JSON.parse(h.ls.getItem('bvom_data')).session[n],effort.session[n]);
  }
 }
 const saved=copy(h.S());h=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage,supabase:null,online:false});
 for(const k of ['session','weights','processed','processedSnapshots','hlm','attempts'])eq(`A01 reload ${mode}/${day}/${k}`,h.S()[k],saved[k]);
 const n=h.ctx.program()[0][0],last=copy(h.S().session[n]);
 h.ctx.bvomRepModal=(_t,_w,_target,initial,save)=>save(Math.max(0,initial-1),8);h.ctx.tapSet(n,0);
 eq('A01 meaningful rep correction still removes later prescribed sets',Object.keys(h.S().session[n]).filter(k=>/^\d+$/.test(k)),['0']);
 eq('A01 correction keeps extras',Object.fromEntries(Object.entries(h.S().session[n]).filter(([k])=>k.startsWith('EXTRA:'))),Object.fromEntries(Object.entries(last).filter(([k])=>k.startsWith('EXTRA:'))));
}
// Numeric rep validation on both BB1 paths: rejection cannot alter the timer,
// progression, persistence or session. Deliberate zero remains legal.
for(const onramp of [false,true])for(const raw of ['', ' ', '-3','1.5','NaN','Infinity','9007199254740992']){
 const h=boot();H.bbStart(h,{onramp});const id=h.S().bodybuilding.selections.A1;
 const before=copy(h.S()),stored=h.ls.getItem('bvom_data');
 h.ctx[onramp?'bvomBbOnRampSetModal':'bvomBbSetModal'](id,0);const o=h.lastOverlay();
 o.querySelector('[data-load]').value='24';o.querySelector('[data-inc]').value='2';o.querySelector('[data-reps]').value=raw;o.querySelector('[data-save]').onclick();
 eq('A04 invalid input leaves full state intact '+onramp+'/'+JSON.stringify(raw),h.S(),before);
 eq('A04 invalid input leaves persisted bytes intact',h.ls.getItem('bvom_data'),stored);
 eq('A04 dialog stays open',!!o.removed,false);eq('A04 inline error shown',o.querySelector('[data-bb-validation]').hidden,false);
}
for(const onramp of [false,true]){
 const h=boot();H.bbStart(h,{onramp});const id=h.S().bodybuilding.selections.A1;
 (onramp?H.orSet:H.bbSet)(h,id,0,{reps:0,load:24,inc:'2'});
 eq('A04 explicit zero recorded',h.S().session[(onramp?'BBOR:':'BB:')+id][0].reps,0);
}
// Canonical actual conversion and legacy compatibility, including hundreds of
// toggles. Stored historical records must not be silently rewritten.
for(const mode of ['lprpt','hlm','fourday','bodybuilding','free']){
 const h=boot(mode,mode==='hlm'?'H':mode==='fourday'?'2':'A');
 if(mode==='bodybuilding')H.bbStart(h);
 if(mode==='free'){h.S().programMode='free';h.ev('bvomFtEnsure()');h.S().freeTrainingSession={Squat:{sets:[{load:63.75,reps:4}]}};}
 else h.S().session={Squat:{'EXTRA:0':{load:63.75,reps:4,extra:true}}};
 h.S().history=[{unit:'lb',volume:560,session:{Squat:{0:{load:140,reps:4}}}}];
 h.S().pbs={Squat:{load:63.75,reps:4}};const history=copy(h.S().history);h.ev('save()');
 const actual=()=>mode==='free'?h.S().freeTrainingSession.Squat.sets[0].load:h.S().session.Squat['EXTRA:0'].load;
 h.ctx.changeUnits('lb',true);eq('A05 exact one-way actual '+mode,actual(),63.75*2.2046226218);
 eq('A05 PB identity',h.S().pbs.Squat.load,63.75*2.2046226218);
 for(let i=0;i<100;i++){h.ctx.changeUnits('kg',true);eq('A05 repeat restores original '+mode,actual(),63.75);h.ctx.changeUnits('lb',true)}
 eq('A05 legacy History bytes retained '+mode,h.S().history,history);
 eq('A05 known origin recoverable without guessing',h.ctx.bvomActualLoad({load:140,_unitLoadOrigins:{load:{unit:'kg',value:63.75,convertedUnit:'lb',converted:140}}},'lb'),63.75*2.2046226218);
 eq('A05 unrecoverable legacy actual stays as stored',h.ctx.bvomActualLoad({load:140},'lb'),140);
}
const output=path.resolve(process.env.BVOM_MONKEY_OUT||path.join(root,'artifacts/monkey-v304'));fs.mkdirSync(output,{recursive:true});
// An interrupted v3.0.3 RPT top set can carry an exact origin even though its
// displayed-unit field was rounded. Read that evidence for a newly earned PB;
// never invent precision for a record without an origin.
{
 const h=boot();h.S().core.Squat.mode='rpt';h.S().unit='lb';
 const rx=h.ctx.corePrescription('Squat'),i=rx.topIndex;
 h.S().session.Squat={[i]:{load:140,reps:rx.targets[i],_unitLoadOrigins:{load:{unit:'kg',value:63.75,convertedUnit:'lb',converted:140}}}};
 h.ctx.maybePB('Squat');eq('A05 recoverable interrupted actual PB',h.S().pbs.Squat.load,63.75*2.2046226218);
}
fs.writeFileSync(path.join(output,'repair-contracts.json'),JSON.stringify({sourceRoot:root,checks,total:checks.length},null,2));
console.log('PASS',checks.length,'targeted repair contracts');
Date.now=originalNow;
