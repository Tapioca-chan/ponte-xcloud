/**
 * Collect streaming frames from both physical controller handlers and
 * xBridge's injected Android relay handler.
 *
 * The previous InputChannel used `instanceof Gamepad` and silently ignored
 * the injected object, despite its getGamepadState() implementation.
 */
export function collectGamepadFrames(handlers) {
  const frames = [];
  for (const handler of Object.values(handlers || {})) {
    if (!handler || typeof handler.getGamepadState !== 'function') continue;
    const frame = handler.getGamepadState();
    if (frame && typeof frame === 'object'
      && Number.isInteger(frame.GamepadIndex)
      && frame.GamepadIndex >= 0 && frame.GamepadIndex <= 3) {
      frames.push(frame);
    }
  }
  return frames;
}
