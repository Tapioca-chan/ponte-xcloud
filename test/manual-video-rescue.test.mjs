import test from 'node:test';
import assert from 'node:assert/strict';
import {ManualVideoRescue} from '../src/manual-video-rescue.mjs';

test('first user rescue requests a fresh keyframe WITHOUT disconnecting existing video',()=>{
 const x=new ManualVideoRescue();
 assert.deepEqual(x.choose({now:100000,playing:true,hasVideo:true}),{
  action:'keyframe',reason:'try-without-video-detach'
 });
 assert.equal(x.start('keyframe',100000),true);
 assert.equal(x.choose({now:100100,playing:true,hasVideo:true}).action,'busy');
 x.finish();
 assert.equal(x.choose({now:102000,playing:true,hasVideo:true}).action,'cooldown');
});
test('second explicit request may rebuild surface if keyframe did not restore it',()=>{
 const x=new ManualVideoRescue();
 x.start('keyframe',100000);x.finish();
 assert.deepEqual(x.choose({now:103500,playing:true,hasVideo:true}),{
  action:'surface',reason:'still-frozen-after-keyframe'
 });
 x.start('surface',103500);x.finish();
 assert.equal(x.choose({now:107000,playing:true,hasVideo:true}).action,'cooldown');
});
test('only third user confirmation renegotiates WebRTC without restarting game',()=>{
 const x=new ManualVideoRescue();
 x.start('keyframe',100000);x.finish();
 x.start('surface',104000);x.finish();
 assert.deepEqual(x.choose({now:110000,playing:true,hasVideo:true}),{
  action:'transport',reason:'still-frozen-after-surface'
 });
 x.start('transport',110000);x.finish();
 assert.equal(x.choose({now:119000,playing:true,hasVideo:true}).action,'cooldown');
 assert.equal(x.choose({now:171000,playing:true,hasVideo:true}).action,'keyframe');
});
test('when the video element is missing, use same-session transport',()=>{
 const x=new ManualVideoRescue();
 assert.equal(x.choose({now:90000,playing:true,hasVideo:false}).action,'transport');
 assert.equal(x.choose({now:90000,playing:false,hasVideo:false}).action,'unavailable');
});
test('an old keyframe attempt expires; fresh recovery starts safely without black flash',()=>{
 const x=new ManualVideoRescue();
 x.start('keyframe',100000);x.finish();
 assert.equal(x.choose({now:450000,playing:true,hasVideo:true}).action,'keyframe');
});
