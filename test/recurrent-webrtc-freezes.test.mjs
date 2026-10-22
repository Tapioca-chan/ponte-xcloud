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
 assert.equal(poll(w,70000,7).suspected,true,'evidence can become eligible after initial stream grace');
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
