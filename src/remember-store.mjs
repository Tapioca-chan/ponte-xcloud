// Persistent encrypted Xbox auth, isolated from the Discord bot database.
import { saveXboxRemember, loadXboxRemember, revokeXboxRemember } from './auth-store.mjs';
const cache = new Map();
const valid = id => /^[0-9a-f]{48}$/.test(id);
const ttl = 30 * 24 * 60 * 60 * 1000;
export function persistentConfigured(){
 return Boolean(process.env.XBRIDGE_AUTH_MONGODB_URI && /^[0-9a-f]{64}$/i.test(process.env.XBRIDGE_AUTH_KEY || ''));
}
export async function saveRemember(id,user) {
 if (!valid(id) || !user?.refresh_token) return false;
 // Save first: never report a durable login before MongoDB confirms the write.
 const ok = await saveXboxRemember(id,{user,expires:Date.now()+ttl});
 if (ok) cache.set(id,user);
 return ok;
}
export async function loadRemember(id) {
 if (!valid(id)) return null;
 if (cache.has(id)) return cache.get(id);
 const record = await loadXboxRemember(id);
 if (!record?.user?.refresh_token) return null;
 cache.set(id, record.user);
 return record.user;
}
export async function revokeRemember(id) {
 if (!valid(id)) return false;
 await revokeXboxRemember(id);
 cache.delete(id);
 return true;
}
