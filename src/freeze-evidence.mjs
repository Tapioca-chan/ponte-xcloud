// A user-confirmed frozen picture is the missing evidence on VIDAA:
// requestVideoFrameCallback/canvas cannot inspect its protected video plane.
// Compare transport counters across a short observation window WITHOUT
// pausing, requesting keyframes, rebinding media or changing Xbox quality.
const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const rise = (previous, current) =>
  valid(previous) && valid(current) && current >= previous ? current - previous : null;

export function compareFreezeEvidence(before, after) {
  if (!before || !after) return { verdict: 'unavailable', decodedRise: null, receivedRise: null, presentedRise: null, elapsedSec: null };
  const decodedRise = rise(before.decoded, after.decoded);
  const receivedRise = rise(before.received, after.received);
  const presentedRise = rise(before.presented, after.presented);
  const currentTimeRise = rise(before.currentTime, after.currentTime);
  const elapsedSec = rise(before.at, after.at) === null ? null : Math.round((after.at-before.at)/1000);
  let verdict = 'inconclusive';
  // If the user is observing a frozen screen while decoded frames still
  // advance, the renderer/native video plane is strongly suspect.
  // Not proof: the stream can be legitimately static during an intro.
  if (decodedRise !== null && decodedRise >= 10 && receivedRise !== null && receivedRise > 0) {
    verdict = 'decoding-continues';
  } else if (decodedRise === 0 && receivedRise !== null && receivedRise > 0) {
    verdict = 'decoder-stalled';
  } else if (decodedRise === 0 && receivedRise === 0) {
    verdict = 'transport-stalled';
  }
  return {verdict,decodedRise,receivedRise,presentedRise,currentTimeRise,elapsedSec};
}
