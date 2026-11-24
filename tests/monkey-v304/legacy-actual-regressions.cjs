'use strict';
// Authentic independent-review v3.0.3 snapshots, hash-verified before replay.
// Freeze the clock at resume; do not rewrite timestamps to bypass expiry.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),a=require('node:assert/strict'),P=require('./platform.cjs');
const fixtures=path.join(__dirname,'fixtures/legacy-actuals'),manifest=JSON.parse(fs.readFileSync(path.join(fixtures,'PROVENANCE.json'))),checks=[];
function eq(label,actual,expected){a.deepEqual(actual,expected,label);checks.push({label,actual,expected,pass:true})}
const click=(p,fn)=>p.locator('[onclick='+JSON.stringify(fn)+']').first().evaluate(e=>e.click());
async function main(){const platform=await P.start();try{
 for(const kind of ['core','extra','custom','bb','onramp','customacc','bbacc','pb']){
  const file=kind+'.json',bytes=fs.readFileSync(path.join(fixtures,file));eq('Genuine seed identity '+kind,crypto.createHash('sha256').update(bytes).digest('hex'),manifest.files[file].sha256);const captured=JSON.parse(bytes),data=captured.seed||captured,mode=data.programMode;
  const d=await platform.device({name:'VerifiedLegacy-'+kind,mode,width:360,lang:'en',now:Number(data.workoutLastActivityAt||Date.now())+1000},{data}),p=d.page;
  try{
   if(['customacc','bbacc'].includes(kind)){const id=kind==='customacc'?'coldacc':'bbacc';await click(p,"tapAccessory('"+id+"',0)");await P.rep(p,7)}
   else if(kind==='extra'){await click(p,"bvomCoreExtraSetModal('Squat','EXTRA:0')");eq('Extra editor exposes physical mass',Number(await p.locator('[data-load]').inputValue()),63.75*2.2046226218);await p.locator('[data-reps]').fill('3');await p.locator('.bvomModalOverlay [data-save]').click()}
   else if(kind==='bb'||kind==='onramp'){
    const id=data.bodybuilding.selections.A1;await click(p,(kind==='onramp'?'bvomBbOnRampSetModal':'bvomBbSetModal')+"('"+id+"',0)");eq('BB editor exposes physical mass '+kind,Number(await p.locator('[data-load]').inputValue()),24*2.2046226218);await p.locator('[data-reps]').fill('7');await p.locator('.bvomModalOverlay [data-save]').click();
   }else if(kind==='core'){await click(p,"tapSet('Squat',0)");await P.rep(p,4)}
   else {await click(p,"bvomFtSetModal('Squat',0,false)");if(kind==='pb')await p.locator('[data-load]').fill('131');else eq('Custom editor exposes physical mass',Number(await p.locator('[data-load]').inputValue()),60*2.2046226218);await P.rep(p,4)}
   await P.finish(p,'Verified legacy actual '+kind,{incomplete:['core','extra','bb','onramp','bbacc'].includes(kind)});await p.reload();await P.ready(p);const after=await P.stored(p),h=after.history.at(-1),exported=await p.evaluate(()=>bvomBuildExportV1(state.history.at(-1)));
   eq('Legacy correction preserves prior History '+kind,after.history.slice(0,-1),data.history);eq('Exactly one new History '+kind,after.history.length,data.history.length+1);
   if(kind==='pb'){eq('Lighter actual cannot replace physical prior PB',after.pbs.Squat,data.pbs.Squat);eq('Lighter actual still recorded',h.session.Squat[0].load,131)}
   else{
    const key=kind==='customacc'?'ACC:coldacc':kind==='bbacc'?'ACC:bbacc':kind==='bb'?'BB:'+data.bodybuilding.selections.A1:kind==='onramp'?'BBOR:'+data.bodybuilding.selections.A1:'Squat',index=kind==='extra'?'EXTRA:0':'0',mass=['customacc','bbacc'].includes(kind)?30:['bb','onramp'].includes(kind)?24:kind==='extra'?63.75:60,expected=mass*2.2046226218;
    eq('Rep correction retains canonical History actual '+kind,h.session[key][index].load,expected);eq('Export retains physical actual '+kind,exported.exercises[0].sets[0].load,expected);
   }
  }finally{await d.context.close()}
 }
 console.log('PASS',checks.length,'genuine legacy actual correction / PB regression checks');
}finally{fs.writeFileSync(path.join(P.out,'legacy-actual-regressions.json'),JSON.stringify({checks,total:checks.length,source:manifest.sourceCommit},null,2));await platform.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
