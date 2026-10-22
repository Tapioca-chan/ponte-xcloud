import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldStartMetroOpaqueRepair,shouldEscalateMetroOpaqueRepair} from '../src/metro-native-plane-autorepair.mjs';
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
