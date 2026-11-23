const express = require('express');

// Every query uses ? placeholders (parameterized) -> SQL injection safe.
function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(require('path').join(__dirname, '..', 'public')));

  const q = {
    listUsers:  db.prepare('SELECT * FROM users ORDER BY id'),
    getUser:    db.prepare('SELECT * FROM users WHERE id = ?'),
    insUser:    db.prepare('INSERT INTO users (name, email) VALUES (?, ?)'),
    updUser:    db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?'),
    delUser:    db.prepare('DELETE FROM users WHERE id = ?'),
    userTasks:  db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY id'),
    listTasks:  db.prepare('SELECT * FROM tasks ORDER BY id'),
    byStatus:   db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY id'),
    getTask:    db.prepare('SELECT * FROM tasks WHERE id = ?'),
    insTask:    db.prepare('INSERT INTO tasks (user_id, title, description, status, priority) VALUES (?, ?, ?, ?, ?)'),
    updTask:    db.prepare('UPDATE tasks SET title = ?, description = ?, status = ?, priority = ? WHERE id = ?'),
    delTask:    db.prepare('DELETE FROM tasks WHERE id = ?')
  };

  const id = (req, res) => {
    const n = Number(req.params.id);
    if (!Number.isInteger(n) || n < 1) { res.status(400).json({ error: 'id must be a positive integer' }); return null; }
    return n;
  };
  const isStr = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
  const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  // ---------- USERS ----------
  app.get('/api/users', (req, res) => res.json(q.listUsers.all()));

  app.get('/api/users/:id', (req, res) => {
    const n = id(req, res); if (n === null) return;
    const u = q.getUser.get(n);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json(u);
  });

  app.get('/api/users/:id/tasks', (req, res) => {
    const n = id(req, res); if (n === null) return;
    if (!q.getUser.get(n)) return res.status(404).json({ error: 'User not found' });
    res.json(q.userTasks.all(n));
  });

  app.post('/api/users', (req, res) => {
    const { name, email } = req.body || {};
    const errors = [];
    if (!isStr(name, 2, 60)) errors.push('name must be 2-60 characters');
    if (!isEmail(email)) errors.push('email must be a valid email address');
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    try {
      const info = q.insUser.run(name.trim(), email.trim().toLowerCase());
      res.status(201).json(q.getUser.get(info.lastInsertRowid));
    } catch (e) { handleDbError(e, res); }
  });

  app.put('/api/users/:id', (req, res) => {
    const n = id(req, res); if (n === null) return;
    if (!q.getUser.get(n)) return res.status(404).json({ error: 'User not found' });
    const { name, email } = req.body || {};
    const errors = [];
    if (!isStr(name, 2, 60)) errors.push('name must be 2-60 characters');
    if (!isEmail(email)) errors.push('email must be a valid email address');
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    try {
      q.updUser.run(name.trim(), email.trim().toLowerCase(), n);
      res.json(q.getUser.get(n));
    } catch (e) { handleDbError(e, res); }
  });

  app.delete('/api/users/:id', (req, res) => {
    const n = id(req, res); if (n === null) return;
    if (q.delUser.run(n).changes === 0) return res.status(404).json({ error: 'User not found' });
    res.sendStatus(204);   // their tasks are removed by ON DELETE CASCADE
  });

  // ---------- TASKS ----------
  app.get('/api/tasks', (req, res) => {
    const { status } = req.query;
    res.json(status ? q.byStatus.all(String(status)) : q.listTasks.all());
  });

  app.get('/api/tasks/:id', (req, res) => {
    const n = id(req, res); if (n === null) return;
    const t = q.getTask.get(n);
    if (!t) return res.status(404).json({ error: 'Task not found' });
    res.json(t);
  });

  app.post('/api/tasks', (req, res) => {
    const b = req.body || {};
    const errors = taskErrors(b, true);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    if (!q.getUser.get(b.user_id)) return res.status(400).json({ error: 'user_id does not match an existing user' });
    try {
      const info = q.insTask.run(b.user_id, b.title.trim(), (b.description || '').trim(), b.status || 'todo', b.priority ?? 2);
      res.status(201).json(q.getTask.get(info.lastInsertRowid));
    } catch (e) { handleDbError(e, res); }
  });

  const updateTask = (partial) => (req, res) => {
    const n = id(req, res); if (n === null) return;
    const cur = q.getTask.get(n);
    if (!cur) return res.status(404).json({ error: 'Task not found' });
    const b = req.body || {};
    const errors = taskErrors(b, false, partial);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    const m = { ...cur, ...b };
    try {
      q.updTask.run(m.title.trim(), (m.description || '').trim(), m.status, m.priority, n);
      res.json(q.getTask.get(n));
    } catch (e) { handleDbError(e, res); }
  };
  app.put('/api/tasks/:id', updateTask(false));
  app.patch('/api/tasks/:id', updateTask(true));

  app.delete('/api/tasks/:id', (req, res) => {
    const n = id(req, res); if (n === null) return;
    if (q.delTask.run(n).changes === 0) return res.status(404).json({ error: 'Task not found' });
    res.sendStatus(204);
  });

  function taskErrors(b, creating, partial = false) {
    const e = [];
    if (creating && !Number.isInteger(b.user_id)) e.push('user_id is required and must be an integer');
    if ((creating || !partial || 'title' in b) && !isStr(b.title, 3, 100)) e.push('title must be 3-100 characters');
    if ('status' in b && !['todo', 'in_progress', 'done'].includes(b.status)) e.push('status must be todo, in_progress or done');
    if ('priority' in b && !(Number.isInteger(b.priority) && b.priority >= 1 && b.priority <= 3)) e.push('priority must be an integer 1-3');
    if ('description' in b && typeof b.description !== 'string') e.push('description must be a string');
    if (partial && Object.keys(b).length === 0) e.push('Provide at least one field to update');
    return e;
  }

  // Database is the final source of truth: translate constraint errors into clear responses
  function handleDbError(e, res) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) {
      const dup = /UNIQUE/.test(e.message);
      return res.status(dup ? 409 : 400).json({ error: dup ? 'That email is already registered' : 'Database constraint violated' });
    }
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }

  app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
module.exports = { createApp };
