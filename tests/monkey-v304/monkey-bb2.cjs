'use strict';
const fs=require('node:fs'),path=require('node:path'),O=require('./oracle.cjs'),P=require('./platform.cjs');
const order=['upper_a','lower_a','upper_b','lower_b'];
const key=(day,s)=>day+'|'+s[0]+'|'+s[4];
async function run(platform,profile){
 const e=new P.Evidence(profile.name,profile),d=await platform.device(profile),p=d.page,m={loads:{},increments:{},quotas:Object.fromEntries(order.map(x=>[x,0])),sets:0,history:[],normalVisits:{},best:{},stalls:{}},seen=new Set();let n=0,next=0;
 for(const day of order)for(const s of O.bb2Days[day]){m.loads[key(day,s)]=O.bb2Load(s[4])*1000;m.increments[key(day,s)]=2500;}
 function propagate(k,field,value){const [day,role,id]=k.split('|'),s=O.bb2Days[day].find(x=>x[0]===role);for(const day2 of order)for(const t of O.bb2Days[day2])if(t[4]===id&&JSON.stringify(t.slice(1,4))===JSON.stringify(s.slice(1,4)))m[field][key(day2,t)]=value;}
 async function projection(){return p.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events));}
 try{
  await P.tab(p,'settings');await p.locator('#settings button[onclick="bvomStartingSetupModal()"]').evaluate(el=>el.click());await p.locator('.bvomModalOverlay [data-r]').evaluate(el=>el.click());await p.locator('#setup [data-bb2-preview]').evaluate(el=>el.click());
  await p.locator('#setup [data-bb2-role="lower_a|hamstring_curl"]').selectOption('lying_leg_curl');await p.locator('#setup [data-bb2-role="upper_b|vertical_pull"]').selectOption('lat_pulldown');await p.locator('#setup [data-bb2-save]').evaluate(el=>el.click());
  e.action('BB2-numeric-setup',{catalogueVersion:5,substitutions:{'lower_a|hamstring_curl':'lying_leg_curl','upper_b|vertical_pull':'lat_pulldown'},optionalCurls:false});
  for(let week=1;week<=12;week++){
   for(const calDay of [0,1,3,4]){
    if(week===2&&calDay===1||week===6&&calDay===4){e.action('missed-day',{week,calDay});continue;}
    const recovery=week===4||week===8,credits=Object.values(m.quotas).reduce((a,b)=>a+b,0);
    if(!recovery&&credits===32){e.action('fixed-lifecycle-rest',{week,calDay,credits});continue;}
    if(!recovery)while(m.quotas[order[next%4]]>=8)next++;
    const day=recovery?order[[0,1,3,4].indexOf(calDay)]:order[next%4];if(!recovery)next++;
    n++;const incomplete=n===6,kind=recovery?'RECOVERY':'NORMAL';await P.now(p,Date.UTC(2026,10,16,7)+(week-1)*7*86400000+calDay*86400000,{verify:true,owner:d.owner});
    if(!await p.locator('#setup [data-bb2-start]').isVisible()){await P.tab(p,'workout');await p.locator('#workout [data-bb2-next-workout]').evaluate(el=>el.click());}
    for(let k=0;k<20;k++){const b=p.locator('#setup [data-bb2-choice-keep],#setup [data-bb2-choice-hold]').first();if(!await b.count())break;await b.evaluate(el=>el.click());}
    await p.locator('#setup [data-bb2-day="'+day+'"]').evaluate(el=>el.click());await p.locator('#setup [data-bb2-kind="'+kind+'"]').evaluate(el=>el.click());
    const expectedSlots=O.bb2Days[day].map(s=>({roleSlotId:s[0],exerciseId:s[4],sets:recovery?Math.ceil(s[1]/2):s[1],floor:s[2],ceiling:s[3],equipment:'loaded',plannedG:recovery?O.grid(m.loads[key(day,s)]*.9,m.increments[key(day,s)]):m.loads[key(day,s)],incrementG:m.increments[key(day,s)]}));
    for(const input of await p.locator('#setup [data-bb2-load]:not([disabled])').all()){
     const i=Number(await input.getAttribute('data-bb2-load'));if(!(await input.inputValue()))await input.fill(String(expectedSlots[i].plannedG/1000));
    }
    for(const input of await p.locator('#setup [data-bb2-inc]:not([disabled])').all()){
     const i=Number(await input.getAttribute('data-bb2-inc'));if(!(await input.inputValue()))await input.fill(String(expectedSlots[i].incrementG/1000));
    }
    await p.locator('#setup [data-bb2-start]').evaluate(el=>el.click());await p.waitForSelector('#workout [data-bb2-set]');
    const start=await p.evaluate(()=>state.bb2.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===state.bb2.activeSessionId));
    e.check('BB2 independent order/count/range/load/increment',start.slots.map(s=>Object.fromEntries(Object.keys(expectedSlots[0]).map(k=>[k,s[k]]))),expectedSlots,{week,n,day,kind});
    e.action('start-session',{week,n,day,kind,incomplete,sessionId:start.sessionId,expectedSlots});
    if(!recovery&&!incomplete)m.normalVisits[day]=(m.normalVisits[day]||0)+1;
    const visit=m.normalVisits[day]||0,all=expectedSlots.flatMap((s,i)=>Array.from({length:s.sets},(_,j)=>({s,i,j}))),selected=incomplete?all.slice(0,2):all,records=[];
    if(n===1||n%7===0){await P.tab(p,'workout');await p.locator('[data-bb2-extra-add="0"]').evaluate(el=>el.click());const load=expectedSlots[0].plannedG/1000;await p.locator('.bvomModalOverlay [data-bb2-reps]').fill('1');await p.locator('.bvomModalOverlay [data-save]').evaluate(el=>el.click());await p.waitForFunction(()=>!document.querySelector('.bvomModalOverlay [data-bb2-reps]'));e.stats.setSaves++;e.stats.extras++;records.push({roleSlotId:expectedSlots[0].roleSlotId,setIndex:expectedSlots[0].sets,actualG:load*1000,reps:1,prescribed:false});e.action('extra-before',{week,n,load,reps:1});await P.rest(p);}
    for(const{s,i,j}of selected){
     const reps=recovery?s.floor:visit>=2&&visit<=6?(visit===4?Math.max(1,s.floor-1):s.floor):s.ceiling;
     await P.tab(p,'workout');const setKey=i+'|'+j;await p.locator('[data-bb2-set="'+setKey+'"]').evaluate(el=>el.click());await p.locator('.bvomModalOverlay [data-bb2-reps="'+setKey+'"]').fill(String(reps));await p.locator('.bvomModalOverlay [data-save]').evaluate(el=>el.click());await p.waitForFunction(()=>!document.querySelector('.bvomModalOverlay [data-bb2-reps]'));
     records.push({roleSlotId:s.roleSlotId,setIndex:j,actualG:s.plannedG,reps,prescribed:true});e.stats.setSaves++;e.action('record-set',{week,n,day,slot:i,index:j,reps,actualG:s.plannedG});await P.rest(p);
    }
    if(n===2){const before=(await P.stored(p)).bb2;await p.reload();await P.ready(p);e.check('BB2 reload preserves journal',(await P.stored(p)).bb2,before,{week,n});}
    const before=await projection(),legacy=(await P.stored(p)).history;
    await P.finish(p,'Buster week '+week+' session '+n,{incomplete});const after=await projection();
    e.stats.sessions++;e.stats[incomplete?'incomplete':'completed']++;e.stats.retainedSets+=records.length;m.sets+=records.length;
    if(!recovery&&!incomplete){m.quotas[day]++;for(const s of O.bb2Days[day]){
     const k=key(day,s),these=records.filter(r=>r.prescribed&&r.roleSlotId===s[0]);if(these.length!==s[1])continue;seen.add(k);
     if(these.every(r=>r.reps>=s[3])){propagate(k,'loads',m.loads[k]+m.increments[k]);propagate(k,'stalls',0);propagate(k,'best',null);}
     else{const sum=these.reduce((n,r)=>n+r.reps,0);if(m.best[k]==null||sum>m.best[k]){propagate(k,'best',sum);propagate(k,'stalls',0);}else propagate(k,'stalls',(m.stalls[k]||0)+1);}
    }}
    for(const k of seen){if(after.progress[k]){e.check('BB2 independent resulting load '+k,after.progress[k].loadG,m.loads[k],{week,n});e.check('BB2 independent stall '+k,after.progress[k].stallCount,m.stalls[k]||0,{week,n});}}
    e.check('BB2 credit quotas',after.quotas,m.quotas,{week,n});e.check('BB2 legacy journal unchanged',(await P.stored(p)).history,legacy,{week,n});e.check('BB2 History one append',after.history.length,m.history.length+1,{week,n});e.check('BB2 prior History immutable',after.history.slice(0,-1),m.history,{week,n});
    const last=after.history.at(-1);e.check('BB2 exact retained sets',last.sets.map(s=>({roleSlotId:s.roleSlotId,setIndex:s.setIndex,actualG:s.actualG,reps:s.reps,prescribed:s.prescribed})).sort((a,b)=>(a.roleSlotId+'|'+a.setIndex).localeCompare(b.roleSlotId+'|'+b.setIndex)),records.sort((a,b)=>(a.roleSlotId+'|'+a.setIndex).localeCompare(b.roleSlotId+'|'+b.setIndex)),{week,n});e.check('BB2 expected status',last.status,incomplete?'INCOMPLETE':recovery?'LOW_STRESS_RECOVERY':'COMPLETED_NORMAL',{week,n});
    if(recovery||incomplete)e.check('BB2 no progression from recovery/incomplete',after.progress,before.progress,{week,n});
    m.history.push(O.copy(last));const head=(await P.stored(p)).bb2.events.length;await p.locator('#timerbar .finish').evaluate(el=>el.click());e.check('BB2 double Finish adds no event',(await P.stored(p)).bb2.events.length,head,{week,n});e.write();
   }
   const actual=await projection();e.check('BB2 weekly total sets',actual.history.reduce((n,h)=>n+h.sets.length,0),m.sets,{week});e.check('BB2 weekly credits',actual.quotas,m.quotas,{week});e.check('BB2 weekly numeric volume',actual.history.flatMap(h=>h.sets).reduce((n,s)=>n+s.actualG/1000*s.reps,0),e.actions.filter(x=>x.type==='record-set').reduce((n,a)=>n+a.actualG/1000*a.reps,0)+e.actions.filter(x=>x.type==='extra-before').reduce((n,a)=>n+a.load*a.reps,0),{week});e.snapshot(week,await P.stored(p),m);
  }
  e.check('BB2 all 32 actual earned credits',Object.values(m.quotas),[8,8,8,8]);
 }catch(error){fs.writeFileSync(path.join(e.path,'error.txt'),error.stack);fs.writeFileSync(path.join(e.path,'failure-state.json'),JSON.stringify(await P.stored(p),null,2));await p.screenshot({path:path.join(e.path,'failure.png'),fullPage:true});throw error;}finally{e.write();await d.context.close();}return e;
}
module.exports={run};
