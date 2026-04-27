import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import multer from 'multer';
import db from './db.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 58001;

app.use(cors({ exposedHeaders: ['X-User'] }));
app.use(express.json({ limit: '50mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../../client/dist')));

// ============ Audit helper ============

function audit(
  req: express.Request,
  entry: {
    action: string;
    entity_type: 'category' | 'product';
    entity_id: number;
    entity_label?: string;
    changes?: any;
  }
) {
  const user = (req.headers['x-user'] as string | undefined)?.toString().slice(0, 64) || 'anonymous';
  db.prepare(
    `INSERT INTO audit_log (user, action, entity_type, entity_id, entity_label, changes) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    user,
    entry.action,
    entry.entity_type,
    entry.entity_id,
    entry.entity_label ?? null,
    entry.changes !== undefined ? JSON.stringify(entry.changes) : null
  );
}

function diffFields(before: Record<string, any>, after: Record<string, any>): Record<string, [any, any]> {
  const diff: Record<string, [any, any]> = {};
  for (const k of Object.keys(after)) {
    const b = before[k];
    const a = after[k];
    if (String(b ?? '') !== String(a ?? '')) diff[k] = [b ?? null, a ?? null];
  }
  return diff;
}

// Parse custom_fields JSON column into an object for client responses.
function parseCustomFields<T extends { custom_fields?: any } | undefined | null>(row: T): T {
  if (row && typeof (row as any).custom_fields === 'string') {
    try { (row as any).custom_fields = JSON.parse((row as any).custom_fields); }
    catch { (row as any).custom_fields = {}; }
  } else if (row && (row as any).custom_fields == null) {
    (row as any).custom_fields = {};
  }
  return row;
}

// Serialize custom_fields object into JSON string for DB storage.
function serializeCustomFieldsInPlace(fields: Record<string, any>) {
  if ('custom_fields' in fields && fields.custom_fields !== null && typeof fields.custom_fields === 'object') {
    fields.custom_fields = JSON.stringify(fields.custom_fields);
  }
}

// Single source of truth for product derived numerics:
//   total_price = quantity * unit_price        (小計售價)
//   profit      = unit_price - cost            (per-unit 利潤)
//   profit_margin = profit / unit_price        (per-unit 利潤率, stored as 0-1 fraction)
// Returns null for any output that lacks the inputs (or has a divide-by-zero).
function computeDerivedProductNumerics(p: { cost?: number | null; quantity?: number | null; unit_price?: number | null }): {
  total_price: number | null;
  profit: number | null;
  profit_margin: number | null;
} {
  const cost = p.cost == null ? null : Number(p.cost);
  const qty = p.quantity == null ? null : Number(p.quantity);
  const up = p.unit_price == null ? null : Number(p.unit_price);
  const total_price = qty != null && up != null ? qty * up : null;
  const profit = up != null && cost != null ? up - cost : null;
  const profit_margin = profit != null && up != null && up !== 0 ? profit / up : null;
  return { total_price, profit, profit_margin };
}

// ============ Categories API ============

// Get tree structure
app.get('/api/categories/tree', (_req, res) => {
  const rows = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY level, sort_order, code').all() as any[];
  rows.forEach(parseCustomFields);

  const map = new Map<number, any>();
  const roots: any[] = [];

  for (const row of rows) {
    map.set(row.id, { ...row, children: [] });
  }

  for (const row of rows) {
    const node = map.get(row.id)!;
    if (row.parent_id && map.has(row.parent_id)) {
      map.get(row.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Add product counts + numeric totals (cost, unit_price, total_price) per direct-child category
  const counts = db.prepare(`
    SELECT category_id, COUNT(*) as count
    FROM products WHERE is_active = 1
    GROUP BY category_id
  `).all() as any[];

  const countMap = new Map<number, number>();
  for (const c of counts) {
    countMap.set(c.category_id, c.count);
  }

  const sumRows = db.prepare(`
    SELECT category_id,
      COALESCE(SUM(cost), 0) AS sum_cost,
      COALESCE(SUM(unit_price), 0) AS sum_unit_price,
      COALESCE(SUM(total_price), 0) AS sum_total_price
    FROM products WHERE is_active = 1
    GROUP BY category_id
  `).all() as any[];
  const totalsMap = new Map<number, { cost: number; unit_price: number; total_price: number }>();
  for (const s of sumRows) {
    totalsMap.set(s.category_id, {
      cost: Number(s.sum_cost) || 0,
      unit_price: Number(s.sum_unit_price) || 0,
      total_price: Number(s.sum_total_price) || 0,
    });
  }

  // Per-category product count grouped by progress_note
  const progressRows = db.prepare(`
    SELECT category_id, progress_note, COUNT(*) AS c
    FROM products WHERE is_active = 1
    GROUP BY category_id, progress_note
  `).all() as any[];
  const PROGRESS_KEYS = ['1-重要', '2-商品中', '3-研發中', '4-評估中', '5-暫緩', '6-商品'];
  const progressMap = new Map<number, Record<string, number>>();
  for (const r of progressRows) {
    const cid = r.category_id;
    if (cid == null) continue;
    const key = r.progress_note && PROGRESS_KEYS.includes(r.progress_note) ? r.progress_note : '_unset';
    const bucket = progressMap.get(cid) || {};
    bucket[key] = (bucket[key] || 0) + Number(r.c);
    progressMap.set(cid, bucket);
  }

  function aggregate(node: any): {
    count: number;
    totals: { cost: number; unit_price: number; total_price: number };
    progressTotals: Record<string, number>;
  } {
    const direct = totalsMap.get(node.id) || { cost: 0, unit_price: 0, total_price: 0 };
    const totals = { ...direct };
    const progressTotals: Record<string, number> = {
      '1-重要': 0, '2-商品中': 0, '3-研發中': 0, '4-評估中': 0,
      '5-暫緩': 0, '6-商品': 0, '_unset': 0,
    };
    const directProg = progressMap.get(node.id);
    if (directProg) for (const k of Object.keys(directProg)) progressTotals[k] = (progressTotals[k] || 0) + directProg[k];
    let count = countMap.get(node.id) || 0;
    for (const child of node.children) {
      const sub = aggregate(child);
      count += sub.count;
      totals.cost += sub.totals.cost;
      totals.unit_price += sub.totals.unit_price;
      totals.total_price += sub.totals.total_price;
      for (const k of Object.keys(sub.progressTotals)) progressTotals[k] = (progressTotals[k] || 0) + sub.progressTotals[k];
    }
    node.productCount = countMap.get(node.id) || 0;
    node.totalProductCount = count;
    node.totals = totals;
    node.productTotalsByProgress = progressTotals;
    return { count, totals, progressTotals };
  }

  roots.forEach(aggregate);

  res.json(roots);
});

// Get all categories flat
app.get('/api/categories', (_req, res) => {
  const rows = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY level, sort_order').all() as any[];
  rows.forEach(parseCustomFields);
  res.json(rows);
});

// Create a category
app.post('/api/categories', (req, res) => {
  const { parent_id, code, name } = req.body as { parent_id: number | null; code: string; name: string };
  if (!code || !name) return res.status(400).json({ error: 'code and name required' });

  let level = 0;
  if (parent_id != null) {
    const parent = db.prepare('SELECT level FROM categories WHERE id = ?').get(parent_id) as any;
    if (!parent) return res.status(400).json({ error: 'Parent not found' });
    level = (parent.level ?? 0) + 1;
  }
  const result = db.prepare(
    `INSERT INTO categories (parent_id, code, name, level, owner, quantity) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(parent_id ?? null, code, name, level, 'N', 1);
  const created = parseCustomFields(db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid) as any);
  audit(req, {
    action: 'create',
    entity_type: 'category',
    entity_id: created.id,
    entity_label: `${created.code} ${created.name}`,
    changes: { parent_id, code, name },
  });
  res.status(201).json(created);
});

