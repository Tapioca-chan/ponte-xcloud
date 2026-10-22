// Deploy this as a dedicated Cloudflare Worker with KV binding SESSIONS.
// Set XBRIDGE_STORE_SECRET as a Worker secret; never put it in GitHub.
export default {
  async fetch(request, env) {
    if (!env.SESSIONS || !env.XBRIDGE_STORE_SECRET) return new Response('Not configured', { status: 503 });
    const supplied = request.headers.get('Authorization');
    if (supplied !== 'Bearer ' + env.XBRIDGE_STORE_SECRET) return new Response('Unauthorized', { status: 401 });
    const url = new URL(request.url);
    const match = /^\/session\/([a-f0-9]{64})$/.exec(url.pathname);
    if (!match) return new Response('Not found', { status: 404 });
    const key = 'xbox:' + match[1];
    if (request.method === 'GET') {
      const value = await env.SESSIONS.get(key);
      return new Response(value || '', { status: value ? 200 : 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } });
    }
    if (request.method === 'DELETE') {
      await env.SESSIONS.delete(key);
      return new Response(null, { status: 204 });
    }
    if (request.method === 'PUT') {
      if ((Number(request.headers.get('content-length')) || 0) > 30000) return new Response('Too large', { status: 413 });
      const body = await request.text();
      if (body.length > 30000) return new Response('Too large', { status: 413 });
      let parsed;
      try { parsed = JSON.parse(body); } catch { return new Response('Bad JSON', { status: 400 }); }
      if (parsed.version !== 1 || typeof parsed.data !== 'string' || typeof parsed.iv !== 'string' || typeof parsed.tag !== 'string') return new Response('Invalid', { status: 400 });
      await env.SESSIONS.put(key, body, { expirationTtl: 60 * 60 * 24 * 30 });
      return new Response(null, { status: 204 });
    }
    return new Response('Method not allowed', { status: 405 });
  }
};