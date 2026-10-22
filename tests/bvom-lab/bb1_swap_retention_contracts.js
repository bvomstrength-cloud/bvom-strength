'use strict';
// BB1: switching a selected movement must not erase its exercise-scoped
// prescription, calibration, performance references, or future ability to resume.
module.exports=({test,ok,H,build})=>{
 const disk=h=>JSON.parse(h.ls.getItem('bvom_data'));
 const fixture=()=>{
  const h=H.boot(build);H.bbStart(h);
  const s=h.S();
  s.bodybuilding.completedSessions=7;
  s.day='B';
  s.bodybuilding.progression.chest_supported_row={
   load:62.5,topLoad:62.5,increment:2.5,calibrated:true,
   previousSuccessfulLoad:60,attempts:3
  };
  s.bodybuilding.performanceRefs.chest_supported_row={[h.ctx.bvomBbComparableKey('chest_supported_row',62.5)]:{load:62.5,reps:11}};
  s.history.push({date:'2026-10-01T00:00:00.000Z',program:'bodybuilding',day:'A',
   session:{'BB:chest_supported_row':{0:{load:60,reps:11}}}});
  s.weights.Squat=145;
  h.ev('save()');
  return h;
 };
 const swap=(h,id,load)=>{
  h.ctx.__bvomBbSetupDraft=null;
  h.ctx.bvomBbSetupSelect('A3',id);
  if(load!=null){h.ctx.bvomBbSetupValue(id,'load',load);h.ctx.bvomBbSetupValue(id,'increment',2.5)}
  h.ctx.bvomBbCommitSetup();
  return disk(h);
 };
 test('BB1-SWAP-KEEP-INACTIVE','DEFECT','Switching a row retains its inactive exercise progress and original History without advancing the block',()=>{
  const h=fixture(),start=disk(h),next=swap(h,'barbell_row',45),reload=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage});
  const p=next.bodybuilding.progression;
  return ok(next.bodybuilding.selections.A3==='barbell_row'&&
   p.barbell_row.load===45&&p.barbell_row.increment===2.5&&
   p.chest_supported_row.load===62.5&&p.chest_supported_row.calibrated===true&&
   p.chest_supported_row.previousSuccessfulLoad===60&&
   next.bodybuilding.performanceRefs.chest_supported_row['chest_supported_row|62.5'].reps===11&&
   next.bodybuilding.completedSessions===7&&
   JSON.stringify(next.history)===JSON.stringify(start.history)&&
   next.weights.Squat===145&&
   reload.S().bodybuilding.progression.chest_supported_row.load===62.5,
   JSON.stringify({chosen:next.bodybuilding.selections.A3,kept:p.chest_supported_row?.load,
    newLoad:p.barbell_row?.load,count:next.bodybuilding.completedSessions}));
 });
 test('BB1-SWAP-RESTORE-BOTH','DEFECT','Returning to previously selected row restores its own exact weight/progression and keeps alternate progression',()=>{
  const h=fixture();swap(h,'barbell_row',45);
  const back=swap(h,'chest_supported_row');
  const again=swap(h,'barbell_row');
  return ok(back.bodybuilding.progression.chest_supported_row.load===62.5&&
   back.bodybuilding.progression.chest_supported_row.previousSuccessfulLoad===60&&
   back.bodybuilding.progression.barbell_row.load===45&&
   again.bodybuilding.progression.chest_supported_row.load===62.5&&
   again.bodybuilding.progression.barbell_row.load===45&&
   again.bodybuilding.completedSessions===7&&again.history.length===1,
   JSON.stringify({back:back.bodybuilding.progression.chest_supported_row,
    again:again.bodybuilding.progression.barbell_row}));
 });
 test('BB1-SWAP-CANCEL-NEUTRAL','CONTROL','Browsing alternate exercises and cancelling does not alter saved selection or progression',()=>{
  const h=fixture(),before=h.ls.getItem('bvom_data');
  h.ctx.__bvomBbSetupDraft=null;
  h.ctx.bvomBbSetupSelect('A3','barbell_row');
  const fresh=h.ctx.bvomBbSetupDraft().progression.barbell_row;
  h.ctx.bvomBbSetupValue('barbell_row','load',45);
  h.ctx.bvomBbCancelSetup();
  return ok(!fresh&&h.ls.getItem('bvom_data')===before&&
   h.S().bodybuilding.selections.A3==='chest_supported_row'&&
   h.S().bodybuilding.progression.chest_supported_row.load===62.5,
   JSON.stringify({fresh:!!fresh,saved:h.S().bodybuilding.selections.A3}));
 });
 test('BB1-SWAP-INACTIVE-EDIT-CLEARS-STALE','DEFECT',
  'Editing inactive-by-commit load clears obsolete previousSuccessfulLoad before returning and reducing after a real workout',()=>{
  const h=fixture();h.S().bodybuilding.completedSessions=6;h.S().day='A';h.ev('save()');
  h.ctx.__bvomBbSetupDraft=null;
  h.ctx.bvomBbSetupValue('chest_supported_row','load',80);
  h.ctx.bvomBbSetupSelect('A3','barbell_row');
  h.ctx.bvomBbSetupValue('barbell_row','load',45);
  h.ctx.bvomBbSetupValue('barbell_row','increment',2.5);
  h.ctx.bvomBbCommitSetup();
  const inactive=disk(h).bodybuilding.progression.chest_supported_row;
  const switched=inactive.load===80&&!('previousSuccessfulLoad' in inactive);
  const restored=swap(h,'chest_supported_row');
  const clean=restored.bodybuilding.progression.chest_supported_row.load===80&&
   !('previousSuccessfulLoad' in restored.bodybuilding.progression.chest_supported_row);
  H.bbSession(h,(id,i)=>id==='chest_supported_row'&&i===0?{reps:5,load:80}:{});
  const after=disk(h),p=after.bodybuilding.progression.chest_supported_row;
  const decision=after.history.at(-1)?.bodybuilding?.decisions?.find(x=>x.id==='chest_supported_row')?.decision;
  return ok(switched&&clean&&p.load===77.5&&p.topLoad===77.5&&
   decision?.action==='reduce'&&after.bodybuilding.completedSessions===7&&
   after.bodybuilding.progression.barbell_row.load===45,
   JSON.stringify({switched,clean,current:p.load,decision,count:after.bodybuilding.completedSessions}));
 });
 test('BB1-SWAP-ALTERNATE-TRAIN-RESUME','DEFECT',
  'Alternate row really earns its own load increase before restoring original row, without cross-exercise leakage',()=>{
  const h=fixture();h.S().bodybuilding.completedSessions=6;h.S().day='A';h.ev('save()');
  swap(h,'barbell_row',45);
  h.S().bodybuilding.progression.barbell_row.calibrated=true;h.ev('save()');
  H.bbSession(h,(id,i)=>id==='barbell_row'&&i===0?{reps:8,load:45}:{});
  const trained=disk(h),earned=trained.bodybuilding.progression.barbell_row.load===47.5&&
   trained.bodybuilding.completedSessions===7&&trained.history.length===2;
  const back=swap(h,'chest_supported_row');
  const restored=back.bodybuilding.progression.chest_supported_row.load===62.5&&
   back.bodybuilding.progression.barbell_row.load===47.5&&back.bodybuilding.completedSessions===7;
  const again=swap(h,'barbell_row');
  return ok(earned&&restored&&again.bodybuilding.progression.barbell_row.load===47.5,
   JSON.stringify({earned,restored,alternate:again.bodybuilding.progression.barbell_row.load}));
 });
 test('BB1-SWAP-COMPARABLE-PERFORMANCE-REF','DEFECT',
  'Real exercise-qualified performance-reference key remains usable after switch away and back',()=>{
  const h=fixture(),before=h.ctx.bvomBbPerformanceDrop('chest_supported_row',62.5,7);
  swap(h,'barbell_row',45);swap(h,'chest_supported_row');
  const after=h.ctx.bvomBbPerformanceDrop('chest_supported_row',62.5,7);
  return ok(before?.triggered===true&&after?.triggered===true&&
   after.referenceReps===11&&Math.abs(after.drop-4/11)<1e-7,
   JSON.stringify({before,after}));
 });
};
