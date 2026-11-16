'use strict';
// Loopback-only path gateway for REAL standalone Supabase Auth and PostgREST.
// This does not manufacture responses, identity, storage or conflicts.
const http=require('node:http'),fs=require('node:fs'),crypto=require('node:crypto');
const secret='bvom-303-disposable-audit-only-jwt-secret-2026';
function token(role){const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),head=enc({alg:'HS256',typ:'JWT'}),body=enc({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400});return head+'.'+body+'.'+crypto.createHmac('sha256',secret).update(head+'.'+body).digest('base64url');}
fs.writeFileSync('/tmp/bvom-audit-local-status.json',JSON.stringify({API_URL:'http://127.0.0.1:54321',ANON_KEY:token('anon'),SERVICE_ROLE_KEY:token('service_role')}),{mode:0o600});
const server=http.createServer((req,res)=>{
 const auth=req.url.startsWith('/auth/v1'),rest=req.url.startsWith('/rest/v1');
 if(!auth&&!rest){res.writeHead(404);res.end();return;}
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'});res.end();return;}
 const path=req.url.slice((auth?'/auth/v1':'/rest/v1').length)||'/';
 const upstream=http.request({hostname:'127.0.0.1',port:auth?54323:54324,path,method:req.method,headers:{...req.headers,host:auth?'127.0.0.1:54323':'127.0.0.1:54324'}},r=>{res.writeHead(r.statusCode,{...r.headers,'access-control-allow-origin':'*','access-control-expose-headers':'*'});r.pipe(res);});
 upstream.on('error',err=>{res.writeHead(502);res.end(err.message);});req.pipe(upstream);
});server.listen(54321,'127.0.0.1',()=>console.log('Disposable real Auth/PostgREST gateway listening on loopback 54321'));
