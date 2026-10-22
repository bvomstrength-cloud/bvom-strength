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
  s.bodybuilding.performanceRefs.chest_supported_row={'62.5':{load:62.5,reps:11}};
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
   next.bodybuilding.performanceRefs.chest_supported_row['62.5'].reps===11&&
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
};
