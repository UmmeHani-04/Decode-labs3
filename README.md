# Project 3: Database Integration
Express + SQLite (better-sqlite3 native driver, raw parameterized SQL). Builds on Project 2's task API.

## Run
    npm install
    npm run seed     # optional sample data
    npm start        # http://localhost:3000  (demo UI at /, API at /api)
    npm test

## Schema (src/schema.sql)
- `users(id PK, name NOT NULL, email UNIQUE NOT NULL CHECK, created_at)`
- `tasks(id PK, user_id FK -> users.id ON DELETE CASCADE, title NOT NULL, description, status CHECK, priority CHECK 1-3, created_at)`
- Relationship: one user has many tasks (1:Many)

## CRUD mapping
| CRUD | HTTP | SQL |
|---|---|---|
| Create | POST /api/users, /api/tasks | INSERT |
| Read | GET /api/users, /api/users/:id, /api/users/:id/tasks, /api/tasks, /api/tasks/:id | SELECT |
| Update | PUT / PATCH /api/users/:id, /api/tasks/:id | UPDATE |
| Delete | DELETE /api/users/:id, /api/tasks/:id | DELETE |

## Data handling and security
- All queries are parameterized (`?`), so SQL injection input is stored or matched as plain text
- Constraints enforce integrity in the DB itself (UNIQUE, NOT NULL, CHECK, FOREIGN KEY)
- Validation in the API layer first; DB constraint errors map to 400 / 409
- Foreign keys enabled via `PRAGMA foreign_keys = ON`
- Data persists in `data.db` between restarts

## Example
    curl -X POST localhost:3000/api/users -H "Content-Type: application/json" -d '{"name":"Alice","email":"alice@email.com"}'
    curl -X POST localhost:3000/api/tasks -H "Content-Type: application/json" -d '{"user_id":1,"title":"Learn SQL"}'
