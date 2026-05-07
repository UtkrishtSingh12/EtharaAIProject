const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'taskflow.db');

const raw = new sqlite3.Database(DB_PATH, (err) => {
  if (err) { console.error('DB open error:', err); process.exit(1); }
  console.log('📦 Database connected:', DB_PATH);
});

raw.serialize(() => {
  raw.run('PRAGMA journal_mode = WAL;');
  raw.run('PRAGMA foreign_keys = ON;');
});


function runSync(sql, params = []) {
  const sab = new SharedArrayBuffer(4);
  const flag = new Int32Array(sab);
  let result = null, error = null;

  raw.serialize(() => {
    raw.run(sql, params, function(err) {
      if (err) error = err;
      else result = { lastInsertRowid: this.lastID, changes: this.changes };
      Atomics.store(flag, 0, 1);
      Atomics.notify(flag, 0);
    });
  });

  Atomics.wait(flag, 0, 0);
  if (error) throw error;
  return result;
}

function getSync(sql, params = []) {
  const sab = new SharedArrayBuffer(4);
  const flag = new Int32Array(sab);
  let row = null, error = null;

  raw.serialize(() => {
    raw.get(sql, params, (err, r) => {
      if (err) error = err;
      else row = r || null;
      Atomics.store(flag, 0, 1);
      Atomics.notify(flag, 0);
    });
  });

  Atomics.wait(flag, 0, 0);
  if (error) throw error;
  return row;
}

function allSync(sql, params = []) {
  const sab = new SharedArrayBuffer(4);
  const flag = new Int32Array(sab);
  let rows = [], error = null;

  raw.serialize(() => {
    raw.all(sql, params, (err, r) => {
      if (err) error = err;
      else rows = r || [];
      Atomics.store(flag, 0, 1);
      Atomics.notify(flag, 0);
    });
  });

  Atomics.wait(flag, 0, 0);
  if (error) throw error;
  return rows;
}

function execSync(sql) {
  const sab = new SharedArrayBuffer(4);
  const flag = new Int32Array(sab);
  let error = null;

  raw.serialize(() => {
    raw.exec(sql, (err) => {
      if (err) error = err;
      Atomics.store(flag, 0, 1);
      Atomics.notify(flag, 0);
    });
  });

  Atomics.wait(flag, 0, 0);
  if (error) throw error;
}

const db = {
  pragma() {},  

  exec(sql) {
    execSync(sql);
  },

  prepare(sql) {
    return {
      get(...params) {
        return getSync(sql, params.flat());
      },
      all(...params) {
        return allSync(sql, params.flat());
      },
      run(...params) {
        return runSync(sql, params.flat());
      }
    };
  }
};

// ─── Schema ───────────────────────────────────────────────────────────────────
execSync(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    owner_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    project_id INTEGER NOT NULL,
    assignee_id INTEGER,
    creator_id INTEGER NOT NULL,
    due_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

module.exports = db;