// Update a category: parent_id (reparent + recompute subtree level) + any allowed field
const CATEGORY_EDITABLE_FIELDS = new Set([
  'name', 'code', 'progress_note', 'keynote', 'note', 'owner',
  'part_type', 'description', 'order_number',
  'cost', 'quantity', 'unit_price', 'total_price', 'lead_days',
  'custom_fields',
  'profit', 'profit_margin', 'discount_pct', 'dis_profit', 'dis_pm',
  'link', 'remark', 'internal_no', 'unit_weight', 'packet_weight',
  'c1', 'c2', 'c3',
  'sort_order',
]);

app.patch('/api/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  const { parent_id, ...fields } = req.body as { parent_id?: number | null; [k: string]: any };

  const self = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
  if (!self) return res.status(404).json({ error: 'Category not found' });

  // Serialize custom_fields if present before DB write
  serializeCustomFieldsInPlace(fields);

  // Whitelist
  const validKeys = Object.keys(fields).filter((k) => CATEGORY_EDITABLE_FIELDS.has(k));

  // Capture for cascade rename audit (computed inside the batch below)
  let cascadeSummary: { categories: number; products: number } | null = null;

  db.batch(() => {
    // Update all allowed fields
    if (validKeys.length > 0) {
      const sets = validKeys.map((k) => `${k} = ?`).join(', ');
      const params = validKeys.map((k) => fields[k]);
      params.push(id);
      db.prepare(`UPDATE categories SET ${sets} WHERE id = ?`).run(...params);
    }

    // Cascade prefix rename: if `code` changed, rewrite descendant categories' code
    // and products' pn whose values start with the OLD code prefix.
    if (validKeys.includes('code') && typeof fields.code === 'string'
        && typeof self.code === 'string' && fields.code !== self.code) {
      const oldPrefix = self.code as string;
      const newPrefix = fields.code as string;
      const descendantIds = getDescendantCategoryIds(id);
      let renamedCats = 0;
      let renamedProds = 0;

      if (descendantIds.length > 0) {
        const placeholders = descendantIds.map(() => '?').join(',');
        const descCats = db.prepare(
          `SELECT id, code FROM categories WHERE id IN (${placeholders}) AND is_active = 1`,
        ).all(...descendantIds) as any[];
        for (const c of descCats) {
          if (typeof c.code === 'string' && c.code.startsWith(oldPrefix)) {
            const newCode = newPrefix + c.code.slice(oldPrefix.length);
            db.prepare('UPDATE categories SET code = ? WHERE id = ?').run(newCode, c.id);
            renamedCats++;
          }
        }
      }

      // Products under self + descendants whose pn starts with old prefix
      const allCatIds = [id, ...descendantIds];
      const phProds = allCatIds.map(() => '?').join(',');
      const prods = db.prepare(
        `SELECT id, pn FROM products WHERE category_id IN (${phProds}) AND is_active = 1 AND pn IS NOT NULL`,
      ).all(...allCatIds) as any[];
      for (const p of prods) {
        if (typeof p.pn === 'string' && p.pn.startsWith(oldPrefix)) {
          const newPn = newPrefix + p.pn.slice(oldPrefix.length);
          db.prepare('UPDATE products SET pn = ? WHERE id = ?').run(newPn, p.id);
          renamedProds++;
        }
      }

      if (renamedCats > 0 || renamedProds > 0) {
        cascadeSummary = { categories: renamedCats, products: renamedProds };
      }
    }

    // Reparent if parent_id key is present in body (including null for root)
    if ('parent_id' in req.body) {
      if (parent_id != null) {
        const descendants = getDescendantCategoryIds(id);
        if (Number(parent_id) === id || descendants.includes(Number(parent_id))) {
          throw new Error('Circular reference');
        }
      }
      let newLevel = 0;
      if (parent_id != null) {
        const parent = db.prepare('SELECT level FROM categories WHERE id = ?').get(parent_id) as any;
        if (!parent) throw new Error('Parent not found');
        newLevel = (parent.level ?? 0) + 1;
      }
      db.prepare('UPDATE categories SET parent_id = ?, level = ? WHERE id = ?')
        .run(parent_id ?? null, newLevel, id);

      const queue: Array<{ id: number; level: number }> = [{ id, level: newLevel }];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const children = db.prepare('SELECT id FROM categories WHERE parent_id = ?').all(cur.id) as any[];
        for (const c of children) {
          const childLevel = cur.level + 1;
          db.prepare('UPDATE categories SET level = ? WHERE id = ?').run(childLevel, c.id);
          queue.push({ id: c.id, level: childLevel });
        }
      }
    }
  });

  const updated = parseCustomFields(db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any);

  // Audit: record field-level changes + reparent
  const changes: Record<string, [any, any]> = {};
  for (const k of validKeys) {
    if (String(self[k] ?? '') !== String(fields[k] ?? '')) {
      changes[k] = [self[k] ?? null, fields[k] ?? null];
    }
  }
  if ('parent_id' in req.body && (parent_id ?? null) !== (self.parent_id ?? null)) {
    changes.parent_id = [self.parent_id ?? null, parent_id ?? null];
  }
  if (cascadeSummary) {
    changes.cascade_rename = [null, cascadeSummary];
  }
  if (Object.keys(changes).length > 0) {
    audit(req, {
      action: changes.parent_id ? 'reparent' : 'update',
      entity_type: 'category',
      entity_id: id,
      entity_label: `${updated.code} ${updated.name}`,
      changes,
    });
  }

  res.json({ ...updated, cascade: cascadeSummary });
});

