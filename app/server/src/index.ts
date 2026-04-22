import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../../client/dist')));

// ============ Categories API ============

// Get tree structure
app.get('/api/categories/tree', (_req, res) => {
  const rows = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY level, sort_order, code').all() as any[];

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

  // Add product counts
  const counts = db.prepare(`
    SELECT category_id, COUNT(*) as count
    FROM products WHERE is_active = 1
    GROUP BY category_id
  `).all() as any[];

  const countMap = new Map<number, number>();
  for (const c of counts) {
    countMap.set(c.category_id, c.count);
  }

  function addCounts(node: any): number {
    let total = countMap.get(node.id) || 0;
    for (const child of node.children) {
      total += addCounts(child);
    }
    node.productCount = countMap.get(node.id) || 0;
    node.totalProductCount = total;
    return total;
  }

  roots.forEach(addCounts);

  res.json(roots);
});

// Get all categories flat
app.get('/api/categories', (_req, res) => {
  const rows = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY level, sort_order').all();
  res.json(rows);
});

// ============ Products API ============

// Get products by category
app.get('/api/products', (req, res) => {
  const { category_id, search, part_type, owner, limit = '100', offset = '0', direct_only } = req.query;

  let sql = 'SELECT * FROM products WHERE is_active = 1';
  const params: any[] = [];

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

  const rows = db.prepare(sql).all(...params);
  res.json({ data: rows, total, limit: Number(limit), offset: Number(offset) });
});

// Get single product
app.get('/api/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// Update product
app.put('/api/products/:id', (req, res) => {
  const fields = req.body;
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const values = Object.values(fields);

  db.prepare(`UPDATE products SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...values, req.params.id);
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Create product
app.post('/api/products', (req, res) => {
  const { category_id, pn, name, description, keynote, cost, quantity, unit_price, total_price, note, owner, part_type } = req.body;
  const result = db.prepare(`
    INSERT INTO products (category_id, pn, name, description, keynote, cost, quantity, unit_price, total_price, note, owner, part_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(category_id, pn, name, description, keynote, cost, quantity, unit_price, total_price, note, owner, part_type);

  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
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
  const products = db.prepare(`
    SELECT p.*, c.code as category_code, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = 1 AND (p.pn LIKE ? OR p.name LIKE ? OR p.note LIKE ? OR p.keynote LIKE ?)
    LIMIT 50
  `).all(s, s, s, s);

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
