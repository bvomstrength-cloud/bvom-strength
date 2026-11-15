'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(process.env.BVOM_APP_ROOT||path.resolve(__dirname,'../..'));
const H=require(path.join(root,'tests/bvom-lab/lib/bvom_harness'));
const O=require('./oracle.cjs');
const out=path.resolve(process.env.BVOM_MONKEY_OUT||path.join(root,'artifacts/monkey-v304'));fs.mkdirSync(path.join(out,'screenshots'),{recursive:true});
function fixture(profile){
 const h=H.boot(H.loadBuild(root),{supabase:null,online:false});H.configureLP(h,profile.weights||{Squat:60,'Bench Press':40,'Prone Row':40,'Overhead Press':30,Deadlift:80});
 const s=h.S();s.accessoryList=[];s.gppList=[];s.history=[];s.language=profile.lang||'en';
 if(profile.mode==='bodybuilding'){
  H.bbStart(h);s.bodybuilding.selections.A1='dumbbell_bench_press';s.bodybuilding.selections.A2='high_bar_squat';
  s.bodybuilding.progression.dumbbell_bench_press={load:24,topLoad:24,increment:2};s.bodybuilding.progression.high_bar_squat={load:80,topLoad:80,increment:2.5};
 }else if(profile.mode==='free'){
  s.programMode='free';s.day='1';s.freeTraining={selectedDay:1,nextDayId:3,days:[{id:'ft1',compounds:[{lift:'Squat',weight:60,sets:3,reps:5,style:'straight',dropPct:10,rptLevel:0,optionalSingle:false}]},{id:'ft2',compounds:[{lift:'Bench Press',weight:40,style:'rpt3',dropPct:5,rptLevel:0,optionalSingle:false}]}]};h.ev('bvomFtEnsure()');
 }else if(profile.mode!=='bb2'){
  s.programMode=profile.mode;s.day=profile.mode==='hlm'?'H':profile.mode==='fourday'?'1':'A';
  if(profile.mode!=='lprpt'){s.hlm.driver={Squat:s.weights.Squat,'Bench Press':s.weights['Bench Press']};s.hlm.driverInitialized=true;s.hlm.rep={Squat:profile.rep||5,'Bench Press':profile.rep||5};}
  s.core['Bench Press'].mode=profile.mode==='lprpt'?'rpt':'straight';s.core['Overhead Press'].mode='rpt';
 }
 h.ev('save()');return O.copy(s);
}
async function start(){
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local');if(url.pathname==='/seed'){res.end('<!doctype html><title>Disposable audit context</title>');return;}
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':/\.html$/.test(file)?'text/html':/\.json$/.test(file)?'application/json':/\.png$/.test(file)?'image/png':'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.BVOM_CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 async function device(profile,{workers='block',data=fixture(profile),owner:explicitOwner=null,localCloud=null}={}){
  const context=await browser.newContext({serviceWorkers:workers,viewport:{width:profile.width||390,height:844},isMobile:true,hasTouch:true});context.setDefaultTimeout(30000);
  if(localCloud&&!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(localCloud.url))throw Error('Cloud audit refuses a hosted endpoint');
  const rejected=[];await context.route('**/*',r=>{const target=new URL(r.request().url()).origin;if(target===origin||localCloud&&target===localCloud.url)return r.continue();rejected.push(r.request().url());return r.abort();});
  if(localCloud)await context.addInitScript(({url,key})=>{let sdk;Object.defineProperty(window,'supabase',{configurable:true,get:()=>sdk,set(value){sdk=value;const create=value.createClient.bind(value);value.createClient=(_url,_key,options)=>create(url,key,options);}});},localCloud);
  await context.addInitScript(()=>{
   Object.defineProperty(navigator,'onLine',{get:()=>false});
   const NativeDate=Date;class AuditDate extends NativeDate{constructor(...args){super(...(args.length?args:[AuditDate.now()]));}static now(){const t=Number(sessionStorage.getItem('audit-now'));return t||NativeDate.now();}}window.Date=AuditDate;
  });
  const page=await context.newPage();const owner=explicitOwner||'fictional-'+profile.name.toLowerCase();
  await page.goto(origin+'/seed');await page.evaluate(({data,owner})=>{localStorage.setItem('bvom_data',JSON.stringify(data));localStorage.setItem('bvom_data_owner',owner);localStorage.setItem('bvom_entitlement_cache_'+owner,JSON.stringify({userId:owner,verifiedAt:new Date().toISOString(),record:{user_id:owner,status:'complimentary'}}));},{data,owner});
  await page.goto(origin+'/index.html');await ready(page);
  return {page,context,owner,rejected};
 }
 return {server,origin,browser,device,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}
async function ready(p){await p.waitForSelector('#app:not(.hidden)');await p.waitForFunction(()=>typeof bvomWindowLockOwned!=='undefined'&&bvomWindowLockOwned===true);}
async function stored(p){return p.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));}
async function now(p,t,{verify=false,owner}={}){await p.evaluate(({t,verify,owner})=>{sessionStorage.setItem('audit-now',String(t));if(verify)localStorage.setItem('bvom_entitlement_cache_'+owner,JSON.stringify({userId:owner,verifiedAt:new Date().toISOString(),record:{user_id:owner,status:'complimentary'}}));},{t,verify,owner});}
async function rest(p,ms=90000){await p.evaluate(ms=>sessionStorage.setItem('audit-now',String(Date.now()+ms)),ms);}
async function tab(p,id){await p.locator('.tab[data-tab="'+id+'"]').evaluate(e=>e.click());}
async function settle(p,{right=false}={}){
 const decisions=[];
 for(let k=0;k<12;k++){
  const found=await p.evaluate(right=>{
   const m=[...document.querySelectorAll('.bvomModalOverlay')].at(-1);if(!m)return null;
   if(m.querySelector('input,textarea,[data-v]'))return {stop:true,text:m.textContent.slice(0,150)};
   const b=m.querySelector('[data-ok]')||m.querySelector(right?'[data-r]':'[data-l]')||m.querySelector('[data-c],[data-cancel]');
   if(!b)return {stop:true,text:m.textContent.slice(0,150)};
   const text=m.textContent;b.click();return {text};
  },right);
  if(!found||found.stop)break;decisions.push(found.text);
 }
 return decisions;
}
async function rep(p,reps){
 await settle(p);
 await p.evaluate(reps=>{const m=[...document.querySelectorAll('.bvomModalOverlay')].at(-1);if(!m?.querySelector('[data-v]'))throw Error('missing real rep dialog');let n=Number(m.querySelector('[data-v]').textContent);while(n>reps){m.querySelector('[data-m]').click();n--;}while(n<reps){m.querySelector('[data-p]').click();n++;}(m.querySelector('[data-ok]')||m.querySelector('[data-s]')).click();},reps);
}
async function finish(p,note,{incomplete=false}={}){
 await tab(p,'workout');await p.locator('#timerbar .finish').evaluate(e=>e.click());
 if(incomplete){const b=p.locator('.bvomModalOverlay [data-finish],.bvomModalOverlay [data-r],.bvomModalOverlay [data-accept]').last();await b.evaluate(e=>e.click());}
 const n=p.locator('.bvomModalOverlay [data-note]');if(await n.count()){await n.fill(note);await p.locator('.bvomModalOverlay [data-save]').evaluate(e=>e.click());}
 await settle(p);await p.waitForFunction(()=>!window.__bvomFinishBusy);await p.waitForTimeout(700);await settle(p);
}
class Evidence{
 constructor(name,profile){this.name=name;this.profile=profile;this.path=path.join(out,name.toLowerCase());fs.mkdirSync(this.path,{recursive:true});this.stats={sessions:0,completed:0,incomplete:0,setSaves:0,retainedSets:0,extras:0,assertions:0,failedAssertions:0,corrections:0};this.failures=[];this.weeks=[];this.actions=[];}
 action(type,details={}){const x={ordinal:this.actions.length+1,type,...details};this.actions.push(x);fs.appendFileSync(path.join(this.path,'actions.jsonl'),JSON.stringify(x)+'\n');return x;}
 check(label,actual,expected,details={}){this.stats.assertions++;const normal=v=>v===undefined?null:JSON.parse(JSON.stringify(v));actual=normal(actual);expected=normal(expected);const pass=require('node:util').isDeepStrictEqual(actual,expected);const entry={label,pass,actual,expected,...details};fs.appendFileSync(path.join(this.path,'comparisons.jsonl'),JSON.stringify(entry)+'\n');if(!pass){this.stats.failedAssertions++;this.failures.push(entry);}return pass;}
 snapshot(week,state,expected){fs.writeFileSync(path.join(this.path,'week-'+String(week).padStart(2,'0')+'.json'),JSON.stringify({week,state,expected},null,2));this.weeks.push(week);this.write();}
 write(){fs.writeFileSync(path.join(this.path,'summary.json'),JSON.stringify({name:this.name,profile:this.profile,stats:this.stats,weeks:this.weeks,failures:this.failures},null,2));}
}
module.exports={root,out,fixture,start,ready,stored,now,rest,tab,settle,rep,finish,Evidence};
