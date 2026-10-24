import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const render=readFileSync(new URL('../vendor/packages/player/src/client/lib/render/video.ts',import.meta.url),'utf8');
const player=readFileSync(new URL('../vendor/packages/player/src/client/lib/player.ts',import.meta.url),'utf8');
const client=readFileSync(new URL('../src/client.ts',import.meta.url),'utf8');

test('user-only migration swaps media DOCUMENT rather than retrying same VIDAA host',()=>{
 assert.match(render,/async migrateNativeVideoHost\(\)/);
 assert.match(render,/const next=current==='iframe'\?'parent':'iframe'/);
 assert.match(render,/window\.parent\.document\.getElementById\('xbridge-top-video'\)/);
 assert.match(render,/document\.getElementById\(this\._player\.getElementId\(\)\)/);
 assert.match(render,/targetDocument\.createElement\('video'\)/);
 assert.match(render,/replacement\.srcObject=stream/);
 assert.match(render,/old\.srcObject=null/);
 assert.match(render,/document\.body\.classList\.toggle\('xb-video-inframe'/);
});
test('failed migration rolls back original video element and unchanged Xbox MediaStream',()=>{
 assert.match(render,/if\(changed\)oldHost\.appendChild\(old\)/);
 assert.match(render,/old\.srcObject=stream/);
 assert.match(render,/this\._element=old/);
 assert.match(render,/this\._surfaceRebuildBusy=false/);
});
test('manual command has receipt and real status, no login, game restart or new WebRTC channel',()=>{
 assert.match(player,/migrateNativeVideoHost\(\)/);
 assert.match(client,/event\.data\?\.type==='xbridge-migrate-video-host'/);
 assert.match(client,/notifyParent\(\{type:'xbridge-video-host-migration',step:'received',from\}\)/);
 assert.match(client,/traceVideo\('surface-command',\{stage:'host-migration',kind:'native-host-migration'/);
 assert.match(client,/traceVideo\('surface-command',\{stage:'keyframe',kind:'manual-rescue-request'/);
 const method=render.slice(render.indexOf('async migrateNativeVideoHost()'),render.indexOf('getElement(){'));
 assert.doesNotMatch(method,/new RTCPeerConnection|api\('start'|logOut|requestAccessToken/);
});
