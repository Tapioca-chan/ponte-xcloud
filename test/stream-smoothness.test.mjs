import test from 'node:test';
import assert from 'node:assert/strict';
import {measureSmoothness,AdaptiveVideoPlayout} from '../src/stream-smoothness.mjs';
const sample=(at,options={})=>({at,decoded:100,packets:1000,lost:0,
 decodeTime:1,emitted:100,bufferTime:2,freezes:1,dropped:2,...options});
test('Reports actual network jitter and packet loss instead of falsely lowering game quality',()=>{
 const baseline=sample(1000);
 const s=measureSmoothness(baseline,{
  framesDecoded:300,packetsReceived:1700,packetsLost:45,
  totalDecodeTime:3,jitterBufferEmittedCount:300,jitterBufferDelay:6,
  freezeCount:2,framesDropped:4,jitter:0.040
 },6000).metrics;
 assert.equal(s.fps,40);
 assert.equal(s.jitterMs,40);
 assert.ok(s.lossPct>5);
 assert.equal(s.cause,'network');
 assert.equal(s.decodeMs,10);
 assert.equal(s.bufferMs,20);
});
test('Reports decoder bottleneck separately and does not buffer to hide it',()=>{
 const m=measureSmoothness(sample(1000),{
 framesDecoded:200,packetsReceived:2000,packetsLost:0,
 totalDecodeTime:4,jitter:0.003
 },6000).metrics;
 assert.equal(m.decoderTrouble,true);
 assert.equal(m.cause,'decoder');
 const tuner=new AdaptiveVideoPlayout();
 const receiver={track:{kind:'video'},jitterBufferTarget:0};
 for(let i=0;i<4;i++)tuner.observe(m,{getReceivers:()=>[receiver]},5000+i*6500);
 assert.equal(receiver.jitterBufferTarget,0);
});
test('Only supported browsers receive a capped non-destructive jitter buffer after repeated bad windows',()=>{
 const t=new AdaptiveVideoPlayout();
 const receiver={track:{kind:'video'},jitterBufferTarget:0};
 const p={getReceivers:()=>[receiver]};
 const bad={cause:'network',networkTrouble:true,decoderTrouble:false,jitterMs:60,lossPct:7,fps:50};
 assert.equal(t.observe(bad,p,1000).targetMs,0);
 const changed=t.observe(bad,p,7500);
 assert.equal(changed.targetMs,120);
 assert.equal(receiver.jitterBufferTarget,90);
 const good={cause:'stable-or-unknown',networkTrouble:false,decoderTrouble:false,fps:60};
 for(let i=0;i<4;i++)t.observe(good,p,15000+i*6500);
 assert.equal(receiver.jitterBufferTarget,0);
 const old=new AdaptiveVideoPlayout();
 assert.equal(old.observe(bad,{getReceivers:()=>[{track:{kind:'video'}}]},1000).targetMs,0);
 assert.equal(old.observe(bad,{getReceivers:()=>[{track:{kind:'video'}}]},7000).mode,'unsupported');
});
test('Blank or unsupported stats never manufacture packet loss or latency',()=>{
 const m=measureSmoothness(null,{framesDecoded:0,packetsReceived:0},Date.now()).metrics;
 assert.equal(m.lossPct,null);assert.equal(m.decodeMs,null);
 assert.equal(m.networkTrouble,false);
});

test('A burst of VIDAA 68ms jitter and repeated RTC freezes is stabilized after one verified window',()=>{
 const tuner=new AdaptiveVideoPlayout();
 const receiver={track:{kind:'video'},jitterBufferTarget:0};
 const result=tuner.observe({cause:'network',networkTrouble:true,decoderTrouble:false,
  jitterMs:68,lossPct:0,newFreezes:3,fps:55},{getReceivers:()=>[receiver]},7000);
 assert.equal(result.mode,'network-buffered');
 assert.equal(result.targetMs,135);
 assert.equal(receiver.jitterBufferTarget,135);
});
