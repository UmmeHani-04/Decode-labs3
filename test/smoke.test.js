const assert = require('node:assert');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const db = openDb(':memory:');
const srv = createApp(db).listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/api`;
  const j = (p, o = {}) => fetch(base + p, { headers: { 'Content-Type': 'application/json' }, ...o });
  let r = await j('/users', { method: 'POST', body: JSON.stringify({ name: 'Alice', email: 'a@x.com' }) }); assert.equal(r.status, 201);
  const u = await r.json();
  r = await j('/users', { method: 'POST', body: JSON.stringify({ name: 'Alice2', email: 'a@x.com' }) }); assert.equal(r.status, 409);   // UNIQUE
  r = await j('/users', { method: 'POST', body: JSON.stringify({ name: 'A', email: 'bad' }) }); assert.equal(r.status, 400);
  r = await j('/tasks', { method: 'POST', body: JSON.stringify({ user_id: 999, title: 'Orphan task' }) }); assert.equal(r.status, 400); // FK
  r = await j('/tasks', { method: 'POST', body: JSON.stringify({ user_id: u.id, title: 'Real task' }) }); assert.equal(r.status, 201);
  const t = await r.json();
  r = await j(`/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) }); assert.equal((await r.json()).status, 'done');
  // SQL injection attempt is treated as plain data
  r = await j('/tasks?status=' + encodeURIComponent("' OR 1=1 --")); assert.deepEqual(await r.json(), []);
  r = await j('/users', { method: 'POST', body: JSON.stringify({ name: "Rob'); DROP TABLE users;--", email: 'r@x.com' }) }); assert.equal(r.status, 201);
  assert.equal((await (await j('/users')).json()).length, 2);
  r = await j(`/users/${u.id}`, { method: 'DELETE' }); assert.equal(r.status, 204);
  assert.equal((await (await j('/tasks')).json()).length, 0);   // CASCADE
  r = await j('/tasks/999'); assert.equal(r.status, 404);
  console.log('All database checks passed'); srv.close();
});
