// Local stand-in for Azure Static Web Apps: serves dist/ and runs the comment API on a JSON file.
// Usage: STAGING_DRAFT=1 bash staging/build.sh && node staging/dev-server.mjs [port]
// Sign in as someone else by setting a cookie in the browser: document.cookie = 'devuser=Anne'
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, identify } from './api/src/core.js';
import { fileStore } from './api/src/store-file.js';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const port = Number(process.argv[2] || 8796);
const env = Object.fromEntries(readFileSync(join(here, '..', '.env'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const store = fileStore(join(here, '.data', 'comments.json'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.otf': 'font/otf', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.mp4': 'video/mp4' };

function devPrincipal(req) {
  const name = decodeURIComponent((req.headers.cookie || '').match(/devuser=([^;]+)/)?.[1] || 'Thibault (dev)');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  return Buffer.from(JSON.stringify({ identityProvider: 'aad', userId: 'dev-' + slug, userDetails: slug + '@example.test', claims: [{ typ: 'name', val: name }] })).toString('base64');
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    let body = null; try { body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; } catch { body = {}; }
    const user = identify(req.headers['x-review-key'], devPrincipal(req), env.REVIEW_API_KEY);
    const route = url.pathname.slice(5).split('/').filter(Boolean);
    const out = await handle({ method: req.method, route, query: Object.fromEntries(url.searchParams), body, user }, store);
    res.writeHead(out.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(out.body));
  }
  if (url.pathname === '/.auth/logout') { res.writeHead(302, { location: '/' }); return res.end(); }
  let file = normalize(join(dist, decodeURIComponent(url.pathname)));
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch {}
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, () => console.log(`Mimyo staging (dev) on http://localhost:${port}`));
