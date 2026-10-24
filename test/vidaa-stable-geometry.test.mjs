import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldPreallocateVideaSurface} from '../src/game-compat.mjs';

const video=readFileSync(new URL('../vendor/packages/player/src/client/lib/render/video.ts',import.meta.url),'utf8');
test('all titles have their final VIDAA native geometry before MediaStream binding',()=>{
 for(const name of ['Marvel Rivals','Fortnite','Metro Exodus','Unknown Game']){
  assert.equal(shouldPreallocateVideaSurface(name),true,name);
 }
 assert.equal(shouldPreallocateVideaSurface(''),false);
 assert.match(video,/if\(nativePlanePreflight\)\s*\{[\s\S]*?this\._element\.srcObject=stream/);
 assert.match(video,/const nativePlanePreflight = \(topLevel\|\|iframeNativeMode\)/);
});

test('a decoded first frame must not reconfigure VIDAA parent or video geometry',()=>{
 const section=video.slice(video.indexOf('const notifyVideoReady = () => {'),
   video.indexOf("videoElement.addEventListener('loadeddata', notifyVideoReady"));
 assert.ok(section.includes('if(!nativePlanePreflight){'));
 for(const key of ["force(element,'position'","force(videoElement,'width'","force(videoElement,'object-fit'"]){
   const p=section.indexOf(key);
   assert.ok(p>section.indexOf('if(!nativePlanePreflight){'),key);
 }
 assert.match(section,/document\.body\.classList\.add\('stream-playing'\)/);
});
