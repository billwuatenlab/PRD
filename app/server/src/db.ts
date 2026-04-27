import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'prd.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Initialize sql.js
const SQL = await initSqlJs();

// Load existing DB or create new one
let sqlDb: SqlJsDatabase;
if (fs.existsSync(DB_PATH)) {
  const buffer = fs.readFileSync(DB_PATH);
  sqlDb = new SQL.Database(buffer);
} else {
  sqlDb = new SQL.Database();
}

// Auto-save to disk after writes
function saveToDisk() {
  const data = sqlDb.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Compatibility wrapper to match better-sqlite3 API
class PreparedStatement {
  constructor(private db: SqlJsDatabase, private sql: string) {}

  all(...params: any[]): any[] {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const stmt = this.db.prepare(this.sql);
    stmt.bind(flatParams.length > 0 ? flatParams : undefined);
    const results: any[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  get(...params: any[]): any {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const stmt = this.db.prepare(this.sql);
    stmt.bind(flatParams.length > 0 ? flatParams : undefined);
    let result: any = undefined;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  }

  run(...params: any[]): { lastInsertRowid: number; changes: number } {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    this.db.run(this.sql, flatParams.length > 0 ? flatParams : undefined);
    const lastInsertRowid = (this.db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0] as number) || 0;
    const changes = this.db.getRowsModified();
    maybeSave();
    return { lastInsertRowid, changes };
  }
}

// Suppress per-statement disk writes; single save when exiting
let saveSuppressed = 0;
function maybeSave() {
  if (saveSuppressed === 0) saveToDisk();
}

const db = {
  prepare(sql: string) {
    return new PreparedStatement(sqlDb, sql);
  },
  exec(sql: string) {
    sqlDb.run(sql);
    maybeSave();
  },
  pragma(value: string) {
    try {
      sqlDb.run(`PRAGMA ${value}`);
    } catch (_) {
      // Some pragmas may not be supported in sql.js
    }
  },
  batch<T>(fn: () => T): T {
    saveSuppressed++;
    try {
      const result = fn();
      return result;
    } finally {
      saveSuppressed--;
      if (saveSuppressed === 0) saveToDisk();
    }
  },
};

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id INTEGER,
    level INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    pn TEXT,
    name TEXT NOT NULL,
    description TEXT,
    keynote TEXT,
    order_number TEXT,
    c1 TEXT,
    c2 TEXT,
    c3 TEXT,
    note TEXT,
    cost REAL,
    quantity REAL,
    unit_price REAL,
    total_price REAL,
    profit REAL,
    profit_margin REAL,
    discount_pct REAL,
    dis_profit REAL,
    dis_pm REAL,
    lead_days REAL,
    link TEXT,
    remark TEXT,
    internal_no TEXT,
    unit_weight REAL,
    packet_weight REAL,
    owner TEXT,
    part_type TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
  CREATE INDEX IF NOT EXISTS idx_products_pn ON products(pn);
  CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
  CREATE INDEX IF NOT EXISTS idx_categories_code ON categories(code);
`);

// Migration: add `level` column to products if missing
const productCols = db.prepare(`PRAGMA table_info(products)`).all() as any[];
if (!productCols.some((c) => c.name === 'level')) {
  db.exec(`ALTER TABLE products ADD COLUMN level INTEGER NOT NULL DEFAULT 1`);
}
if (!productCols.some((c) => c.name === 'progress_note')) {
  db.exec(`ALTER TABLE products ADD COLUMN progress_note TEXT`);
}
if (!productCols.some((c) => c.name === 'custom_fields')) {
  db.exec(`ALTER TABLE products ADD COLUMN custom_fields TEXT`);
}

// Migration: add progress_note + product-parity fields to categories
const categoryCols = db.prepare(`PRAGMA table_info(categories)`).all() as any[];
const CATEGORY_EXTRA_COLUMNS: Array<[string, string]> = [
  ['progress_note', 'TEXT'],
  ['keynote', 'TEXT'], ['note', 'TEXT'], ['owner', 'TEXT'],
  ['part_type', 'TEXT'], ['description', 'TEXT'], ['order_number', 'TEXT'],
  ['cost', 'REAL'], ['quantity', 'REAL'], ['unit_price', 'REAL'],
  ['total_price', 'REAL'], ['lead_days', 'REAL'],
  ['custom_fields', 'TEXT'],
  // Full parity with products
  ['profit', 'REAL'], ['profit_margin', 'REAL'],
  ['discount_pct', 'REAL'], ['dis_profit', 'REAL'], ['dis_pm', 'REAL'],
  ['link', 'TEXT'], ['remark', 'TEXT'], ['internal_no', 'TEXT'],
  ['unit_weight', 'REAL'], ['packet_weight', 'REAL'],
  ['c1', 'TEXT'], ['c2', 'TEXT'], ['c3', 'TEXT'],
];
for (const [name, type] of CATEGORY_EXTRA_COLUMNS) {
  if (!categoryCols.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE categories ADD COLUMN ${name} ${type}`);
  }
}

// audit_log table
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    user TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_label TEXT,
    changes TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
`);

// One-time backfill: set default values for NULL / empty fields
try {
  const pQtyFill = db.prepare(`UPDATE products SET quantity = 1 WHERE quantity IS NULL`).run();
  const cQtyFill = db.prepare(`UPDATE categories SET quantity = 1 WHERE quantity IS NULL`).run();
  const pOwnerFill = db.prepare(`UPDATE products SET owner = 'N' WHERE owner IS NULL OR owner = ''`).run();
  const cOwnerFill = db.prepare(`UPDATE categories SET owner = 'N' WHERE owner IS NULL OR owner = ''`).run();
  if (pQtyFill.changes || cQtyFill.changes || pOwnerFill.changes || cOwnerFill.changes) {
    console.log(`[backfill] quantity=1: ${pQtyFill.changes} products + ${cQtyFill.changes} categories, owner=N: ${pOwnerFill.changes} products + ${cOwnerFill.changes} categories`);
  }
} catch (e) {
  console.error('[backfill] failed:', e);
}

export default db;
