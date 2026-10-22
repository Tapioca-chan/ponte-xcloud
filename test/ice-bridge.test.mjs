import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeLocalIceCandidates} from '../src/ice-bridge.mjs';

test('awaits Promise-returning xCloudPlayer.getICECandidates before mapping', async () => {
  const item = {candidate:'candidate:1 1 udp 12345 192.0.2.1 5000 typ host',sdpMid:'0',sdpMLineIndex:0,usernameFragment:'xyz'};
  const result = await serializeLocalIceCandidates(async () => [item]);
  assert.equal(result.length, 1);
  assert.deepEqual(JSON.parse(result[0]), item);
});

test('also accepts sync candidate lists and excludes invalid entries', async () => {
  const local = () => [{candidate:'candidate:2 1 udp 0 127.0.0.1 9 typ host',sdpMid:'0',sdpMLineIndex:0},null,{candidate:''}];
  const result = await serializeLocalIceCandidates(local);
  assert.equal(result.length, 1);
  assert.equal(JSON.parse(result[0]).candidate,'candidate:2 1 udp 0 127.0.0.1 9 typ host');
});

test('shows meaningful ICE error instead of .map is not a function', async () => {
  await assert.rejects(serializeLocalIceCandidates(async () => ({ candidates:[] })),/candidatos ICE em formato válido/);
});
