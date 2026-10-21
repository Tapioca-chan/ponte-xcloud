import test from 'node:test';
import assert from 'node:assert/strict';
import { collectGamepadFrames } from '../vendor/packages/player/src/client/lib/channel/input/collect.mjs';
import { sanitize } from '../src/protocol.mjs';

test('virtual Android controller is sent through xCloud input channel', () => {
  const virtualFrame = sanitize({ A: 1, LeftThumbXAxis: 0.8 });
  const realFrame = sanitize({ B: 1, GamepadIndex: 1 });
  realFrame.GamepadIndex = 1;
  const handlers = {
    0: { getGamepadState: () => virtualFrame, detach() {} },
    1: { getGamepadState: () => realFrame },
    2: undefined,
    3: null
  };
  const frames = collectGamepadFrames(handlers);
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[0], virtualFrame);
  assert.deepEqual(frames[1], realFrame);
});

test('release frames are sent when a controller stops providing input', () => {
  let frame = sanitize({ A: 1 });
  const handler = { getGamepadState: () => frame };
  assert.equal(collectGamepadFrames({ 0: handler })[0].A, 1);
  frame = sanitize({});
  assert.equal(collectGamepadFrames({ 0: handler })[0].A, 0);
});

test('invalid, missing and out-of-range gamepad handlers cannot enter channel', () => {
  const frames = collectGamepadFrames({
    0: { getGamepadState: () => null },
    1: { getGamepadState: () => ({ GamepadIndex: 5 }) },
    2: { getGamepadState: () => ({ GamepadIndex: -1 }) },
    3: { detach() {} }
  });
  assert.deepEqual(frames, []);
});
