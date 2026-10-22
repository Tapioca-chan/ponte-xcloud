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
 assert.match(describeRecoveryBlockers({...base,freezeEvents:0}),/Nenhum congelamento/);
});

test('VIDAA screenshot: one early freeze, A=3 at 71s, then browser panel opens by 130s',()=>{
 const early={...base,sessionAgeMs:71000,recentFreezeEvents:0,totalFreezeCount:1,aPresses:3};
 assert.equal(shouldRecoverMetroIntro(early),false,'protect free-tier ad until 90s');
 assert.match(describeRecoveryBlockers({...early,freezeEvents:0}),/90 s/);
 const ready={...early,sessionAgeMs:130000};
 assert.equal(shouldRecoverMetroIntro(ready),true,'retain early WebRTC freeze with repeated A');
 assert.match(describeRecoveryBlockers({...ready,freezeEvents:0}),/recuperação autorizada/);
 assert.equal(shouldRecoverMetroIntro({...ready,overlayOpen:true}),false);
 assert.match(describeRecoveryBlockers({...ready,freezeEvents:0,overlayOpen:true}),/Painel aberto/);
 assert.equal(shouldRecoverMetroIntro({...ready,overlayOpen:false,attempts:1}),false,'never blind-repeat intro fallback');
});
test('no browser-observed freezes still prevents an automatic Metro rebind',()=>{
 assert.equal(shouldRecoverMetroIntro({...base,recentFreezeEvents:0,totalFreezeCount:0}),false);
 assert.equal(shouldRecoverMetroIntro({...base,recentFreezeEvents:0,totalFreezeCount:1,title:'Marvel Rivals'}),false);
});
