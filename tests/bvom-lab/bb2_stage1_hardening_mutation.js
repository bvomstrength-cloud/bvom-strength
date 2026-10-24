#!/usr/bin/env node
// Mutation proof: each deliberate BB2 domain regression MUST be caught.
// Operates on disposable OS temp files only; never modifies repo source.
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
  cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const src=fs.readFileSync(path.join(root,'bb2/ledger.cjs'),'utf8');
const contract=fs.readFileSync(path.join(__dirname,'bb2_stage1_hardening_contracts.js'),'utf8');
const faults=[
  {name:'ALLOW-BELOW-GATE',from:"if (s.outcome === 'FINISH' && sessionEligible(s) && originalValidCount < minimumValid)",
    to:"if (false && s.outcome === 'FINISH' && sessionEligible(s) && originalValidCount < minimumValid)"},
  {name:'FLOOR-70-PERCENT',from:'const minimumValid = Math.ceil(.70 * count);',to:'const minimumValid = Math.floor(.70 * count);'},
  {name:'SKIP-CORRECTION-IDENTITY',
    from:"fail('correction target identity mismatch');",
    to:"/* mutated: a mismatched correction is accepted */"},
  {name:'WIPE-BODYWEIGHT-VARIATION',
    from:"variation: own(e, 'variation') ? e.variation : prior.variation,",
    to:"variation: e.variation,"},
  {name:'WIPE-HARD-EFFORT',
    from:"harderThanIntended: own(e, 'harderThanIntended') ? e.harderThanIntended : prior.harderThanIntended,",
    to:"harderThanIntended: !!e.harderThanIntended,"},
  {name:'IGNORE-CREDIT-AT-REVISION',
    from:"if (!creditEligibleAt(s, e.commitOrdinal)) fail('credit grant without eligible session revision');",
    to:"if (false && !creditEligibleAt(s, e.commitOrdinal)) fail('credit grant without eligible session revision');"},
  {name:'IGNORE-CREDIT-REVOKE-REVISION',
    from:"if (creditEligibleAt(sessions.get(e.sessionId), e.commitOrdinal)) {",
    to:"if (false && creditEligibleAt(sessions.get(e.sessionId), e.commitOrdinal)) {"},
  {name:'ALLOW-SECOND-FIRST-GRANT',
    from:"if (e.type === 'CREDIT_GRANTED' && priorCredits.length) fail('second first-grant; use regrant');",
    to:"if (false && e.type === 'CREDIT_GRANTED' && priorCredits.length) fail('second first-grant; use regrant');"}
];
let killed=0;
for(const fault of faults) {
  if(!src.includes(fault.from)) throw Error('STALE mutation '+fault.name);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bvom-bb2-mutation-'));
  try {
    fs.mkdirSync(path.join(dir,'bb2'));fs.mkdirSync(path.join(dir,'tests/bvom-lab'),{recursive:true});
    fs.writeFileSync(path.join(dir,'bb2/ledger.cjs'),src.replace(fault.from,fault.to));
    fs.writeFileSync(path.join(dir,'tests/bvom-lab/bb2_stage1_hardening_contracts.js'),contract);
    const run=cp.spawnSync(process.execPath,[path.join(dir,'tests/bvom-lab/bb2_stage1_hardening_contracts.js')],{
      cwd:dir,encoding:'utf8',timeout:30000});
    if(run.error) throw run.error;
    if(run.status!==0) {killed++;console.log('KILLED BB2 '+fault.name);}
    else {console.error('SURVIVED BB2 '+fault.name);}
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
console.log('BB2 MUTATION '+killed+'/'+faults.length+' KILLED');
if(killed!==faults.length) process.exit(1);