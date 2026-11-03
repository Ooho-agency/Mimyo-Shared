// Azure Table Storage backend: one table for comments (plus an id counter), one for reviewers' names.
import { TableClient, odata } from '@azure/data-tables';

const pad = id => String(id).padStart(8, '0');

export function tableStore(connection) {
  const comments = TableClient.fromConnectionString(connection, 'comments');
  const people = TableClient.fromConnectionString(connection, 'people');
  let ready;
  const init = () => ready ||= Promise.all([comments, people].map(t => t.createTable().catch(e => { if (e.statusCode !== 409) throw e; })));

  const toEntity = c => ({ partitionKey: 'c', rowKey: pad(c.id), ...c, anchor: c.anchor ? JSON.stringify(c.anchor) : '' });
  const fromEntity = e => {
    const { partitionKey, rowKey, etag, timestamp, ...c } = e;
    return { ...c, anchor: c.anchor ? JSON.parse(c.anchor) : null };
  };

  return {
    async nextId() {
      await init();
      for (let i = 0; i < 10; i++) {
        try {
          const e = await comments.getEntity('meta', 'counter');
          await comments.updateEntity({ partitionKey: 'meta', rowKey: 'counter', value: e.value + 1 }, 'Replace', { etag: e.etag });
          return e.value + 1;
        } catch (err) {
          if (err.statusCode === 404) {
            try { await comments.createEntity({ partitionKey: 'meta', rowKey: 'counter', value: 1 }); return 1; } catch (e2) { if (e2.statusCode !== 409) throw e2; }
          } else if (err.statusCode !== 412) throw err;
        }
      }
      throw new Error('Could not allocate a comment id.');
    },
    async list(version) {
      await init();
      const filter = version ? odata`PartitionKey eq 'c' and version eq ${version}` : odata`PartitionKey eq 'c'`;
      const out = [];
      for await (const e of comments.listEntities({ queryOptions: { filter } })) out.push(fromEntity(e));
      return out;
    },
    async get(id) {
      await init();
      try { return fromEntity(await comments.getEntity('c', pad(id))); } catch (e) { if (e.statusCode === 404) return null; throw e; }
    },
    async put(c) { await init(); await comments.upsertEntity(toEntity(c), 'Replace'); },
    async getPerson(id) {
      await init();
      try { const { name, email } = await people.getEntity('p', encodeURIComponent(id)); return { id, name, email }; } catch (e) { if (e.statusCode === 404) return null; throw e; }
    },
    async putPerson(p) { await init(); await people.upsertEntity({ partitionKey: 'p', rowKey: encodeURIComponent(p.id), ...p }, 'Replace'); },
  };
}