// Soft-delete a category and cascade to all descendants + their products
app.delete('/api/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  const self = db.prepare('SELECT id, code, name FROM categories WHERE id = ? AND is_active = 1').get(id) as any;
  if (!self) return res.status(404).json({ error: 'Category not found' });

  const descendants = getDescendantCategoryIds(id);
  const allIds = [id, ...descendants];

  db.batch(() => {
    const placeholders = allIds.map(() => '?').join(',');
    db.prepare(`UPDATE categories SET is_active = 0 WHERE id IN (${placeholders})`).run(...allIds);
    db.prepare(`UPDATE products SET is_active = 0 WHERE category_id IN (${placeholders})`).run(...allIds);
  });

  audit(req, {
    action: 'delete',
    entity_type: 'category',
    entity_id: id,
    entity_label: `${self.code} ${self.name}`,
    changes: { cascaded_categories: allIds.length },
  });

  res.json({ ok: true, categoryCount: allIds.length });
});

// ============ Products API ============

// Get products by category
app.get('/api/products', (req, res) => {
  const { category_id, search, part_type, owner, limit = '100', offset = '0', direct_only, max_level } = req.query;

  let sql = 'SELECT * FROM products WHERE is_active = 1';
  const params: any[] = [];

  if (max_level) {
    sql += ' AND level <= ?';
    params.push(Number(max_level));
  }

  if (category_id) {
    if (direct_only === '1') {
      // Only products directly in this category
      sql += ' AND category_id = ?';
      params.push(Number(category_id));
    } else {
      // Get all descendant category IDs
      const catIds = getDescendantCategoryIds(Number(category_id));
      catIds.push(Number(category_id));
      sql += ` AND category_id IN (${catIds.map(() => '?').join(',')})`;
      params.push(...catIds);
    }
  }

  if (search) {
    sql += ' AND (pn LIKE ? OR name LIKE ? OR note LIKE ? OR keynote LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  if (part_type) {
    sql += ' AND part_type = ?';
    params.push(part_type);
  }

  if (owner) {
    sql += ' AND owner = ?';
    params.push(owner);
  }

  // Get total count
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = (db.prepare(countSql).get(...params) as any).total;

  sql += ' ORDER BY sort_order, id LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows = (db.prepare(sql).all(...params) as any[]).map(parseCustomFields);
  res.json({ data: rows, total, limit: Number(limit), offset: Number(offset) });
});

// Get single product
app.get('/api/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseCustomFields(row));
});

// Update product. After applying user fields, derived numerics
// (total_price, profit, profit_margin) are recomputed from cost/quantity/unit_price
// so they stay consistent — manual edits to the derived fields are overridden.
app.put('/api/products/:id', (req, res) => {
  const fields = { ...req.body };
  const id = Number(req.params.id);
  const before = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
  if (!before) return res.status(404).json({ error: 'Not found' });

  serializeCustomFieldsInPlace(fields);

  db.batch(() => {
    if (Object.keys(fields).length > 0) {
      const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
      const values = Object.values(fields);
      db.prepare(`UPDATE products SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
    }
    // Read the current row (post-edit) and recompute derived numerics.
    const cur = db.prepare('SELECT cost, quantity, unit_price FROM products WHERE id = ?').get(id) as any;
    const d = computeDerivedProductNumerics(cur);
    db.prepare(
      `UPDATE products SET total_price = ?, profit = ?, profit_margin = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(d.total_price, d.profit, d.profit_margin, id);
  });

  const updated = parseCustomFields(db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any);

  const changes = diffFields(before, fields);
  // Surface auto-recomputes that the client didn't ask for so the audit log is honest.
  for (const k of ['total_price', 'profit', 'profit_margin'] as const) {
    if (!(k in fields) && String(before[k] ?? '') !== String(updated[k] ?? '')) {
      changes[k] = [before[k] ?? null, updated[k] ?? null];
    }
  }
  if (Object.keys(changes).length > 0) {
    audit(req, {
      action: 'update',
      entity_type: 'product',
      entity_id: id,
      entity_label: updated.pn || updated.name,
      changes,
    });
  }
  res.json(updated);
});

// Bulk reorder products — accepts [{id, level, sort_order}]; single disk write
app.patch('/api/products/reorder', (req, res) => {
  const updates = req.body as Array<{ id: number; level?: number; sort_order?: number }>;
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'Expected array' });

  const stmt = db.prepare(
    `UPDATE products SET
       level = COALESCE(?, level),
       sort_order = COALESCE(?, sort_order),
       updated_at = datetime('now')
     WHERE id = ?`
  );
  db.batch(() => {
    for (const u of updates) {
      stmt.run(u.level ?? null, u.sort_order ?? null, u.id);
    }
  });
  res.json({ ok: true, count: updates.length });
});

