'use strict';
// Issue #62 — real narrow-phone Chromium, EN/JA: explicit Bodybuilding
// prescription edits after On-Ramp, preserved state and active-set protection.
// The test uses only synthetic offline data and never contacts real BVOM services.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),
 http=require('node:http'),{chromium}=require('playwright'),H=require('./lib/bvom_harness');
const root=path.resolve(__dirname,'../..'),build=H.loadBuild(root);
function fixture(lang){
 const h=H.boot(build);H.bbStart(h);
 const s=h.S(),b=s.bodybuilding;b.selections.A2='high_bar_squat';
 b.progression.high_bar_squat={load:100,topLoad:100,increment:2.5,calibrated:true,previousSuccessfulLoad:97.5};
 b.performanceRefs.high_bar_squat={'high_bar_squat|100':{load:100,reps:10,updatedAt:'2026-01-01'}};
 s.weights.Squat=145;s.language=lang;s.accessoryList=[];s.gppList=[];
 h.ev('save()');return JSON.parse(JSON.stringify(s));
}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/seed'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>BVOM test seed</title>');return}
 const file=path.resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
 res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':'application/octet-stream','Cache-Control':'no-store'});
 res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({headless:true});
  for(const lang of ['en','ja']){
   const context=await browser.newContext({serviceWorkers:'block',viewport:{width:375,height:812},deviceScaleFactor:1,isMobile:true,hasTouch:true});
   context.setDefaultTimeout(8000);
   await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
   await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
   const seed=await context.newPage();await seed.goto(origin+'/seed');
   await seed.evaluate(data=>{
    localStorage.setItem('bvom_data',JSON.stringify(data));
    localStorage.setItem('bvom_data_owner','bbweight');
    localStorage.setItem('bvom_entitlement_cache_bbweight',JSON.stringify({userId:'bbweight',verifiedAt:new Date().toISOString(),record:{user_id:'bbweight',status:'complimentary'}}));
   },fixture(lang));await seed.close();
   const page=await context.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.message));
   await page.goto(origin+'/index.html');
   await page.waitForSelector('#app:not(.hidden)',{timeout:15000});
   const get=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
   const before=await page.evaluate(()=>({rx:bvomBbPrescription('high_bar_squat'),warm:bvomBbWarmStageBPlan('A2','high_bar_squat')}));
   assert.equal(before.rx.sets[0].load,100);
   const btn=page.locator('#workout #work-bb-A2 [data-bb-edit-weight]');
   assert.equal(await btn.count(),1,'one high-bar prescribed weight button');
   assert.equal(await btn.isEnabled(),true);
   await btn.click();
   const modal=page.locator('.bvomModalOverlay');
   assert.match(await modal.textContent(),lang==='en'?/next working weight/i:/次回のワーキング重量/);
   assert.match(await modal.textContent(),lang==='en'?/progression increment/i:/進行時の増量幅/);
   assert.equal(await modal.locator('[data-bb-increment]').inputValue(),'2.5','existing step appears in Edit Weight');
   assert.match(await modal.textContent(),lang==='en'?/back-off sets/i:/バックオフセット/);
   await modal.locator('[data-bb-increment]').fill('25');
   await modal.locator('[data-save]').click();
   assert.equal(await modal.count(),1,'out-of-range increment remains in modal');
   assert.match(await modal.locator('[data-bb-validation]').textContent(),lang==='en'?/0.01 to 10/i:/0.01～10/);
   await modal.locator('[data-bb-increment]').fill('1');
   await modal.locator('[data-save]').click();
   assert.equal(await modal.count(),0,'increment-only change closes the existing modal');
   let d=await get();
   assert.equal(d.bodybuilding.progression.high_bar_squat.load,100,'increment-only retains load');
   assert.equal(d.bodybuilding.progression.high_bar_squat.previousSuccessfulLoad,97.5,'increment-only retains progression evidence');
   assert.equal(d.bodybuilding.progression.high_bar_squat.increment,1,'increment-only persists');
   const stepOnly=await page.evaluate(()=>({rx:bvomBbPrescription('high_bar_squat'),warm:bvomBbWarmStageBPlan('A2','high_bar_squat'),drop:bvomBbPerformanceDrop('high_bar_squat',100,6)}));
   assert.deepEqual(stepOnly.rx.sets.slice(1),before.rx.sets.slice(1),'increment-only must preserve back-off prescriptions');
   assert.deepEqual(stepOnly.warm.sets,before.warm.sets,'increment-only must preserve warm-up suggestions');
   assert.equal(stepOnly.drop.triggered,true,'reference remains reachable after increment edit');
   await btn.click();
   assert.equal(await modal.locator('[data-bb-increment]').inputValue(),'1','reopened Edit Weight shows new increment');
   await modal.locator('[data-bb-weight]').fill('102.5');
   await modal.locator('[data-save]').click();
   assert.equal(await modal.count(),0,'successful edit closes the modal');
   const after=await page.evaluate(()=>({rx:bvomBbPrescription('high_bar_squat'),warm:bvomBbWarmStageBPlan('A2','high_bar_squat')}));
   assert.equal(after.rx.sets[0].load,102.5);
   assert.notEqual(after.rx.sets[1].load,before.rx.sets[1].load,'back-offs recalculated');
   assert.notDeepEqual(after.warm.sets,before.warm.sets,'warm-up recalculated');
   d=await get();
   assert.equal(d.bodybuilding.progression.high_bar_squat.load,102.5);
   assert.equal(d.bodybuilding.progression.high_bar_squat.increment,1,'weight edit preserves increment');
   assert.equal(d.bodybuilding.progression.high_bar_squat.previousSuccessfulLoad,undefined,'weight edit resets old performance reference');
   assert.equal(d.weights.Squat,145,'LP load untouched');
   assert.equal(d.bodybuilding.completedSessions,0);
   assert.equal(d.history.length,0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'375px no page overflow');
   await page.evaluate(()=>activateTab('warmup'));
   assert.match(await page.locator('#warmup #warm-bb-A2').textContent(),/102.5 kg/);
   await page.reload();await page.waitForSelector('#app:not(.hidden)');
   d=await get();assert.equal(d.bodybuilding.progression.high_bar_squat.load,102.5,'reload retains edit');
   assert.equal(d.bodybuilding.progression.high_bar_squat.increment,1,'reload retains increment');
   await page.evaluate(()=>{
    const tri='lying_barbell_triceps_extension';
    state.bodybuilding.selections.A6=tri;
    state.bodybuilding.progression[tri]={load:32.5,topLoad:32.5,increment:2.5,
     calibrated:true,previousSuccessfulLoad:30};
    save({durable:true});renderWorkout();
   });
   const triButton=page.locator('#workout #work-bb-A6 [data-bb-edit-weight]');
   assert.equal(await triButton.isEnabled(),true,'triceps editor available independently of squat');
   await triButton.click();
   assert.equal(await modal.locator('[data-bb-increment]').inputValue(),'2.5');
   await modal.locator('[data-bb-increment]').fill('1');
   await modal.locator('[data-save]').click();
   const tri=await page.evaluate(()=>({
    p:state.bodybuilding.progression.lying_barbell_triceps_extension,
    decision:bvomBbDecide('lying_barbell_triceps_extension',[{reps:15},{reps:15}])
   }));
   assert.equal(tri.p.load,32.5,'editing step does not move triceps load');
   assert.equal(tri.p.previousSuccessfulLoad,30,'editing step keeps prior successful load');
   assert.equal(tri.decision.nextLoad,33.5,'earned 1 kg from 32.5 kg must be 33.5 kg, not 34 kg');
   await page.evaluate(()=>{
    const id='machine_chest_press';state.bodybuilding.selections.A1=id;
    state.bodybuilding.progression[id]={load:32.5,topLoad:32.5,calibrated:true};
    save({durable:true});renderAll();
   });
   const machineBefore=await page.evaluate(()=>({
    back:bvomBbPrescription('machine_chest_press').sets.slice(1).map(x=>x.load),
    warm:bvomBbWarmStageBPlan('A1','machine_chest_press').sets
   }));
   await page.locator('#workout #work-bb-A1 [data-bb-edit-weight]').click();
   assert.equal(await modal.locator('[data-bb-increment]').inputValue(),'','unset increment displayed empty');
   await modal.locator('[data-bb-increment]').fill('1');
   await modal.locator('[data-save]').click();
   const machineAfter=await page.evaluate(()=>({
    back:bvomBbPrescription('machine_chest_press').sets.slice(1).map(x=>x.load),
    warm:bvomBbWarmStageBPlan('A1','machine_chest_press').sets,
    prep:state.bodybuilding.progression.machine_chest_press.preparationStep,
    step:state.bodybuilding.progression.machine_chest_press.increment
   }));
   assert.deepEqual(machineAfter.back,machineBefore.back,'first increment leaves machine back-offs intact');
   assert.deepEqual(machineAfter.warm,machineBefore.warm,'first increment leaves machine warm-ups intact');
   assert.equal(machineAfter.prep,null,'no prior rounding step is preserved');
   assert.equal(machineAfter.step,1);
   await page.evaluate(()=>{
    state.bodybuilding.performanceRefs.high_bar_squat={
     old:{load:33.5,reps:12},other:{load:34,reps:8}
    };
    save({durable:true});changeUnits('lb',true);
   });
   const refsLb=await page.evaluate(()=>Object.values(state.bodybuilding.performanceRefs.high_bar_squat)
    .map(x=>({load:x.load,reps:x.reps})).sort((a,b)=>a.load-b.load));
   assert.deepEqual(refsLb,[{load:73.8549,reps:12},{load:74.9572,reps:8}],
    'unit conversion preserves distinct historical loads');
   await page.evaluate(()=>changeUnits('kg',true));
   const refsKg=await page.evaluate(()=>Object.values(state.bodybuilding.performanceRefs.high_bar_squat)
    .map(x=>({load:x.load,reps:x.reps})).sort((a,b)=>a.load-b.load));
   assert.deepEqual(refsKg,[{load:33.5,reps:12},{load:34,reps:8}],
    'return to kg recovers both exact performance references');
   await page.evaluate(()=>{
    changeUnits('lb',true);
    state.bodybuilding.performanceRefs.high_bar_squat={a:{load:75,reps:12},b:{load:75.01,reps:8}};
    save({durable:true});changeUnits('kg',true);
   });
   const fineKg=await page.evaluate(()=>Object.values(state.bodybuilding.performanceRefs.high_bar_squat)
    .map(x=>({load:x.load,reps:x.reps})).sort((a,b)=>a.load-b.load));
   assert.deepEqual(fineKg,[{load:34.0194,reps:12},{load:34.024,reps:8}],
    '0.01 lb separated evidence stays distinct in kilograms');
   await page.evaluate(()=>changeUnits('lb',true));
   const fineLb=await page.evaluate(()=>Object.values(state.bodybuilding.performanceRefs.high_bar_squat)
    .map(x=>({load:x.load,reps:x.reps})).sort((a,b)=>a.load-b.load));
   assert.deepEqual(fineLb,[{load:75,reps:12},{load:75.01,reps:8}],
    '0.01 lb separated evidence restores exactly');
   await page.evaluate(()=>changeUnits('kg',true));
   await page.reload();await page.waitForSelector('#app:not(.hidden)');
   assert.equal((await get()).bodybuilding.progression.machine_chest_press.preparationStep,null,
    'no-step preparation lock survives full reload');
   await page.evaluate(()=>activateTab('warmup'));
   await page.locator('#warmup #warm-bb-A2 button.set').first().click();
   await page.evaluate(()=>activateTab('workout'));
   assert.equal(await page.locator('#workout #work-bb-A2 [data-bb-edit-weight]').isDisabled(),true,'warm-up tick locks same-exercise edit');
   d=await get();assert.equal(d.bodybuilding.progression.high_bar_squat.load,102.5);
   assert.deepEqual(errs,[],'no app JS exceptions');
   console.log('PASS native Chromium Bodybuilding exercise settings: '+lang+' 375px, triceps 32.5+1→33.5, first machine increment neutral, distinct kg/lb refs including .01 lb, weight 100→102.5, warmups, reload, LP isolation, tick protection');
   await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
