'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),a=require('node:assert/strict'),cp=require('node:child_process');
const {packageMonkeyTest}=require('../../scripts/package-monkey-repair-test.cjs'),{FILES}=require('../../scripts/package-bb2-test.cjs');
const root=path.resolve(__dirname,'../..'),sourceSha=process.env.BVOM_SOURCE_SHA||cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'bvom304-package-'));
let count=0;const check=(x,label)=>{a.ok(x,label);count++};
try{
 function make(name,extra={}){return packageMonkeyTest({root,sourceSha,output:path.join(temp,name),zipFile:path.join(temp,name+'.zip'),...extra})}
 const first=make('a'),repeat=make('b');check(first.zipSha256===repeat.zipSha256,'deterministic committed-source ZIP');check(first.sourceSha===sourceSha,'exact source identity');check(!first.cloudConfigured&&first.status.startsWith('HOLD'),'unconfigured cloud is explicitly HOLD');
 for(const file of FILES){const packaged=fs.readFileSync(path.join(first.zipFile.replace('.zip',''),file));if(!['index.html','admin.html','sw.js'].includes(file))check(packaged.equals(cp.execFileSync('git',['show',sourceSha+':'+file],{cwd:root,maxBuffer:32*1024*1024})),'unchanged committed asset '+file)}
 for(const file of ['index.html','admin.html']){const text=fs.readFileSync(path.join(temp,'a',file),'utf8');check(!text.includes('hkteienxwdsjncchuvnz.supabase.co'),'production endpoint removed '+file);check(text.includes('https://isolated-monkey-backend.invalid'),'unconfigured endpoint fails closed '+file)}
 check(fs.readFileSync(path.join(temp,'a/sw.js'),'utf8').includes(first.cache),'commit-specific test cache');
 check(first.manifestIdentityUnchanged,'PWA manifest identity retained');
 const configured=make('c',{cloudUrl:'https://isolated-monkey-fixture.supabase.co',cloudKey:'sb_publishable_disposable_fixture'});check(configured.cloudConfigured,'explicit isolated configuration supported');
 for(const [label,extra]of [
  ['production URL',{cloudUrl:'https://hkteienxwdsjncchuvnz.supabase.co',cloudKey:'public'}],
  ['unrelated project',{cloudUrl:'https://eyockhubhkbacnmprahj.supabase.co',cloudKey:'public'}],
  ['secret key',{cloudUrl:'https://isolated-monkey-fixture.supabase.co',cloudKey:'sb_secret_never_package'}],
  ['service JWT',{cloudUrl:'https://isolated-monkey-fixture.supabase.co',cloudKey:'header.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.sig'}],
  ['plain HTTP',{cloudUrl:'http://isolated-monkey-fixture.supabase.co',cloudKey:'public'}]
 ]){a.throws(()=>make('bad-'+count,extra),label+' rejected');count++}
 console.log('PASS',count,'committed-source isolated package contracts');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
