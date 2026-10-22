import test from 'node:test';
import assert from 'node:assert/strict';
import {decoderSummary} from '../src/decoder-health.mjs';
test('decoder metrics distinguish congestion and slow hardware decoding',()=>{
 const prev={framesDecoded:100,totalDecodeTime:1,packetsReceived:1000,packetsLost:10,jitterBufferDelay:2,jitterBufferEmittedCount:200,freezeCount:4};
 const next={framesDecoded:280,totalDecodeTime:5.5,packetsReceived:4000,packetsLost:40,jitterBufferDelay:10,jitterBufferEmittedCount:400,framesPerSecond:30,frameWidth:1280,frameHeight:720,freezeCount:7};
 const s=decoderSummary(prev,next);
 assert.equal(s.fps,30);
 assert.equal(s.decodeMs,25);
 assert.equal(s.lossPercent,1);
 assert.equal(s.jitterMs,40);
 assert.equal(s.width,1280);assert.equal(s.height,720);
 assert.equal(s.freezeRise,3);
});
test('older VIDAA browsers omit optional fields gracefully',()=>{
 const data=decoderSummary(null,{framesDecoded:0,packetsReceived:300});
 assert.equal(data.decodeMs,null);
 assert.equal(data.lossPercent,null);
 assert.equal(data.jitterMs,null);
 assert.equal(data.fps,null);
});
test('negative counter resets are not reported as packet loss',()=>{
 const data=decoderSummary({packetsLost:100,packetsReceived:1000},{packetsLost:2,packetsReceived:10});
 assert.equal(data.lossPercent,null);
});