// Create product
app.post('/api/products', (req, res) => {
  const { category_id, pn, name, description, keynote, cost, quantity, unit_price, total_price, note, owner, part_type } = req.body;
  // Apply defaults: empty/null quantity → 1, empty/null owner → 'N'
  const qDefault = (quantity == null) ? 1 : quantity;
  const ownerDefault = (owner == null || owner === '') ? 'N' : owner;
  const result = db.prepare(`
    INSERT INTO products (category_id, pn, name, description, keynote, cost, quantity, unit_price, total_price, note, owner, part_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(category_id, pn, name, description, keynote, cost, qDefault, unit_price, total_price, note, ownerDefault, part_type);

  const created = parseCustomFields(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid) as any);
  audit(req, {
    action: 'create',
    entity_type: 'product',
    entity_id: created.id,
    entity_label: created.pn || created.name,
    changes: { category_id, pn, name },
  });
  res.status(201).json(created);
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const before = db.prepare('SELECT id, pn, name FROM products WHERE id = ?').get(id) as any;
  if (!before) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(id);
  audit(req, {
    action: 'delete',
    entity_type: 'product',
    entity_id: id,
    entity_label: before.pn || before.name,
  });
  res.json({ ok: true });
});

// ============ Excel Export / Import ============

// Build the ancestor-code chain (up to 9 levels) for a category
function categoryPath(catId: number | null, catMap: Map<number, any>): string[] {
  const path: string[] = [];
  let curr = catId != null ? catMap.get(catId) : null;
  const startId = catId;
  while (curr && path.length < 9) {
    path.unshift(curr.code);
    if (curr.parent_id == null) break;
    const next = catMap.get(curr.parent_id);
    if (!next) {
      console.warn(`[categoryPath] orphan chain: category id=${curr.id} code=${curr.code} has parent_id=${curr.parent_id} which is missing/inactive (starting from category_id=${startId})`);
      break;
    }
    curr = next;
  }
  while (path.length < 9) path.push('');
  return path.slice(0, 9);
}

const EXPORT_COLUMNS = [
  'type', 'id',
  'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9',
  'pn', 'name',
  'cost', 'unit_price', 'total_price', 'quantity',
  'owner', 'progress_note',
  'keynote', 'note', 'order_number', 'part_type', 'description', 'lead_days',
  'profit', 'profit_margin', 'discount_pct', 'dis_profit', 'dis_pm',
  'link', 'remark', 'internal_no', 'unit_weight', 'packet_weight',
  'c1', 'c2', 'c3',
];

// RFC 4180 CSV field escape: wrap in "" if contains , " \r \n; double internal ".
// Also: if value starts with =, +, -, @ Excel would interpret the cell as a
// formula on open and corrupt it (e.g. "-DCV ..." → #NAME?). Prepend a TAB so
// Excel treats it as text; the matching strip is in parseXlsx().
function csvField(v: any): string {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = '\t' + s;
  if (/[",\r\n\t]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

app.get('/api/export.csv', (_req, res) => {
  const cats = db.prepare('SELECT * FROM categories WHERE is_active = 1').all() as any[];
  const catMap = new Map<number, any>();
  for (const c of cats) catMap.set(c.id, c);

  const products = db.prepare(`SELECT * FROM products WHERE is_active = 1 ORDER BY category_id, sort_order, id`).all() as any[];

  // Build a row from a product/category record using its own L-path + fields.
  // `type` ('P'|'C') and `id` make round-trip lossless: products without pn
  // are still re-identified on re-import via id.
  const rowFor = (r: any, pn: string | null, path: string[], type: 'P' | 'C') => [
    type, r.id,
    ...path,
    pn, r.name,
    r.cost, r.unit_price, r.total_price, r.quantity,
    r.owner, r.progress_note,
    r.keynote, r.note, r.order_number, r.part_type, r.description, r.lead_days,
    r.profit, r.profit_margin, r.discount_pct, r.dis_profit, r.dis_pm,
    r.link, r.remark, r.internal_no, r.unit_weight, r.packet_weight,
    r.c1, r.c2, r.c3,
  ].map(csvField).join(',');

  const lines: string[] = [EXPORT_COLUMNS.map(csvField).join(',')];
  for (const p of products) {
    lines.push(rowFor(p, p.pn, categoryPath(p.category_id, catMap), 'P'));
  }

  // Append one row per category (pn blank, L-path filled) so empty branches
  // survive round-trip and a fresh DB can be rebuilt from the CSV. Category rows
  // carry the same parity fields (progress_note, keynote, note, owner, etc.).
  const catsSorted = [...cats].sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || String(a.code).localeCompare(String(b.code)));
  for (const c of catsSorted) {
    lines.push(rowFor(c, null, categoryPath(c.id, catMap), 'C'));
  }

  // Prepend UTF-8 BOM so Excel reads Chinese correctly
  const csv = '﻿' + lines.join('\r\n') + '\r\n';
  const today = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="PRD-${today}.csv"`);
  res.send(csv);
});

// Fields that we diff on the product side
const PRODUCT_DIFF_FIELDS = [
  'name', 'cost', 'unit_price', 'total_price', 'quantity',
  'owner', 'progress_note', 'keynote', 'note', 'order_number', 'part_type', 'description', 'lead_days',
  'profit', 'profit_margin', 'discount_pct', 'dis_profit', 'dis_pm',
  'link', 'remark', 'internal_no', 'unit_weight', 'packet_weight',
  'c1', 'c2', 'c3',
];

// Parse an xlsx/csv buffer into rows keyed by the header.
// Strip the leading TAB we add on export to defeat Excel's formula-injection
// (see csvField). If Excel preserved the TAB, remove it; if Excel stripped it,
// the value still matches on its own.
function parseXlsx(buf: Buffer): Record<string, any>[] {
  // xlsx files start with the ZIP signature 'PK' (0x50 0x4B). Anything else is
  // treated as CSV/text — force UTF-8 decoding so files without a BOM (e.g. one
  // saved by Excel after editing) don't get mis-decoded as Latin-1.
  const isXlsx = buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4B;
  let wb;
  if (isXlsx) {
    wb = XLSX.read(buf);
  } else {
    let text = buf.toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    wb = XLSX.read(text, { type: 'string' });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as any[];
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      const v = row[k];
      if (typeof v === 'string' && v.length > 0 && v.charCodeAt(0) === 9) {
        row[k] = v.slice(1);
      }
    }
  }
  return rows;
}

// Resolve (or propose) a category_id for a given A1..A9 path
function resolveCategoryId(
  pathCodes: (string | null)[],
  catByCode: Map<string, any[]>,
  catMap: Map<number, any>
): { id: number | null; toCreate: string[] } {
  const nonEmpty = pathCodes.filter((c): c is string => !!c && String(c).trim() !== '').map(String);
  if (nonEmpty.length === 0) return { id: null, toCreate: [] };

  let parentId: number | null = null;
  const toCreate: string[] = [];
  for (const code of nonEmpty) {
    const candidates = catByCode.get(code) || [];
    // Find a category with this code whose parent matches
    const match = candidates.find((c) => (c.parent_id ?? null) === parentId);
    if (match) {
      parentId = match.id;
    } else {
      toCreate.push(code);
      parentId = null; // can't resolve further if any mid-path is missing
      break;
    }
  }
  return { id: parentId, toCreate };
}

