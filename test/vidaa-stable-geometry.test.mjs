import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldPreallocateVideaSurface} from '../src/game-compat.mjs';

const video=readFileSync(new URL('../vendor/packages/player/src/client/lib/render/video.ts',import.meta.url),'utf8');

test('parent-hosted Toshiba VIDEO gets full native geometry before attaching its first decoded frame',()=>{
 for(const name of ['Marvel Rivals','Fortnite','Metro Exodus','Unknown Game']){
  assert.equal(shouldPreallocateVideaSurface(name),true,name);
 }
 assert.equal(shouldPreallocateVideaSurface(''),false);
 assert.match(video,/const nativePlanePreflight = \(topLevel\|\|iframeNativeMode\)/);
 assert.match(video,/\(topLevel \|\| Boolean\(\(this\._player as any\)\.__xbridgePreallocateVideaSurface\)\)/);
 assert.match(video,/if\(nativePlanePreflight\)\s*\{[\s\S]*?this\._element\.srcObject=stream/);
 assert.match(video,/rendererVersion:legacyParentGeometry\?'vidaa-fhd-prebind-v4'/);
});

test('720p CSS viewport on a Toshiba full-HD plane is compensated without relying on screen.width',()=>{
 assert.match(video,/const legacy720Viewport=viewportW>=1200&&viewportW<=1300/);
 assert.match(video,/screenW\/viewportW<=1\.05/);
 assert.match(video,/const effectiveScreenW=physicalScaleFallback\?Math\.round\(viewportW\*1\.5\):screenW/);
 assert.match(video,/videoElement\.setAttribute\('data-xbridge-physical-fallback',physicalScaleFallback\?'1':'0'\)/);
 assert.match(video,/physical\?Math\.round\(effectiveScreenW\)\+'px'/);
});

test('neither initial playback nor further decoded frames shrink a preallocated Toshiba native plane',()=>{
 const section=video.slice(video.indexOf('const notifyVideoReady = () => {'),
   video.indexOf("videoElement.addEventListener('loadeddata', notifyVideoReady"));
 assert.match(section,/if\(!nativePlanePreflight && !topLevel\)\{/);
 assert.ok(section.includes("force(videoElement,'width','100%')"));
 assert.ok(section.includes('Parent-hosted video owns a FIXED 100vw/100vh container'));
 assert.match(section,/document\.body\.classList\.add\('stream-playing'\)/);
});
