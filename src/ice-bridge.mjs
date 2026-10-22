/**
 * Serialize ICE candidates from xCloudPlayer for the Xbox signaling API.
 * xCloudPlayer.getICECandidates() is async; applying .map to its Promise
 * crashes before ICE exchange, even when the TV gathered candidates.
 */
export async function serializeLocalIceCandidates(getCandidates) {
  const local = await getCandidates();
  if (!Array.isArray(local)) {
    throw new Error('A TV não retornou candidatos ICE em formato válido.');
  }
  return local
    .filter(c => c && typeof c.candidate === 'string' && c.candidate.length > 0)
    .map(c => JSON.stringify({
      candidate: c.candidate,
      sdpMid: c.sdpMid,
      sdpMLineIndex: c.sdpMLineIndex,
      usernameFragment: c.usernameFragment
    }));
}
