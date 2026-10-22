// Keep experimental Xbox system-UI support scoped to the title whose official
// cloud version works but whose independent streaming session does not.
export function needsXboxDialogCompatibility(title) {
 return typeof title==='string' && /\bmetro\s+exodus\b/i.test(title);
}
