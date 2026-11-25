'use strict';
const fs=require('node:fs'),path=require('node:path');
const O=require('./oracle.cjs'),P=require('./platform.cjs');
const profiles=[
 {name:'Bruno',mode:'lprpt',seed:3031101,width:320,lang:'en',weights:{Squat:60,'Bench Press':40,'Prone Row':40,'Overhead Press':30,Deadlift:80,'Romanian Deadlift':60}},
 {name:'Kong',mode:'hlm',seed:3031102,width:360,lang:'ja',rep:3,weights:{Squat:180,'Bench Press':120,'Prone Row':100,'Overhead Press':65,Deadlift:210}},
 {name:'Milo',mode:'fourday',seed:3031103,width:390,lang:'en',weights:{Squat:120,'Bench Press':80,'Prone Row':70,'Overhead Press':50,Deadlift:150}},
 {name:'Rocky',mode:'bodybuilding',seed:3031104,width:430,lang:'ja'},
 {name:'Buster',mode:'bb2',seed:3031105,width:360,lang:'en'},
 {name:'Chaos',mode:'free',seed:3031106,width:320,lang:'ja'}
];
const initial=Date.UTC(2026,10,16,7);
const daysOf=m=>m==='fourday'?[0,1,3,4]:m==='free'?[0,2,5]:m==='bb2'?[0,1,3,4]:[0,2,4];
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function setCount(session){return Object.values(session||{}).flatMap(x=>Object.values(x||{})).filter(x=>x&&x.reps!==undefined).length;}
function volume(session){return Object.values(session||{}).flatMap(x=>Object.values(x||{})).reduce((n,s)=>n+(s&&s.reps!==undefined?Number(s.load||0)*Number(s.reps):0),0);}
const round2=n=>Math.round(n*100)/100;
async function clickFn(p,fn){await p.locator('[onclick='+JSON.stringify(fn)+']').first().evaluate(e=>e.click());}
async function addExtra(p,n,load,reps,e,position){
 await P.settle(p);
 await P.tab(p,'workout');await p.locator('[data-core-add-extra='+JSON.stringify(n)+']').evaluate(e=>e.click());
 await p.locator('.bvomModalOverlay [data-load]').fill(String(load));await p.locator('.bvomModalOverlay [data-reps]').fill(String(reps));await p.locator('.bvomModalOverlay [data-save]').evaluate(e=>e.click());
 e.stats.setSaves++;e.stats.extras++;e.action('extra',{lift:n,load,reps,position});await P.rest(p);
}
async function reconciliation(p,e,week,m,expectedHist){
 const s=await P.stored(p);e.check('weekly History count',s.history.length,expectedHist.length,{week});e.check('weekly full immutable History actuals',s.history.map(h=>h.session),expectedHist.map(h=>h.session),{week});
 e.check('weekly total retained sets',s.history.reduce((n,h)=>n+setCount(h.session),0),expectedHist.reduce((n,h)=>n+setCount(h.session),0),{week});
 e.check('weekly cumulative volume',round2(s.history.reduce((n,h)=>n+Number(h.volume||0),0)),round2(expectedHist.reduce((n,h)=>n+volume(h.session),0)),{week});
 if(m.weights){for(const n of Object.keys(m.core)){if(m.weights[n]!==undefined)e.check('weekly '+n+' weight',s.weights[n],m.weights[n],{week});e.check('weekly '+n+' failures',Number(s.attempts[n]||0),Number(m.attempts[n]||0),{week});}
  if(m.mode!=='lprpt')for(const n of ['Squat','Bench Press'])for(const[k,key]of [['driver','driver'],['nextHeavy','next'],['rep','rep'],['failCount','fail']])e.check('weekly '+k+' '+n,s.hlm[k][n],m[key][n],{week});
 }
 e.check('weekly no live sets',Object.values(s.session||{}).some(x=>Object.keys(x||{}).length>0),false,{week});e.snapshot(week,s,m);
}
async function coreRun(platform,profile){
 const e=new P.Evidence(profile.name,profile),d=await platform.device(profile),p=d.page,random=rng(profile.seed);let n=0,heavyVisits=0;
 const s=await P.stored(p),m={mode:profile.mode,weights:O.copy(s.weights),core:O.copy(s.core),attempts:O.copy(s.attempts),driver:O.copy(s.hlm.driver),next:O.copy(s.hlm.nextHeavy),rep:O.copy(s.hlm.rep),fail:O.copy(s.hlm.failCount)},hist=[],exposures={};
 try{
  for(let week=1;week<=12;week++){
   for(const calDay of daysOf(profile.mode)){
    if((week===3&&calDay===2)||(week===8&&calDay===daysOf(profile.mode).at(-1))){e.action('missed-day',{week,calDay});continue;}
    n++;const day=profile.mode==='lprpt'?(n%2?'A':'B'):profile.mode==='hlm'?['H','L','M'][(n-1)%3]:String((n-1)%4+1);
    const actualDay=profile.name==='Milo'&&week===5&&calDay<2?calDay+1:profile.name==='Milo'&&week===7&&calDay===4?5:calDay;
    if(actualDay!==calDay)e.action('rearranged-calendar-day',{week,plannedDay:calDay,actualDay});
    const incomplete=n===12;const t=initial+(week-1)*7*86400000+actualDay*86400000;
    await P.now(p,t,{verify:true,owner:d.owner});
    await P.tab(p,'workout');if((await P.stored(p)).day!==day)await clickFn(p,"switchDay('"+day+"')");
    if(profile.mode==='hlm'&&day==='H')heavyVisits++;
    const names=O.rotations[profile.mode][day];e.check('session exercise order',await p.evaluate(()=>program().map(x=>x[0])),names,{week,n,day});
    const expected={};e.action('start-session',{week,n,day,incomplete,at:new Date(t).toISOString()});
    if(n===9){
     // A real card edit before the lift starts; oracle follows the entered value.
     const lift=profile.mode==='hlm'?names.at(-1):names[0],old=O.prescription(m,day,lift),weight=old.loads[old.top]+2.5;
     await p.locator('#work-'+lift.replace(/\W/g,'')+' .weight').evaluate(e=>e.click());await p.locator('.bvomModalOverlay [data-w]').fill(String(weight));await p.locator('.bvomModalOverlay [data-s]').evaluate(e=>e.click());
     if(O.isDriver(m.mode,day,lift)){m.driver[lift]=weight;m.weights[lift]=weight;m.next[lift]=null;}else if(O.isMedium(m.mode,day,lift)||m.mode==='hlm'&&day==='L'&&lift==='Squat'){
      // Session-only derived edits are checked separately; this sequence uses a driver/non-driver edit.
      throw Error('unexpected derived manual-edit scenario');
     }else m.weights[lift]=weight;
     // A deliberate working-weight change starts a fresh failure streak.
     m.attempts[lift]=0;
     e.action('manual-weight',{lift,weight});
    }
    if(n===15){
     const lift=names.at(-1),id=lift.replace(/\W/g,''),previous=m.core[lift].increment,increment=previous===2.5?5:2.5;await P.tab(p,'settings');
     const advanced=p.locator('#settings [data-settings-group="training"]:not([open]) > summary');
     if(await advanced.count())await advanced.click();
     const select=p.locator('#inc'+id);await select.evaluate(el=>el.closest('details').open=true);await select.selectOption(String(increment));await clickFn(p,"saveLiftSettings('"+lift+"')");await P.settle(p);m.core[lift].increment=increment;e.action('increment-edit',{lift,previous,increment});await P.tab(p,'workout');
    }
    if(n%5===1){const lift=names[0],rx=O.prescription(m,day,lift),load=Math.max(20,rx.loads[rx.top]-5);await addExtra(p,lift,load,6,e,'before');expected[lift]={'EXTRA:0':{load,reps:6,extra:true}};}
    for(const name of names){
     exposures[name]=(exposures[name]||0)+1;let records={};const base=O.prescription(m,day,name);
     e.check('independent prescription',await p.evaluate(n=>{const p=corePrescription(n);return {targets:p.targets,loads:p.loads,top:p.topIndex};},name),{targets:base.targets,loads:base.loads,top:base.top},{week,n,day,lift:name});
     const displayBefore=(await p.locator('#work-'+name.replace(/\W/g,'')+' .weight').textContent()).trim();e.check('today working weight before sets',Number(displayBefore.split(/\s/)[0]),base.loads[base.top],{week,n,lift:name});
     for(let i=0;i<12;i++){
      const plan=O.plan(m,day,name,records);if(i>=plan.length)break;
      const q=plan[i],actual=await p.evaluate(({name,i})=>{const q=getSetPlan(name)[i];return q?{load:q.load,target:q.target,optional:!!q.optional}:null;},{name,i});
      e.check('independent live set prescription',actual,{load:q.load,target:q.target,optional:!!q.optional},{week,n,day,lift:name,i});
      let reps=q.target;
      const fail=profile.name==='Bruno'?(name==='Squat'&&[4,5,6].includes(exposures[name])&&i===0):profile.name==='Kong'?(O.isDriver(m.mode,day,name)&&[2,3,4,7,8,9].includes(heavyVisits)&&i===2):(O.isDriver(m.mode,day,name)&&[5,9,13].includes(n)&&i===2);
      if(fail)reps=Math.max(0,q.target-2);
      if(profile.name==='Bruno'&&name==='Bench Press'&&exposures[name]===5&&i===1)reps=q.target-1;
      if(random()<.04&&!q.optional&&!fail&&q.amrap)reps++;
      if(i===0&&O.isDriver(m.mode,day,name)&&m.next[name]!=null){m.driver[name]=m.next[name];m.weights[name]=m.next[name];m.next[name]=null;}
      await P.tab(p,'workout');await clickFn(p,"tapSet('"+name+"',"+i+")");await P.rep(p,reps);records[i]={reps,load:q.load,target:q.target};
      e.stats.setSaves++;e.action('record-set',{week,n,day,lift:name,index:i,reps,load:q.load,target:q.target,optional:!!q.optional});
      const live=await P.stored(p);e.check('set durably saved',{reps:live.session[name]?.[i]?.reps,load:live.session[name]?.[i]?.load,target:live.session[name]?.[i]?.target},records[i],{week,n,lift:name,i});
      const dec=await P.settle(p,{right:profile.name==='Kong'&&m.rep[name]>2});for(const text of dec)e.action('decision',{text:text.slice(0,350)});
      e.check('today working weight remains after set',Number((await p.locator('#work-'+name.replace(/\W/g,'')+' .weight').textContent()).split(/\s/)[0]),base.loads[base.top],{week,n,lift:name,i});await P.rest(p);
      if(n===2&&i===0&&name===names[0]){const before=await P.stored(p);await p.reload();await P.ready(p);e.check('reload preserves session',(await P.stored(p)).session,before.session);e.action('interrupted-reload',{week,n});}
      if(incomplete)break;
     }
     expected[name]={...(expected[name]||{}),...O.copy((await P.stored(p)).session[name])};
     // The journal expectation is assembled from commanded records; metadata is
     // checked independently above and retained verbatim for exact portability.
     for(const[i,r]of Object.entries(records))Object.assign(expected[name][i],r);
     const decision=O.completeLift(m,day,name,records,{third:profile.name==='Kong'?'drop':'repeat'});e.action('expected-progression',{week,n,lift:name,...decision});
     const after=await P.stored(p);e.check('resulting working weight',after.weights[name],m.weights[name],{week,n,lift:name});e.check('resulting failure counter',Number(after.attempts[name]||0),Number(m.attempts[name]||0),{week,n,lift:name});
     if(O.isDriver(m.mode,day,name))for(const [k,key]of [['driver','driver'],['nextHeavy','next'],['rep','rep'],['failCount','fail']])e.check('result '+k,after.hlm[k][name],m[key][name],{week,n,lift:name});
     if(incomplete)break;
    }
    if(!incomplete&&n%4===0){const lift=names.at(-1),load=O.prescription(m,day,lift).loads.at(-1);await addExtra(p,lift,load,2,e,'after');expected[lift]['EXTRA:0']={load,reps:2,extra:true};}
    const beforeFinish=await P.stored(p),dur=await p.evaluate(()=>bvomDuration());
    e.check('actuals equal commanded retained record count',setCount(beforeFinish.session),setCount(expected),{week,n});
    e.check('live volume independent arithmetic',await p.evaluate(()=>bvomWorkoutVolume()),volume(expected),{week,n});
    await P.finish(p,profile.name+' week '+week+' session '+n,{incomplete});const after=await P.stored(p),last=after.history.at(-1);
    e.stats.sessions++;e.stats[incomplete?'incomplete':'completed']++;e.stats.retainedSets+=setCount(expected);
    e.check('single History append',after.history.length,hist.length+1,{week,n});e.check('History incomplete flag',!!last.incomplete,incomplete,{week,n});e.check('History duration',last.duration,dur,{week,n});e.check('History date',last.date,new Date(await p.evaluate(()=>Date.now())).toISOString(),{week,n});e.check('History volume',last.volume,volume(expected),{week,n});e.check('previous History unchanged',after.history.slice(0,-1),hist,{week,n});hist.push(O.copy(last));
    const snap=O.copy(after.history);await p.locator('#timerbar .finish').evaluate(el=>el.click());e.check('double Finish has no duplicate',(await P.stored(p)).history,snap,{week,n});
    e.write();
   }
   await reconciliation(p,e,week,m,hist);
  }
 }catch(error){e.error=error.stack;fs.writeFileSync(path.join(e.path,'error.txt'),error.stack);await p.screenshot({path:path.join(e.path,'failure.png'),fullPage:true});fs.writeFileSync(path.join(e.path,'failure-state.json'),JSON.stringify(await P.stored(p),null,2));throw error;
 }finally{e.write();await d.context.close();}
 return e;
}
async function bb1Run(platform,profile){
 const e=new P.Evidence(profile.name,profile),d=await platform.device(profile),p=d.page,s=await P.stored(p),m={progress:{},completed:0},hist=[];let n=0;
 for(const[id,v]of Object.entries(s.bodybuilding.progression))if(v.load>0)m.progress[id]={load:v.load,increment:v.increment,preparationStep:v.preparationStep,calibrated:!!v.calibrated};
 const selections=O.copy(s.bodybuilding.selections);
 try{
  for(let week=1;week<=12;week++){
   for(const calDay of daysOf(profile.mode)){
    if(m.completed===24){e.action('fixed-lifecycle-rest',{week,calDay,completed:24});continue;}
    if(week===3&&calDay===2||week===6&&calDay===4){e.action('missed-day',{week,calDay});continue;}
    n++;await P.now(p,initial+(week-1)*7*86400000+calDay*86400000,{verify:true,owner:d.owner});const incomplete=n===7,day=m.completed%2?'B':'A',ids=Array.from({length:6},(_,i)=>selections[day+(i+1)]),expected={};
    e.action('start-session',{week,n,day,incomplete});e.check('BB1 day',await p.evaluate(()=>bvomBbDay()),day,{week,n});
    for(const id of ids){
     const ex=O.bb1Spec[id],rx=O.bb1Plan(id,m.progress[id]),records=[];
     e.check('BB1 exercise prescription',await p.evaluate(id=>bvomBbPrescription(id).sets.map(x=>({load:x.load,minReps:x.minReps,maxReps:x.maxReps})),id),rx,{week,n,id});
     for(let i=0;i<rx.length;i++){
      const reps=n%7===3&&i===0?ex.lo-1:n%4===0?ex.lo:n%5===0&&i===1?Math.max(1,ex.lo-1):rx[i].maxReps,hard=n%6===0&&i===0;
      await P.tab(p,'workout');await clickFn(p,"bvomBbSetModal('"+id+"',"+i+")");await p.locator('.bvomModalOverlay [data-reps]').fill(String(reps));if(hard)await p.locator('.bvomModalOverlay [data-hard]').check();
      await p.locator('.bvomModalOverlay [data-save]').evaluate(el=>el.click());await P.settle(p);records.push({reps,load:rx[i].load,hard});e.stats.setSaves++;e.action('record-set',{week,n,id,index:i,...records.at(-1)});await P.rest(p);
      e.check('BB1 current load not advanced before Finish',(await P.stored(p)).bodybuilding.progression[id].load,m.progress[id].load,{week,n,id,i});
      if(incomplete)break;
     }
     if(n%5===1&&!incomplete&&id===ids[0]){
      const extraLoad=rx.at(-1).load;await P.tab(p,'workout');await clickFn(p,"bvomBbAddExtraSet('"+id+"')");await p.locator('.bvomModalOverlay [data-load]').fill(String(extraLoad));await p.locator('.bvomModalOverlay [data-reps]').fill('1');await p.locator('.bvomModalOverlay [data-hard]').check();await p.locator('.bvomModalOverlay [data-save]').evaluate(el=>el.click());e.stats.setSaves++;e.stats.extras++;e.action('extra',{week,n,id,index:rx.length,load:extraLoad,reps:1,hard:true});e.check('BB1 commanded extra actual load',(await P.stored(p)).session['BB:'+id][rx.length].load,extraLoad,{week,n,id});await P.rest(p);
     }
     expected['BB:'+id]=O.copy((await P.stored(p)).session['BB:'+id]);
     for(let i=0;i<records.length;i++)e.check('BB1 actual commanded',{load:expected['BB:'+id][i]?.load,reps:expected['BB:'+id][i]?.reps},{load:records[i].load,reps:records[i].reps},{week,n,id,i});
     if(!incomplete){const v=m.progress[id];let action;if(!v.calibrated){v.calibrated=true;action='initial-about-right-confirmation';}else action=O.bb1Progress(id,v,records);e.action('expected-progression',{week,n,id,action,next:v.load});}
     if(incomplete)break;
    }
    if(n===2){const before=await P.stored(p);await p.reload();await P.ready(p);e.check('BB1 interrupted reload',(await P.stored(p)).session,before.session);}
    const dur=await p.evaluate(()=>bvomDuration());await P.finish(p,'Rocky week '+week+' session '+n,{incomplete});if(!incomplete)m.completed++;
    const after=await P.stored(p),last=after.history.at(-1);e.stats.sessions++;e.stats[incomplete?'incomplete':'completed']++;e.stats.retainedSets+=setCount(expected);
    e.check('BB1 earned completed count',after.bodybuilding.completedSessions,m.completed,{week,n});e.check('BB1 History append',after.history.length,hist.length+1,{week,n});e.check('BB1 prior immutable History',after.history.slice(0,-1),hist,{week,n});e.check('BB1 incomplete',!!last.incomplete,incomplete,{week,n});e.check('BB1 duration',last.duration,dur,{week,n});e.check('BB1 volume',last.volume,volume(expected),{week,n});hist.push(O.copy(last));
    for(const id of ids)e.check('BB1 independently calculated resulting load',after.bodybuilding.progression[id].load,m.progress[id].load,{week,n,id});e.write();
   }
   await reconciliation(p,e,week,m,hist);
  }
  e.check('BB1 fixed block stops at 24',m.completed,24);e.check('BB1 completed status',(await P.stored(p)).bodybuilding.status,'completed');
 }catch(error){fs.writeFileSync(path.join(e.path,'error.txt'),error.stack);fs.writeFileSync(path.join(e.path,'failure-state.json'),JSON.stringify(await P.stored(p),null,2));await p.screenshot({path:path.join(e.path,'failure.png'),fullPage:true});throw error;}finally{e.write();await d.context.close();}return e;
}
async function customRun(platform,profile){
 const e=new P.Evidence(profile.name,profile),d=await platform.device(profile),p=d.page,baseline=await P.stored(p),hist=[];let n=0;
 try{
  for(let week=1;week<=12;week++){
   for(const calDay of daysOf(profile.mode)){
    if(week===2&&calDay===2||week===7&&calDay===5){e.action('missed-day',{week,calDay});continue;}
    n++;await P.now(p,initial+(week-1)*7*86400000+calDay*86400000,{verify:true,owner:d.owner});await P.tab(p,'workout');
    const day=n%2?1:2;await clickFn(p,'bvomFtSelectDay('+day+')');const phase=Math.floor((week-1)/3),name=[['Squat','Bench Press'],['Deadlift','Overhead Press'],['Prone Row','Squat'],['Bench Press','Deadlift']][phase][day-1],load=O.grid(({Squat:60,'Bench Press':40,Deadlift:80,'Overhead Press':30,'Prone Row':40}[name])+(n%7-3)*2.5),style=n%3===0?'rpt5':n%3===1?'straight':'rpt3';
    const previous=(await P.stored(p)).freeTraining.days[day-1].compounds[0]?.lift;
    if(previous!==name){if(previous)await clickFn(p,"bvomFtRemove('"+previous+"')");await clickFn(p,'bvomFtBuilder()');await p.locator('.bvomModalOverlay [data-lift]').selectOption(name);e.action('exercise-substitution',{week,n,day,previous,next:name});}else await clickFn(p,"bvomFtBuilder('"+name+"')");
    await p.locator('.bvomModalOverlay [data-style]').selectOption(style);await p.locator('.bvomModalOverlay [data-weight]').fill(String(load));
    if(style==='straight'){await p.locator('.bvomModalOverlay [data-sets]').fill(String(n%2+2));await p.locator('.bvomModalOverlay [data-reps]').fill('6');}else{await p.locator('.bvomModalOverlay [data-level]').selectOption(String(n%4));await p.locator('.bvomModalOverlay [data-drop]').fill('10');}
    await p.locator('.bvomModalOverlay [data-s]').evaluate(el=>el.click());const targets=style==='straight'?Array(n%2+2).fill(6):style==='rpt3'?O.ladders3[n%4]:O.ladders5[n%4],loads=targets.map((_,i)=>style==='straight'?load:style==='rpt3'?i===0?load:O.grid(load*(1-.1*i),2.5,20):O.grid(load*[.8,.9,1,.9,.8][i],2.5,20));
    e.action('user-plan-edit',{week,n,day,name,load,style,targets});e.check('Custom independent prescribed plan',await p.evaluate(name=>bvomFtPlan(bvomFtCurrent(name)).map(x=>({load:x.load,target:x.target})),name),targets.map((target,i)=>({target,load:loads[i]})),{week,n});
    const incomplete=n===11,sets=[];
    for(let i=0;i<(incomplete?1:targets.length);i++){
     const reps=Math.max(0,targets[i]-(n%6===0?2:0)),actual=loads[i]+(n%5===0?2.5:0);await P.tab(p,'workout');await clickFn(p,"bvomFtSetModal('"+name+"',"+i+",false)");await p.locator('.bvomModalOverlay [data-load]').fill(String(actual));await P.rep(p,reps);
     sets.push({reps,load:actual});e.stats.setSaves++;e.action('record-set',{week,n,name,index:i,...sets.at(-1)});await P.rest(p);
    }
    if(n%4===0){await P.tab(p,'workout');await clickFn(p,"bvomFtAddExtraSet('"+name+"')");await p.locator('.bvomModalOverlay [data-load]').fill(String(load));await P.rep(p,2);e.stats.setSaves++;e.stats.extras++;e.action('extra',{week,n,name,load,reps:2});await P.rest(p);}
    if(n===3||n===17){const before=await P.stored(p);await p.reload();await P.ready(p);e.check('Custom reload actuals',(await P.stored(p)).freeTrainingSession,before.freeTrainingSession);}
    const before=await P.stored(p),expectedSession=await p.evaluate(()=>bvomFtRecordForHistory()),dur=await p.evaluate(()=>bvomDuration());
    for(let i=0;i<sets.length;i++)e.check('Custom actual matches commanded',{reps:expectedSession[name][i].reps,load:expectedSession[name][i].load},sets[i],{week,n,i});
    await P.finish(p,'Chaos week '+week+' session '+n);const after=await P.stored(p),last=after.history.at(-1);e.stats.sessions++;e.stats.completed++;e.stats.retainedSets+=setCount(last.session);
    e.check('Custom user plan remains authoritative',after.freeTraining.days,before.freeTraining.days,{week,n});for(const key of ['weights','core','hlm','bodybuilding'])e.check('Custom no leakage '+key,after[key],baseline[key],{week,n});
    e.check('Custom History append',after.history.length,hist.length+1,{week,n});e.check('Custom prior History immutable',after.history.slice(0,-1),hist,{week,n});e.check('Custom History volume',last.volume,volume(expectedSession),{week,n});e.check('Custom duration',last.duration,dur,{week,n});hist.push(O.copy(last));e.write();
   }
   await reconciliation(p,e,week,{},hist);
  }
 }catch(error){fs.writeFileSync(path.join(e.path,'error.txt'),error.stack);fs.writeFileSync(path.join(e.path,'failure-state.json'),JSON.stringify(await P.stored(p),null,2));await p.screenshot({path:path.join(e.path,'failure.png'),fullPage:true});throw error;}finally{e.write();await d.context.close();}return e;
}
async function main(){
 const platform=await P.start();fs.writeFileSync(path.join(P.out,'run-environment.json'),JSON.stringify({baseline:'6c51e612cd5e6aa532766e5ce80f2d226eb950c0',candidate:'working-tree',chromium:platform.browser.version(),node:process.version,profiles,startedAt:new Date().toISOString()},null,2));
 const chosen=process.argv.slice(2);try{
  const results=await Promise.allSettled(profiles.filter(x=>!chosen.length||chosen.includes(x.name)).map(async profile=>{
   console.log('START',profile.name);const result=profile.mode==='bb2'?await require('./monkey-bb2.cjs').run(platform,profile):profile.mode==='bodybuilding'?await bb1Run(platform,profile):profile.mode==='free'?await customRun(platform,profile):await coreRun(platform,profile);console.log('DONE',profile.name,JSON.stringify(result.stats));if(result.stats.failedAssertions||result.weeks.length!==12)process.exitCode=1;return {name:profile.name,stats:result.stats,weeks:result.weeks};
  }));for(let i=0;i<results.length;i++){if(results[i].status==='rejected')process.exitCode=1;console.log('RESULT',JSON.stringify(results[i].status==='fulfilled'?results[i]:{status:'rejected',error:results[i].reason.stack}));}
 }finally{await platform.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={profiles,coreRun,bb1Run,customRun,setCount,volume};
