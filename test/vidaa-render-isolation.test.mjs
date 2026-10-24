import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const video=readFileSync(new URL('../vendor/packages/player/src/client/lib/render/video.ts',import.meta.url),'utf8');
const client=readFileSync(new URL('../src/client.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');

test('ordinary gameplay never reads back VIDAA GPU video through canvas',()=>{
 assert.match(client,/optInVideoReadback\?document\.createElement\('canvas'\):null/);
 assert.match(client,/signature:visualSampleCanvas\?sampleVideoLuma\(media,visualSampleCanvas\):null/);
 assert.match(client,/xbridge:unsafe-video-canvas-probe/);
});
test('iframe native mode never hoists MediaStream into parent document',()=>{
 assert.match(video,/iframeNativeMode=/);
 assert.match(video,/if \(!iframeNativeMode && window\.parent !== window/);
 assert.match(video,/const nativePlanePreflight = \(topLevel\|\|iframeNativeMode\)/);
 assert.match(video,/const physical=topLevel&&scaleMode/);
 assert.match(client,/__xbridgeVideoHostMode=embeddedVideoHostMode/);
 assert.match(client,/hostParam==='iframe'\?'iframe'/);
});
test('same-document native player video is viewport sized before the stream is attached',()=>{
 assert.match(css,/body\.xbridge-embedded\.xb-video-inframe #playerContainer/);
 assert.match(css,/width:100vw!important;height:100vh!important/);
 assert.match(css,/\.xb-video-inframe #playerContainer video/);
 assert.match(video,/if\(nativePlanePreflight\)\{[\s\S]*?this\._element\.srcObject=stream/);
});
