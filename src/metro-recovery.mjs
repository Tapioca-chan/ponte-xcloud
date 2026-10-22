// Recovery is deliberately limited to Metro Exodus and to measurable video
// decode/compositor stalls. A motionless game screen alone is not a freeze.
// The recovery reuses the same MediaStream and does not restart the Xbox title.
export function shouldRebindMetroVideo(title, kind, consecutiveChecks, attempted) {
  // Historical one-shot API retained for existing regression tests.
  if (consecutiveChecks < 3) return false;
  return shouldAttemptMetroRecovery({
    title, kind, consecutiveChecks, attempts: attempted ? 3 : 0,
    hasVideo: true, connection: 'connected', now: 60000,
    lastAttemptAt: 0
  });
}

export function shouldAttemptMetroRecovery({
  title, kind, consecutiveChecks, attempts = 0, lastAttemptAt = 0,
  now = Date.now(), hasVideo = false, connection = 'connected'
}) {
  if (typeof title !== 'string' || !/\bmetro\s+exodus\b/i.test(title)) return false;
  if (!hasVideo || (connection !== 'connected' && connection !== 'completed')) return false;
  if (kind !== 'decode-stall' && kind !== 'presentation-stall') return false;
  if (!Number.isInteger(consecutiveChecks) || consecutiveChecks < 2) return false;
  if (!Number.isInteger(attempts) || attempts < 0 || attempts >= 3) return false;
  // Waiting at least one minute between retries avoids repeated black flashes
  // during a temporarily poor connection, especially on low-end VIDAA CPUs.
  if (attempts > 0 && now - lastAttemptAt < 60000) return false;
  return true;
}

/**
 * Boot-only safeguard for VIDAA: some games continue producing valid WebRTC
 * frames but the native display plane sticks on one scene. Frame counters
 * cannot detect that state. Try the same local video rebind a single time
 * during an idle part of Metro's first minute, never during normal gameplay.
 */
export function shouldNudgeMetroBoot({
  title, videoAgeMs, lastInputAgoMs, alreadyNudged = false,
  hasVideo = false, connection = 'connected', recoveryBusy = false
}) {
  if (typeof title !== 'string' || !/\bmetro\s+exodus\b/i.test(title)) return false;
  if (alreadyNudged || !hasVideo || recoveryBusy) return false;
  if (connection !== 'connected' && connection !== 'completed') return false;
  // No mid-game periodic reconnection; expire the boot-time opportunity.
  if (!Number.isFinite(videoAgeMs) || videoAgeMs < 22000 || videoAgeMs > 60000) return false;
  // An actively used gamepad suggests the player is already playing.
  // Do not interrupt their inputs just because the image looks static.
  if (!Number.isFinite(lastInputAgoMs) || lastInputAgoMs < 6000) return false;
  return true;
}
