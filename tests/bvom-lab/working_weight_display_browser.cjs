const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');const root=process.env.BVOM_APP_ROOT||path.resolve(__dirname,'../..'),H=require(path.join(__dirname,'lib/bvom_harness')),build=H.loadBuild(root);
const out=[];function fixture(mode){const h=H.boot(build,{supabase:null,online:false});H.configureLP(h);h.S().accessoryList=[];h.S().gppList=[];if(mode==='bb1'||mode==='onramp')H.bbStart(h,{onramp:mode==='onramp'});else if(mode==='free'){h.S().programMode='free';h.S().day='1';h.S().freeTraining={selectedDay:1,nextDayId:2,days:[{id:'ft1',compounds:[{lift:'Squat',weight:60,sets:3,reps:5,style:'straight'}]}]};h.ev('bvomFtEnsure();save()')}else if(mode!=='lprpt'){h.S().programMode=mode;h.S().day=mode==='hlm'?'H':'1';h.ev('ensureHLM();save()')}return JSON.parse(JSON.stringify(h.S()))}
const server=http.createServer((req,res)=>{let p=new URL(req.url,'http://local').pathname;if(p==='/seed')return res.end('<html>seed</html>');if(p.startsWith('/vendor/'))return res.end('/* no external service */');const f=path.join(root,p==='/'?'index.html':p);if(!fs.existsSync(f)) {res.statusCode=404;return res.end()}res.setHeader('Content-Type',/\.m?js$/.test(f)?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(f))});
let browser,origin;
async function boot(data){const c=await browser.newContext({serviceWorkers:'block'});c.setDefaultTimeout(6500);await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await c.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));const p=await c.newPage();p.on('pageerror',e=>console.error('PAGE',e.message));await p.goto(origin+'/seed');await p.evaluate(d=>{localStorage.setItem('bvom_data',JSON.stringify(d));localStorage.setItem('bvom_data_owner','audit-owner');localStorage.setItem('bvom_entitlement_cache_audit-owner',JSON.stringify({userId:'audit-owner',verifiedAt:new Date().toISOString(),record:{user_id:'audit-owner',status:'complimentary'}}))},data);await p.goto(origin+'/index.html');await ready(p);return {c,p}}
async function ready(p){await p.waitForSelector('#app:not(.hidden)');await p.waitForFunction(()=>bvomWindowLockState!=='starting')}

(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath:process.env.BVOM_CHROMIUM_PATH||undefined,args:['--no-sandbox']});let count=0;try{
 for(const lang of ['en','ja'])for(const[mode,days]of [['lprpt',['A','B']],['hlm',['H','L','M']],['fourday',['1','2','3','4']]])for(const day of days){
  const d=fixture(mode);d.day=day;d.weights.Squat=105;if(mode==='lprpt'&&day==='B')d.core['Overhead Press'].mode='rpt';
  const{c,p}=await boot(d);await p.setViewportSize({width:360,height:800});await p.evaluate(lang=>{state.language=lang;save();renderAll()},lang);
  const weights=await p.locator('#workout .exercise[id^="work-"] .weight').allTextContents();
  // Exercise real rep dialogs, including dynamic optional singles.
  await p.evaluate(()=>{for(const[n]of program())for(let i=0;i<getSetPlan(n).length;i++){tapSet(n,i);document.querySelector('.bvomModalOverlay [data-ok]').click()}});
  assert.deepEqual(await p.locator('#workout .exercise[id^="work-"] .weight').allTextContents(),weights);
  if(mode==='lprpt'&&day==='A'){assert.match(await p.locator('#work-Squat').textContent(),lang==='ja'?/次のワークアウト: 107.5 kg/:/Next workout: 107.5 kg/);assert.equal(await p.locator('#work-Squat .weight').textContent(),'105 kg')}
  const before=await p.evaluate(()=>JSON.stringify({weights:state.weights,attempts:state.attempts,hlm:state.hlm}));
  await p.reload();await ready(p);assert.deepEqual(await p.locator('#workout .exercise[id^="work-"] .weight').allTextContents(),weights);assert.equal(await p.evaluate(()=>JSON.stringify({weights:state.weights,attempts:state.attempts,hlm:state.hlm})),before);
  const n=await p.evaluate(()=>program()[0][0]),card=p.locator('#work-'+n.replace(/\W/g,''));
  await card.locator('.weight').click();await p.locator('.bvomModalOverlay [data-w]').fill('112.5');await p.locator('.bvomModalOverlay [data-s]').click();assert.equal(await card.locator('.weight').textContent(),'112.5 kg');assert.equal(await card.locator('[data-next-workout-weight]').count(),0);
  await p.reload();await ready(p);assert.equal(await card.locator('.weight').textContent(),'112.5 kg');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  for(const el of await p.locator('[data-next-workout-weight]').all()){const box=await el.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=360)}
  if(process.env.BVOM_SCREENSHOT_DIR){fs.mkdirSync(process.env.BVOM_SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.BVOM_SCREENSHOT_DIR,mode+'-'+day+'-'+lang+'.png'),fullPage:true})}
  console.log('PASS current/future weight, reload, manual edit, mobile layout: '+[mode,day,lang].join('/'));count++;await c.close();
 }
 console.log('RESULT '+count+' EN/JA mobile journeys');
}finally{await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
