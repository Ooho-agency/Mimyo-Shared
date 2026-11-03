// Comment API logic, shared by the Azure Functions entry point and the local dev server.
import { timingSafeEqual } from 'node:crypto';

export const STATUSES = ['open', 'discuss', 'resolved'];
const VERSION = /^(v\d{1,3}|draft)$/;
const MAX_BODY = 5000;

// Who is calling: Claude (review key) or a signed-in reviewer (Static Web Apps principal).
export function identify(keyHeader, principalHeader, reviewKey) {
  if (keyHeader && reviewKey) {
    const a = Buffer.from(keyHeader), b = Buffer.from(reviewKey);
    if (a.length === b.length && timingSafeEqual(a, b)) return { id: 'claude', name: 'Claude', email: '', provider: 'claude' };
  }
  if (!principalHeader) return null;
  try {
    const p = JSON.parse(Buffer.from(principalHeader, 'base64').toString('utf8'));
    if (!p.userId) return null;
    const claim = t => (p.claims || []).find(c => c.typ === t)?.val;
    return {
      id: `${p.identityProvider}:${p.userId}`,
      email: p.userDetails || '',
      name: claim('name') || '',
      provider: p.identityProvider,
    };
  } catch { return null; }
}

const json = (status, body) => ({ status, body });
const bad = msg => json(400, { error: msg });
const now = () => new Date().toISOString();

function publicComment(c) {
  return c.deleted ? { ...c, body: '', anchor: c.parentId ? null : c.anchor } : c;
}

async function displayName(store, user) {
  if (user.provider === 'claude') return 'Claude';
  const p = await store.getPerson(user.id);
  return p?.name || user.name || nameFromEmail(user.email) || 'Reviewer';
}

// thibault.vandenhove@ooho.io → Thibault Vandenhove (a first guess the reviewer can change)
function nameFromEmail(email) {
  return (email || '').split('@')[0].split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// req: { method, route: ['me'] | ['comments', id?], query, body, user }
export async function handle(req, store) {
  const { method, route, query = {}, body, user } = req;
  if (!user) return json(401, { error: 'Sign in first.' });

  if (route[0] === 'me') {
    if (method === 'GET') {
      const p = user.provider === 'claude' ? null : await store.getPerson(user.id);
      return json(200, { id: user.id, email: user.email, provider: user.provider, name: p?.name || user.name || nameFromEmail(user.email), named: !!p?.name || user.provider === 'claude' });
    }
    if (method === 'PUT') {
      const name = String(body?.name || '').trim().slice(0, 60);
      if (!name) return bad('Name is required.');
      await store.putPerson({ id: user.id, name, email: user.email, updatedAt: now() });
      return json(200, { id: user.id, email: user.email, provider: user.provider, name, named: true });
    }
  }

  if (route[0] !== 'comments') return json(404, { error: 'Not found.' });
  const id = route[1] ? Number(route[1]) : null;

  if (method === 'GET' && id == null) {
    let list = await store.list(query.version && VERSION.test(query.version) ? query.version : null);
    if (query.page) list = list.filter(c => c.page === query.page);
    list.sort((a, b) => a.id - b.id);
    return json(200, { comments: list.map(publicComment) });
  }

  if (method === 'GET') {
    const c = await store.get(id);
    if (!c) return json(404, { error: 'No such comment.' });
    const replies = (await store.list(c.version)).filter(r => r.parentId === c.id).sort((a, b) => a.id - b.id);
    return json(200, { comment: publicComment(c), replies: replies.map(publicComment) });
  }

  if (method === 'POST' && id == null) {
    const text = String(body?.body || '').trim();
    if (!text) return bad('Comment is empty.');
    if (text.length > MAX_BODY) return bad(`Keep it under ${MAX_BODY} characters.`);
    const name = await displayName(store, user);
    const base = { body: text, authorId: user.id, authorName: name, authorEmail: user.email, createdAt: now(), updatedAt: now(), deleted: false };

    if (body.parentId) {
      const parent = await store.get(Number(body.parentId));
      if (!parent || parent.parentId) return bad('You can only reply to a thread.');
      const reply = { ...base, id: await store.nextId(), version: parent.version, page: parent.page, parentId: parent.id, anchor: null, status: '', statusBy: '', statusAt: '' };
      await store.put(reply);
      if (parent.status === 'resolved') await store.put({ ...parent, status: 'open', statusBy: name, statusAt: now(), updatedAt: now() });
      return json(201, { comment: reply });
    }

    if (!VERSION.test(String(body.version))) return bad('Unknown version.');
    const page = String(body.page || '').slice(0, 200);
    if (!page) return bad('Page is required.');
    const a = body.anchor || {};
    const anchor = {
      path: String(a.path || '').slice(0, 1000),
      tag: String(a.tag || '').slice(0, 40),
      text: String(a.text || '').slice(0, 200),
      x: clamp01(a.x), y: clamp01(a.y),
      vw: Math.round(Number(a.vw) || 0),
    };
    const thread = { ...base, id: await store.nextId(), version: body.version, page, parentId: 0, anchor, status: 'open', statusBy: name, statusAt: now() };
    await store.put(thread);
    return json(201, { comment: thread });
  }

  if (method === 'PATCH' && id != null) {
    const c = await store.get(id);
    if (!c) return json(404, { error: 'No such comment.' });
    const next = { ...c, updatedAt: now() };
    if (body?.status !== undefined) {
      if (c.parentId) return bad('Status belongs to the thread.');
      if (!STATUSES.includes(body.status)) return bad(`Status is one of ${STATUSES.join(', ')}.`);
      Object.assign(next, { status: body.status, statusBy: await displayName(store, user), statusAt: now() });
    }
    if (body?.body !== undefined) {
      if (c.authorId !== user.id) return json(403, { error: 'You can only edit your own comments.' });
      const text = String(body.body).trim();
      if (!text || text.length > MAX_BODY) return bad('Comment is empty or too long.');
      next.body = text;
    }
    await store.put(next);
    return json(200, { comment: next });
  }

  if (method === 'DELETE' && id != null) {
    const c = await store.get(id);
    if (!c) return json(404, { error: 'No such comment.' });
    if (c.authorId !== user.id) return json(403, { error: 'You can only delete your own comments.' });
    await store.put({ ...c, deleted: true, updatedAt: now() });
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed.' });
}

function clamp01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 1000) / 1000)) : 0.5;
}
