// Conservative recovery for Metro Exodus media stalls on VIDAA.
// Do not intervene in other games or while decoded/presented frames are advancing.
// Ask the Xbox for a new keyframe first (existing control path), then reattach
// the exact same MediaStream at most once per local WebRTC connection.
export function shouldRebindMetroVideo(title, kind, consecutiveChecks, attempted) {
  if (attempted || typeof title !== 'string' || !/\bmetro\s+exodus\b/i.test(title)) return false;
  if (!Number.isInteger(consecutiveChecks) || consecutiveChecks < 3) return false;
  return kind === 'decode-stall' || kind === 'presentation-stall';
}
