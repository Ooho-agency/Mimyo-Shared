#!/usr/bin/env node
// Read and answer staging comments from the repo. Writes are signed "Claude".
// Needs STAGING_URL and REVIEW_API_KEY in .env at the repo root (or in the environment).
//
//   node staging/comments.mjs list [--version v1] [--status open|discuss|resolved|all] [--page index.html] [--json]
//   node staging/comments.mjs show <id> [--json]
//   node staging/comments.mjs reply <id> "text"
//   node staging/comments.mjs status <id> open|discuss|resolved
//   node staging/comments.mjs delete <id>        (only Claude's own comments)
//   node staging/comments.mjs versions
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...readEnv(join(repo, '.env')), ...process.env };
const base = (env.STAGING_URL || '').replace(/\/$/, '');
if (!base || !env.REVIEW_API_KEY) die('Set STAGING_URL and REVIEW_API_KEY in .env (see README, "Staging and comments").');

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}, args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) { const k = rest[i].slice(2); flags[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; }
  else args.push(rest[i]);
}

const STATUS = { open: 'Open', discuss: 'To discuss', resolved: 'Resolved' };

async function api(path, opts = {}) {
  const res = await fetch(base + '/api/' + path, {
    method: opts.method || 'GET',
    headers: { 'x-review-key': env.REVIEW_API_KEY, ...(opts.body ? { 'content-type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: 'manual',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) die(`${res.status}: ${data.error || res.statusText}`);
  return data;
}

const fmt = iso => iso ? iso.slice(0, 16).replace('T', ' ') : '';
const url = c => `${base}/${c.version}/${c.page}#review-${c.id}`;

if (cmd === 'versions') {
  // Versions are the review-v* tags (staging/build.sh turns each into /vN/).
  const out = execFileSync('git', ['tag', '-l', 'review-v*', '--sort=v:refname', '--format=%(refname:short)\t%(contents:subject)\t%(creatordate:short)'], { cwd: repo, encoding: 'utf8' });
  console.log(out.trim().split('\n').filter(Boolean).map(l => { const [t, label, date] = l.split('\t'); const v = t.replace('review-', ''); return `V${v.slice(1)}_${date.replace(/-/g, '')}  (${v})  ${label}  ${base}/${v}/`; }).join('\n') || 'No review-v* tags yet.');
} else if (cmd === 'list') {
  const q = new URLSearchParams();
  if (flags.version) q.set('version', flags.version);
  if (flags.page) q.set('page', flags.page);
  const { comments } = await api('comments?' + q);
  const status = flags.status || 'open';
  const threads = comments.filter(c => !c.parentId && !c.deleted && (status === 'all' || c.status === status));
  if (flags.json) {
    console.log(JSON.stringify(threads.map(t => ({ ...t, url: url(t), replies: comments.filter(r => r.parentId === t.id && !r.deleted) })), null, 2));
  } else if (!threads.length) {
    console.log(`No ${status === 'all' ? '' : STATUS[status]?.toLowerCase() + ' '}comments.`);
  } else {
    for (const t of threads) {
      const replies = comments.filter(r => r.parentId === t.id && !r.deleted);
      console.log(`#${t.id} [${STATUS[t.status]}] ${t.version}/${t.page} · ${t.authorName} · ${fmt(t.createdAt)}`);
      if (t.anchor?.text) console.log(`  on: "${t.anchor.text}"  (${t.anchor.path})`);
      console.log('  ' + t.body.replace(/\n/g, '\n  '));
      for (const r of replies) console.log(`  ↳ ${r.authorName}: ${r.body.replace(/\n/g, '\n    ')}`);
      console.log('');
    }
  }
} else if (cmd === 'show') {
  const id = need(args[0], 'id');
  const { comment: t, replies } = await api('comments/' + id);
  if (flags.json) { console.log(JSON.stringify({ ...t, url: url(t), replies }, null, 2)); process.exit(0); }
  console.log(`#${t.id} [${STATUS[t.status] || 'reply'}] ${t.version}/${t.page}  ${url(t)}`);
  if (t.anchor) console.log(`element: ${t.anchor.path}\ntext: "${t.anchor.text}"\nmade at ${t.anchor.vw}px wide`);
  if (t.statusBy) console.log(`status set by ${t.statusBy} · ${fmt(t.statusAt)}`);
  console.log(`\n${t.authorName} <${t.authorEmail}> · ${fmt(t.createdAt)}\n${t.deleted ? '(deleted)' : t.body}`);
  for (const r of replies) console.log(`\n${r.authorName} · ${fmt(r.createdAt)}\n${r.deleted ? '(deleted)' : r.body}`);
} else if (cmd === 'reply') {
  const id = need(args[0], 'id'), body = need(args.slice(1).join(' '), 'text');
  const { comment } = await api('comments', { method: 'POST', body: { parentId: Number(id), body } });
  console.log(`Replied on #${id} (reply #${comment.id}).`);
} else if (cmd === 'status') {
  const id = need(args[0], 'id'), status = need(args[1], 'status');
  if (!STATUS[status]) die('Status is open, discuss or resolved.');
  await api('comments/' + id, { method: 'PATCH', body: { status } });
  console.log(`#${id} is now ${STATUS[status]}.`);
} else if (cmd === 'delete') {
  const id = need(args[0], 'id');
  await api('comments/' + id, { method: 'DELETE' });
  console.log(`Deleted #${id}.`);
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 10).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
}

function readEnv(file) {
  try {
    return Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter(l => /^\w+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
  } catch { return {}; }
}
function need(v, what) { if (!v) die(`Missing ${what}.`); return v; }
function die(msg) { console.error(msg); process.exit(1); }
