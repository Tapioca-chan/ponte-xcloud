import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldStartMetroOpaqueRepair,shouldEscalateMetroOpaqueRepair,shouldPreferNativeMetroSurface,shouldProbeMetroOpaqueSurfaceWithoutFreezeCount,shouldProtectRecoveredMetroSurface} from '../src/metro-native-plane-autorepair.mjs';
const base={title:'Metro Exodus',nativePlaneUnobservable:true,
 firstVideoAt:1000,now:107000,freezeCount:1,hasVideo:true,
 videoReadyState:4,connection:'connected',overlayOpen:false,recoveryBusy:false,
 lastManualRecoveryAt:0,attempts:0,lastSoftRecoveryAt:0,enabled:true};
test('Toshiba case with no A input and one earlier WebRTC freeze triggers gentle startup repair',()=>{
 assert.equal(shouldStartMetroOpaqueRepair(base),true);
 assert.equal(shouldStartMetroOpaqueRepair({...base,now:105999}),false);
 assert.equal(shouldStartMetroOpaqueRepair({...base,now:212000}),false);
 assert.equal(shouldStartMetroOpaqueRepair({...base,freezeCount:0}),false);
});
test('strong VIDAA refresh follows one gentle pass even without further freeze counters',()=>{
 const state={...base,now:139000,attempts:1,lastSoftRecoveryAt:112000};
 assert.equal(shouldEscalateMetroOpaqueRepair(state),true);
 assert.equal(shouldEscalateMetroOpaqueRepair({...state,now:130000}),false);
 assert.equal(shouldEscalateMetroOpaqueRepair({...state,attempts:2}),false);
 assert.equal(shouldEscalateMetroOpaqueRepair({...state,lastSoftRecoveryAt:0}),false);
 assert.equal(shouldEscalateMetroOpaqueRepair({...state,now:260000}),false);
});
test('ads, other games, a visible image, manual intervention and overlays prevent autoflash',()=>{
 for(const scenario of [
  {title:'Marvel Rivals'},{title:'Metro 2033 Redux'},
  {nativePlaneUnobservable:false},{lastManualRecoveryAt:80000},
  {overlayOpen:true},{recoveryBusy:true},{enabled:false},
  {hasVideo:false},{videoReadyState:1},{connection:'failed'}
 ]){
  assert.equal(shouldStartMetroOpaqueRepair({...base,...scenario}),false,JSON.stringify(scenario));
  assert.equal(shouldEscalateMetroOpaqueRepair({...base,now:139000,
   attempts:1,lastSoftRecoveryAt:112000,...scenario}),false,JSON.stringify(scenario));
 }
});
test('does not repeat startup rebind more than once',()=>{
 assert.equal(shouldStartMetroOpaqueRepair({...base,attempts:1}),false);
 assert.equal(shouldEscalateMetroOpaqueRepair({...base,attempts:2,lastSoftRecoveryAt:112000,now:139000}),false);
 assert.equal(shouldEscalateMetroOpaqueRepair({...base,attempts:3,lastSoftRecoveryAt:112000,now:139000}),false);
});

test('evidence-based Metro freeze watchdog prioritizes automatic native plane (no button)',()=>{
 const base={title:'Metro Exodus',nativePlaneUnobservable:true,firstVideoAt:1000,
  now:61000,freezeCount:3,hasVideo:true,videoReadyState:4,
  connection:'connected',overlayOpen:false,recoveryBusy:false,
  alreadyTried:false};
 assert.equal(shouldPreferNativeMetroSurface(base),true);
 assert.equal(shouldPreferNativeMetroSurface({...base,now:35000}),false);
 assert.equal(shouldPreferNativeMetroSurface({...base,alreadyTried:true}),false);
 assert.equal(shouldPreferNativeMetroSurface({...base,overlayOpen:true}),false);
 assert.equal(shouldPreferNativeMetroSurface({...base,recoveryBusy:true}),false);
 assert.equal(shouldPreferNativeMetroSurface({...base,title:'Marvel Rivals'}),false);
 assert.equal(shouldPreferNativeMetroSurface({...base,nativePlaneUnobservable:false}),false);
 assert.equal(shouldPreferNativeMetroSurface({...base,freezeCount:0}),false);
 assert.equal(shouldPreferNativeMetroSurface({...base,now:300000}),false);
});

