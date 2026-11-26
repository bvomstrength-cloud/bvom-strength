'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=process.argv[2]||'.';
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const mutants=[
 ['skip-straight-recovery'," let out=genericSetPlan(n,p,ss);"," if(p.fixed&&p.kind==='straight')return p.targets.map((target,i)=>({target,load:p.loads[i]}));\n let out=genericSetPlan(n,p,ss);",'genericSetPlan','oracle'],
 ['preset-seed','rescueBase=Math.max(1,Number(done.reps)+1)','rescueBase=Math.max(1,Number(q.target)+1)','genericSetPlan','oracle'],
 ['ignore-recovery-miss','if(done&&done.reps<rq.target)rescueBase-=1;','', 'genericSetPlan','oracle'],
 ['zero-rep-rescue','target:p.fixed?Math.max(1,rescueBase+offset):rescueBase+offset','target:rescueBase+offset','genericSetPlan','oracle'],
 ['float-tie','load*(100-dropPercent)/100','load*(1-dropPct)','genericSetPlan','oracle'],
 ['stale-entry','current?.target!==q.target||current?.load!==q.load||current?.drop!==q.drop||current?.top!==q.top','false','tapSet','edges'],
 ['orphan-on-undo','if(openedFixed&&!bvomCoreSessionHasActivity(n))delete state.processedSnapshots?.[n];','','tapSet','edges'],
 ['leave-failure-transition',' bvomRollbackCoreFailureTransition(n,snap);','','bvomRollbackLockedEarnedStateForCorrection','edges'],
 ['credit-underweight','&&(!p.fixed||bvomFixedActualMeetsLoad(ss[i],q))','','bvomFixedActualMeetsLoad','edges'],
 ['no-rollback-on-resize','bvomRollbackFixedResult(n);','','bvomChangeFixedPrescription','oracle']
];
let killed=0;
for(const [id,before,after,anchor,mode] of mutants){
 const start=source.indexOf('function '+anchor+'(',source.indexOf('function genericSetPlan('));
 assert.ok(start>=0,id);
 const at=source.indexOf(before,start);
 assert.ok(at>=0,id);
 const stage=fs.mkdtempSync(path.join(os.tmpdir(),'bvom310-audit-mut-'));
 try{
  fs.cpSync(path.join(root,'i18n'),path.join(stage,'i18n'),{recursive:true});
  fs.writeFileSync(path.join(stage,'index.html'),source.slice(0,at)+after+source.slice(at+before.length));
  const result=spawnSync(process.execPath,[require.resolve('./stress.cjs'),stage,mode],{encoding:'utf8'});
  if(result.status===1&&(/AssertionError|^FAIL /m.test(result.stderr||''))){killed++;console.log('KILLED',id)}
  else{console.log(result.error?'UNRUN':'SURVIVED',id,result.stderr?.slice(0,400),result.error?.message);process.exitCode=1}
 } finally {fs.rmSync(stage,{recursive:true,force:true})}
}
console.log(`RESULT ${killed}/${mutants.length}`);
