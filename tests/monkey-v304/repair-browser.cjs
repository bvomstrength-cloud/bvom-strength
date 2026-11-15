'use strict';
const fs=require('node:fs'),path=require('node:path'),a=require('node:assert/strict');
const P=require('./platform.cjs'),H=require('../bvom-lab/lib/bvom_harness'),{profiles}=require('./monkeys.cjs');
const checks=[],actions=[];let platform,active;
function eq(label,actual,expected){a.deepEqual(actual,expected,label);checks.push({label,pass:true,actual,expected})}
const click=(p,fn)=>p.locator('[onclick='+JSON.stringify(fn)+']').first().evaluate(e=>e.click());
async function units(p,to){await P.tab(p,'settings');await click(p,"changeUnits('"+to+"')");await p.locator('.bvomModalOverlay [data-change]').click();await P.settle(p);await P.tab(p,'workout')}
async function raw(p){return p.evaluate(()=>localStorage.getItem('bvom_data'))}
async function main(){platform=await P.start();try{
 for(const profile of profiles.slice(0,3)){
  const data=P.fixture(profile);if(profile.mode==='fourday')data.day='2';active=await platform.device({...profile,name:'Noop-'+profile.name,lang:'en'},{data});const p=active.page;
  await P.now(p,Date.UTC(2026,10,15,8),{verify:true,owner:active.owner});
  await p.locator('[data-core-add-extra="Squat"]').click();await p.locator('.bvomModalOverlay [data-load]').fill('63.75');await p.locator('.bvomModalOverlay [data-reps]').fill('4');await p.locator('.bvomModalOverlay [data-save]').click();
  for(let i=0;i<await p.evaluate(()=>getSetPlan('Squat').length);i++){const target=await p.evaluate(i=>getSetPlan('Squat')[i].target,i);await click(p,"tapSet('Squat',"+i+")");await P.rep(p,target);await P.settle(p)}
  const before=await raw(p),indices=Object.keys((await P.stored(p)).session.Squat).filter(x=>/^\d+$/.test(x));
  for(const i of indices){await click(p,"tapSet('Squat',"+i+")");await p.locator('.bvomModalOverlay [data-ok]').click();eq('A01 browser unchanged '+profile.mode+'/'+i,await raw(p),before)}
  await p.reload();await P.ready(p);eq('A01 browser reload keeps all actuals',(await P.stored(p)).session,JSON.parse(before).session);await active.context.close();
 }
 for(const lang of ['en','ja'])for(const onramp of [false,true]){
  let data=P.fixture(profiles[3]);if(onramp){const h=H.boot(H.loadBuild(P.root),{supabase:null,online:false});H.configureLP(h);H.bbStart(h,{onramp:true});data=JSON.parse(JSON.stringify(h.S()));data.language=lang;data.accessoryList=[];data.gppList=[]}else data.language=lang;
  active=await platform.device({...profiles[3],name:'Reps-'+lang+'-'+onramp,lang},{data});const p=active.page,id=data.bodybuilding.selections.A1,before=await raw(p);
  await click(p,(onramp?'bvomBbOnRampSetModal':'bvomBbSetModal')+"('"+id+"',0)");
  for(const value of ['', '-3','1.5','1e309','9007199254740992']){
   await p.locator('.bvomModalOverlay [data-reps]').fill(value);await p.locator('.bvomModalOverlay [data-save]').click();
   eq('A04 browser storage unchanged '+lang+'/'+onramp+'/'+value,await raw(p),before);
   eq('A04 validation dialog open',await p.locator('.bvomModalOverlay [data-save]').count(),1);
   const message=await p.locator('[data-bb-validation]').textContent();eq('A04 useful localized inline error',lang==='ja'?/[\u3040-\u9fff]/u.test(message):message.includes('whole number'),true);
  }
  await p.locator('.bvomModalOverlay [data-reps]').fill('0');if(onramp){await p.locator('.bvomModalOverlay [data-load]').fill('24');await p.locator('.bvomModalOverlay [data-inc]').fill('2')}
  await p.locator('.bvomModalOverlay [data-save]').click();eq('A04 deliberate zero', (await P.stored(p)).session[(onramp?'BBOR:':'BB:')+id][0].reps,0);await active.context.close();
 }
 for(const unit of ['kg','lb']){
  active=await platform.device({...profiles[5],name:'Actual-'+unit,lang:'en'});const p=active.page;if(unit==='lb')await units(p,'lb');
  await click(p,"bvomFtSetModal('Squat',0,false)");const before=await raw(p);
  for(const value of ['', '-3','0','1e309']){await p.locator('.bvomModalOverlay [data-load]').fill(value);await p.locator('.bvomModalOverlay [data-s]').click();eq('A03 invalid load before mutation '+unit+'/'+value,await raw(p),before);eq('A03 invalid dialog open',await p.locator('.bvomModalOverlay [data-s]').count(),1)}
  for(let i=0;i<3;i++){if(i)await click(p,"bvomFtSetModal('Squat',"+i+",false)");await p.locator('.bvomModalOverlay [data-load]').fill('61.25');await P.rep(p,5);eq('A03 initial precise actual '+unit+'/'+i,(await P.stored(p)).freeTrainingSession.Squat.sets[i].load,61.25)}
  await click(p,"bvomFtSetModal('Squat',0,false)");await p.locator('.bvomModalOverlay [data-load]').fill('63.75');await P.rep(p,5);
  await click(p,"bvomFtAddExtraSet('Squat')");await p.locator('.bvomModalOverlay [data-load]').fill('61.25');await P.rep(p,2);
  const prior=(await P.stored(p)).freeTraining;await P.finish(p,'Precise Custom actual '+unit);
  const state=await P.stored(p),h=state.history.at(-1),expected=63.75*5+61.25*12;
  eq('A03 History correction precision',h.session.Squat[0].load,63.75);eq('A03 extra precision',h.session.Squat[3].load,61.25);eq('A03 volume',h.volume,expected);eq('A03 PB uses precise actual',state.pbs.Squat.load,63.75);eq('A03 user plan unchanged',state.freeTraining,prior);
  const exported=await p.evaluate(()=>bvomBuildExportV1(state.history.at(-1)));eq('A03 export actual',exported.exercises[0].sets[0].load,63.75);
  const download=p.waitForEvent('download');await P.tab(p,'settings');await click(p,'exportBackup()');const dl=await download;await dl.saveAs(path.join(P.out,'precise-custom-'+unit+'.json'));await active.context.close();
 }
 active=await platform.device({...profiles[5],name:'Counts',lang:'ja'});{
  const p=active.page,before=await raw(p);await click(p,"bvomFtBuilder('Squat')");
  for(const [sets,reps]of [['2.5','5.5'],['','5'],['3',''],['0','5'],['21','5'],['3','51'],['3','-1'],['1e309','5'],['3','9007199254740992']]){
   await p.locator('.bvomModalOverlay [data-sets]').fill(sets);await p.locator('.bvomModalOverlay [data-reps]').fill(reps);await p.locator('.bvomModalOverlay [data-s]').click();eq('A06 invalid template unchanged '+sets+'/'+reps,await raw(p),before);eq('A06 editor remains open',await p.locator('.bvomModalOverlay [data-sets]').count(),1);eq('A06 inline error visible',await p.locator('[data-bb-validation]').isVisible(),true);
  }
  await p.locator('.bvomModalOverlay [data-sets]').fill('20');await p.locator('.bvomModalOverlay [data-reps]').fill('50');await p.locator('.bvomModalOverlay [data-s]').click();
  eq('A06 maximum allowed counts',await p.evaluate(()=>({sets:bvomFtPlan(bvomFtCurrent('Squat')).length,reps:bvomFtCurrent('Squat').reps})),{sets:20,reps:50});await active.context.close();
 }
 // Original one-way A05 reproduction, through real Finish, export and adapter.
 active=await platform.device({...profiles[0],name:'Unit-Finish',lang:'en'});{
  const p=active.page;await p.locator('[data-core-add-extra="Squat"]').click();await p.locator('.bvomModalOverlay [data-load]').fill('63.75');await p.locator('.bvomModalOverlay [data-reps]').fill('4');await p.locator('.bvomModalOverlay [data-save]').click();await units(p,'lb');await P.finish(p,'Unit identity after Finish',{incomplete:true});await p.reload();await P.ready(p);
  const h=(await P.stored(p)).history.at(-1),exact=63.75*2.2046226218,derived=await p.evaluate(()=>{const h=state.history.at(-1),e=bvomBuildExportV1(h);return {e,adapter:bvomBuildStravaUploadV1(e),share:bvomShareWorkoutText(h)}});
  eq('A05 History actual in new units',h.session.Squat['EXTRA:0'].load,exact);eq('A05 History volume follows existing two-decimal policy',h.volume,Math.round(exact*4*100)/100);eq('A05 export physical actual',derived.e.exercises[0].sets[0].load,exact);eq('A05 adapter returns physical kg',derived.adapter.file.sets[0].weight,63.75);eq('A05 sharing includes actual display',derived.share.includes('140.5'),true);await active.context.close();
 }
 for(const lang of ['en','ja'])for(const width of [320,360,390,430]){
  const data=P.fixture(profiles[1]);data.language=lang;data.balance=true;Object.assign(data.weights,{'Overhead Press':20,'Prone Row':180});
  active=await platform.device({...profiles[1],name:'Balance-'+lang+'-'+width,lang,width},{data});const p=active.page;await P.tab(p,'workout');
  const advice=await p.evaluate(()=>ratioNotices());eq('A07 advice exists both directions',advice.length>=2,true);eq('A07 complete language '+lang+'/'+width,lang==='ja'?advice.every(x=>!/(starting relationship|Overhead Press|Prone Row|below|above|male|female)/.test(x)&&/[\u3040-\u9fff]/u.test(x)):advice.every(x=>x.includes('starting relationship')),true);
  eq('A07 small screen no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await p.screenshot({path:path.join(P.out,'screenshots','balance-'+lang+'-'+width+'.png'),fullPage:true});await active.context.close();
 }
 console.log('PASS',checks.length,'repair browser assertions');
}catch(error){if(active){await active.page.screenshot({path:path.join(P.out,'screenshots','repair-browser-failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(P.out,'repair-browser-error.txt'),error.stack)}throw error}
finally{fs.writeFileSync(path.join(P.out,'repair-browser.json'),JSON.stringify({checks,total:checks.length,actions},null,2));await platform.close()}}
main().catch(error=>{console.error(error);process.exitCode=1});
