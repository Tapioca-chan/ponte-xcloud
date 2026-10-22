import test from 'node:test';
import assert from 'node:assert/strict';
import {VideoFreezeWatchdog,differsVisibly,canAutoRecoverStream,classifyAudioVideoStall} from '../src/video-freeze-watchdog.mjs';
function image(level=12){const a=new Uint8Array(32*18);for(let i=0;i<a.length;i++)a[i]=i%2?level:level+8;return a;}
function tick(w,{now,signature=image(),decoded=Math.floor(now/100),presented=Math.floor(now/100),recentInput=true,received=Math.floor(now/20),connection='connected',videoReadyState=4}={}){
 return w.observe({now,signature,decoded,presented,received,recentInput,connection,videoReadyState});
}
test('visible pixel differences are resilient to tiny decoder noise',()=>{
 const a=image();const noisy=image();noisy[2]=a[2]+2;
 assert.equal(differsVisibly(a,noisy),false);
 const changed=image(23);assert.equal(differsVisibly(a,changed),true);
});
test('frozen visual pattern needs real decoded and presented frame progress and ad grace',()=>{
 const w=new VideoFreezeWatchdog();
 tick(w,{now:1000});
 for(let i=1;i<=9;i++)tick(w,{now:1000+i*6500});
 const x=tick(w,{now:66000});assert.equal(x.frozen,true);
 assert.equal(x.status,'suspected-visual-freeze');
 const w2=new VideoFreezeWatchdog();
 tick(w2,{now:1000});
 for(let i=1;i<=8;i++)tick(w2,{now:1000+i*6500,decoded:0,presented:0});
 assert.equal(tick(w2,{now:66000,decoded:0,presented:0}).frozen,false);
 const w3=new VideoFreezeWatchdog();
 tick(w3,{now:1000});
 for(let i=1;i<=6;i++)tick(w3,{now:1000+i*6500});
 assert.equal(tick(w3,{now:41000}).frozen,false,'free preroll protected by startup grace');
});
test('advertisement/cutscene motion resets visual watchdog and long idle static menus are protected',()=>{
 const w=new VideoFreezeWatchdog();
 tick(w,{now:1000});
 for(let i=1;i<=8;i++)tick(w,{now:1000+i*6500});
 const moved=tick(w,{now:60000,signature:image(22)});
 assert.equal(moved.frozen,false);
 assert.equal(tick(w,{now:66000,signature:image(22)}).frozen,false);
 const idle=new VideoFreezeWatchdog();
 tick(idle,{now:1000,recentInput:false});
 for(let i=1;i<=11;i++)tick(idle,{now:1000+i*6500,recentInput:false});
 assert.equal(tick(idle,{now:74000,recentInput:false}).frozen,false);
 assert.equal(tick(idle,{now:100000,recentInput:false}).frozen,true);
});
test('VIDAA unsupported screen readback and disconnected sessions never auto recover',()=>{
 const w=new VideoFreezeWatchdog();
 tick(w,{now:1000,signature:null});
 for(let i=1;i<=15;i++)tick(w,{now:1000+i*6500,signature:null});
 assert.equal(tick(w,{now:101000,signature:null}).frozen,false);
 assert.equal(canAutoRecoverStream({now:100000,attempts:0,visualFrozen:true,hasVideo:true,connection:'disconnected'}),false);
});
test('retries are bounded and distinct from a stuck loading splash',()=>{
 assert.equal(canAutoRecoverStream({now:200000,attempts:0,visualFrozen:false,signalFrozen:false,hasVideo:true}),false);
 assert.equal(canAutoRecoverStream({now:200000,attempts:0,visualFrozen:true,hasVideo:true}),true);
 assert.equal(canAutoRecoverStream({now:200000,attempts:1,lastAttemptAt:160000,visualFrozen:true,hasVideo:true}),false);
 assert.equal(canAutoRecoverStream({now:200000,attempts:1,lastAttemptAt:100000,visualFrozen:true,hasVideo:true}),true);
 assert.equal(canAutoRecoverStream({now:200000,attempts:3,visualFrozen:true,hasVideo:true}),false);
});

test('silent video stalls are detected only when audio packets keep arriving',()=>{
 const before={connection:'connected',videoReadyState:4,videoPaused:false,videoWidth:1280,videoHeight:720,audioReceived:100,received:200,decoded:40};
 assert.equal(classifyAudioVideoStall(before,{...before,audioReceived:118}),true);
 assert.equal(classifyAudioVideoStall(before,{...before,audioReceived:118,received:210}),false);
 assert.equal(classifyAudioVideoStall(before,{...before,audioReceived:118,decoded:45}),false);
 assert.equal(classifyAudioVideoStall(before,{...before,audioReceived:102}),false);
 assert.equal(classifyAudioVideoStall(before,{...before,audioReceived:118,connection:'disconnected'}),false);
 assert.equal(classifyAudioVideoStall(before,{...before,audioReceived:118,videoReadyState:1}),false);
 assert.equal(classifyAudioVideoStall(before,{...before,audioReceived:118,videoPaused:true}),false);
 assert.equal(classifyAudioVideoStall(before,{...before,audioReceived:118,videoWidth:0}),false);
});
test('visual watchdog shortens recovery when advert motion preceded a stuck splash',()=>{
 const w=new VideoFreezeWatchdog();
 tick(w,{now:1000,signature:image(10)});
 tick(w,{now:7000,signature:image(15)});
 tick(w,{now:13000,signature:image(20)});
 tick(w,{now:19000,signature:image(23)});
 for(const n of [25000,31000,37000])assert.equal(tick(w,{now:n,signature:image(23)}).frozen,false);
 assert.equal(tick(w,{now:43000,signature:image(23)}).frozen,true);
});
