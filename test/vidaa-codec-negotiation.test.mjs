import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const player=readFileSync(new URL('../vendor/packages/player/src/client/lib/player.ts',import.meta.url),'utf8');
const client=readFileSync(new URL('../src/client.ts',import.meta.url),'utf8');
test('native browser codec negotiation is default, legacy H264 override is opt-in only',()=>{
 assert.match(player,/codecMode: 'browser' \| 'legacy' = 'browser'/);
 assert.match(player,/if \(codecMode === 'legacy' && videoTransceiver\.setCodecPreferences\)/);
 assert.doesNotMatch(player,/if \(videoTransceiver\.setCodecPreferences\) \{/);
});
test('TV codec A/B setting is passed before constructing peer connection',()=>{
 assert.match(client,/playerParams\.get\('videoCodec'\)==='legacy'/);
 assert.match(client,/new Player\('playerContainer',xboxVideoCodecMode\)/);
 assert.match(client,/codecMode:xboxVideoCodecMode/);
});
