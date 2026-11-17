'use strict';
const fs=require('node:fs'),path=require('node:path'),P=require('./platform.cjs'),O=require('./oracle.cjs');
const {profiles}=require('./monkeys.cjs');
async function main(){
 const selected=process.argv.slice(2),platform=await P.start(),e=new P.Evidence(process.env.BVOM_EVIDENCE_NAME||(selected.length?'AdversarialRechecks':'Adversarial'),{baseline:'6c51e612cd5e6aa532766e5ce80f2d226eb950c0',candidate:'working-tree'});let cases=0;const errors=[];
 async function run(label,fn){if(selected.length&&!selected.some(s=>label.includes(s)))return;const old=e.stats.assertions;try{await fn();cases++;console.log('EXECUTED',label,e.stats.assertions-old,'assertions');}catch(error){errors.push({label,error:error.stack});console.log('HARNESS ERROR',label,error.message);}e.write();}
 const click=(p,fn)=>p.locator('[onclick='+JSON.stringify(fn)+']').first().click();
 try{
  for(const val of ['', '-3', '1.5'])await run('BB1 numeric rep entry '+JSON.stringify(val),async()=>{
   const d=await platform.device({...profiles[3],name:'InputBB'+val.replace(/\W/g,'')});const p=d.page;
   try{const before=await P.stored(p),id=before.bodybuilding.selections.A1;await click(p,"bvomBbSetModal('"+id+"',0)");await p.locator('.bvomModalOverlay [data-reps]').fill(val);const field=await p.locator('.bvomModalOverlay [data-reps]').evaluate(el=>({value:el.value,min:el.min,step:el.step,valid:el.checkValidity(),message:el.validationMessage}));await p.locator('.bvomModalOverlay [data-save]').click();const after=await P.stored(p);e.action('BB1-invalid-input',{entered:val,field,record:after.session['BB:'+id]?.[0]});e.check('BB1 rejects missing/negative/fractional reps without recording',after.session,before.session,{entered:val,field});await p.screenshot({path:path.join(P.out,'screenshots','bb1-reps-'+(val===''?'blank':val.replace(/\W/g,'_'))+'.png'),fullPage:true});
   }finally{await d.context.close();}
  });
  await run('Custom actual load precision',async()=>{
   const d=await platform.device({...profiles[5],name:'ActualLoad',lang:'en'}),p=d.page;
   try{await click(p,"bvomFtSetModal('Squat',0,false)");await p.locator('.bvomModalOverlay [data-load]').fill('61.25');await p.locator('.bvomModalOverlay [data-s]').click();const actual=(await P.stored(p)).freeTrainingSession.Squat.sets[0];e.action('custom-enter-actual',{entered:61.25,actual});e.check('Custom records explicitly entered actual load exactly',actual.load,61.25);await p.screenshot({path:path.join(P.out,'screenshots/custom-actual-load.png'),fullPage:true});
   }finally{await d.context.close();}
  });
  await run('Custom fractional set/repetition plan',async()=>{
   const d=await platform.device({...profiles[5],name:'FractionalPlan',lang:'en'}),p=d.page;
   try{const before=await P.stored(p);await click(p,"bvomFtBuilder('Squat')");await p.locator('.bvomModalOverlay [data-sets]').fill('2.5');await p.locator('.bvomModalOverlay [data-reps]').fill('5.5');const valid=await p.locator('.bvomModalOverlay [data-sets]').evaluate(el=>el.checkValidity());await p.locator('.bvomModalOverlay [data-s]').click();const after=await P.stored(p);e.action('custom-fractional-plan',{valid,entered:{sets:'2.5',reps:'5.5'},stored:after.freeTraining.days[0].compounds[0]});e.check('Custom rejects fractional set and rep counts',after.freeTraining.days,before.freeTraining.days);await p.screenshot({path:path.join(P.out,'screenshots/custom-fractional-plan.png'),fullPage:true});
   }finally{await d.context.close();}
  });
  await run('Genuine touch double taps',async()=>{
   const d=await platform.device({...profiles[0],name:'DoubleTap'}),p=d.page;
   try{const b=p.locator('#work-Squat button[onclick="tapSet(\'Squat\',0)"]'),box=await b.boundingBox();await p.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await p.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);e.check('touch double tap opens one rep dialog',await p.locator('.bvomModalOverlay [data-v]').count(),1);await p.locator('.bvomModalOverlay [data-ok]').click();const s=await P.stored(p);e.check('touch double tap records only one set',Object.keys(s.session.Squat),['0']);e.stats.setSaves++;e.stats.retainedSets++;
   }finally{await d.context.close();}
  });
  await run('Active unit roundtrip with actual set and extra',async()=>{
   const d=await platform.device({...profiles[0],name:'Units',width:320}),p=d.page;
   try{await click(p,"tapSet('Squat',0)");await P.rep(p,5);await p.locator('[data-core-add-extra="Squat"]').click();await p.locator('.bvomModalOverlay [data-load]').fill('63.75');await p.locator('.bvomModalOverlay [data-reps]').fill('4');await p.locator('.bvomModalOverlay [data-save]').click();const before=await P.stored(p);await P.tab(p,'settings');await click(p,"changeUnits('lb')");await p.locator('.bvomModalOverlay [data-change]').click();await P.settle(p);const pounds=await P.stored(p);e.check('actual extra load converts physically',Math.abs(pounds.session.Squat['EXTRA:0'].load/2.2046226218487757-63.75)<1e-8,true);await click(p,"changeUnits('kg')");await p.locator('.bvomModalOverlay [data-change]').click();await P.settle(p);const after=await P.stored(p);e.check('active unit roundtrip working weights',after.weights,before.weights);e.check('active unit roundtrip actual records',after.session,before.session);e.check('active unit roundtrip failures',after.attempts,before.attempts);e.stats.setSaves+=2;e.stats.retainedSets+=2;e.stats.extras++;
   }finally{await d.context.close();}
  });
  await run('Real storage quota rejection and reload',async()=>{
   const d=await platform.device({...profiles[0],name:'Quota'}),p=d.page;
   try{const before=await p.evaluate(()=>localStorage.getItem('bvom_data'));await p.locator('[data-core-add-extra="Squat"]').click();await p.locator('.bvomModalOverlay [data-reps]').fill('3');await p.evaluate(()=>{window.auditSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='bvom_data')throw new DOMException('Audit quota exhaustion','QuotaExceededError');return window.auditSetItem.call(this,k,v);};});await p.locator('.bvomModalOverlay [data-save]').click();e.check('quota rejected extra leaves durable bytes unchanged',await p.evaluate(()=>localStorage.getItem('bvom_data')),before);e.check('quota rejected extra rolls back memory actuals',await p.evaluate(()=>state.session),JSON.parse(before).session);await p.evaluate(()=>Storage.prototype.setItem=window.auditSetItem);await p.reload();await P.ready(p);e.check('quota recovery reload has no phantom History',(await P.stored(p)).history,[]);
   }finally{await d.context.close();}
  });
  await run('Actual service-worker offline shell and active workout recovery',async()=>{
   const d=await platform.device({...profiles[0],name:'OfflinePWA',width:360},{workers:'allow'}),p=d.page;
   try{await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await P.ready(p);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await d.context.setOffline(true);await click(p,"tapSet('Squat',0)");await P.rep(p,5);const before=await P.stored(p);await p.reload();await P.ready(p);e.check('offline controlled reload keeps actuals',(await P.stored(p)).session,before.session);await p.close();const b=await d.context.newPage();await b.goto(platform.origin+'/index.html');await P.ready(b);e.check('offline browser reopen keeps actuals',(await P.stored(b)).session,before.session);await click(b,"tapSet('Squat',1)");await P.rep(b,5);e.check('offline reopened app records next set',(await P.stored(b)).session.Squat[1].reps,5);await d.context.setOffline(false);await b.reload();await P.ready(b);e.check('reconnection creates no completed History',(await P.stored(b)).history,[]);e.stats.setSaves+=2;e.stats.retainedSets+=2;e.action('native-offline-reopen',{controller:await b.evaluate(()=>navigator.serviceWorker.controller.scriptURL)});
   }finally{await d.context.close();}
  });
  for(const profile of profiles)await run('Export/restore full '+profile.name+' timeline',async()=>{
   const file=path.join(P.out,profile.name.toLowerCase(),'week-12.json'),source=JSON.parse(fs.readFileSync(file)).state,d=await platform.device(profile,{data:source}),p=d.page;
   try{await P.tab(p,'settings');const downloadP=p.waitForEvent('download');await click(p,'exportBackup()');const download=await downloadP,backupPath=path.join(P.out,profile.name.toLowerCase(),'final-backup.json');await download.saveAs(backupPath);const backup=JSON.parse(fs.readFileSync(backupPath));e.check(profile.name+' export exact completed History',backup.data.history,source.history);if(source.bb2)e.check(profile.name+' export exact BB2 ledger',backup.data.bb2.events,source.bb2.events);
    await d.context.close();const r=await platform.device(profile),q=r.page;try{await P.tab(q,'settings');await q.locator('#settings input[type=file]').setInputFiles(backupPath);const confirm=q.locator('.bvomModalOverlay [data-r]').last();try{await Promise.all([q.waitForEvent('load'),confirm.click()]);}catch(error){await q.screenshot({path:path.join(P.out,'screenshots','restore-'+profile.name+'-failure.png'),fullPage:true});fs.writeFileSync(path.join(P.out,'restore-'+profile.name+'-diagnostic.json'),JSON.stringify(await q.evaluate(()=>({auth:window.__bvomAuthUserId,user:bvomCloud.user?.id,owner:bvomLocalOwnerId(),startup:bvomCloud.startupState,modals:[...document.querySelectorAll('.bvomModalOverlay')].map(x=>x.textContent),stored:JSON.parse(localStorage.getItem('bvom_data'))})),null,2));throw error}await P.ready(q);const restored=await P.stored(q);e.check(profile.name+' restored exact completed History',restored.history,source.history);e.check(profile.name+' restored working weights',restored.weights,source.weights);if(source.bb2)e.check(profile.name+' restored exact BB2 ledger',restored.bb2.events,source.bb2.events);await q.reload();await P.ready(q);e.check(profile.name+' restore reload stable',(await P.stored(q)).history,source.history);}finally{await r.context.close();}
   }finally{if(d.context.pages().length)await d.context.close();}
  });
 }finally{e.write();fs.writeFileSync(path.join(e.path,'execution.json'),JSON.stringify({cases,errors,stats:e.stats},null,2));if(errors.length||e.stats.failedAssertions)process.exitCode=1;await platform.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
