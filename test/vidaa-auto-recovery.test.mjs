import test from 'node:test';
import assert from 'node:assert/strict';
import {VideaAutoRecovery} from '../src/vidaa-auto-recovery.mjs';
const sample=(watch,now,decoded,received,freezeCount,videoTime=0,qualityFrames=0,extra={})=>
  watch.observe({now,decoded,received,freezeCount,videoTime,qualityFrames,
    ready:true,connected:true,videoAttached:true,...extra});

test('two distinct WebRTC freeze rises request ONLY a no-black-flash keyframe',()=>{
 const w=new VideaAutoRecovery();
 assert.equal(sample(w,100000,100,200,0,4,100).action,'none');
 assert.equal(sample(w,106000,460,900,1,10,460).action,'none');
 const v=sample(w,112000,820,1500,2,16,820);
 assert.equal(v.action,'keyframe');
 assert.equal(v.reason,'recurrent-rtc-freezes');
 w.acknowledgeKeyframe(112000,v.reason);
 for(let n=1;n<=16;n++){
  assert.notEqual(sample(w,112000+n*6000,820+n*250,1500+n*500,
    2+n,16+n*6,820+n*250).action,'surface');
 }
});
test('constant zero VIDEO renderer metric and advancing frames never prompts surface reconstruction',()=>{
 const w=new VideaAutoRecovery();
 sample(w,100000,100,100,0,0,0);
 for(let n=1;n<80;n++){
  const v=sample(w,100000+n*6000,100+n*180,100+n*400,n,0,0);
  assert.notEqual(v.action,'surface');
  if(v.action==='keyframe')w.acknowledgeKeyframe(100000+n*6000,v.reason);
 }
 assert.equal(w.frameClockVerified,false);
 assert.equal(w.mediaClockVerified,false);
});
test('proven clocks stop for >=3 samples: keyframe, then single optional surface escalation',()=>{
 const w=new VideaAutoRecovery();
 sample(w,100000,100,200,0,10,100);
 sample(w,106000,400,800,0,16,400);
 for(const [now,d,r] of [[112000,700,1400],[118000,1000,2000]]){
  assert.equal(sample(w,now,d,r,0,16,400,{recentUserInput:true}).action,'none');
 }
 const request=sample(w,124000,1300,2600,0,16,400,{recentUserInput:true});
 assert.equal(request.action,'keyframe');
 assert.equal(request.reason,'media-clock-stall');
 w.acknowledgeKeyframe(124000,request.reason);
 for(const [now,d,r] of [[130000,1600,3200],[136000,1900,3800]]){
  assert.notEqual(sample(w,now,d,r,0,16,400,{recentUserInput:true}).action,'surface');
 }
 const recover=sample(w,142000,2200,4400,0,16,400,{recentUserInput:true});
 assert.equal(recover.action,'surface');
 w.acknowledgeSurface(142000);
 sample(w,148000,2600,4800,0,0,0,{recentUserInput:true});
 for(let k=1;k<20;k++){
  assert.notEqual(sample(w,148000+k*6000,2600+k*300,4800+k*500,k,0,0,
   {recentUserInput:true}).action,'surface');
 }
 assert.equal(w.surfaceAttempts,1);
});
test('short stalled media recovers before intervention, even if decoder constantly advances',()=>{
 const w=new VideaAutoRecovery();
 sample(w,100000,100,100,0,10,100);
 sample(w,106000,400,500,0,16,400);
 sample(w,112000,700,900,0,16,400,{recentUserInput:true});
 sample(w,118000,900,1200,0,23,700,{recentUserInput:true});
 const v=sample(w,124000,1200,1600,0,29,1200,{recentUserInput:true});
 assert.equal(v.action,'none');
});
test('TV menus and stalls without controller movement never trigger auto surface reset',()=>{
 const w=new VideaAutoRecovery();
 sample(w,100000,100,100,0,10,100);
 sample(w,106000,200,300,0,16,200);
 for(let k=1;k<=16;k++){
  let v=sample(w,106000+k*6000,200+k*200,300+k*400,0,16,200);
  assert.notEqual(v.action,'surface');
  if(v.action==='keyframe')w.acknowledgeKeyframe(106000+k*6000,v.reason);
 }
 assert.equal(sample(w,210000,3700,7000,5,16,200,{overlay:true}).action,'none');
});
test('native surface replacement and counter rollback invalidate old verified evidence',()=>{
 const w=new VideaAutoRecovery();
 sample(w,100000,100,100,0,10,100);
 sample(w,106000,200,200,0,16,200);
 assert.equal(w.mediaClockVerified,true);
 w.acknowledgeSurface(107000);
 assert.equal(w.mediaClockVerified,false);
 assert.equal(sample(w,112000,300,250,0,0,0).action,'none');
 assert.equal(sample(w,118000,400,350,0,0,0).action,'none');
});
