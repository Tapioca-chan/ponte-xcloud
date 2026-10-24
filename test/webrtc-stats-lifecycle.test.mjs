import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const stats=readFileSync(new URL('../vendor/packages/player/src/client/lib/stats.ts',import.meta.url),'utf8');
const player=readFileSync(new URL('../vendor/packages/player/src/client/lib/player.ts',import.meta.url),'utf8');

test('RTC stats timer ends with game session, including closed peer connections',()=>{
 assert.match(stats,/private _timer: ReturnType<typeof setInterval> \| null = null/);
 assert.match(stats,/this\._timer = setInterval\(\(\) => \{ void this\.loop\(\) \}, 1000\)/);
 assert.match(stats,/destroy\(\)\{[\s\S]*?clearInterval\(this\._timer\)/);
 assert.match(player,/this\._statsHelper\.destroy\(\)\s*this\._peerConnection\.close\(\)/);
});
test('getStats polling does not overlap or trigger unhandled rejected promises',()=>{
 assert.match(stats,/this\._destroyed \|\| this\._polling/);
 assert.match(stats,/const stats = await this\._peerConnection\.getStats\(\)/);
 assert.match(stats,/catch\(_\)\{/);
 assert.match(stats,/finally\{\s*this\._polling = false/);
});
