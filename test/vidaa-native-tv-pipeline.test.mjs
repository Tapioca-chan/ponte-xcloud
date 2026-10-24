import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const client=readFileSync(new URL('../src/client.ts',import.meta.url),'utf8');
const video=readFileSync(new URL('../vendor/packages/player/src/client/lib/render/video.ts',import.meta.url),'utf8');

test('native TV mode is transported without changing the Xbox WebRTC session',()=>{
 assert.match(client,/hostParam==='native-tv'\?'native-tv':'parent'/);
 assert.match(video,/__xbridgeVideoHostMode==='native-tv'/);
 assert.match(video,/data-xbridge-render-pipeline','native-tv'/);
 assert.match(video,/this\._element\.srcObject=stream/);
});
test('dedicated VIDAA video host is full-bleed before binding the MediaStream',()=>{
 const newMode=video.indexOf('const dedicatedNativeTvMode=');
 const host=video.indexOf("host?.style.setProperty('position','fixed','important')");
 const prebind=video.indexOf('this._element.srcObject=stream');
 assert.ok(newMode>=0 && host>newMode && prebind>host);
 assert.match(video,/host\?\.style\.setProperty\('inset','0','important'\)/);
 assert.match(video,/host\?\.style\.setProperty\('width','100vw','important'\)/);
 assert.match(video,/host\?\.style\.setProperty\('height','100vh','important'\)/);
 assert.match(video,/topLevel&&scaleMode==='physical'/);
 assert.match(video,/topLevel&&scaleMode==='transform'/);
 assert.match(video,/host\?\.style\.setProperty\('overflow',scaleMode==='css'\?'hidden':'visible','important'\)/);
 assert.match(video,/rendererVersion:'vidaa-scale-v2'/);
});
test('native pipeline does not use experimental GPU canvas or modify Xbox controls',()=>{
 assert.match(video,/const videoElement = renderDocument\.createElement\('video'\)/);
 assert.doesNotMatch(video,/navigator\.gpu\.requestAdapter\(/);
 assert.match(client,/player\.init\(\)/);
});

test('legacy physical scale is not imposed over the selected transform or CSS mode',()=>{
 assert.doesNotMatch(video,/dedicatedNativeTvMode\|\|scaleMode==='physical'/);
 assert.match(video,/videoElement\.setAttribute\('data-xbridge-scale-mode',scaleMode\)/);
 assert.match(video,/transform-origin','left top'/);
});
