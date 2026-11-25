'use strict';
// Actual Chromium-installed desktop web app, not a fake standalone media query.
// CDP installs/launches the real manifest in a disposable persistent profile.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),a=require('node:assert/strict');
const {chromium}=require('playwright'),P=require('./platform.cjs');
const roots=[path.resolve(process.env.BVOM_SW_BASELINE_ROOT||'/workspace/bvom-v303-audit'),P.root],profile=fs.mkdtempSync(path.join(os.tmpdir(),'bvom-installed-pwa-'));
const builds=roots.map(root=>fs.readFileSync(path.join(root,'index.html'),'utf8').match(/const BVOM_BUILD='([^']+)'/)[1]);
const [hadRdl,hasRdl]=roots.map(root=>fs.readFileSync(path.join(root,'index.html'),'utf8').includes('core.romanian_deadlift'));
const rdlUpgrade=hasRdl&&!hadRdl;
const checks=[],actions=[];let context,control,version=0,server,origin,manifestId,app;
const eq=(label,actual,expected)=>{a.deepEqual(actual,expected,label);checks.push({label,actual,expected,pass:true})};
const click=(p,fn)=>p.locator('[onclick='+JSON.stringify(fn)+']').first().evaluate(e=>e.click());
async function stored(p){return P.stored(p)}
async function openContext(){
 context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.BVOM_CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox'],viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'allow'});
 context.setDefaultTimeout(30000);await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));control=await context.browser().newBrowserCDPSession();
}
async function launch(){
 const pending=context.waitForEvent('page');const target=await control.send('PWA.launch',{manifestId});await pending;app=null;
 for(let attempt=0;attempt<50&&!app;attempt++){
  for(const page of context.pages())if(!page.isClosed()&&page.url().startsWith(origin)&&await page.evaluate(()=>matchMedia('(display-mode:standalone)').matches).catch(()=>false)){app=page;break}
  if(!app)await new Promise(r=>setTimeout(r,100));
 }
 if(!app)throw Error('No standalone installed-app window was attached');await P.ready(app);await app.waitForFunction(()=>bvomCloud.offlineLocalAccess);
 const info=await (await context.newCDPSession(app)).send('Target.getTargetInfo');actions.push({type:'native-launch',launchTarget:target.targetId,attachedTarget:info.targetInfo.targetId,url:app.url()});
 eq('Native launched app uses manifest origin',new URL(app.url()).origin,origin);eq('Installed app is standalone',await app.evaluate(()=>matchMedia('(display-mode:standalone)').matches),true);return app;
}
async function main(){
 server=http.createServer((req,res)=>{const n=new URL(req.url,'http://local').pathname.replace(/^\//,'')||'index.html';if(n==='seed'){res.end('<title>Disposable PWA fixture</title>');return}const f=path.resolve(roots[version],n);if(!f.startsWith(roots[version]+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end()}res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',n.endsWith('.html')?'text/html':n.endsWith('.json')?'application/manifest+json':/\.m?js$/.test(n)?'text/javascript':n.endsWith('.svg')?'image/svg+xml':'image/png');res.end(fs.readFileSync(f))});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 const manifest=JSON.parse(fs.readFileSync(path.join(roots[0],'manifest.json')));manifestId=new URL(manifest.id||manifest.start_url,origin+'/').href;
 try{
  eq('Manifest identity unchanged',fs.readFileSync(path.join(roots[0],'manifest.json'),'utf8'),fs.readFileSync(path.join(roots[1],'manifest.json'),'utf8'));
  await openContext();const seed=context.pages()[0],owner='fictional-native-pwa',data=P.fixture({name:'Native',mode:'lprpt',weights:{Squat:60,'Bench Press':40,'Prone Row':40,'Overhead Press':30,Deadlift:80}});
  if(rdlUpgrade)for(const k of ['weights','core','barByLift','plateMode'])delete data[k]['Romanian Deadlift'];
  await seed.goto(origin+'/seed');await seed.evaluate(({data,owner})=>{localStorage.setItem('bvom_data',JSON.stringify(data));localStorage.setItem('bvom_data_owner',owner);localStorage.setItem('bvom_entitlement_cache_'+owner,JSON.stringify({userId:owner,verifiedAt:new Date().toISOString(),record:{user_id:owner,status:'complimentary'}}))},{data,owner});
  await seed.goto(origin+'/index.html');await P.ready(seed);await seed.evaluate(()=>navigator.serviceWorker.ready);
  const pageControl=await context.newCDPSession(seed);await pageControl.send('PWA.install',{manifestId,installUrl:origin+'/index.html'});await pageControl.send('PWA.changeAppUserSettings',{manifestId,displayMode:'standalone'});actions.push({type:'actual-native-install',manifestId,osState:await control.send('PWA.getOsAppState',{manifestId})});await seed.goto(origin+'/seed');
  await launch();eq('Installed baseline build',await app.evaluate(()=>BVOM_BUILD),builds[0]);let sets=0;
  const names=await app.evaluate(()=>program().map(x=>x[0]));
  for(const n of names)for(let i=0;i<await app.evaluate(n=>getSetPlan(n).length,n);i++){const q=await app.evaluate(({n,i})=>getSetPlan(n)[i],{n,i});await click(app,"tapSet('"+n+"',"+i+")");await P.rep(app,q.target);await P.settle(app);sets++;actions.push({type:'baseline-prescribed-set',n,index:i,load:q.load,reps:q.target})}
  await P.finish(app,'Native installed baseline completed workout');eq('Baseline completed History count',(await stored(app)).history.length,1);eq('Baseline prescribed sets actually recorded',sets,9);
  await P.tab(app,'workout');await click(app,"tapSet('Squat',0)");await P.rep(app,5);eq('Interrupted next workout actual load',(await stored(app)).session.Squat[0].load,62.5);const interrupted=await stored(app);
  version=1;await app.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update()});await app.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);eq('Active workout defers the update control',await app.locator('#bvomUpdateBanner [data-bvom-update]').isVisible(),false);
  eq('Active-workout update is refused',await app.evaluate(()=>BVOM_BUILD),builds[0]);eq('Refused update keeps actuals',(await stored(app)).session,interrupted.session);eq('Refused update keeps History',(await stored(app)).history,interrupted.history);
  await P.finish(app,'Native installed baseline interrupted workout',{incomplete:true});const before=await stored(app);eq('Interrupted workout saved explicitly',before.history.at(-1).incomplete,true);
  await app.locator('#bvomUpdateBanner [data-bvom-update]').waitFor();await app.locator('#bvomUpdateBanner [data-bvom-update]').click();await app.waitForFunction(build=>typeof BVOM_BUILD!=='undefined'&&BVOM_BUILD===build,builds[1]);await P.ready(app);
  const after=await stored(app);
  for(const k of ['history','weights','core','attempts','processed','processedSnapshots','pbs','unit','programMode','hlm']){
   const current=rdlUpgrade&&['weights','core'].includes(k)?Object.fromEntries(Object.entries(after[k]).filter(([n])=>n!=='Romanian Deadlift')):after[k];
   eq('Native update preserves '+k,current,before[k]);
  }
  if(rdlUpgrade){
   eq('RDL seeded from last recorded A squat',after.weights['Romanian Deadlift'],before.history.at(-1).session.Squat[0].load);
   eq('RDL independent core mode',after.core['Romanian Deadlift'].mode,'straight');
  }
  eq('Single service-worker scope after native upgrade',await app.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),1);eq('No second waiting worker',await app.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),false);eq('Still standalone after upgrade',await app.evaluate(()=>matchMedia('(display-mode:standalone)').matches),true);
  await app.screenshot({path:path.join(P.out,'screenshots','installed-pwa-updated.png'),fullPage:true});await context.close();context=null;
  await openContext();await launch();eq('Persistent installed app launches updated build',await app.evaluate(()=>BVOM_BUILD),builds[1]);eq('Native relaunch keeps both History records',(await stored(app)).history,before.history);
  await context.setOffline(true);await P.tab(app,'workout');await click(app,"tapSet('Squat',0)");await P.rep(app,5);const offline=await stored(app);await app.reload();await P.ready(app);eq('Installed offline reload preserves actuals',(await stored(app)).session,offline.session);eq('Offline relaunch creates no duplicate History',(await stored(app)).history,before.history);await context.setOffline(false);
  actions.push({type:'native-upgrade-and-relaunch',manifestId,savedSessions:2,savedSets:10,additionalActiveSets:1,osState:await control.send('PWA.getOsAppState',{manifestId})});console.log('PASS',checks.length,'actual installed Chromium PWA upgrade assertions; 2 saved sessions, 11 set saves');
 }catch(error){if(app&&!app.isClosed())await app.screenshot({path:path.join(P.out,'screenshots','native-pwa-failure.png'),fullPage:true}).catch(()=>{});throw error}
 finally{if(control)try{await control.send('PWA.uninstall',{manifestId})}catch{}if(context)await context.close();await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});fs.writeFileSync(path.join(P.out,'native-pwa-upgrade.json'),JSON.stringify({platform:'Linux Chromium installed desktop PWA; physical Android/iOS not tested',checks,total:checks.length,actions},null,2))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
