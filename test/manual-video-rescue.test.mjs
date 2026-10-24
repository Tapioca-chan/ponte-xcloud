import test from 'node:test';
import assert from 'node:assert/strict';
import {ManualVideoRescue} from '../src/manual-video-rescue.mjs';

test('a physical VIDAA frozen frame first gets a new native surface, not Xbox reconnect',()=>{
 const x=new ManualVideoRescue();
 const first=x.choose({now:100_000,playing:true,hasVideo:true});
 assert.equal(first.action,'surface');
 assert.equal(x.start('surface',100_000),true);
 assert.equal(x.choose({now:100_010,playing:true,hasVideo:true}).action,'busy');
 x.finish();
 assert.equal(x.choose({now:103_000,playing:true,hasVideo:true}).action,'cooldown');
});
test('second explicit user request after an unsuccessful surface escalates same Xbox session',()=>{
 const x=new ManualVideoRescue();
 x.start('surface',100_000);x.finish();
 assert.deepEqual(x.choose({now:106_000,playing:true,hasVideo:true}),{
  action:'transport',reason:'still-frozen-after-surface'
 });
 x.start('transport',106_000);x.finish();
 assert.equal(x.choose({now:115_000,playing:true,hasVideo:true}).action,'cooldown');
 assert.equal(x.choose({now:167_000,playing:true,hasVideo:true}).action,'surface');
});
test('missing video uses transport rather than pretending native surface succeeded',()=>{
 const x=new ManualVideoRescue();
 assert.equal(x.choose({now:90_000,playing:true,hasVideo:false}).action,'transport');
 assert.equal(x.choose({now:90_000,playing:false,hasVideo:false}).action,'unavailable');
});
test('old surface repair history expires; no blind transport restarts',()=>{
 const x=new ManualVideoRescue();
 x.start('surface',100_000);x.finish();
 assert.equal(x.choose({now:450_000,playing:true,hasVideo:true}).action,'surface');
});
