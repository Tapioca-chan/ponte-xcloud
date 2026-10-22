import test from 'node:test';
import assert from 'node:assert/strict';
import {xboxAdvertisedDisplay,xboxStreamingOsName} from '../src/stream-device-display.mjs';

test('Xbox receives a 1280x720 client display for the existing 720p stream profile',()=>{
 assert.deepEqual(xboxAdvertisedDisplay(720),{widthInPixels:1280,heightInPixels:720});
 assert.deepEqual(xboxAdvertisedDisplay(),{widthInPixels:1280,heightInPixels:720});
});
test('1080p stream selection retains the full-HD device header',()=>{
 assert.deepEqual(xboxAdvertisedDisplay(1080),{widthInPixels:1920,heightInPixels:1080});
});
test('unknown values fail safe to the lower decoding profile',()=>{
 assert.deepEqual(xboxAdvertisedDisplay(0),{widthInPixels:1280,heightInPixels:720});
 assert.deepEqual(xboxAdvertisedDisplay('720'),{widthInPixels:1280,heightInPixels:720});
 assert.deepEqual(xboxAdvertisedDisplay('1080'),{widthInPixels:1920,heightInPixels:1080});
});

test('Xbox 720p uses Android identity consistently in session and device info',()=>{
 assert.equal(xboxStreamingOsName(720),'android');
 assert.equal(xboxStreamingOsName(), 'android');
 assert.equal(xboxStreamingOsName('720'),'android');
});
test('Xbox 1080p retains original Windows desktop identity',()=>{
 assert.equal(xboxStreamingOsName(1080),'windows');
 assert.equal(xboxStreamingOsName('1080'),'windows');
});
