'use strict';
const assert=require('node:assert/strict');
const H=require('../bvom-lab/lib/bvom_harness');
const build=H.loadBuild(process.argv[2]||'.');
function edit(app,lift,sets,reps){
 app.ctx.bvomWeightModal=(_name,weight,save)=>save(weight,{sets,reps},weight);
 app.ctx.editWeight(lift);
}
for(const [lift,weight,edits,target,rescue] of [
 ['Prone Row',80,[],5,[75,5]],
 ['Bench Press',80,[6],6,[75,6]],
 ['Squat',110,[8,5],5,[100,5]]
]){
 if(process.argv[3]&&process.argv[3]!==lift)continue;
 const app=H.boot(build);H.configureLP(app);
 app.S().weights[lift]=weight;
 app.ev('save()');
 edits.forEach(reps=>edit(app,lift,3,reps));
 app.reps.push(target,target-1);
 app.ctx.tapSet(lift,0);app.ctx.tapSet(lift,1);
 const actual=app.ctx.getSetPlan(lift)[2];
 assert.deepEqual([actual.load,actual.target,actual.drop,actual.amrap],[...rescue,true,true],lift);
 const reload=H.boot(build,{ls:app.ls,ss:H.memStore({bvom_tab_id:app.ctx.bvomTabId()})});
 const restored=reload.ctx.getSetPlan(lift)[2];
 assert.deepEqual([restored.load,restored.target,restored.drop,restored.amrap],[...rescue,true,true]);
 assert.equal(reload.ctx.coreResult(lift).incomplete,true);
 if(edits.length===2)assert.equal(reload.S().fixedWorkingSets?.lprpt?.[lift],undefined);
 reload.reps.push(rescue[1]);reload.ctx.tapSet(lift,2);
 assert.equal(reload.S().weights[lift],weight,'a failed straight prescription earns no increment');
 H.finish(reload);
 assert.deepEqual([reload.S().history.at(-1).session[lift][2].load,reload.S().history.at(-1).session[lift][2].reps],rescue);
 console.log('PASS',lift,'edited reps',edits,'recovery',rescue);
}

async function cloudRestore(){
 const net={online:true},supabase=H.mockSupabase({net,session:true});
 const app=await H.launch(build,{ls:H.memStore(),net,supabase});
 H.configureLP(app);
 app.S().weights['Bench Press']=80;
 app.ev('save()');
 edit(app,'Bench Press',3,6);
 app.reps.push(6,5,6);
 for(let i=0;i<3;i++)app.ctx.tapSet('Bench Press',i);
 H.finish(app);
 app.lastOverlay().querySelector('[data-ok]').click();
 await app.ctx.bvomCloudSaveNow();
 assert.equal(app.ev('bvomCloud.cloudExists'),true);
 const device=await H.launch(build,{ls:H.memStore(),net,supabase});
 device.choices.push('R');
 await device.ctx.bvomCloudRestore();
 const restored=H.boot(build,{ls:device.ls});
 const copy=JSON.parse(restored.ls.getItem('bvom_data'));
 assert.deepEqual(copy.fixedWorkingSets.lprpt['Bench Press'],{sets:3,reps:6});
 assert.deepEqual(Object.values(copy.history.at(-1).session['Bench Press']).map(row=>[row.load,row.reps,row.target]),
  [[80,6,6],[80,5,6],[75,6,6]]);
 console.log('PASS edited straight recovery actuals and settings restored on a second mocked device');
}
if(!process.argv[3])cloudRestore().catch(error=>{console.error(error);process.exitCode=1});
