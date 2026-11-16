'use strict';
// v3.0.4 keeps the existing local-first Supabase backup protocol.
// No production database migration, RPC or revision column is required.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const app=fs.readFileSync(path.join(root,'index.html'),'utf8');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/bvom-bb2-cloud-proof.yml'),'utf8');
const extract=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i+1);assert(i>=0&&j>i,'expected cloud function anchors');return app.slice(i,j)};
const latest=extract('async function bvomCloudLatest()','async function bvomCloudAssessSync()');
const assess=extract('async function bvomCloudAssessSync()','function bvomNeedsLegacyBackupReminder()');
const commit=extract('async function bvomLegacyCloudCommit(','async function bvomCloudAutoSave()');
const auto=extract('async function bvomCloudAutoSave()','async function bvomCloudSaveNow()');
const manual=extract('async function bvomCloudSaveNow()','async function bvomCloudRestore()');
const restore=extract('async function bvomCloudRestore()','async function bvomCloudSignOut()');
for(const [name,body] of [['latest',latest],['restore',restore]]){
 assert(body.includes("select('id,data,created_at')"),name+' reads existing table fields');
}
assert(!app.includes('legacy_revision'),'no migration-only revision field');
assert(!app.includes('bvom_legacy_cloud_commit_v1'),'no migration-only RPC');
assert(!fs.existsSync(path.join(root,'supabase/migrations/20261115203345_legacy_history_compare_and_swap.sql')),'no migration in release');
assert(commit.includes(".from('bvom_data').update("),'existing update protocol');
assert(commit.includes(".from('bvom_data').insert("),'existing first-backup protocol');
assert(commit.includes(".eq('user_id',owner)"),'owner-filtered update');
assert(auto.includes('remoteChanged')&&auto.includes('bvomLegacyCloudConflict()'),'auto upload detects changed cloud');
assert(manual.includes('remoteFingerprint')&&manual.includes('resolveConflict'),'manual save respects existing conflict choice');
assert(assess.includes('bvomCloudConflictNotice()'),'cloud/device conflict popup retained');
assert(restore.includes('bvomChoiceModal(')&&restore.includes('bvomRestoreCommitAllowed('),'restore requires user confirmation and valid state');
assert(!workflow.includes('legacy_history_compare_and_swap.sql'),'CI never applies removed migration');
console.log('PASS 12 existing-cloud static protocol checks (not a hosted sync test)');
