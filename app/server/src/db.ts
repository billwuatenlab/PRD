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
    saveToDisk();
    return { lastInsertRowid, changes };
  }
}

const db = {
  prepare(sql: string) {
    return new PreparedStatement(sqlDb, sql);
  },
  exec(sql: string) {
    sqlDb.run(sql);
    saveToDisk();
  },
  pragma(value: string) {
    try {
      sqlDb.run(`PRAGMA ${value}`);
    } catch (_) {
      // Some pragmas may not be supported in sql.js
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

export default db;
