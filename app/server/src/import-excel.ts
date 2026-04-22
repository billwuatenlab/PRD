import XLSX from 'xlsx';
import db from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = path.resolve(__dirname, '../../../reference/2026產品牌價.xlsx');

console.log('📂 Reading Excel:', EXCEL_PATH);

const wb = XLSX.readFile(EXCEL_PATH);
const ws = wb.Sheets['2026產品牌價'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];

console.log(`📊 Total rows: ${rows.length}`);

// Clear existing data
db.exec('DELETE FROM products');
db.exec('DELETE FROM categories');
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('products', 'categories')");

// Column mapping (0-indexed):
// 0=Keynote, 1=S, 2=No, 3=PN, 4=O/N, 5=O/D, 6=C1, 7=C2, 8=C3, 9=Note
// 10=Cost, 11=Q'ty, 12=U/P, 13=Price, 14=Profit, 15=P/M, 16=Discount%
// 17=Dis profit, 18=Dis P/M, 19=Days, 20=Link, 21=remark, 22=Internal No.
// 23=Unit/Weight, 24=Packet/Weight, 25=Owner

const insertCategory = db.prepare(`
  INSERT INTO categories (code, name, parent_id, level, sort_order)
  VALUES (?, ?, ?, ?, ?)
`);

const insertProduct = db.prepare(`
  INSERT INTO products (category_id, pn, name, description, keynote, order_number,
    c1, c2, c3, note, cost, quantity, unit_price, total_price, profit, profit_margin,
    discount_pct, dis_profit, dis_pm, lead_days, link, remark, internal_no,
    unit_weight, packet_weight, owner, part_type, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Parse category code to determine level
// A1 -> level 0, A11 -> level 1, A111 -> level 2, A211 -> level 2
function parseCategoryLevel(code: string): number {
  // Remove leading 'A'
  if (!code.startsWith('A')) return -1;
  const digits = code.substring(1);
  if (digits.length === 1) return 0; // A1, A2, ...
  if (digits.length === 2) return 1; // A11, A12, A21, ...
  if (digits.length === 3) return 2; // A111, A112, A211, ...
  return -1;
}

// Determine parent code from category code
function getParentCode(code: string): string | null {
  if (!code.startsWith('A')) return null;
  const digits = code.substring(1);
  if (digits.length <= 1) return null; // Top level
  if (digits.length === 2) return 'A' + digits[0]; // A11 -> A1
  if (digits.length === 3) return 'A' + digits.substring(0, 2); // A111 -> A11
  return null;
}

// Extract part type from PN code
function extractPartType(pn: string): string | null {
  // Pattern: M5XX.XXXX.A.C01..name -> part type is 'C'
  const match = pn.match(/\.([A-Z])(\d+)\.\./);
  if (match) return match[1];

  // Pattern like M581.2539.A..name
  const match2 = pn.match(/\.[A-Z]\.\./);
  if (match2) return null;

  return null;
}

// Step 1: Scan for all categories and build them
const categoryMap = new Map<string, number>(); // code -> id
const categoryStack: { code: string; name: string; id: number; level: number }[] = [];

// Pre-defined top-level categories
const topCategories = [
  { code: 'A1', name: 'System（系統）' },
  { code: 'A2', name: 'Hardware（硬體）' },
  { code: 'A3', name: 'Service（服務）' },
  { code: 'A4', name: 'Upgrade（升級）' },
  { code: 'A5', name: 'TBD（未整理）' },
  { code: 'A6', name: 'Military（軍用）' },
  { code: 'A7', name: 'Agency（代理）' },
];

// Insert top-level categories
for (let i = 0; i < topCategories.length; i++) {
  const { code, name } = topCategories[i];
  const result = insertCategory.run(code, name, null, 0, i + 1);
  categoryMap.set(code, Number(result.lastInsertRowid));
}

// Scan all rows for category-like entries (code..name pattern with short alphanumeric codes)
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const pn = row[3] != null ? String(row[3]).trim() : '';

  if (!pn || !pn.includes('..')) continue;

  const parts = pn.split('..');
  const code = parts[0].trim();
  const name = parts.slice(1).join('..').trim().split('\n')[0].trim();

  // Check if it's a category code (A + digits)
  if (/^A\d{2,3}$/.test(code) && !categoryMap.has(code)) {
    const level = parseCategoryLevel(code);
    if (level < 0) continue;

    const parentCode = getParentCode(code);
    const parentId = parentCode ? categoryMap.get(parentCode) || null : null;

    // Auto-create parent if missing
    if (parentCode && !categoryMap.has(parentCode)) {
      const grandParentCode = getParentCode(parentCode);
      const grandParentId = grandParentCode ? categoryMap.get(grandParentCode) || null : null;
      const pLevel = parseCategoryLevel(parentCode);
      const pResult = insertCategory.run(parentCode, parentCode, grandParentId, pLevel, 0);
      categoryMap.set(parentCode, Number(pResult.lastInsertRowid));
    }

    const actualParentId = parentCode ? categoryMap.get(parentCode) || null : null;
    const result = insertCategory.run(code, name || code, actualParentId, level, categoryMap.size);
    categoryMap.set(code, Number(result.lastInsertRowid));
  }
}

// Also create subcategories for A6xx patterns
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const pn = row[3] != null ? String(row[3]).trim() : '';

  // Match patterns like "A621-被動元件(EMP)", "A622-主動元件", "A63-Software/Service", "A67-Agent"
  const subMatch = pn.match(/^(A\d{2,3})[-—](.+)$/);
  if (subMatch && !categoryMap.has(subMatch[1])) {
    const code = subMatch[1];
    const name = subMatch[2].trim();
    const level = parseCategoryLevel(code);
    if (level < 0) continue;

    const parentCode = getParentCode(code);
    const parentId = parentCode ? categoryMap.get(parentCode) || null : null;
    const result = insertCategory.run(code, name, parentId, level, categoryMap.size);
    categoryMap.set(code, Number(result.lastInsertRowid));
  }
}

// Also handle "A2-Hardware", "A3-Software", "A4-upgrade", "A6-Military", "A7-Agency" as markers
// These are already created as top-level, just mark the rows

console.log(`📁 Categories created: ${categoryMap.size}`);
for (const [code, id] of categoryMap) {
  console.log(`  ${code} -> id:${id}`);
}

// Step 2: Import products
// Track current category context
let currentCategoryId: number | null = null;
let currentSubsystem: string | null = null; // e.g., "A1 Anechoic Chamber"
let productCount = 0;
let sortOrder = 0;

// Build a sub-category map for "A1 RF System" style entries
const subsystemMap = new Map<string, number>(); // "parentCatId:subsystemName" -> category_id

function getOrCreateSubsystem(parentCatId: number, subsystemName: string): number {
  const key = `${parentCatId}:${subsystemName}`;
  if (subsystemMap.has(key)) return subsystemMap.get(key)!;

  // Create as a child category
  const parentCat = db.prepare('SELECT * FROM categories WHERE id = ?').get(parentCatId) as any;
  const code = `${parentCat?.code || 'X'}_${subsystemMap.size}`;
  const result = insertCategory.run(code, subsystemName, parentCatId, (parentCat?.level || 0) + 1, subsystemMap.size);
  const id = Number(result.lastInsertRowid);
  subsystemMap.set(key, id);
  return id;
}

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const pn = row[3] != null ? String(row[3]).trim() : '';

  if (!pn) continue;

  const keynote = row[0] != null ? String(row[0]).trim() : null;
  const sVal = row[1];
  const noVal = row[2];
  const onVal = row[4] != null ? String(row[4]).trim() : null;
  const c1 = row[6] != null ? String(row[6]).trim() : null;
  const c2 = row[7] != null ? String(row[7]).trim() : null;
  const c3 = row[8] != null ? String(row[8]).trim() : null;
  const note = row[9] != null ? String(row[9]).trim() : null;
  const cost = typeof row[10] === 'number' ? row[10] : null;
  const qty = typeof row[11] === 'number' ? row[11] : null;
  const up = typeof row[12] === 'number' ? row[12] : null;
  const price = typeof row[13] === 'number' ? row[13] : null;
  const profit = typeof row[14] === 'number' ? row[14] : null;
  const pm = typeof row[15] === 'number' ? row[15] : null;
  const discountPct = typeof row[16] === 'number' ? row[16] : null;
  const disProfit = typeof row[17] === 'number' ? row[17] : null;
  const disPm = typeof row[18] === 'number' ? row[18] : null;
  const days = typeof row[19] === 'number' ? row[19] : null;
  const link = row[20] != null ? String(row[20]).trim() : null;
  const remark = row[21] != null ? String(row[21]).trim() : null;
  const internalNo = row[22] != null ? String(row[22]).trim() : null;
  const unitWeight = typeof row[23] === 'number' ? row[23] : null;
  const packetWeight = typeof row[24] === 'number' ? row[24] : null;
  const owner = row[25] != null ? String(row[25]).trim() : null;

  // Get first line of PN
  const pnFirstLine = pn.split('\n')[0].trim();
  const pnMultiline = pn.includes('\n') ? pn : null;

  // Skip header row
  if (pnFirstLine === 'Name/Discrption') continue;

  // Check if this is a category marker
  if (pnFirstLine.includes('..')) {
    const codePart = pnFirstLine.split('..')[0].trim();

    // If it's an A-code category, update context
    if (/^A\d{1,3}$/.test(codePart) && categoryMap.has(codePart)) {
      currentCategoryId = categoryMap.get(codePart)!;
      currentSubsystem = null;
      sortOrder = 0;
      continue;
    }
  }

  // Check for top-level markers like "A2-Hardware", "A3-Software"
  const topMatch = pnFirstLine.match(/^A(\d)-/);
  if (topMatch) {
    const topCode = 'A' + topMatch[1];
    if (categoryMap.has(topCode)) {
      currentCategoryId = categoryMap.get(topCode)!;
      currentSubsystem = null;
      sortOrder = 0;
      continue;
    }
  }

  // Check for sub-category markers like "A621-被動元件(EMP)"
  const subMatch = pnFirstLine.match(/^(A\d{2,3})[-—]/);
  if (subMatch && categoryMap.has(subMatch[1])) {
    currentCategoryId = categoryMap.get(subMatch[1])!;
    currentSubsystem = null;
    sortOrder = 0;
    continue;
  }

  // Check for subsystem headers like "A1 Anechoic Chamber", "A4 RF System"
  const subsysMatch = pnFirstLine.match(/^A\d\s+(.+)/);
  if (subsysMatch && currentCategoryId && !pnFirstLine.includes('..') && cost == null && qty == null) {
    currentSubsystem = pnFirstLine;
    // Create subsystem as child category
    const subCatId = getOrCreateSubsystem(currentCategoryId, pnFirstLine);
    sortOrder = 0;
    continue;
  }

  // Determine the target category
  let targetCategoryId = currentCategoryId;
  if (currentSubsystem && currentCategoryId) {
    const key = `${currentCategoryId}:${currentSubsystem}`;
    if (subsystemMap.has(key)) {
      targetCategoryId = subsystemMap.get(key)!;
    }
  }

  // Extract product name from PN
  let productName = pnFirstLine;
  let productPn = null as string | null;
  let description = pnMultiline;

  if (pnFirstLine.includes('..')) {
    const parts = pnFirstLine.split('..');
    productPn = parts[0].trim();
    productName = parts.slice(1).join('..').trim() || productPn;

    // If there's multiline content, extract full description
    if (pn.includes('\n')) {
      description = pn.split('\n').slice(1).join('\n').trim();
    }
  }

  // Extract part type
  const partType = productPn ? extractPartType(productPn + '..') : null;

  sortOrder++;

  try {
    insertProduct.run(
      targetCategoryId, productPn, productName, description,
      keynote, onVal, c1, c2, c3, note,
      cost, qty, up, price, profit, pm,
      discountPct, disProfit, disPm, days,
      link, remark, internalNo, unitWeight, packetWeight,
      owner, partType, sortOrder
    );
    productCount++;
  } catch (e: any) {
    console.error(`  ⚠️ Row ${i + 1}: ${e.message}`);
  }
}

console.log(`\n✅ Import complete!`);
console.log(`   📁 Categories: ${categoryMap.size + subsystemMap.size}`);
console.log(`   📦 Products: ${productCount}`);
