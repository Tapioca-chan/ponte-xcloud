import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMicrosoftUserToken} from '../src/msal-token-shape.mjs';

test('Microsoft device-code JSON normalizes with a durable expiry',()=>{
 const token=normalizeMicrosoftUserToken({
  access_token:'dummy-access',refresh_token:'dummy-refresh',expires_in:3600,token_type:'Bearer'
 });
 assert.equal(token.access_token,'dummy-access');
 assert.equal(token.refresh_token,'dummy-refresh');
 assert.equal(typeof token.expires_on,'string');
 assert.ok(new Date(token.expires_on).getTime()>Date.now()+3000000);
});
test('xal-node UserToken wrapper normalizes from .data rather than wrongly rejecting refresh',()=>{
 const refreshed=normalizeMicrosoftUserToken({data:{
  access_token:'new-access',refresh_token:'new-refresh',expires_in:3600
 }},{refresh_token:'old-refresh'});
 assert.equal(refreshed.access_token,'new-access');
 assert.equal(refreshed.refresh_token,'new-refresh');
 assert.ok(refreshed.expires_on);
});
test('refresh without rotation reuses last refresh token',()=>{
 const token=normalizeMicrosoftUserToken({data:{access_token:'new-access',expires_in:3600}},
  {refresh_token:'old-refresh'});
 assert.equal(token.refresh_token,'old-refresh');
});
test('malformed refresh never silently authorizes or stores a token',()=>{
 assert.throws(()=>normalizeMicrosoftUserToken({data:{refresh_token:'x'}}));
 assert.throws(()=>normalizeMicrosoftUserToken({access_token:'a'}));
 assert.throws(()=>normalizeMicrosoftUserToken(null));
});
