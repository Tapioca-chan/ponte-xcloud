import test from 'node:test';
import assert from 'node:assert/strict';
import {isDirectConsoleNavigation,directConsoleDestination} from '../src/console-entrypoint.mjs';

test('historic xbridge-player root opens console for direct TV or mobile users',()=>{
 assert.equal(isDirectConsoleNavigation({pathname:'/',method:'GET'}),true);
 assert.equal(isDirectConsoleNavigation({pathname:'/index.html',method:'GET'}),true);
 assert.equal(directConsoleDestination(), 'https://xbridge-hnd9.onrender.com/?role=tv');
 assert.equal(directConsoleDestination('?role=mobile&room=XB42'),
 'https://xbridge-hnd9.onrender.com/?role=mobile&room=XB42');
});

test('proxy player/health/API/WebSocket paths never redirect',()=>{
 for(const value of [
  {pathname:'/',proxyMarker:'tv-player'},
  {pathname:'/index.html',proxyMarker:'tv-player'},
  {pathname:'/health'},{pathname:'/app.js'},{pathname:'/style.css'},
  {pathname:'/api/resume',method:'POST'},{pathname:'/relay'},
  {pathname:'/',method:'POST'}
 ])assert.equal(isDirectConsoleNavigation(value),false,JSON.stringify(value));
});

test('legacy URL cannot produce an open redirect or forward arbitrary query data',()=>{
 assert.equal(directConsoleDestination('?role=tv&room=AAAA12&token=secret&redirect=https://evil.example'),
  'https://xbridge-hnd9.onrender.com/?role=tv&room=AAAA12');
 assert.equal(directConsoleDestination('?role=unknown&room=invalid-!'),
  'https://xbridge-hnd9.onrender.com/?role=tv');
});
