#!/usr/bin/env node
'use strict';
// Full release gate: static tier, behavioural tier, then test validation (mutations + known-bad reference).
// Usage: node gate.js <candidate-build-dir> <v2.8.0-known-bad-build-dir>
const {spawnSync}=require('child_process'),path=require('path');
const [cand,ref]=process.argv.slice(2);if(!cand||!ref){console.error('Usage: node gate.js <candidate-build-dir> <v2.8.0-known-bad-build-dir>');process.exit(2)}
const steps=[['STATIC','regression_guard.js',[cand]],['BEHAVIOUR','behaviour_guard.js',[cand]],['SEQUENCE','sequence_guard.js',[cand]],['MUTATION','mutation_check.js',[cand,'--known-bad',ref]]];
const out=[];for(const [name,file,args] of steps){console.log(`\n######## ${name} ########`);const r=spawnSync(process.execPath,[path.join(__dirname,file),...args],{stdio:'inherit'});out.push([name,r.status===0])}
console.log('\n######## GATE SUMMARY ########');for(const [n,ok] of out)console.log(`${ok?'PASS':'FAIL'}  ${n}`);
const go=out.every(x=>x[1]);console.log(`\nVERDICT: ${go?'GO':'NO-GO'}`);process.exit(go?0:1);
