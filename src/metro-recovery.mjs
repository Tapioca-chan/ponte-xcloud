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
 * Boot-only safeguard for VIDAA: the compositor can show a stale image
 * even while WebRTC receives valid frames. A user holding A to advance the
 * stuck Metro splash must NOT prevent the recovery. Try one media-only rebind
 * within a bounded startup window; never run it repeatedly during gameplay.
 */
export function shouldNudgeMetroBoot({
  title, videoAgeMs, lastInputAgoMs, alreadyNudged = false,
  hasVideo = false, connection = 'connected', recoveryBusy = false
}) {
  if (typeof title !== 'string' || !/\bmetro\s+exodus\b/i.test(title)) return false;
  if (alreadyNudged || !hasVideo || recoveryBusy) return false;
  if (connection !== 'connected' && connection !== 'completed') return false;
  // No mid-game periodic reconnection; expire the boot-time opportunity.
  if (!Number.isFinite(videoAgeMs) || videoAgeMs < 16000 || videoAgeMs > 45000) return false;
  // No gamepad-idle requirement: pressing buttons is common precisely when
  // Metro has frozen. The window and one-shot guard prevent a periodic reset.
  return true;
}
