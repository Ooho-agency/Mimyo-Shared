// Azure Functions entry point (Static Web Apps managed API): /api/me and /api/comments[/id].
import { app } from '@azure/functions';
import { handle, identify } from '../core.js';
import { tableStore } from '../store-table.js';

let store;

async function run(req, route) {
  store ||= tableStore(process.env.TABLES_CONNECTION);
  const user = identify(req.headers.get('x-review-key'), req.headers.get('x-ms-client-principal'), process.env.REVIEW_API_KEY);
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await req.json().catch(() => ({})) : null;
  try {
    const res = await handle({ method: req.method, route, query: Object.fromEntries(req.query), body, user }, store);
    return { status: res.status, jsonBody: res.body, headers: { 'cache-control': 'no-store' } };
  } catch (err) {
    return { status: 500, jsonBody: { error: 'Server error.' }, headers: { 'cache-control': 'no-store' } };
  }
}

app.http('me', { methods: ['GET', 'PUT'], authLevel: 'anonymous', route: 'me', handler: req => run(req, ['me']) });
app.http('comments', { methods: ['GET', 'POST', 'PATCH', 'DELETE'], authLevel: 'anonymous', route: 'comments/{id?}', handler: req => run(req, ['comments', req.params.id]) });
