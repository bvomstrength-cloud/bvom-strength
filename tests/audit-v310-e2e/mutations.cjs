'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(process.argv[2]||'.');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const variants=[
 ['bypass edited straight recovery','function genericSetPlan(', ' let out=genericSetPlan(n,p,ss);',
  " if(p.fixed&&p.kind==='straight')return p.targets.map((target,i)=>({target,load:p.loads[i]}));\n let out=genericSetPlan(n,p,ss);",'browser'],
 ['display recovery from prescribed reps','function genericSetPlan(','rescueBase=Math.max(1,Number(done.reps)+1)',
  'rescueBase=Math.max(1,Number(q.target)+1)','transitions'],
 ['omit final-miss rescue','function genericSetPlan(',"if(p.kind==='straight'&&planned.length)",
  "if(!p.fixed&&p.kind==='straight'&&planned.length)",'transitions'],
 ['award double increment','function bvomApplyFixedResult(',
  'bvomCoreWeightForSession(n)+bvomCoreCfgForSession(n).increment',
  'bvomCoreWeightForSession(n)+2*bvomCoreCfgForSession(n).increment','transitions'],
 ['accept superseded prescription dialog','function editWeight(n){\n const current=bvomCoreCardWeight(n)',
  '  if(fixed&&bvomLastPersistedRaw!==persistedAtOpen)return;','', 'historical']
];
for(const [name,anchor,from,to,runner] of variants){
 const start=source.indexOf(anchor);
 assert.ok(start>=0,name);
 const offset=source.indexOf(from,start);
 assert.ok(offset>=start,name);
 const stage=fs.mkdtempSync(path.join(os.tmpdir(),'bvom-e2e-mut-'));
 try{
  fs.cpSync(path.join(root,'i18n'),path.join(stage,'i18n'),{recursive:true});
  fs.writeFileSync(path.join(stage,'index.html'),source.slice(0,offset)+to+source.slice(offset+from.length));
  const lib=path.join(stage,'tests/bvom-lab/lib');
  fs.mkdirSync(lib,{recursive:true});
  fs.copyFileSync(require.resolve('../bvom-lab/lib/bvom_harness'),path.join(lib,'bvom_harness.js'));
  const result=spawnSync(process.execPath,[path.join(__dirname,runner+'.cjs'),runner==='browser'?'control':stage],{
   timeout:60000,encoding:'utf8',env:{...process.env,BVOM_APP_ROOT:stage,BVOM_MONKEY_OUT:path.join(stage,'output'),BVOM_E2E_VM_TRIALS:'6'}
  });
  assert.equal(result.status,1,`${name}: ${result.error||result.stderr}`);
  assert.match(result.stderr,/AssertionError/,name);
  console.log('KILLED',name);
 }finally{fs.rmSync(stage,{recursive:true,force:true})}
}
console.log('RESULT',variants.length+'/'+variants.length);
