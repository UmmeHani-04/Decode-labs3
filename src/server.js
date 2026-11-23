const { openDb } = require('./db');
const { createApp } = require('./app');
const db = openDb();
const PORT = process.env.PORT || 3000;
createApp(db).listen(PORT, () => console.log(`API + SQLite running on http://localhost:${PORT}`));
