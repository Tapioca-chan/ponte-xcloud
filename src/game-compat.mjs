// Keep experimental Xbox system-UI support scoped to the title whose official
// cloud version works but whose independent streaming session does not.
export function needsXboxDialogCompatibility(title) {
 return typeof title==='string' && /\bmetro\s+exodus\b/i.test(title);
}


// Native VIDAA video geometry is a TV-wide responsibility, NOT something
// limited to Metro/Fortnite. The system-dialog compatibility below remains
// Metro-only. The render component applies this only when mounted in the
// verified same-origin TV parent's dedicated video host.
export function shouldPreallocateVideaSurface(title) {
 return typeof title==='string' && title.trim().length>0;
}