// POST /api/import/diff — accept xlsx, return three sections
app.post('/api/import/diff', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const rows = parseXlsx(req.file.buffer);

  const cats = db.prepare('SELECT id, code, name, parent_id FROM categories WHERE is_active = 1').all() as any[];
  const catMap = new Map<number, any>();
  const catByCode = new Map<string, any[]>();
  for (const c of cats) {
    catMap.set(c.id, c);
    const list = catByCode.get(c.code) || [];
    list.push(c); catByCode.set(c.code, list);
  }

  const existingProducts = db.prepare(`SELECT * FROM products WHERE is_active = 1`).all() as any[];
  const byPn = new Map<string, any>();
  const byId = new Map<number, any>();
  for (const p of existingProducts) {
    if (p.pn) byPn.set(String(p.pn), p);
    byId.set(Number(p.id), p);
  }

  const added: any[] = [];
  const updated: any[] = [];
  // category-only rows (no pn): carry full payload so progress_note/keynote/etc. survive
  const categoryRows: Array<{ path: string[]; payload: Record<string, any> }> = [];
  const seenIds = new Set<number>();

  // Normalise strings for diff comparison (collapse \r\n and \r into \n, trim)
  const normStr = (v: any): string => {
    if (v == null) return '';
    return String(v).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  };

  for (const row of rows) {
    const rawType = row.type != null ? String(row.type).trim().toUpperCase() : '';
    const pn = row.pn != null ? String(row.pn).trim() : null;
    const rowId = row.id != null && row.id !== '' ? Number(row.id) : null;
    // Accept both new L1-L9 and legacy A1-A9 header names
    const pathCodes: (string | null)[] = [1,2,3,4,5,6,7,8,9].map((i) => {
      const v = row[`L${i}`] ?? row[`A${i}`];
      return v == null ? null : String(v).trim() || null;
    });

    // Row classification: explicit `type` wins; else fall back to pn presence.
    // 'P' = product row (even with no pn — matched by id);  'C' = category row.
    const isProduct = rawType === 'P' || (rawType === '' && !!pn);

    if (!isProduct) {
      // Category row — record path + full payload so apply can ensure the
      // tree exists AND restore fields like progress_note / keynote / note.
      const nonEmpty = pathCodes.filter((c): c is string => !!c);
      if (nonEmpty.length > 0) {
        const payload: Record<string, any> = {};
        if (row.name !== undefined) payload.name = row.name;
        for (const f of PRODUCT_DIFF_FIELDS) if (row[f] !== undefined) payload[f] = row[f];
        categoryRows.push({ path: nonEmpty, payload });
      }
      continue;
    }

    const { id: resolvedCatId, toCreate } = resolveCategoryId(pathCodes, catByCode, catMap);

    const payload: any = {};
    for (const f of PRODUCT_DIFF_FIELDS) if (row[f] !== undefined) payload[f] = row[f];
    payload.category_id = resolvedCatId;
    payload.category_path = pathCodes.filter(Boolean).join(' › ');

    // Match priority: id (lossless round-trip) → pn (legacy CSVs)
    let existing: any = null;
    if (rowId != null && byId.has(rowId)) existing = byId.get(rowId);
    else if (pn && byPn.has(pn))          existing = byPn.get(pn);

    if (!existing) {
      added.push({ pn, payload, missingCategories: toCreate });
    } else {
      seenIds.add(Number(existing.id));
      // field-level diff
      const diff: Record<string, [any, any]> = {};
      for (const f of PRODUCT_DIFF_FIELDS) {
        if (row[f] === undefined) continue;
        const oldV = existing[f];
        const newV = row[f];
        const isNumeric = typeof oldV === 'number' || typeof newV === 'number';
        const eq = isNumeric
          ? Number(oldV ?? 0) === Number(newV ?? 0)
          : normStr(oldV) === normStr(newV);
        if (!eq) diff[f] = [oldV ?? null, newV ?? null];
      }
      // pn change is meaningful too
      if (normStr(existing.pn) !== normStr(pn)) {
        diff.pn = [existing.pn ?? null, pn ?? null];
        payload.pn = pn;
      }
      if ((existing.category_id ?? null) !== (resolvedCatId ?? null)) {
        diff.category_id = [existing.category_id ?? null, resolvedCatId ?? null];
      }
      if (Object.keys(diff).length > 0) {
        updated.push({ id: existing.id, pn: existing.pn, diff, payload, missingCategories: toCreate, categoryPath: payload.category_path });
      }
    }
  }

  // Removed: any active product whose id was not seen in the file.
  // Now correctly catches products without pn (which previously slipped through).
  const removed = existingProducts
    .filter((p) => !seenIds.has(Number(p.id)))
    .map((p) => ({ id: p.id, pn: p.pn, name: p.name, categoryPath: categoryPath(p.category_id, catMap).filter(Boolean).join(' › ') }));

  res.json({ added, updated, removed, categoryRows });
});

