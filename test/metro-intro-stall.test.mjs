import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRecoverMetroIntro,describeRecoveryBlockers} from '../src/metro-intro-stall.mjs';
const base={title:'Metro Exodus',sessionAgeMs:130000,aPresses:18,
 recentFreezeEvents:1,attempts:0,lastAttemptAt:0,now:130000,
 overlayOpen:false,videoReadyState:4,hasVideo:true,connection:'connected'};
test('real VIDAA example: repeated A presses plus WebRTC freezes recover early Metro credits',()=>{
 assert.equal(shouldRecoverMetroIntro(base),true);
 assert.match(describeRecoveryBlockers({...base,freezeEvents:1}),/recuperação autorizada/);
});
test('does not recover other titles, ads, running games, overlays, or unready streams',()=>{
 for(const val of [
  {title:'Marvel Rivals'}, {title:'Metro 2033 Redux'}, {sessionAgeMs:65000},
  {sessionAgeMs:400000},{aPresses:2},{recentFreezeEvents:0},{attempts:1},
  {overlayOpen:true},{videoReadyState:1},{hasVideo:false},{connection:'failed'}
 ])assert.equal(shouldRecoverMetroIntro({...base,...val}),false,JSON.stringify(val));
});
test('separate WebRTC freezes preserve bounded, non-perpetual recovery mode',()=>{
 assert.equal(shouldRecoverMetroIntro({...base,attempts:3}),false);
 assert.equal(shouldRecoverMetroIntro({...base,lastAttemptAt:110000}),false);
 assert.equal(shouldRecoverMetroIntro({...base,now:240000,lastAttemptAt:110000}),true);
});
test('diagnostics explain overlay, missing title and cooldown without private data',()=>{
 assert.match(describeRecoveryBlockers({...base,freezeEvents:2,overlayOpen:true}),/Painel aberto/);
 assert.match(describeRecoveryBlockers({...base,freezeEvents:0,connection:'failed'}),/indisponível/);
 assert.match(describeRecoveryBlockers({...base,freezeEvents:0,cooldownMs:40000}),/40 segundos/);
 assert.match(describeRecoveryBlockers({...base,freezeEvents:0}),/Sem novos/);
});
