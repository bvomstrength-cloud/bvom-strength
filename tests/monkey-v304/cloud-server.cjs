'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),a=require('node:assert/strict'),{createClient}=require('@supabase/supabase-js');
const c=JSON.parse(fs.readFileSync('/tmp/bvom-audit-local-status.json'));a.equal(c.API_URL,'http://127.0.0.1:54321');
const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(c.API_URL,c.SERVICE_ROLE_KEY,options),checks=[];
function eq(label,actual,expected){a.deepEqual(actual,expected,label);checks.push({label,pass:true,actual,expected})}
async function main(){
 const email='server-race-'+Date.now()+'@example.invalid',password='Disposable-Server-304!',created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;const owner=created.data.user.id;
 const clients=[createClient(c.API_URL,c.ANON_KEY,options),createClient(c.API_URL,c.ANON_KEY,options)];for(const client of clients){const r=await client.auth.signInWithPassword({email,password});if(r.error)throw r.error}
 const commit=(client,p)=>client.rpc('bvom_legacy_cloud_commit_v1',p);
 const args=n=>({p_owner_id:owner,p_expected_id:null,p_expected_revision:0,p_data:{probe:n},p_request_id:crypto.randomUUID()});
 const first=await Promise.all(clients.map((client,i)=>commit(client,args(i))));eq('Two first uploads have exactly one winner',first.map(r=>r.data.status).sort(),['committed','conflict']);
 let rows=await clients[0].from('bvom_data').select('*');eq('First race creates one document',rows.data.length,1);let row=rows.data[0];
 const p={p_owner_id:owner,p_expected_id:row.id,p_expected_revision:row.legacy_revision,p_data:{probe:'second'},p_request_id:crypto.randomUUID()};
 const next=await commit(clients[0],p);eq('Conditional update increments revision',next.data.revision,row.legacy_revision+1);
 const stale=await commit(clients[1],{...p,p_data:{probe:'stale'},p_request_id:crypto.randomUUID()});eq('Stale update rejected in server',stale.data,{status:'conflict'});
 const replay=await commit(clients[1],p);eq('Same request retried without duplication',[replay.data.status,replay.data.replayed,replay.data.revision],['committed',true,next.data.revision]);
 const latest={...p,p_expected_revision:next.data.revision,p_request_id:crypto.randomUUID(),p_data:{probe:'third'}};const third=await commit(clients[0],latest);eq('Newer writer accepted',third.data.revision,next.data.revision+1);
 const lateReplay=await commit(clients[1],p);eq('Once-idempotent stale retry cannot replace newer data',lateReplay.data,{status:'conflict'});
 const invalid=await commit(clients[0],{...latest,p_data:null});eq('Null body rejected',invalid.error?.code,'22023');
 const anon=createClient(c.API_URL,c.ANON_KEY,options);const anonymous=await commit(anon,latest);eq('Anonymous cannot invoke writer',anonymous.error?.code,'42501');
 const observed=await clients[0].from('bvom_data').select('*');row=observed.data[0];
 // Trusted administrative updates must also invalidate pending client writes.
 const updated=await admin.from('bvom_data').update({data:{probe:'maintenance'}}).eq('id',row.id).select('legacy_revision').single();if(updated.error)throw updated.error;eq('Trusted maintenance bumps revision',updated.data.legacy_revision,row.legacy_revision+1);
 const old=await commit(clients[0],{...latest,p_expected_revision:row.legacy_revision,p_request_id:crypto.randomUUID()});eq('Maintenance invalidates old client baseline',old.data,{status:'conflict'});
 // Preserve duplicate historical documents, but accept writes only against
 // the same deterministic latest row. No migration deduplication is allowed.
 const older=await admin.from('bvom_data').insert({user_id:owner,data:{probe:'old-archive'},created_at:'2020-01-01T00:00:00Z'}).select('*').single();if(older.error)throw older.error;
 const wrong=await commit(clients[1],{...latest,p_expected_id:older.data.id,p_expected_revision:older.data.legacy_revision,p_request_id:crypto.randomUUID()});eq('An older duplicate cannot be overwritten as latest',wrong.data,{status:'conflict'});
 rows=await clients[0].from('bvom_data').select('*');eq('Legacy duplicate retained intact',rows.data.find(r=>r.id===older.data.id).data,{probe:'old-archive'});
 const out=path.resolve(process.env.BVOM_MONKEY_OUT||'artifacts/monkey-v304/cloud');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'cloud-server.json'),JSON.stringify({owner,checks,total:checks.length},null,2));console.log('PASS',checks.length,'real PostgreSQL CAS contracts');
}
main().catch(e=>{console.error(e);process.exitCode=1});
