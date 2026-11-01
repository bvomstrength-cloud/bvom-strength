'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const {packageBB2Test,FILES}=require('../../scripts/package-bb2-test.cjs');
const H=require('./lib/bvom_harness');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'bb2-package-'));
const sha='1234567890abcdef1234567890abcdef12345678';
try{
 const output=path.join(temp,'site'),zipFile=path.join(temp,'candidate.zip');
 const result=packageBB2Test({sourceSha:sha,output,zipFile});
 const html=fs.readFileSync(path.join(output,'index.html'),'utf8'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const script=html.match(/<script data-bb2-test-build>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);assert.doesNotMatch(source,/<script data-bb2-test-build>/,'source build never includes an activation marker');
 for(const name of FILES)if(!['index.html','sw.js'].includes(name))assert.deepEqual(fs.readFileSync(path.join(output,name)),fs.readFileSync(path.join(root,name)),name+' matches exact source');
 const h=H.boot(H.loadBuild(output));
 for(const [origin,marker,allowed] of [
  ['https://bb2-review.netlify.app',true,true],['https://bb2-review.netlify.app',false,false],
  ['https://app.bvomstrength.com',true,false],['https://bvomstrength.com',true,false],
  ['https://netlify.app.evil.test',true,false],['https://netlify.app',true,false],
  ['http://localhost:8000',false,true]]){
  h.ctx.location.origin=origin;h.ctx.location.search='?bb2Preview=1';
  h.ctx.__BVOM_BB2_TEST_BUILD=marker?{pr:73,source:sha}:undefined;
  assert.equal(h.ctx.bvomBb2PreviewEnabled(),allowed,origin+' marker='+marker);
 }
 for(const hostname of ['bb2-review.netlify.app','app.bvomstrength.com','localhost']){
  let url='';const ctx={window:{},URL,location:{hostname,href:'https://'+hostname+'/'},history:{replaceState:(_a,_b,u)=>{url=String(u)}}};
  vm.runInNewContext(script,ctx);
  assert.equal(url.includes('bb2Preview=1'),hostname!=='app.bvomstrength.com','packaged auto-entry stays off production');
 }
 const note=fs.readFileSync(path.join(output,'NETLIFY-TEST-BUILD.txt'),'utf8');
 assert.match(note,/42/);assert.match(note,/46/);assert.match(note,/cloud sync is disabled/);assert.match(note,/disposable test account/);
 assert.equal(result.files.length,19);
 assert.match(fs.readFileSync(path.join(output,'sw.js'),'utf8'),/pr73-1234567890ab/);
 assert.equal(H.boot(H.loadBuild(output)).ctx.bvomCloudPayload().bb2,undefined);
 const names=cp.execFileSync('python3',['-c','import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("\\n".join(sorted(z.namelist())))',zipFile],{encoding:'utf8'}).trim().split('\n');
 assert.deepEqual(names,result.files.slice().sort(),'ZIP has exactly the reviewed static payload');
 assert.throws(()=>packageBB2Test({sourceSha:sha,output,zipFile}),/already exists/);
 assert.throws(()=>packageBB2Test({sourceSha:'bad',output:path.join(temp,'bad'),zipFile}),/SHA/);
 console.log('PASS BB2 packaged candidate: source bytes, ZIP integrity, unique cache, automatic test-site entry and production exclusion');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