// POST /api/import/apply — accept selected changes list and execute
app.post('/api/import/apply', (req, res) => {
  const { added = [], updated = [], removed = [], categoryRows = [] } = req.body as {
    added: Array<{ pn: string; payload: any; missingCategories: string[] }>;
    updated: Array<{ id: number; payload: any }>;
    removed: Array<{ id: number }>;
    categoryRows?: Array<{ path: string[]; payload: Record<string, any> }>;
  };

  const cats = db.prepare('SELECT id, code, name, parent_id, level FROM categories WHERE is_active = 1').all() as any[];
  const catByCode = new Map<string, any[]>();
  const catById = new Map<number, any>();
  for (const c of cats) {
    const list = catByCode.get(c.code) || [];
    list.push(c); catByCode.set(c.code, list);
    catById.set(c.id, c);
  }

  let addedCount = 0, updatedCount = 0, removedCount = 0, catsCreated = 0;

  // Walk a path and create any missing category nodes along the way; returns the leaf id.
  const ensurePath = (pathCodes: string[]): number | null => {
    let parentId: number | null = null;
    for (let depth = 0; depth < pathCodes.length; depth++) {
      const code = pathCodes[depth];
      const list = catByCode.get(code) || [];
      let match = list.find((c) => (c.parent_id ?? null) === parentId);
      if (!match) {
        if (parentId != null && !catById.has(parentId)) {
          throw new Error(`import/apply: refusing to create category "${code}" under non-existent parent id=${parentId} (path=${pathCodes.join(' › ')})`);
        }
        const level = depth;
        const info = db.prepare(`INSERT INTO categories (parent_id, code, name, level, owner, quantity) VALUES (?, ?, ?, ?, 'N', 1)`)
          .run(parentId, code, code, level);
        match = { id: Number(info.lastInsertRowid), code, name: code, parent_id: parentId, level };
        cats.push(match);
        list.push(match); catByCode.set(code, list);
        catById.set(match.id, match);
        catsCreated++;
      }
      parentId = match.id;
    }
    return parentId;
  };

  // Category-parity fields that can be carried on a category row (matches product parity columns in db.ts)
  const CATEGORY_ROW_FIELDS = ['name', ...PRODUCT_DIFF_FIELDS];

  let categoryFieldsUpdated = 0;

  db.batch(() => {
    // 0) Ensure category-only paths exist (preserves empty branches) AND restore
    //    their carried fields (progress_note / keynote / note / owner / …).
    for (const { path, payload } of categoryRows) {
      if (path.length === 0) continue;
      const leafId = ensurePath(path);
      if (leafId == null || !payload) continue;
      const keys = CATEGORY_ROW_FIELDS.filter((k) => payload[k] !== undefined);
      if (keys.length === 0) continue;
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      const values = keys.map((k) => payload[k] ?? null);
      db.prepare(`UPDATE categories SET ${sets} WHERE id = ?`).run(...values, leafId);
      categoryFieldsUpdated++;
    }

    // 1) ADDED — create missing categories if needed, then insert product
    for (const item of added) {
      const pathCodes: string[] = (item.payload.category_path || '').split(' › ').filter(Boolean);
      const parentId = ensurePath(pathCodes);
      const p = item.payload;
      db.prepare(`INSERT INTO products (
        category_id, pn, name, cost, unit_price, total_price, quantity, owner, progress_note, keynote, note, order_number, part_type, description, lead_days,
        profit, profit_margin, discount_pct, dis_profit, dis_pm, link, remark, internal_no, unit_weight, packet_weight, c1, c2, c3
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(parentId, item.pn, p.name ?? null, p.cost ?? null, p.unit_price ?? null, p.total_price ?? null,
             p.quantity ?? 1, p.owner ?? 'N', p.progress_note ?? null, p.keynote ?? null, p.note ?? null,
             p.order_number ?? null, p.part_type ?? null, p.description ?? null, p.lead_days ?? null,
             p.profit ?? null, p.profit_margin ?? null, p.discount_pct ?? null, p.dis_profit ?? null, p.dis_pm ?? null,
             p.link ?? null, p.remark ?? null, p.internal_no ?? null, p.unit_weight ?? null, p.packet_weight ?? null,
             p.c1 ?? null, p.c2 ?? null, p.c3 ?? null);
      addedCount++;
    }

    // 2) UPDATED — apply changed fields
    for (const item of updated) {
      const keys = Object.keys(item.payload).filter((k) => k !== 'category_path');
      if (keys.length === 0) continue;
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      const values = keys.map((k) => item.payload[k]);
      db.prepare(`UPDATE products SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...values, item.id);
      updatedCount++;
    }

    // 3) REMOVED — soft delete
    for (const item of removed) {
      db.prepare(`UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(item.id);
      removedCount++;
    }
  });

  audit(req, {
    action: 'update',
    entity_type: 'product',
    entity_id: 0,
    entity_label: `excel import`,
    changes: { added: addedCount, updated: updatedCount, removed: removedCount, categoriesCreated: catsCreated },
  });

  res.json({ ok: true, addedCount, updatedCount, removedCount, categoriesCreated: catsCreated });
});

// POST /api/import/replace-all — DB end state = file content (M1: 清空再匯入)
// Two-pass ID-preserving sync:
//   Pass 1 — categories (parents before children — file is already in level order)
//   Pass 2 — products
//   Pass 3 — soft-delete any product/category not seen in either pass
// Both passes preserve the id column from the file so re-export round-trips losslessly.
app.post('/api/import/replace-all', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const rows = parseXlsx(req.file.buffer);

  let productsUpdated = 0, productsInserted = 0, productsDeleted = 0;
  let categoriesUpdated = 0, categoriesInserted = 0, categoriesDeleted = 0, categoryFieldsUpdated = 0;

  db.batch(() => {
    const CATEGORY_ROW_FIELDS = ['name', ...PRODUCT_DIFF_FIELDS];

    // ── Snapshot existing state (active + inactive) ──
    const allCats = db.prepare(`SELECT id, code, parent_id, is_active FROM categories`).all() as any[];
    const allCategoryIds = new Set<number>(allCats.map((c) => Number(c.id)));
    const activeCategoryIds = new Set<number>(allCats.filter((c) => c.is_active).map((c) => Number(c.id)));
    // catByCode keyed by ACTIVE rows only — used for resolving paths by code+parent
    const catByCode = new Map<string, any[]>();
    for (const c of allCats) {
      if (!c.is_active) continue;
      const list = catByCode.get(c.code) || [];
      list.push(c); catByCode.set(c.code, list);
    }

    const allProducts = db.prepare(`SELECT id, pn, is_active FROM products`).all() as any[];
    const allProductIds = new Set<number>(allProducts.map((p) => Number(p.id)));
    const activeProductIds = new Set<number>(allProducts.filter((p) => p.is_active).map((p) => Number(p.id)));
    const productByPn = new Map<string, number>();
    for (const p of allProducts) if (p.is_active && p.pn) productByPn.set(String(p.pn), Number(p.id));

    const seenCategoryIds = new Set<number>();
    const seenProductIds = new Set<number>();

    // Helper — parse path codes from a row (L1..L9, with legacy A1..A9 fallback)
    const parsePath = (row: any): string[] => {
      return [1,2,3,4,5,6,7,8,9]
        .map((i) => row[`L${i}`] ?? row[`A${i}`])
        .map((v) => v == null ? null : String(v).trim() || null)
        .filter((c): c is string => !!c);
    };

    // Helper — resolve/create a category under a known parent. Updates catByCode.
    const findOrCreateCategoryAt = (code: string, parentId: number | null, level: number): number => {
      const list = catByCode.get(code) || [];
      let match = list.find((c) => (c.parent_id ?? null) === parentId);
      if (match) return match.id;
      const info = db.prepare(`INSERT INTO categories (parent_id, code, name, level, owner, quantity) VALUES (?, ?, ?, ?, 'N', 1)`)
        .run(parentId, code, code, level);
      const id = Number(info.lastInsertRowid);
      const created = { id, code, parent_id: parentId, level, is_active: 1 };
      list.push(created); catByCode.set(code, list);
      allCategoryIds.add(id);
      categoriesInserted++;
      return id;
    };

    // ── Pass 1: process category rows (id-preserving) ──
    for (const row of rows) {
      const rawType = row.type != null ? String(row.type).trim().toUpperCase() : '';
      const pn = row.pn != null ? String(row.pn).trim() : null;
      const isCategory = rawType === 'C' || (rawType === '' && !pn);
      if (!isCategory) continue;

      const pathCodes = parsePath(row);
      if (pathCodes.length === 0) continue;
      const fileId = row.id != null && row.id !== '' ? Number(row.id) : null;

      // Walk parents (all but leaf) — auto-create using code+parent (id-preservation
      // for non-leaf categories happens when their own row is processed, since the
      // file is sorted parent-first).
      let parentId: number | null = null;
      for (let depth = 0; depth < pathCodes.length - 1; depth++) {
        parentId = findOrCreateCategoryAt(pathCodes[depth], parentId, depth);
        seenCategoryIds.add(parentId);
      }

      // Handle the leaf — this category IS what this row represents.
      const leafCode = pathCodes[pathCodes.length - 1];
      const level = pathCodes.length - 1;
      let leafId: number;

      if (fileId != null && allCategoryIds.has(fileId)) {
        // UPDATE existing row (active or inactive) and reactivate; preserves id
        db.prepare(`UPDATE categories SET parent_id=?, code=?, level=?, is_active=1 WHERE id=?`)
          .run(parentId, leafCode, level, fileId);
        leafId = fileId;
        // Refresh catByCode entry
        const list = catByCode.get(leafCode) || [];
        if (!list.find((c) => c.id === leafId)) {
          list.push({ id: leafId, code: leafCode, parent_id: parentId, level, is_active: 1 });
          catByCode.set(leafCode, list);
        }
        categoriesUpdated++;
      } else if (fileId != null) {
        // file id given, no DB row → INSERT with explicit id; preserves id
        db.prepare(`INSERT INTO categories (id, parent_id, code, name, level, owner, quantity) VALUES (?, ?, ?, ?, ?, 'N', 1)`)
          .run(fileId, parentId, leafCode, leafCode, level);
        leafId = fileId;
        allCategoryIds.add(fileId);
        const list = catByCode.get(leafCode) || [];
        list.push({ id: leafId, code: leafCode, parent_id: parentId, level, is_active: 1 });
        catByCode.set(leafCode, list);
        categoriesInserted++;
      } else {
        // No file id — match by code+parent or create
        leafId = findOrCreateCategoryAt(leafCode, parentId, level);
      }

      seenCategoryIds.add(leafId);

      // Apply category fields from row
      const keys = CATEGORY_ROW_FIELDS.filter((k) => row[k] !== undefined);
      if (keys.length > 0) {
        const sets = keys.map((k) => `${k} = ?`).join(', ');
        const values = keys.map((k) => row[k] ?? null);
        db.prepare(`UPDATE categories SET ${sets} WHERE id = ?`).run(...values, leafId);
        categoryFieldsUpdated++;
      }
    }

    // ── Pass 2: process product rows (id-preserving) ──
    for (const row of rows) {
      const rawType = row.type != null ? String(row.type).trim().toUpperCase() : '';
      const pn = row.pn != null ? String(row.pn).trim() : null;
      const isProduct = rawType === 'P' || (rawType === '' && !!pn);
      if (!isProduct) continue;

      const pathCodes = parsePath(row);
      const fileId = row.id != null && row.id !== '' ? Number(row.id) : null;

      // Resolve parent category (file should already define it via Pass 1; auto-create if not)
      let parentId: number | null = null;
      for (let depth = 0; depth < pathCodes.length; depth++) {
        parentId = findOrCreateCategoryAt(pathCodes[depth], parentId, depth);
        seenCategoryIds.add(parentId);
      }

      // Same id-preserving 4-way logic as before
      if (fileId != null && allProductIds.has(fileId)) {
        db.prepare(`UPDATE products SET
          category_id=?, pn=?, name=?, cost=?, unit_price=?, total_price=?, quantity=?, owner=?,
          progress_note=?, keynote=?, note=?, order_number=?, part_type=?, description=?, lead_days=?,
          profit=?, profit_margin=?, discount_pct=?, dis_profit=?, dis_pm=?,
          link=?, remark=?, internal_no=?, unit_weight=?, packet_weight=?, c1=?, c2=?, c3=?,
          is_active=1, updated_at=datetime('now') WHERE id=?`)
          .run(parentId, pn, row.name ?? null, row.cost ?? null, row.unit_price ?? null, row.total_price ?? null,
               row.quantity ?? 1, row.owner ?? 'N', row.progress_note ?? null, row.keynote ?? null, row.note ?? null,
               row.order_number ?? null, row.part_type ?? null, row.description ?? null, row.lead_days ?? null,
               row.profit ?? null, row.profit_margin ?? null, row.discount_pct ?? null, row.dis_profit ?? null, row.dis_pm ?? null,
               row.link ?? null, row.remark ?? null, row.internal_no ?? null, row.unit_weight ?? null, row.packet_weight ?? null,
               row.c1 ?? null, row.c2 ?? null, row.c3 ?? null, fileId);
        seenProductIds.add(fileId);
        productsUpdated++;
      } else if (fileId == null && pn && productByPn.has(pn)) {
        const targetId = productByPn.get(pn)!;
        db.prepare(`UPDATE products SET
          category_id=?, pn=?, name=?, cost=?, unit_price=?, total_price=?, quantity=?, owner=?,
          progress_note=?, keynote=?, note=?, order_number=?, part_type=?, description=?, lead_days=?,
          profit=?, profit_margin=?, discount_pct=?, dis_profit=?, dis_pm=?,
          link=?, remark=?, internal_no=?, unit_weight=?, packet_weight=?, c1=?, c2=?, c3=?,
          is_active=1, updated_at=datetime('now') WHERE id=?`)
          .run(parentId, pn, row.name ?? null, row.cost ?? null, row.unit_price ?? null, row.total_price ?? null,
               row.quantity ?? 1, row.owner ?? 'N', row.progress_note ?? null, row.keynote ?? null, row.note ?? null,
               row.order_number ?? null, row.part_type ?? null, row.description ?? null, row.lead_days ?? null,
               row.profit ?? null, row.profit_margin ?? null, row.discount_pct ?? null, row.dis_profit ?? null, row.dis_pm ?? null,
               row.link ?? null, row.remark ?? null, row.internal_no ?? null, row.unit_weight ?? null, row.packet_weight ?? null,
               row.c1 ?? null, row.c2 ?? null, row.c3 ?? null, targetId);
        seenProductIds.add(targetId);
        productsUpdated++;
      } else if (fileId != null) {
        db.prepare(`INSERT INTO products (
          id, category_id, pn, name, cost, unit_price, total_price, quantity, owner, progress_note, keynote, note, order_number, part_type, description, lead_days,
          profit, profit_margin, discount_pct, dis_profit, dis_pm, link, remark, internal_no, unit_weight, packet_weight, c1, c2, c3
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(fileId, parentId, pn, row.name ?? null, row.cost ?? null, row.unit_price ?? null, row.total_price ?? null,
               row.quantity ?? 1, row.owner ?? 'N', row.progress_note ?? null, row.keynote ?? null, row.note ?? null,
               row.order_number ?? null, row.part_type ?? null, row.description ?? null, row.lead_days ?? null,
               row.profit ?? null, row.profit_margin ?? null, row.discount_pct ?? null, row.dis_profit ?? null, row.dis_pm ?? null,
               row.link ?? null, row.remark ?? null, row.internal_no ?? null, row.unit_weight ?? null, row.packet_weight ?? null,
               row.c1 ?? null, row.c2 ?? null, row.c3 ?? null);
        seenProductIds.add(fileId);
        allProductIds.add(fileId);
        productsInserted++;
      } else {
        const info = db.prepare(`INSERT INTO products (
          category_id, pn, name, cost, unit_price, total_price, quantity, owner, progress_note, keynote, note, order_number, part_type, description, lead_days,
          profit, profit_margin, discount_pct, dis_profit, dis_pm, link, remark, internal_no, unit_weight, packet_weight, c1, c2, c3
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(parentId, pn, row.name ?? null, row.cost ?? null, row.unit_price ?? null, row.total_price ?? null,
               row.quantity ?? 1, row.owner ?? 'N', row.progress_note ?? null, row.keynote ?? null, row.note ?? null,
               row.order_number ?? null, row.part_type ?? null, row.description ?? null, row.lead_days ?? null,
               row.profit ?? null, row.profit_margin ?? null, row.discount_pct ?? null, row.dis_profit ?? null, row.dis_pm ?? null,
               row.link ?? null, row.remark ?? null, row.internal_no ?? null, row.unit_weight ?? null, row.packet_weight ?? null,
               row.c1 ?? null, row.c2 ?? null, row.c3 ?? null);
        seenProductIds.add(Number(info.lastInsertRowid));
        productsInserted++;
      }
    }

    // ── Pass 3a: soft-delete any active product not in the file ──
    for (const id of activeProductIds) {
      if (!seenProductIds.has(id)) {
        db.prepare(`UPDATE products SET is_active=0, updated_at=datetime('now') WHERE id=?`).run(id);
        productsDeleted++;
      }
    }

    // ── Pass 3b: soft-delete any active category not in the file ──
    for (const id of activeCategoryIds) {
      if (!seenCategoryIds.has(id)) {
        db.prepare(`UPDATE categories SET is_active=0 WHERE id=?`).run(id);
        categoriesDeleted++;
      }
    }
  });

  audit(req, {
    action: 'update',
    entity_type: 'product',
    entity_id: 0,
    entity_label: 'excel import (clear & import)',
    changes: {
      productsUpdated, productsInserted, productsDeleted,
      categoriesUpdated, categoriesInserted, categoriesDeleted, categoryFieldsUpdated,
    },
  });

  res.json({
    ok: true,
    productsUpdated, productsInserted, productsDeleted,
    categoriesUpdated, categoriesInserted, categoriesDeleted, categoryFieldsUpdated,
  });
});

// ============ Audit Log API ============

app.get('/api/audit', (req, res) => {
  const { entity_type, entity_id, user, limit = '100' } = req.query as Record<string, string>;
  let sql = 'SELECT * FROM audit_log WHERE 1=1';
  const params: any[] = [];
  if (entity_type) { sql += ' AND entity_type = ?'; params.push(entity_type); }
  if (entity_id)   { sql += ' AND entity_id = ?';   params.push(Number(entity_id)); }
  if (user)        { sql += ' AND user LIKE ?';     params.push(`%${user}%`); }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(Math.min(Number(limit) || 100, 1000));

  const rows = (db.prepare(sql).all(...params) as any[]).map((r) => ({
    ...r,
    changes: r.changes ? JSON.parse(r.changes) : null,
  }));
  res.json(rows);
});

// ============ Stats API ============

app.get('/api/stats', (_req, res) => {
  const totalProducts = (db.prepare('SELECT COUNT(*) as c FROM products WHERE is_active = 1').get() as any).c;
  const totalCategories = (db.prepare('SELECT COUNT(*) as c FROM categories WHERE is_active = 1').get() as any).c;
  const owners = db.prepare("SELECT owner, COUNT(*) as count FROM products WHERE is_active = 1 AND owner IS NOT NULL AND owner != '' GROUP BY owner ORDER BY count DESC").all();
  const partTypes = db.prepare("SELECT part_type, COUNT(*) as count FROM products WHERE is_active = 1 AND part_type IS NOT NULL GROUP BY part_type ORDER BY count DESC").all();

  res.json({ totalProducts, totalCategories, owners, partTypes });
});

// ============ Search API ============

app.get('/api/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const s = `%${q}%`;
  const products = (db.prepare(`
    SELECT p.*, c.code as category_code, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = 1 AND (p.pn LIKE ? OR p.name LIKE ? OR p.note LIKE ? OR p.keynote LIKE ?)
    LIMIT 50
  `).all(s, s, s, s) as any[]).map(parseCustomFields);

  res.json(products);
});

// ============ Helper ============

function getDescendantCategoryIds(parentId: number): number[] {
  const children = db.prepare('SELECT id FROM categories WHERE parent_id = ? AND is_active = 1').all(parentId) as any[];
  const ids: number[] = [];
  for (const child of children) {
    ids.push(child.id);
    ids.push(...getDescendantCategoryIds(child.id));
  }
  return ids;
}

// SPA fallback — all non-API routes serve index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`PRD Server running on http://0.0.0.0:${PORT}`);
});
