import XLSX from 'xlsx';
import db from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = path.resolve(__dirname, '../../../reference/2025 產品牌價表.xlsx');

console.log('📂 Reading Excel:', EXCEL_PATH);

const wb = XLSX.readFile(EXCEL_PATH);
const ws = wb.Sheets['2025 產品牌價表'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];

console.log(`📊 Total rows: ${rows.length}`);

// Column mapping (2025 format):
// 5=上層品號, 6=品名, 7=品號, 9=描述
// 12=數量, 13=台幣牌價, 14=台幣成本, 15=成交價, 16=折扣率, 17=成交毛利率
// 23=Note

const MAX_ROW = 6000; // Skip duplicate sections after row 6000

// Clear existing data
db.exec('DELETE FROM products');
db.exec('DELETE FROM categories');
try { db.exec("DELETE FROM sqlite_sequence WHERE name IN ('products', 'categories')"); } catch (_) {}

// ── Step 1: Scan all rows to find parent-child relationships ──

interface RowInfo {
  idx: number;
  pn: string;
  name: string;
  parentPn: string;
}

const allRows: RowInfo[] = [];
const parentPnSet = new Set<string>(); // PNs that are referenced as parents
const pnToName = new Map<string, string>();

for (let i = 1; i < Math.min(rows.length, MAX_ROW); i++) {
  const row = rows[i];
  const rawPn = row[7] != null ? String(row[7]).trim() : '';
  const name = row[6] != null ? String(row[6]).trim() : '';
  const rawParentPn = row[5] != null ? String(row[5]).trim() : '';

  // Normalize: replace all - and , with . (except standalone "-")
  const pn = rawPn.replace(/[-,]/g, '.');
  const parentPn = rawParentPn === '-' ? '-' : rawParentPn.replace(/[-,]/g, '.');

  if (!pn && !name) continue;
  if (name === '2025目錄' || pn === 'AXXX.AXXX') continue;

  allRows.push({ idx: i, pn, name, parentPn });
  if (pn && name) pnToName.set(pn, name);

  // Collect parent PNs (items referenced as parents are categories)
  if (parentPn && parentPn !== '-' && !parentPn.startsWith('#')) {
    parentPnSet.add(parentPn);
  }

  // All pure letter-digit PNs (A1, B11, C156, etc.) are always categories
  if (/^[A-Z]\d+$/.test(pn)) {
    parentPnSet.add(pn);
  }

  // PNs ending with .PONN or .PON are always categories (system definitions)
  if (/\.P?ONN?$/i.test(pn)) {
    parentPnSet.add(pn);
  }

  // Single-letter PNs like A213.A, B116.V are always categories (subsystems)
  if (/^[A-Z]\d+\.[A-Z]$/i.test(pn)) {
    parentPnSet.add(pn);
  }

  // Auto-create letter-digit intermediate categories AND all ancestors
  // e.g. PN "A191.PONN" → A191, A19, A1;  "B116.J.JF41" → B116, B11, B1
  const prefixMatch = pn.match(/^([A-Z]\d+)/);
  if (prefixMatch) {
    const digits = prefixMatch[1]; // e.g. "A191" or "B116"
    for (let len = digits.length; len >= 2; len--) {
      const code = digits.substring(0, len);
      parentPnSet.add(code);
      if (!pnToName.has(code)) pnToName.set(code, code);
    }
  }
}

// ── Step 2: Create categories for all PNs that are parents ──

const insertCategory = db.prepare(`
  INSERT INTO categories (code, name, parent_id, level, sort_order)
  VALUES (?, ?, ?, ?, ?)
`);

const categoryMap = new Map<string, number>(); // PN -> category id

// Sort parent PNs by length (shorter = higher level, create first)
const sortedParents = [...parentPnSet].sort((a, b) => {
  // Normalize: replace - with . for comparison
  const aN = a.replace(/-/g, '.');
  const bN = b.replace(/-/g, '.');
  return aN.length - bN.length || aN.localeCompare(bN);
});

