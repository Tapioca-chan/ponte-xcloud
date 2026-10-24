import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const client=readFileSync(new URL('../src/client.ts',import.meta.url),'utf8');

test('Metro evidence-gated recovery is never guarded by NOT Metro',()=>{
 for(const path of ['(doSoft || doStrong)','opaqueZeroFreezeProbe','shouldPerformBlindMetroRefresh({']){
  const marker='if(isMetro && opaqueRepairEnabled && canAutoInterruptVideo() &&';
  assert.ok(client.includes(marker),'Metro guard missing');
  assert.ok(client.includes(path),'Recovery stage missing');
 }
 assert.doesNotMatch(client,/if\(!isMetro && opaqueRepairEnabled && canAutoInterruptVideo\(\) &&\s*!protectRecoveredMetroSurface\(\)/);
 assert.match(client,/if\(isMetro && introEligible && gameOverlayOpen\)/);
});

test('rescue restarts native surface first, transport only after explicit second user action',()=>{
 assert.match(client,/type==='xbridge-rescue-video'/);
 assert.match(client,/manualVideoRescue\.choose\(/);
 assert.match(client,/await rebuildNativeVideoSurfaceWithEvidence\(\)/);
 assert.match(client,/await reconnectXboxMediaWithoutRestart\(\)/);
 assert.match(client,/choice\.action==='busy'\|\|videoRecoveryInFlight\|\|reconnectingMedia/);
});

test('temporary WebRTC ICE disconnect preserves native VIDAA video surface',()=>{
 assert.match(client,/notifyParent\(\{type:'xbridge-rtc-state',state\}\)/);
 assert.doesNotMatch(client,/if\(state==='failed'\|\|state==='disconnected'\|\|state==='closed'\)\s*\{\s*document\.body\.classList\.remove\('stream-playing'\)/);
 assert.match(client,/if\(state==='connected' && started\)/);
});
