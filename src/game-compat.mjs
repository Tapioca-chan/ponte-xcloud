// Keep experimental Xbox system-UI support scoped to the title whose official
// cloud version works but whose independent streaming session does not.
export function needsXboxDialogCompatibility(title) {
 return typeof title==='string' && /\bmetro\s+exodus\b/i.test(title);
}


// Prepare the native VIDAA video plane at its final TV geometry *before*
// attaching the Xbox MediaStream. This stabilizes the transition from xCloud
// preroll to Fortnite/Metro gameplay without touching codec, bitrate, quality,
// controller or Xbox dialogue compatibility. Other games remain unchanged.
export function shouldPreallocateVideaSurface(title) {
 return typeof title==='string' &&
   (needsXboxDialogCompatibility(title)||/\bfortnite\b/i.test(title));
}
