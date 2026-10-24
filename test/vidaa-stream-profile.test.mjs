import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {xboxAdvertisedDisplay,xboxStreamingOsName} from '../src/stream-device-display.mjs';

const server=readFileSync(new URL('../src/server.ts',import.meta.url),'utf8');
const client=readFileSync(new URL('../src/client.ts',import.meta.url),'utf8');

test('server uses requested Xbox stream resolution instead of forcing 1080p',()=>{
 assert.match(server,/const requestedResolution=body\.resolution===720\?720:1080/);
 assert.match(server,/resolution:requestedResolution/);
 assert.doesNotMatch(server,/host:room\.host,resolution:1080/);
});
test('embedded TV defaults to the lower-complexity 720p stream, explicit 1080p retains quality',()=>{
 assert.match(client,/xboxVideoResolution:720\|1080=embedded && playerParams\.get\('videoResolution'\)!=='1080'\?720:1080/);
 assert.match(client,/api\('start',\{id:\$\('games'\)\.value,resolution:xboxVideoResolution\}\)/);
});
test('Xbox stream identity matches desired profile in device metadata',()=>{
 assert.deepEqual(xboxAdvertisedDisplay(720),{widthInPixels:1280,heightInPixels:720});
 assert.equal(xboxStreamingOsName(720),'android');
 assert.deepEqual(xboxAdvertisedDisplay(1080),{widthInPixels:1920,heightInPixels:1080});
 assert.equal(xboxStreamingOsName(1080),'windows');
});
