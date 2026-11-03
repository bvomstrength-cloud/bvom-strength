#!/usr/bin/env node
'use strict';
// Exact committed production files only. This never uploads or deploys anything.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {FILES}=require('./package-bb2-test.cjs');
const ROOT=path.resolve(__dirname,'..');
function packageProduction({sourceSha,output,zipFile,root=ROOT}){
 if(!/^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('A full release commit SHA is required');
 output=path.resolve(output);zipFile=path.resolve(zipFile);
 if(fs.existsSync(output)||fs.existsSync(zipFile))throw Error('Use fresh output and ZIP paths');
 const git=(...args)=>cp.execFileSync('git',args,{cwd:root});
 if(git('rev-parse',sourceSha+'^{commit}').toString().trim()!==sourceSha)throw Error('Release commit mismatch');
 const files=new Map(FILES.map(name=>[name,git('show',sourceSha+':'+name)]));
 const html=files.get('index.html').toString(),sw=files.get('sw.js').toString();
 const build=html.match(/const BVOM_BUILD='([0-9.]+)'/)?.[1];
 if(!build||!html.includes('<title>BVOM Strength v'+build+'</title>')||
    !html.includes('BEST VERSION OF MYSELF · v'+build)||!html.includes('./sw.js?v='+build+'"')||
    !sw.includes("const BUILD = '"+build+"';")||!sw.includes("const CACHE = 'bvom-"+build+"';"))throw Error('Production version/cache mismatch');
 if(/data-bb2-test-build|__BVOM_BB2_TEST_BUILD|NETLIFY-TEST-BUILD|HOLD-TEST/.test(html+sw))throw Error('Test/HOLD marker in production source');
 fs.mkdirSync(output,{recursive:true});
 for(const [name,bytes]of files){const dest=path.join(output,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes)}
 fs.mkdirSync(path.dirname(zipFile),{recursive:true});
 const epoch=Number(git('show','-s','--format=%ct',sourceSha).toString().trim());
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
 for name,digest in expected.items():assert hashlib.sha256(z.read(name)).hexdigest()==digest,name
`,output,zipFile,String(epoch),JSON.stringify(Object.fromEntries([...files].map(([n,b])=>[n,crypto.createHash('sha256').update(b).digest('hex')])))]);
 return {sourceSha,build,files:FILES,zipFile,sha256:crypto.createHash('sha256').update(fs.readFileSync(zipFile)).digest('hex')};
}
if(require.main===module){const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];if(!['--source-sha','--output','--zip'].every(k=>args.includes(k)))throw Error('Use --source-sha SHA --output DIR --zip FILE');console.log(JSON.stringify(packageProduction({sourceSha:get('--source-sha'),output:get('--output'),zipFile:get('--zip')}),null,2))}
module.exports={packageProduction};
