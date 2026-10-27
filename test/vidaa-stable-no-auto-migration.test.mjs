import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const client=readFileSync(new URL('../src/client.ts',import.meta.url),'utf8');

test('VIDAA stable playback suppresses automatic cross-document engine migration even with old saved flags',()=>{
 assert.match(client,/const autoHostMigrationEnabled=false;/);
 assert.match(client,/const aggressiveSurfaceAllowed=false;/);
 assert.match(client,/autoHostMigrationOverride=false;/);
 assert.match(client,/setItem\('xbridge:vidaa-auto-host-migration','false'\)/);
 assert.doesNotMatch(client,/autoHostMigrationEnabled=localStorage\.getItem/);
});

test('Metro retains non-disruptive keyframes and explicit user rescue without silent surface rebuilds',()=>{
 const gate=client.slice(client.indexOf('function canAutoInterruptVideo()'),client.indexOf('let videoHealthTimer'));
 assert.match(gate,/return false;/);
 assert.match(client,/const opaqueRepairEnabled=false;/);
 assert.match(client,/const nativeRefreshEnabled=false;/);
 assert.match(client,/requestKeyframeRequest\(true\)/);
 assert.match(client,/type:'xbridge-rescue-video'/);
 assert.match(client,/migrateNativeVideoHostWithEvidence\(\)/);
});
