import test from 'node:test';
import assert from 'node:assert/strict';
import {selectVideoRecoveryMode,canRequestSurfaceRefresh} from '../src/video-recovery-stages.mjs';

test('first automatic repair is gentle, without disconnecting the stream',()=>{
 assert.equal(selectVideoRecoveryMode({now:100000,freezeCount:4}),'soft');
 assert.equal(selectVideoRecoveryMode({now:200000,lastSoftAt:190000,
   lastSoftFreezeCount:4,freezeCount:5}),'soft','do not rebind before grace');
});
test('subsequent, newly observed WebRTC trouble can escalate to one rebind',()=>{
 assert.equal(selectVideoRecoveryMode({now:225000,lastSoftAt:200000,
   lastSoftFreezeCount:4,freezeCount:5}),'rebind');
 assert.equal(selectVideoRecoveryMode({now:225000,lastSoftAt:200000,
   lastSoftFreezeCount:4,freezeCount:4}),'soft');
 assert.equal(selectVideoRecoveryMode({now:225000,lastSoftAt:200000,
   lastSoftFreezeCount:4,freezeCount:3}),'soft');
 assert.equal(selectVideoRecoveryMode({now:225000,lastSoftAt:200000,
   lastSoftFreezeCount:null,freezeCount:5}),'soft');
 assert.equal(selectVideoRecoveryMode({now:225000,lastSoftAt:200000,
   lastSoftFreezeCount:null,freezeCount:null,signalStrong:true}),'rebind');
});
test('manual recovery always uses previously successful strong operation',()=>{
 assert.equal(selectVideoRecoveryMode({manual:true}),'rebind');
 assert.equal(canRequestSurfaceRefresh({embedded:true,hasVideo:true,overlayOpen:false}),true);
 assert.equal(canRequestSurfaceRefresh({embedded:false,hasVideo:true}),false);
 assert.equal(canRequestSurfaceRefresh({embedded:true,hasVideo:false}),false);
 assert.equal(canRequestSurfaceRefresh({embedded:true,hasVideo:true,overlayOpen:true}),false);
});
