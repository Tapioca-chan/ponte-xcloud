import test from 'node:test';
import assert from 'node:assert/strict';
import {RecurrentWebRtcFreezeWatch} from '../src/recurrent-webrtc-freezes.mjs';
function poll(w,now,freezeCount,extra={}){
 return w.observe({now,freezeCount,decodedDelta:190,receivedDelta:2200,firstVideoAt:1000,...extra});
}
test('observed screenshot pattern: 2 separated freezes with decoded frames provoke recovery',()=>{
 const w=new RecurrentWebRtcFreezeWatch();
 assert.equal(poll(w,61000,3).suspected,false);
 assert.equal(poll(w,66000,4).suspected,false);
 assert.equal(poll(w,95000,4).suspected,false);
 const x=poll(w,105000,5);
 assert.equal(x.suspected,true);
 assert.equal(x.recentEvents,2);
 w.acknowledgeRecovery();
 assert.equal(poll(w,111000,5).suspected,false,'cannot reuse past freezes');
 assert.equal(poll(w,153000,6).suspected,false);
 assert.equal(poll(w,160000,7).suspected,true);
});
test('WebRTC freeze counter first poll establishes baseline and ad grace prevents premature reset',()=>{
 const w=new RecurrentWebRtcFreezeWatch();
 assert.equal(poll(w,20000,5).suspected,false);
 assert.equal(poll(w,30000,6).suspected,false);
 assert.equal(poll(w,40000,7).suspected,false);
 assert.equal(poll(w,70000,7).suspected,false,'pre-roll evidence is never reused');
 assert.equal(poll(w,76000,8).suspected,false);
 assert.equal(poll(w,82000,9).suspected,true,'only repeated post-grace freezes count');
});
test('ad transition, absent or resetting metrics do not count as confirmed repeated freezes',()=>{
 const w=new RecurrentWebRtcFreezeWatch();
 poll(w,70000,4);
 assert.equal(poll(w,76000,6).suspected,false,'two events in one interval are not two independent observations');
 assert.equal(poll(w,82000,7,{decodedDelta:0}).suspected,false);
 assert.equal(poll(w,90000,8,{receivedDelta:0}).suspected,false);
 assert.equal(poll(w,98000,3).suspected,false,'counter reset');
 assert.equal(poll(w,104000,4).suspected,false);
 assert.equal(poll(w,110000,null).suspected,false);
 assert.equal(poll(w,117000,5).suspected,false);
});
test('evidence expires after window and does not trigger without two recent observations',()=>{
 const w=new RecurrentWebRtcFreezeWatch();
 poll(w,1000,0);
 poll(w,65000,1);
 assert.equal(poll(w,185000,2).suspected,false);
 assert.equal(poll(w,191000,3).suspected,true);
});

test('faster Toshiba polls detect two separated post-45s freezes rather than waiting 60s',()=>{
 const w=new RecurrentWebRtcFreezeWatch();
 assert.equal(poll(w,40000,0).suspected,false);
 assert.equal(poll(w,44000,1).suspected,false,'ad/preroll freeze remains below grace');
 assert.equal(poll(w,47000,2).suspected,false,'first eligible interval');
 assert.equal(poll(w,51000,3).suspected,true,'second eligible interval');
 w.acknowledgeRecovery();
 assert.equal(poll(w,55000,3).suspected,false,'no immediate retry on same freeze counter');
});

test('Metro fastStart: two independent rising polls recover intro without arbitrary startup delay',()=>{
 const x=new RecurrentWebRtcFreezeWatch();
 const fast={fastStart:true};
 assert.equal(poll(x,5000,0,fast).suspected,false);
 assert.equal(poll(x,9000,1,fast).suspected,false);
 assert.equal(poll(x,13000,2,fast).suspected,true);
 x.acknowledgeRecovery();
 // Continuous freeze-count growth must NOT cause repeated hardware flashes.
 assert.equal(poll(x,17000,4,fast).suspected,false);
 assert.equal(poll(x,21000,5,fast).suspected,false);
 assert.equal(poll(x,25000,5,fast).suspected,false);
 assert.equal(poll(x,29000,5,fast).suspected,false);
 assert.equal(poll(x,33000,6,fast).suspected,false);
 assert.equal(poll(x,37000,7,fast).suspected,true);
});
test('Metro fastStart: no repair until recovery events are rearmed after two quiet samples',()=>{
 const x=new RecurrentWebRtcFreezeWatch();
 const fast={fastStart:true};
 poll(x,5000,0,fast);
 poll(x,9000,1,fast);
 poll(x,13000,2,fast);
 x.acknowledgeRecovery();
 for(let i=3;i<15;i++)assert.equal(poll(x,i*4000+5000,i,fast).suspected,false,
  'ongoing counter growth is not a valid new independent freeze episode');
});
