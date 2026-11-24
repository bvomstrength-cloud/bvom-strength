'use strict';
// Independent arithmetic oracle. Does not import or execute BVOM code.
// Rule sources and implementation-only clarifications are in audit/ORACLE.md.
const copy = x => JSON.parse(JSON.stringify(x));
const ladders3=[[5,6,8],[4,5,7],[3,4,6],[2,3,5],[1,2,4]];
const ladders5=[[5,5,5,6,8],[4,4,4,5,7],[3,3,3,4,6],[2,2,2,3,5],[1,1,1,2,4]];
const rotations={lprpt:{A:['Squat','Bench Press','Prone Row'],B:['Squat','Overhead Press','Deadlift']},hlm:{H:['Squat','Bench Press','Prone Row'],L:['Squat','Deadlift','Overhead Press'],M:['Squat','Bench Press','Supine Row']},fourday:{1:['Bench Press','Prone Row'],2:['Squat'],3:['Bench Press','Overhead Press'],4:['Squat','Deadlift']}};
const grid=(x,q=2.5,min=q)=>Math.max(min,Math.floor(x/q+0.5)*q);
const isDriver=(mode,day,n)=>['Squat','Bench Press'].includes(n)&&(mode==='hlm'?day==='H':mode==='fourday'?day===(n==='Squat'?'2':'1'):false);
const isMedium=(mode,day,n)=>mode==='hlm'?day==='M'&&['Squat','Bench Press'].includes(n):mode==='fourday'&&(n==='Squat'&&day==='4'||n==='Bench Press'&&day==='3');
function prescription(m,day,n){
 const c=m.core[n],w=m.weights[n],d=c.drop/100,der=x=>grid(x,2.5,20),inter=m.mode!=='lprpt';
 let targets,loads,kind,top=0;
 if(inter&&isDriver(m.mode,day,n)){
  const t=m.next[n]??m.driver[n],r=m.rep[n];targets=ladders5[5-r];loads=[.9,.95,1,1-d,1-2*d].map(f=>der(t*f));kind='heavy';top=2;
 }else if(m.mode==='hlm'&&day==='L'&&n==='Squat'){
  targets=[m.rep[n],m.rep[n]];loads=targets.map(()=>grid(m.driver[n]*.8));kind='light';
 }else if(inter&&isMedium(m.mode,day,n)){
  targets=[m.rep[n]];loads=[grid(m.driver[n]*(n==='Squat'?1.1:1.05))];kind='medium';
 }else if(c.mode==='straight'){
  targets=Array(n==='Deadlift'?1:n==='Overhead Press'?5:n==='Supine Row'?3:3).fill(n==='Supine Row'&&m.mode==='hlm'?8:5);loads=targets.map(()=>w);kind='straight';
 }else if(n==='Overhead Press'){
  targets=ladders5[c.rptLevel];loads=[1-2*d,1-d,1,1-d,1-2*d].map(f=>der(w*f));kind='rpt5';top=2;
 }else if(n==='Deadlift'){
  targets=[Math.max(1,4-c.rptLevel),Math.max(2,5-c.rptLevel)];loads=[w,der(w*(1-d))];kind='rptDL';
 }else{
  targets=n==='Supine Row'&&m.mode==='hlm'?[[8,9,11],[7,8,10],[6,7,9],[5,6,8],[4,5,7]][c.rptLevel]:ladders3[c.rptLevel];loads=[w,der(w*(1-d)),der(w*(1-2*d))];kind='rpt3';
 }
 return {targets:copy(targets),loads,kind,top};
}
function plan(m,day,n,records={},skipSingle=false){
 const p=prescription(m,day,n),d=m.core[n].drop/100,der=x=>grid(x,2.5,20);
 let rows=p.targets.map((target,i)=>({target,load:p.loads[i],top:i===p.top,drop:p.kind!=='straight'&&i>p.top,amrap:p.kind==='heavy'?i===4:p.kind==='rpt3'?i===2:p.kind==='rpt5'?i===4:p.kind==='rptDL'?i===1:false,optional:false}));
 if(p.kind==='light')return rows.map(r=>({...r,top:false,drop:false}));
 if(p.kind==='medium'){
  const r=records[0];if(!r)return rows;
  if(r.reps<p.targets[0])return [...rows,{target:p.targets[0],load:der(p.loads[0]*(1-d)),top:false,drop:true,amrap:false,optional:false}];
  if(!skipSingle&&m.rep[n]>2){const base=n==='Squat'?10:5,rp=m.rep[n],pct=rp===5?base:rp===4?base*(n==='Squat'?.75:.8):base*.5;rows.push({target:1,load:grid(r.load*(1+pct/100)),optional:true,top:false,drop:false,amrap:false});}
  return rows;
 }
 const miss=p.targets.findIndex((t,i)=>records[i]&&records[i].reps<t);
 if(miss>=0){
  let target=Math.max(1,records[miss].reps+1),load=der(p.loads[miss]*(1-d));
  const heavy=p.kind==='heavy'&&miss>=2;
  let remaining=heavy?(miss>=3?(miss===3?2:1):p.targets.length-miss-1):p.targets.length-miss-1;
  rows=rows.slice(0,miss+1);
  for(let j=0;j<remaining;j++){
   const off=heavy?(j===0?0:2):remaining>=3?(j===0?0:j===1?1:3):remaining===2?(j===0?0:2):0;
   const ix=rows.length,t=heavy?Math.max(1,target+off):target+off;
   rows.push({target:t,load,top:false,drop:true,amrap:j===remaining-1,optional:false});
   if(records[ix]&&records[ix].reps<t)target=heavy?Math.max(1,target-1):target-1;
   load=der(load*(1-d));
  }
  if(p.kind==='straight'&&miss===p.targets.length-1)rows.push({target:p.targets.at(-1),load:der(p.loads.at(-1)*(1-d)),drop:true,top:false,amrap:true,optional:false});
 }
 if(m.mode!=='lprpt'&&n==='Deadlift'&&m.core[n].mode!=='rpt'&&records[0]?.reps>=5&&!skipSingle)rows.push({target:1,load:grid(records[0].load*1.1),optional:true,top:false,drop:false,amrap:false});
 return rows;
}
function completeLift(m,day,n,records,{close='repeat',third='repeat'}={}){
 const p=prescription(m,day,n),rows=plan(m,day,n,records),base=isDriver(m.mode,day,n)?m.driver[n]:m.weights[n];
 if(!rows.every((_,i)=>records[i]))return {action:'incomplete'};
 if(p.kind==='light'||p.kind==='medium')return {action:'hold-derived'};
 if(p.kind==='heavy'){
  const success=[0,1,2].every(i=>records[i].reps>=p.targets[i]);
  if(success){m.next[n]=grid(base+m.core[n].increment);m.fail[n]=0;return {action:'nextHeavy',next:m.next[n]};}
  m.fail[n]++;
  if(m.fail[n]===3){if(third==='drop'&&m.rep[n]>2)m.rep[n]--;m.fail[n]=0;return {action:'heavy-choice',rep:m.rep[n]};}
  return {action:'heavy-fail',count:m.fail[n]};
 }
 const preMiss=p.targets.some((t,i)=>i<p.top&&records[i]?.reps<t),topMiss=records[p.top].reps<p.targets[p.top],backMiss=p.targets.some((t,i)=>i>p.top&&records[i]?.reps<t);
 const near=p.kind!=='straight'&&!preMiss&&!topMiss&&backMiss;
 const failed=preMiss||topMiss||(!near&&p.targets.some((t,i)=>records[i]?.reps<t));
 if(!failed&&(!near||close==='progress')){m.weights[n]=grid(base+m.core[n].increment);m.attempts[n]=0;return {action:'increase',next:m.weights[n]};}
 m.attempts[n]=(m.attempts[n]||0)+1;
 if(m.attempts[n]===3){m.attempts[n]=0;if(third==='progress'){if(m.core[n].mode==='straight')m.core[n].mode='rpt';else m.core[n].rptLevel++;m.weights[n]=grid(base+m.core[n].increment);}return {action:'lp-choice'};}
 return {action:near?'close-repeat':'failed',count:m.attempts[n]};
}
const bb1Spec={
 machine_chest_press:{method:'stable',sets:3,lo:6,hi:8},hack_squat:{method:'stable',sets:3,lo:6,hi:8},high_bar_squat:{method:'demanding',sets:3,lo:6,hi:8},
 chest_supported_row:{method:'double',sets:2,lo:8,hi:12},seated_leg_curl:{method:'double',sets:2,lo:10,hi:15},cable_lateral_raise:{method:'double',sets:2,lo:12,hi:20},cable_pushdown:{method:'double',sets:2,lo:10,hi:15},
 lat_pulldown:{method:'stable',sets:3,lo:6,hi:8},romanian_deadlift:{method:'demanding',sets:3,lo:6,hi:8},incline_dumbbell_press:{method:'double',sets:2,lo:8,hi:12},leg_extension:{method:'double',sets:2,lo:10,hi:15},reverse_pec_deck:{method:'double',sets:2,lo:12,hi:20},cable_curl:{method:'double',sets:2,lo:10,hi:15},dumbbell_bench_press:{method:'stable',sets:3,lo:6,hi:8}
};
function bb1Plan(id,p){const s=bb1Spec[id];return Array.from({length:s.sets},(_,i)=>({load:i&&s.method!=='double'?Math.round(grid(p.load*(s.method==='stable'?.92:.95),p.preparationStep??p.increment)*100)/100:p.load,minReps:i&&s.method!=='double'?null:s.lo,maxReps:i&&s.method!=='double'?(s.method==='stable'?10:8):s.hi}));}
function bb1Progress(id,p,records){const s=bb1Spec[id],g=s.method==='double'?records:records.slice(0,1),first=g[0];let action='hold';if(first.reps<s.lo)action='reduce';else if(!g.some(x=>x.hard)&&first.reps>=s.hi&&g.slice(1).every(x=>x.reps>=s.lo))action='increase';if(action==='increase'){p.previous=p.load;p.load=Math.round((p.load+p.increment)*100)/100;}if(action==='reduce')p.load=p.previous>0&&p.previous<p.load?p.previous:Math.round((p.load-p.increment)*100)/100;return action;}
const bb2Days={upper_a:[['flat_press',3,6,8,'bench_press'],['horizontal_row',3,8,12,'chest_supported_row'],['shoulder_press',2,8,12,'dumbbell_shoulder_press'],['triceps_extension',2,10,15,'lying_barbell_triceps_extension']],lower_a:[['squat',3,6,8,'high_bar_squat'],['unilateral_quad',2,8,12,'bulgarian_split_squat'],['hamstring_curl',3,6,10,'lying_leg_curl'],['calf_raise',2,10,20,'standing_calf_raise']],upper_b:[['incline_press',3,8,12,'incline_dumbbell_press'],['vertical_pull',3,6,10,'lat_pulldown'],['horizontal_row',2,8,12,'chest_supported_row'],['lateral_raise',3,12,20,'dumbbell_lateral_raise'],['secondary_chest',2,10,15,'dumbbell_fly']],lower_b:[['quad',2,8,12,'front_squat'],['hip_hinge',3,6,8,'romanian_deadlift'],['calf_raise',2,10,20,'standing_calf_raise'],['abdominal',2,10,15,'weighted_crunch']]};
const bb2Load=id=>/squat|deadlift/.test(id)?100:/calf/.test(id)?70:/lateral/.test(id)?8:/triceps|crunch/.test(id)?20:/dumbbell|fly|bulgarian/.test(id)?24:60;
module.exports={copy,grid,ladders3,ladders5,rotations,isDriver,isMedium,prescription,plan,completeLift,bb1Spec,bb1Plan,bb1Progress,bb2Days,bb2Load};
