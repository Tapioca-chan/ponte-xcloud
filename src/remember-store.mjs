// Encrypted, optional remote Xbox session persistence. The Worker stores only ciphertext.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
const cache = new Map();
const valid = k => /^[a-f0-9]{48}$/.test(k);
function config() {
  const endpoint = process.env.XBRIDGE_STORE_URL || '';
  const secret = process.env.XBRIDGE_STORE_SECRET || '';
  const hex = process.env.XBRIDGE_AUTH_KEY || '';
  let url;
  try { url = new URL(endpoint); } catch { return null; }
  if (url.protocol !== 'https:' || !secret || !/^[a-f0-9]{64}$/i.test(hex)) return null;
  return { origin: url.origin, secret, key: Buffer.from(hex, 'hex') };
}
const recordId = id => createHash('sha256').update(id).digest('hex');
async function request(id, method, body) {
  const c = config();
  if (!c) return { enabled: false, status: 0, data: null };
  const response = await fetch(c.origin + '/session/' + recordId(id), {
    method,
    headers: { Authorization: 'Bearer ' + c.secret, ...(body ? {'Content-Type': 'application/json'} : {}) },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  if (response.status === 404 && method === 'GET') return { enabled: true, status: 404, data: null };
  if (!response.ok) throw Error('Remote session storage unavailable (' + response.status + ')');
  return { enabled: true, status: response.status, data: method === 'GET' ? await response.json() : null };
}
export function persistentConfigured() { return !!config(); }
export async function saveRemember(id, user) {
  if (!valid(id) || !user) return false;
  cache.set(id, user);
  const c = config();
  if (!c) return false;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', c.key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify({ user }), 'utf8'), cipher.final()]);
  await request(id, 'PUT', { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
  return true;
}
export async function loadRemember(id) {
  if (!valid(id)) return null;
  const local = cache.get(id);
  if (local) return local;
  const response = await request(id, 'GET');
  if (!response.enabled || response.status === 404) return null;
  const c = config();
  const r = response.data;
  if (r?.version !== 1) throw Error('Invalid encrypted session');
  const decipher = createDecipheriv('aes-256-gcm', c.key, Buffer.from(r.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(r.tag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(r.data, 'base64')), decipher.final()]);
  const parsed = JSON.parse(decrypted.toString('utf8'));
  if (!parsed.user?.refresh_token) return null;
  cache.set(id, parsed.user);
  return parsed.user;
}
export async function revokeRemember(id) {
  if (!valid(id)) return;
  cache.delete(id);
  if (persistentConfigured()) await request(id, 'DELETE');
}
