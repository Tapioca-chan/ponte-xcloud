import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const client=readFileSync(new URL('../src/client.ts',import.meta.url),'utf8');
const video=readFileSync(new URL('../vendor/packages/player/src/client/lib/render/video.ts',import.meta.url),'utf8');

test('default iframe renderer is eligible for FIRST native-surface recovery',()=>{
 assert.match(video,/const renderPath=topLevel\?'parent':iframeNativeMode\?'iframe':'standalone'/);
 assert.match(video,/videoElement\.setAttribute\('data-xbridge-render-path',renderPath\)/);
 assert.match(video,/\['parent','iframe'\]\.includes\(renderPath\|\|''\)/);
 assert.match(client,/const hasRecoverableSurface=Boolean\(video\?\.srcObject && video\.isConnected/);
 assert.match(client,/\['parent','iframe'\]\.includes\(video\.getAttribute\('data-xbridge-render-path'\)\|\|''\)/);
 assert.doesNotMatch(client,/getAttribute\('data-xbridge-top-video'\)==='1'/);
});
test('video rebuild keeps exact same MediaStream, video geometry and control channel',()=>{
 assert.match(video,/replacement\.style\.cssText=old\.style\.cssText/);
 assert.match(video,/old\.srcObject=null\s*host\.replaceChild\(replacement,old\)/);
 assert.match(video,/replacement\.srcObject=stream/);
 assert.match(video,/replacement\.setAttribute\('data-xbridge-render-path',renderPath!\)/);
 assert.doesNotMatch(video,/await .*startStream\(/);
});
test('only explicit second request escalates manual rescue to same-session reconnect',()=>{
 assert.match(client,/if\(choice\.action==='surface'\)/);
 assert.match(client,/await rebuildNativeVideoSurfaceWithEvidence\(\)/);
 assert.match(client,/await reconnectXboxMediaWithoutRestart\(\)/);
});