// Determine parent category purely from PN structure
// Rule 1: A116 → A11 (pure letter-digit, strip last digit)
// Rule 2: A116.PONN / A116.PON → A116 (system def goes under letter-digit prefix)
// Rule 3: A116.A (single letter after prefix) → A116.PONN or A116.PON (under system def)
// Rule 4: A116.A.PON / A116.A01 → A116.A (strip last segment)
function findParentCategory(pn: string): number | null {
  // Rule 1: Pure letter-digit codes (A116, B11, etc.)
  const letterDigitMatch = pn.match(/^([A-Z])(\d+)$/);
  if (letterDigitMatch) {
    const letter = letterDigitMatch[1];
    const digits = letterDigitMatch[2];
    if (digits.length > 1) {
      const parentCode = letter + digits.substring(0, digits.length - 1);
      if (categoryMap.has(parentCode)) {
        return categoryMap.get(parentCode)!;
      }
    }
    return null;
  }

  // Extract letter-digit prefix (e.g. A116 from A116.A.PON; B116 from B116.J.JF41)
  const prefixMatch = pn.match(/^([A-Z]\d+)\./);
  const prefix = prefixMatch ? prefixMatch[1] : null;

  // Rule 2: Ends with .PONN or .PON directly after prefix → parent is prefix
  if (prefix && /^[A-Z]\d+\.P?ONN?$/i.test(pn)) {
    if (categoryMap.has(prefix)) return categoryMap.get(prefix)!;
  }

  // Rule 3: Single letter after prefix (A116.A, B116.J) → parent is prefix.PONN or prefix.PON
  if (prefix && new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.[A-Z]$').test(pn)) {
    for (const suffix of ['.PONN', '.PON']) {
      const candidate = prefix + suffix;
      if (categoryMap.has(candidate)) {
        return categoryMap.get(candidate)!;
      }
    }
    if (categoryMap.has(prefix)) return categoryMap.get(prefix)!;
  }

  // Rule 3.5: PN like A111.A.PON or B111.J.PONN → parent is prefix.PONN or prefix.PON
  if (prefix) {
    const subSystemMatch = pn.match(new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.[A-Z]\\.P?ONN?$', 'i'));
    if (subSystemMatch) {
      for (const suffix of ['.PONN', '.PON']) {
        const candidate = prefix + suffix;
        if (categoryMap.has(candidate)) {
          return categoryMap.get(candidate)!;
        }
      }
      if (categoryMap.has(prefix)) return categoryMap.get(prefix)!;
    }
  }

  // Rule 4: Strip last segment, with sub-segment awareness
  // A116.A01 → try A116.A first (letter prefix), then A116
  // A116.A010 → try A116.A01, then A116.A, then A116
  const lastDot = pn.lastIndexOf('.');
  if (lastDot > 0) {
    const beforeDot = pn.substring(0, lastDot);
    const afterDot = pn.substring(lastDot + 1);

    // Try progressively shorter sub-segments within the last part
    // e.g. afterDot = "A01" → try "A0", "A"; afterDot = "A010" → try "A01", "A0", "A"
    for (let len = afterDot.length - 1; len >= 1; len--) {
      const candidate = beforeDot + '.' + afterDot.substring(0, len);
      if (categoryMap.has(candidate)) return categoryMap.get(candidate)!;
    }

    // Try the part before the dot
    if (categoryMap.has(beforeDot)) return categoryMap.get(beforeDot)!;

    // Strip further
    let remaining = beforeDot;
    while (true) {
      const sep = remaining.lastIndexOf('.');
      if (sep <= 0) break;
      remaining = remaining.substring(0, sep);
      if (categoryMap.has(remaining)) return categoryMap.get(remaining)!;
    }
  }

  // Last fallback: prefix
  if (prefix && categoryMap.has(prefix)) return categoryMap.get(prefix)!;

  return null;
}

// Determine level by counting separators (. and -) plus letter-digit depth
function getLevel(pn: string): number {
  const ldMatch = pn.match(/^[A-Z](\d+)$/);
  if (ldMatch) return ldMatch[1].length - 1; // A1/B1=0, A15=1, A156=2
  const normalized = pn.replace(/-/g, '.');
  const parts = normalized.split('.');
  const baseMatch = parts[0].match(/^[A-Z](\d+)$/);
  const baseLevel = baseMatch ? baseMatch[1].length - 1 : 0;
  return baseLevel + (parts.length - 1);
}

// Pass 1: Create all categories first (no parent assignments)
sortedParents.sort((a, b) => getLevel(a) - getLevel(b) || a.localeCompare(b));

for (let i = 0; i < sortedParents.length; i++) {
  const pn = sortedParents[i];
  const name = pnToName.get(pn) || pn;
  const level = getLevel(pn);

  const result = insertCategory.run(pn, name, null, level, i + 1);
  categoryMap.set(pn, result.lastInsertRowid as number);
}

// Pass 2: Fix parent relationships now that all categories exist
const updateParent = db.prepare('UPDATE categories SET parent_id = ? WHERE id = ?');
for (const pn of sortedParents) {
  const parentId = findParentCategory(pn);
  if (parentId != null) {
    const catId = categoryMap.get(pn)!;
    updateParent.run(parentId, catId);
  }
}

console.log(`📁 Categories created: ${categoryMap.size}`);

// ── Step 3: Import products (items NOT in parentPnSet) ──

const insertProduct = db.prepare(`
  INSERT INTO products (category_id, pn, name, description, keynote,
    note, cost, quantity, unit_price, total_price, profit, profit_margin,
    discount_pct, owner, part_type, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Build a lookup: for non-category PNs, find which category they belong to
const pnToCategoryId = new Map<string, number>();
for (const r of allRows) {
  if (categoryMap.has(r.pn)) continue; // skip categories themselves
  if (r.parentPn && categoryMap.has(r.parentPn)) {
    pnToCategoryId.set(r.pn, categoryMap.get(r.parentPn)!);
  }
}

// For items whose parent is another product (not a category), trace up the chain
function findCategoryForParent(parentPn: string, visited: Set<string>): number | null {
  if (!parentPn || parentPn === '-' || parentPn.startsWith('#')) return null;
  if (categoryMap.has(parentPn)) return categoryMap.get(parentPn)!;
  if (pnToCategoryId.has(parentPn)) return pnToCategoryId.get(parentPn)!;
  if (visited.has(parentPn)) return null;
  visited.add(parentPn);
  // Find the parent's parent
  for (const r of allRows) {
    if (r.pn === parentPn && r.parentPn) {
      return findCategoryForParent(r.parentPn, visited);
    }
  }
  return null;
}

let productCount = 0;
let skippedCount = 0;
let dedupedCount = 0;
let sortOrder = 0;
const seenProductPns = new Set<string>();

for (const r of allRows) {
  // Skip items that are categories
  if (parentPnSet.has(r.pn)) continue;

  // Dedupe by pn (first-wins) to prevent same pn appearing multiple times
  if (r.pn && seenProductPns.has(r.pn)) {
    dedupedCount++;
    continue;
  }

  const row = rows[r.idx];

  // Find category: use parentPn, trace up chain, or fall back to last known category
  let categoryId: number | null = null;
  if (r.parentPn && r.parentPn !== '-' && !r.parentPn.startsWith('#')) {
    // Try exact match, then normalized (dash→dot) match
    const parentVariants = [r.parentPn, r.parentPn.replace(/-/g, '.')];
    for (const pv of parentVariants) {
      if (categoryMap.has(pv)) {
        categoryId = categoryMap.get(pv)!;
        break;
      }
    }
    if (!categoryId) {
      categoryId = findCategoryForParent(r.parentPn, new Set());
    }
  }

  // Fall back: find the last category that appeared before this row
  if (!categoryId) {
    for (let j = allRows.indexOf(r) - 1; j >= 0; j--) {
      if (categoryMap.has(allRows[j].pn)) {
        categoryId = categoryMap.get(allRows[j].pn)!;
        break;
      }
    }
  }

  if (!categoryId) {
    skippedCount++;
    continue;
  }

  const description = row[9] != null ? String(row[9]).trim() : null;
  const note = row[23] != null ? String(row[23]).trim() : null;
  const status = row[0] != null ? String(row[0]).trim() : null;
  const quantity = typeof row[12] === 'number' ? row[12] : null;
  const unitPrice = typeof row[13] === 'number' ? row[13] : null;
  const cost = typeof row[14] === 'number' ? row[14] : null;
  const totalPrice = typeof row[15] === 'number' ? row[15] : null;
  const discountPct = typeof row[16] === 'number' ? row[16] : null;
  const profitMargin = typeof row[17] === 'number' ? row[17] : null;
  const profit = (unitPrice != null && cost != null) ? unitPrice - cost : null;

  // Extract part type from PN
  let partType: string | null = null;
  const ptMatch = r.pn.match(/[-.]([A-Z])\d/);
  if (ptMatch) partType = ptMatch[1];

  sortOrder++;

  try {
    insertProduct.run(
      categoryId, r.pn || null, r.name, description,
      status, note,
      cost, quantity, unitPrice, totalPrice,
      profit, profitMargin, discountPct,
      null, partType, sortOrder
    );
    productCount++;
    if (r.pn) seenProductPns.add(r.pn);
  } catch (e: any) {
    console.error(`  ⚠️ Row ${r.idx + 1}: ${e.message}`);
  }
}

console.log(`\n✅ Import complete!`);
console.log(`   📁 Categories: ${categoryMap.size}`);
console.log(`   📦 Products: ${productCount}`);
console.log(`   🔁 Deduped (same pn, first-wins): ${dedupedCount}`);
console.log(`   ⏭️ Skipped (no category): ${skippedCount}`);
