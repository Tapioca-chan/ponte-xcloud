export function decoderSummary(previous, current) {
  const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
  const diff = (a,b) => finite(a) !== null && finite(b) !== null && a >= b ? a - b : null;
  const frameCount = diff(current.framesDecoded, previous?.framesDecoded);
  const decodeTime = diff(current.totalDecodeTime, previous?.totalDecodeTime);
  const received = diff(current.packetsReceived, previous?.packetsReceived);
  const lost = diff(current.packetsLost, previous?.packetsLost);
  const jitterCount = diff(current.jitterBufferEmittedCount, previous?.jitterBufferEmittedCount);
  const jitterTime = diff(current.jitterBufferDelay, previous?.jitterBufferDelay);
  const timePerFrame = frameCount > 0 && decodeTime !== null ? Math.round(10000 * decodeTime / frameCount) / 10 : null;
  const lossPercent = received !== null && lost !== null && received + lost > 0 ? Math.round(1000 * lost / (received + lost)) / 10 : null;
  const jitterMs = jitterCount > 0 && jitterTime !== null ? Math.round(1000 * jitterTime / jitterCount) : null;
  return { fps: finite(current.framesPerSecond), decodeMs: timePerFrame,
    lossPercent, jitterMs, width: finite(current.frameWidth), height: finite(current.frameHeight),
    freezeRise: diff(current.freezeCount, previous?.freezeCount) };
}