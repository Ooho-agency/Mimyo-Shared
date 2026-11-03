// JSON-file backend for the local dev server (staging/dev-server.mjs). Not used on Azure.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function fileStore(file) {
  let db;
  try { db = JSON.parse(readFileSync(file, 'utf8')); } catch { db = { counter: 0, comments: {}, people: {} }; }
  const save = () => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(db, null, 2)); };
  const clone = v => v && structuredClone(v);
  return {
    async nextId() { db.counter += 1; save(); return db.counter; },
    async list(version) { return Object.values(db.comments).filter(c => !version || c.version === version).map(clone); },
    async get(id) { return clone(db.comments[id]) || null; },
    async put(c) { db.comments[c.id] = clone(c); save(); },
    async getPerson(id) { return clone(db.people[id]) || null; },
    async putPerson(p) { db.people[p.id] = clone(p); save(); },
  };
}
