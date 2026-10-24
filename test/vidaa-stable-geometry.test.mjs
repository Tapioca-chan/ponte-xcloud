import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldPreallocateVideaSurface} from '../src/game-compat.mjs';

const video=readFileSync(new URL('../vendor/packages/player/src/client/lib/render/video.ts',import.meta.url),'utf8');

test('preallocation remains available on native-tv and iframe A/B paths',()=>{
 for(const name of ['Marvel Rivals','Fortnite','Metro Exodus','Unknown Game']){
  assert.equal(shouldPreallocateVideaSurface(name),true,name);
 }
 assert.equal(shouldPreallocateVideaSurface(''),false);
 assert.match(video,/const nativePlanePreflight = \(topLevel\|\|iframeNativeMode\)/);
 assert.match(video,/!legacyParentGeometry/);
 assert.match(video,/if\(nativePlanePreflight\)\s*\{[\s\S]*?this\._element\.srcObject=stream/);
});

test('Oct-22 parent renderer restores attach-before-first-frame and leaves Xbox connection intact',()=>{
 assert.match(video,/const legacyParentGeometry=topLevel && !dedicatedNativeTvMode/);
 assert.match(video,/if\(!nativePlanePreflight\) videoElement\.srcObject = stream/);
 assert.match(video,/rendererVersion:legacyParentGeometry\?'oct22-parent-v3'/);
 const start=video.indexOf('const notifyVideoReady = () => {');
 const end=video.indexOf("videoElement.addEventListener('loadeddata', notifyVideoReady");
 const section=video.slice(start,end);
 assert.ok(section.includes('if(!nativePlanePreflight){'));
 assert.ok(section.includes("force(videoElement,'width','100%')"));
 assert.match(section,/document\.body\.classList\.add\('stream-playing'\)/);
});
