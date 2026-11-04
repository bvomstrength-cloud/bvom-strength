#!/usr/bin/env node
'use strict';
// Committed source only. Creates an identifiable isolated HOLD artifact; never deploys.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {FILES}=require('./package-bb2-test.cjs');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function packageLifecycleHold({sourceSha,output,zipFile,root=path.resolve(__dirname,'..')}){
 if(!/^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('Full source commit required');
 output=path.resolve(output);zipFile=path.resolve(zipFile);
 if(fs.existsSync(output)||fs.existsSync(zipFile))throw Error('Use fresh output and ZIP paths');
 const git=(...args)=>cp.execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024});
 if(git('rev-parse',sourceSha+'^{commit}').toString().trim()!==sourceSha)throw Error('Source commit mismatch');
 const files=new Map(FILES.map(n=>[n,git('show',sourceSha+':'+n)])),sourceHashes=Object.fromEntries([...files].map(([n,b])=>[n,digest(b)]));
 let html=files.get('index.html').toString(),sw=files.get('sw.js').toString();
 const build=html.match(/const BVOM_BUILD='([0-9.]+)'/)?.[1];
 if(build!=='3.0.1'||!html.includes('<title>BVOM Strength v'+build+'</title>')||!sw.includes("const BUILD = '"+build+"';"))throw Error('Expected coherent v3.0.1 source');
 const cache='bvom-'+build+'-hold-'+sourceSha.slice(0,12);
 html=html.replace('<title>BVOM Strength v'+build+'</title>','<title>BVOM Strength v'+build+' — HOLD TEST</title>')
  .replace('BEST VERSION OF MYSELF · v'+build,'v'+build+' · HOLD TEST — NOT PRODUCTION')
  .replace('<head>','<head>\n<script data-lifecycle-hold-build>window.__BVOM_LIFECYCLE_HOLD_BUILD='+JSON.stringify({source:sourceSha,build})+';</script>');
 const testSw=sw.replace(/^const CACHE = '[^']+';$/m,"const CACHE = '"+cache+"';");
 if(testSw===sw||!html.includes('data-lifecycle-hold-build'))throw Error('HOLD identification failed');
 files.set('index.html',Buffer.from(html));files.set('sw.js',Buffer.from(testSw));
 const metadata={status:'HOLD TEST ONLY — NOT A PRODUCTION RELEASE',sourceSha,build,cache,sourceHashes};
 files.set('HOLD-TEST.txt',Buffer.from('BVOM Strength v3.0.1 — HOLD TEST ONLY\nSource: '+sourceSha+'\n\nUpload CONTENTS only to a separate disposable test site. Never upload this ZIP to production.\nUse a test account and copies of backups. Existing account transport is unchanged.\nCheck all six programmes, final-set removal, interrupted work, empty BB2 Cancel/restart, and cloud/file restore.\nNo merge, release or production deployment is authorized.\n'));
 files.set('SOURCE.json',Buffer.from(JSON.stringify(metadata,null,2)+'\n'));
 fs.mkdirSync(output,{recursive:true});for(const [name,bytes]of files){const dest=path.join(output,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes)}
 fs.mkdirSync(path.dirname(zipFile),{recursive:true});
 const epoch=git('show','-s','--format=%ct',sourceSha).toString().trim(),hashes=Object.fromEntries([...files].map(([n,b])=>[n,digest(b)]));
 cp.execFileSync('python3',['-c',`import pathlib,zipfile,sys,datetime,json,hashlib
root=pathlib.Path(sys.argv[1]);stamp=datetime.datetime.fromtimestamp(int(sys.argv[3]),datetime.timezone.utc).timetuple()[:6]
expected=json.loads(sys.argv[4])
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:
 for name in sorted(expected):
  info=zipfile.ZipInfo(name,stamp);info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100644<<16
  z.writestr(info,(root/name).read_bytes())
with zipfile.ZipFile(sys.argv[2]) as z:
 assert z.testzip() is None
 assert sorted(z.namelist())==sorted(expected)
 for name,d in expected.items():assert hashlib.sha256(z.read(name)).hexdigest()==d,name
`,output,zipFile,epoch,JSON.stringify(hashes)]);
 const result={sourceSha,build,cache,zipFile,files:[...files.keys()],sha256:digest(fs.readFileSync(zipFile))};
 fs.writeFileSync(zipFile+'.sha256',result.sha256+'  '+path.basename(zipFile)+'\n');return result;
}
if(require.main===module){const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];if(!['--source-sha','--output','--zip'].every(k=>args.includes(k)))throw Error('Use --source-sha SHA --output DIR --zip FILE');console.log(JSON.stringify(packageLifecycleHold({sourceSha:get('--source-sha'),output:get('--output'),zipFile:get('--zip')}),null,2))}
module.exports={packageLifecycleHold};
