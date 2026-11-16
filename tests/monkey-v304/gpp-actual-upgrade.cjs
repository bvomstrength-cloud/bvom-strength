'use strict';
// Generate legacy origins through real v3.0.3 UI, then finish that exact active
// state in the candidate. No origin fields are invented by this regression.
const fs=require('node:fs'),path=require('node:path'),a=require('node:assert/strict'),P=require('./platform.cjs');
const seedOnly=process.argv.includes('--seed'),seeds=path.resolve(process.env.BVOM_GPP_SEEDS||path.join(P.out,'gpp-seeds')),checks=[];
fs.mkdirSync(seeds,{recursive:true});
function eq(label,actual,expected){a.deepEqual(actual,expected,label);checks.push({label,actual,expected,pass:true})}
const click=(p,fn)=>p.locator('[onclick='+JSON.stringify(fn)+']').first().evaluate(e=>e.click());
async function units(p,to){await P.tab(p,'settings');await click(p,"changeUnits('"+to+"')");await p.locator('.bvomModalOverlay [data-change]').click();await P.settle(p);await P.tab(p,'workout')}
async function main(){const platform=await P.start();try{
 for(const sets of [false,true])for(const from of ['kg','lb']){
  const label=(sets?'sets':'actual')+'-'+from,entry=63.75,to=from==='kg'?'lb':'kg',expected=from==='kg'?entry*2.2046226218:entry/2.2046226218;
  let source;if(!seedOnly)source=JSON.parse(fs.readFileSync(path.join(seeds,label+'.json')));
  const profile={name:'GppActual-'+label,mode:'lprpt',lang:'en',width:360,now:source?.state?.workoutLastActivityAt?Number(source.state.workoutLastActivityAt)+1000:undefined},data=source?.state||P.fixture(profile);
  if(!source)data.gppList=[{id:'sled',name:'Sled',assignment:'Both',hlmAssignment:'Any',fourDayAssignment:'Any',metrics:{sets,reps:true,load:true},planned:{sets:2,reps:4,load:60}}];
  const d=await platform.device(profile,{data}),p=d.page;
  try{
   if(!source){if(from==='lb')await units(p,'lb');await click(p,sets?"bvomGppSetModal('sled',0)":"bvomGppQuickRecord('sled')");await p.locator('.bvomModalOverlay [data-k="load"]').fill(String(entry));await p.locator('.bvomModalOverlay [data-k="reps"]').fill('4');await p.locator('.bvomModalOverlay [data-s]').click();await units(p,to)}
   const state=await P.stored(p),record=sets?state.gppSession.sled.sets[0]:state.gppSession.sled.actual;
   if(seedOnly){eq('Genuine legacy origin '+label,record._unitLoadOrigins.load.value,entry);eq('Legacy origin unit '+label,record._unitLoadOrigins.load.unit,from);a.notEqual(record.load,expected);fs.writeFileSync(path.join(seeds,label+'.json'),JSON.stringify({from,to,sets,entry,expected,state},null,2));continue}
   const projection=await p.evaluate(()=>{const raw=JSON.stringify(state.gppSession),snapshot=bvomGppResultSnapshot();return {snapshot,unchanged:raw===JSON.stringify(state.gppSession)}});
   eq('Snapshot does not rewrite live actuals '+label,projection.unchanged,true);eq('Snapshot preserves canonical actual '+label,projection.snapshot[0].actual.load,expected);if(sets)eq('Snapshot preserves canonical set '+label,projection.snapshot[0].sets[0].load,expected);
   await P.finish(p,'Verified legacy GPP upgrade '+label);const after=await P.stored(p),h=after.history.at(-1),exported=await p.evaluate(()=>bvomBuildExportV1(state.history.at(-1)));
   eq('New History physical actual '+label,h.gpp[0].actual.load,expected);if(sets)eq('New History physical set '+label,h.gpp[0].sets[0].load,expected);eq('Export physical actual '+label,exported.conditioning[0].load,expected);eq('Prior History unchanged '+label,after.history.slice(0,-1),state.history);eq('Exactly one History append '+label,after.history.length,state.history.length+1);
   await p.reload();await P.ready(p);eq('History survives reload '+label,(await P.stored(p)).history,after.history);await p.screenshot({path:path.join(P.out,'screenshots','gpp-upgrade-'+label+'.png'),fullPage:true});
  }finally{await d.context.close()}
 }
 // Fresh v3.0.4 set and non-set controls exercise conversion rather than just
 // importing old data. Both source directions are covered above by legacy UI.
 if(!seedOnly)for(const sets of [false,true]){
  const profile={name:'FreshGpp-'+sets,mode:'lprpt'},data=P.fixture(profile);data.gppList=[{id:'sled',name:'Sled',assignment:'Both',hlmAssignment:'Any',fourDayAssignment:'Any',metrics:{sets,reps:true,load:true},planned:{sets:2,reps:4,load:60}}];const d=await platform.device(profile,{data}),p=d.page;
  try{await click(p,sets?"bvomGppSetModal('sled',0)":"bvomGppQuickRecord('sled')");await p.locator('[data-k="load"]').fill('63.75');await p.locator('[data-k="reps"]').fill('4');await p.locator('.bvomModalOverlay [data-s]').click();await units(p,'lb');const state=await P.stored(p);eq('Fresh exact GPP actual '+sets,(sets?state.gppSession.sled.sets[0]:state.gppSession.sled.actual).load,63.75*2.2046226218);await P.finish(p,'Fresh precise GPP');eq('Fresh History exact GPP '+sets,(await P.stored(p)).history.at(-1).gpp[0].actual.load,63.75*2.2046226218)}finally{await d.context.close()}
 }
 console.log('PASS',checks.length,seedOnly?'genuine v3.0.3 GPP origin checks':'GPP interrupted-upgrade / fresh actual checks');
}finally{fs.writeFileSync(path.join(P.out,seedOnly?'gpp-seed-checks.json':'gpp-actual-upgrade.json'),JSON.stringify({sourceRoot:P.root,total:checks.length,checks},null,2));await platform.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
