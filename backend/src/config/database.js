const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const backendRoot = path.resolve(__dirname, '../../');
const rawDbPath = process.env.DATABASE_PATH || 'database/expense-tracker.db';
const dbPath = path.isAbsolute(rawDbPath)
  ? rawDbPath
  : path.resolve(backendRoot, rawDbPath);

// Ensure the target directory for the database file exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Connect to SQLite database using better-sqlite3
const db = new Database(dbPath);

// Optimize performance and enforce integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Automatically apply schema if tables do not exist
const schemaPath = path.resolve(backendRoot, 'database/schema.sql');
if (fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
} else {
  console.warn(`Schema file not found at ${schemaPath}`);
}

module.exports = db;