test('Metro compositor stall prioritizes native surface even after early callbacks, without a browser freeze counter',()=>{
 const baseline={title:'Metro Exodus',nativePlaneUnobservable:false,firstVideoAt:1000,
  now:100000,freezeCount:null,hasVideo:true,videoReadyState:4,
  connection:'connected',overlayOpen:false,recoveryBusy:false,alreadyTried:false};
 assert.equal(shouldPreferNativeMetroSurface({...baseline,presentationStalled:true}),true);
 assert.equal(shouldPreferNativeMetroSurface({...baseline,visualFrozen:true}),true);
 assert.equal(shouldPreferNativeMetroSurface({...baseline,presentationStalled:false,visualFrozen:false}),false);
 assert.equal(shouldPreferNativeMetroSurface({...baseline,presentationStalled:true,alreadyTried:true}),false);
 assert.equal(shouldPreferNativeMetroSurface({...baseline,presentationStalled:true,now:15000}),false);
 assert.equal(shouldPreferNativeMetroSurface({...baseline,presentationStalled:true,title:'Marvel Rivals'}),false);
 assert.equal(shouldPreferNativeMetroSurface({...baseline,presentationStalled:true,overlayOpen:true}),false);
 assert.equal(shouldPreferNativeMetroSurface({...baseline,presentationStalled:true,connection:'disconnected'}),false);
});

test('zero WebRTC freezeCount on VIDAA permits exactly one delayed Metro-only surface probe',()=>{
 const recorded={title:'Metro Exodus',nativePlaneUnobservable:true,firstVideoAt:1000,
  now:128000,decodedDelta:195,receivedDelta:2000,
  hasVideo:true,videoReadyState:4,videoPaused:false,
  connection:'connected',overlayOpen:false,recoveryBusy:false,
  attempts:0,alreadyTried:false,lastManualRecoveryAt:0,enabled:true,
  recentMeaningfulInput:false};
 assert.equal(shouldProbeMetroOpaqueSurfaceWithoutFreezeCount(recorded),true);
 for(const blocked of [
  {title:'Marvel Rivals'},{nativePlaneUnobservable:false},
  {now:125000},{now:240000},{decodedDelta:0},{receivedDelta:0},
  {hasVideo:false},{videoReadyState:1},{videoPaused:true},
  {connection:'failed'},{overlayOpen:true},{recoveryBusy:true},
  {attempts:1},{alreadyTried:true},{lastManualRecoveryAt:1000},
  {enabled:false},{recentMeaningfulInput:true}
 ]){
  assert.equal(shouldProbeMetroOpaqueSurfaceWithoutFreezeCount({...recorded,...blocked}),false,
   JSON.stringify(blocked));
 }
});

test('Toshiba post-surface black-screen regression: do not arm a second automatic media detach',()=>{
 assert.equal(shouldProtectRecoveredMetroSurface({title:'Metro Exodus',nativeSurfaceRecovered:true}),true);
 assert.equal(shouldProtectRecoveredMetroSurface({title:'Metro Exodus',nativeSurfaceRecovered:false}),false);
 assert.equal(shouldProtectRecoveredMetroSurface({title:'Marvel Rivals',nativeSurfaceRecovered:true}),false);
 assert.equal(shouldProtectRecoveredMetroSurface({title:'Metro 2033 Redux',nativeSurfaceRecovered:true}),false);
 assert.equal(shouldProtectRecoveredMetroSurface({title:'Metro Exodus'}),false);
});
