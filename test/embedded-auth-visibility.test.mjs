import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const client=readFileSync(new URL('../src/client.ts',import.meta.url),'utf8');
test('embed tells the TV when Microsoft authorization, restore or cooldown requires a visible screen',()=>{
 for(const reason of ['login_required','restore_retry','rate_limited'])
  assert.match(client,new RegExp("type:'xbridge-auth-action-required',reason:'"+reason+"'"));
 const request=client.slice(client.indexOf('const prepare=run('));
 assert.ok(request.includes("notifyParent({type:'xbridge-ready'})"));
 assert.ok(request.includes("if(needsLogin)"));
 assert.ok(request.includes("await dashboard.restored()"));
 assert.doesNotMatch(request,/revokeRemember|logout|clearRememberCookie/);
});
