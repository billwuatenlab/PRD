import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Card, Table, Input, InputNumber, Select, Segmented, AutoComplete, Tag, Empty, Descriptions, Spin, Popconfirm, Modal, Drawer, List, Button, Space, Form, Menu, Tooltip, message } from 'antd';
import { SearchOutlined, FolderOutlined, FileOutlined, EditOutlined, HolderOutlined, PlusOutlined, DeleteOutlined, FolderAddOutlined, HistoryOutlined, UserOutlined, SplitCellsOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { fetchProducts, searchProducts, updateProduct, createCategory, updateCategory, deleteCategory, deleteProduct, fetchAuditLog } from '../../api';
import { useAppStore } from '../../store/app';

// ── Types ──

interface CategoryNode {
  id: number;
  code: string;
  name: string;
  level: number;
  children: CategoryNode[];
  totalProductCount: number;
  productCount: number;
  progress_note?: string | null;
  keynote?: string | null;
  note?: string | null;
  owner?: string | null;
  part_type?: string | null;
  description?: string | null;
  order_number?: string | null;
  cost?: number | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  lead_days?: number | null;
  custom_fields?: Record<string, any>;
  totals?: { cost?: number; unit_price?: number; total_price?: number };
  profit?: number | null;
  profit_margin?: number | null;
  discount_pct?: number | null;
  dis_profit?: number | null;
  dis_pm?: number | null;
  link?: string | null;
  remark?: string | null;
  internal_no?: string | null;
  unit_weight?: number | null;
  packet_weight?: number | null;
  c1?: string | null;
  c2?: string | null;
  c3?: string | null;
  productTotalsByProgress?: Record<string, number>;
}

interface Product {
  id: number;
  pn: string | null;
  name: string;
  description: string | null;
  keynote: string | null;
  cost: number | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  profit: number | null;
  profit_margin: number | null;
  lead_days: number | null;
  owner: string | null;
  part_type: string | null;
  note: string | null;
  remark: string | null;
  order_number: string | null;
  internal_no: string | null;
  unit_weight: number | null;
  packet_weight: number | null;
  link: string | null;
  level?: number | null;
  sort_order?: number | null;
  progress_note?: string | null;
  custom_fields?: Record<string, any>;
  discount_pct?: number | null;
  dis_profit?: number | null;
  dis_pm?: number | null;
  c1?: string | null;
  c2?: string | null;
  c3?: string | null;
  category_code?: string;
  category_name?: string;
}

interface RowData {
  key: string;
  code: string;
  name: string;
  count: number;
  totalCost: number;
  nodeType: 'category' | 'product';
  product?: Product;
  children?: RowData[];
  _depth?: number; // tree depth (0 = root); used for per-column indent
  // Fields mirrored from category row (also present on products via .product)
  progress_note?: string | null;
  keynote?: string | null;
  note?: string | null;
  owner?: string | null;
  part_type?: string | null;
  description?: string | null;
  order_number?: string | null;
  cost?: number | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  lead_days?: number | null;
  custom_fields?: Record<string, any>;
  totals?: { cost?: number; unit_price?: number; total_price?: number };
  profit?: number | null;
  profit_margin?: number | null;
  discount_pct?: number | null;
  dis_profit?: number | null;
  dis_pm?: number | null;
  link?: string | null;
  remark?: string | null;
  internal_no?: string | null;
  unit_weight?: number | null;
  packet_weight?: number | null;
  c1?: string | null;
  c2?: string | null;
  c3?: string | null;
  productTotalsByProgress?: Record<string, number>;
}

type TabKey = 'all' | number; // number = root category id

type CustomColumnType = 'text' | 'number' | 'currency' | 'select';
interface CustomColumnDef {
  key: string;     // 'custom_xxx'
  label: string;   // display name
  type: CustomColumnType;
  options?: string[]; // only for type === 'select'
}

const PART_TYPE_COLORS: Record<string, string> = {
  C: 'blue', S: 'cyan', E: 'green', D: 'orange',
  A: 'purple', M: 'magenta', N: 'lime', B: 'gold',
  U: 'geekblue', F: 'volcano', P: 'red', J: 'default',
  X: 'default', W: 'default',
};

const PART_TYPES = ['C', 'S', 'E', 'D', 'A', 'M', 'N', 'B', 'U', 'F', 'P', 'J', 'X', 'W'];

const PROGRESS_OPTIONS: Array<{ value: string; color: string }> = [
  { value: '1-重要',   color: 'red' },
  { value: '2-商品中', color: 'green' },
  { value: '3-研發中', color: 'blue' },
  { value: '4-評估中', color: 'gold' },
  { value: '5-暫緩',   color: 'default' },
  { value: '6-商品',   color: 'purple' },
  { value: '7-停售',   color: 'default' },
];

// Row text color when a progress is set (applied via onRow.style.color)
const PROGRESS_ROW_COLORS: Record<string, string> = {
  '1-重要':   '#cf1322',
  '2-商品中': '#389e0d',
  '3-研發中': '#1677ff',
  '4-評估中': '#d48806',
  '5-暫緩':   '#8c8c8c',
  '6-商品':   '#531dab',
  '7-停售':   '#8c8c8c',
};

// Row background tint by progress (applied via onRow.style.backgroundColor)
const PROGRESS_ROW_BG: Record<string, string> = {
  '1-重要':   '#fff1f0',
  '2-商品中': '#f6ffed',
  '3-研發中': '#e6f4ff',
  '4-評估中': '#fffbe6',
  '5-暫緩':   '#f5f5f5',
  '6-商品':   '#f9f0ff',
  '7-停售':   '#f5f5f5',
};

// ── Build category tree into RowData ──

function buildCategoryTree(nodes: CategoryNode[], depth = 0): RowData[] {
  return nodes.map((node) => ({
    key: `cat:${node.id}`,
    code: node.code,
    name: node.name,
    count: node.totalProductCount,
    totalCost: 0,
    nodeType: 'category' as const,
    progress_note: node.progress_note ?? null,
    keynote: node.keynote ?? null,
    note: node.note ?? null,
    owner: node.owner ?? null,
    part_type: node.part_type ?? null,
    description: node.description ?? null,
    order_number: node.order_number ?? null,
    cost: node.cost ?? null,
    quantity: node.quantity ?? null,
    unit_price: node.unit_price ?? null,
    total_price: node.total_price ?? null,
    lead_days: node.lead_days ?? null,
    custom_fields: node.custom_fields ?? {},
    totals: node.totals,
    profit: node.profit ?? null,
    profit_margin: node.profit_margin ?? null,
    discount_pct: node.discount_pct ?? null,
    dis_profit: node.dis_profit ?? null,
    dis_pm: node.dis_pm ?? null,
    link: node.link ?? null,
    remark: node.remark ?? null,
    internal_no: node.internal_no ?? null,
    unit_weight: node.unit_weight ?? null,
    packet_weight: node.packet_weight ?? null,
    c1: node.c1 ?? null,
    c2: node.c2 ?? null,
    c3: node.c3 ?? null,
    productTotalsByProgress: node.productTotalsByProgress,
    _depth: depth,
    children: node.children.length > 0
      ? buildCategoryTree(node.children, depth + 1)
      : [],
  }));
}

function productToRow(p: Product): RowData {
  return {
    key: `prod:${p.id}`,
    code: p.pn || String(p.id),
    name: p.name,
    count: p.quantity || 0,
    totalCost: p.total_price || 0,
    nodeType: 'product',
    product: p,
  };
}

// ── Inline editable cell ──

function EditableText({ value, onSave, style }: {
  value: string;
  onSave: (v: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <Input
      size="small"
      autoFocus
      defaultValue={value}
      style={style}
      onPressEnter={(e) => onSave((e.target as HTMLInputElement).value)}
      onBlur={(e) => onSave(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ── Number formatting: k / M shorthand ──
function formatShortNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  // If it's an integer keep it integer; otherwise keep up to 2 decimals
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
}
function ShortCurrency({ value }: { value: number | null | undefined }) {
  if (value == null) return <span style={{ color: '#ccc' }}>—</span>;
  return (
    <Tooltip title={`$${value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`} mouseEnterDelay={0.3}>
      <span>${formatShortNumber(value)}</span>
    </Tooltip>
  );
}
function ShortNumber({ value, suffix }: { value: number | null | undefined; suffix?: string }) {
  if (value == null) return <span style={{ color: '#ccc' }}>—</span>;
  const raw = value.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
  return (
    <Tooltip title={`${raw}${suffix || ''}`} mouseEnterDelay={0.3}>
      <span>{formatShortNumber(value)}{suffix || ''}</span>
    </Tooltip>
  );
}

// AutoComplete editor for fields where options are derived from existing values but user can also type a new value
function AutoCompleteEditor({
  initial, options, onSave,
}: { initial: string; options: string[]; onSave: (v: string | null) => void }) {
  const [val, setVal] = useState<string>(initial);
  const commit = () => onSave(val.trim() || null);
  return (
    <AutoComplete
      autoFocus
      value={val}
      onChange={(v) => setVal(v)}
      onSelect={(v) => { setVal(v); onSave((v || '').trim() || null); }}
      options={options.map((o) => ({ value: o }))}
      style={{ width: '100%' }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') onSave(initial || null);
      }}
    >
      <Input size="small" onClick={(e) => e.stopPropagation()} />
    </AutoComplete>
  );
}

function EditableNumber({ value, onSave, min }: {
  value: number | null;
  onSave: (v: number | null) => void;
  min?: number;
}) {
  return (
    <InputNumber
      size="small"
      autoFocus
      defaultValue={value ?? undefined}
      min={min}
      style={{ width: '100%' }}
      onPressEnter={(e) => {
        const v = (e.target as HTMLInputElement).value;
        onSave(v === '' ? null : Number(v));
      }}
      onBlur={(e) => {
        const v = e.target.value;
        onSave(v === '' ? null : Number(v));
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ── Main Component ──

export default function Products() {
  const { t } = useTranslation();
  const { selectedProductId, setSelectedProductId } = useAppStore();
  const categoryTree = useAppStore((s) => s.categoryTree) as RowData[];
  const setCategoryTree = (next: RowData[] | ((prev: RowData[]) => RowData[])) => {
    useAppStore.getState().setCategoryTree(next as any);
  };
  const refetchCategoryTree = useAppStore((s) => s.refetchCategoryTree);
  // searchResults overrides the category tree as table data when a search is active.
  const [searchResults, setSearchResults] = useState<RowData[] | null>(null);
  const treeData: RowData[] = searchResults ?? categoryTree;
  const setTreeData = (next: RowData[] | ((prev: RowData[]) => RowData[])) => {
    if (searchResults) {
      setSearchResults((prev) => typeof next === 'function' ? (next as any)(prev ?? []) : next);
    } else {
      setCategoryTree(next);
    }
  };
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [focusedRowKey, setFocusedRowKey] = useState<string | null>(null);
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ key: string; field: string } | null>(null);
  const loadedCategories = useRef<Set<string>>(new Set());
  const [listRatio, setListRatio] = useState<number>(() => {
    const s = Number(localStorage.getItem('prd.listRatio'));
    return s >= 20 && s <= 80 ? s : 60; // default 60:40 (list 1.5x of detail)
  });
  const saveListRatio = (v: number) => {
    const clamped = Math.max(20, Math.min(80, v));
    setListRatio(clamped);
    localStorage.setItem('prd.listRatio', String(clamped));
  };
  const [layoutDir, setLayoutDir] = useState<'vertical' | 'horizontal'>(() =>
    localStorage.getItem('prd.layoutDir') === 'horizontal' ? 'horizontal' : 'vertical'
  );
  const saveLayoutDir = (v: 'vertical' | 'horizontal') => {
    setLayoutDir(v);
    localStorage.setItem('prd.layoutDir', v);
  };
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState<number>(400);
  // Keep antd Table's scroll body height in sync with its container so all rows are reachable
  useEffect(() => {
    const el = tableWrapperRef.current;
    if (!el) return;
    const update = () => {
      // Subtract a small fudge for the table header (~40px). Floor so we don't go negative.
      const next = Math.max(120, el.clientHeight - 44);
      setTableScrollY(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    code: 240, name: 300, part_type: 120, progress_note: 130, cost: 110, quantity: 80, unit_price: 110, owner: 90, keynote: 200,
  });
  // Custom column definitions (user-created, stored in localStorage)
  const [customColumns, _setCustomColumns] = useState<CustomColumnDef[]>(() => {
    try {
      const s = localStorage.getItem('prd.customColumns');
      if (s) {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr;
      }
    } catch {}
    return [];
  });
  const setCustomColumns = (next: CustomColumnDef[] | ((prev: CustomColumnDef[]) => CustomColumnDef[])) => {
    _setCustomColumns((prev) => {
      const v = typeof next === 'function' ? (next as any)(prev) : next;
      localStorage.setItem('prd.customColumns', JSON.stringify(v));
      return v;
    });
  };
  const customColumnsMap = useMemo(() => new Map(customColumns.map((c) => [c.key, c])), [customColumns]);

  // Add-column modal
  const [addColModal, setAddColModal] = useState<null | {
    mode: 'existing' | 'custom';
    insertAfter?: string;
  }>(null);
  const [newColLabel, setNewColLabel] = useState('');
  const [newColType, setNewColType] = useState<CustomColumnType>('text');
  const [newColOptions, setNewColOptions] = useState('');

  const DEFAULT_COLUMN_ORDER = [
    'code', 'name', 'part_type', 'progress_note',
    'cost', 'quantity', 'unit_price', 'total_price',
    'profit', 'profit_margin', 'discount_pct', 'dis_profit', 'dis_pm',
    'owner', 'keynote', 'note', 'order_number', 'description', 'lead_days',
    'link', 'remark', 'internal_no', 'unit_weight', 'packet_weight',
    'c1', 'c2', 'c3',
  ];
  const [columnOrder, _setColumnOrder] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem('prd.columnOrder');
      if (s) {
        const arr = JSON.parse(s);
        if (Array.isArray(arr) && arr.length > 0) {
          // Auto-inject newly-added columns for existing users (at end)
          const missing = DEFAULT_COLUMN_ORDER.filter((k) => !arr.includes(k));
          if (missing.length > 0) {
            const next = [...arr, ...missing];
            localStorage.setItem('prd.columnOrder', JSON.stringify(next));
            return next;
          }
          return arr;
        }
      }
    } catch {}
    return DEFAULT_COLUMN_ORDER;
  });
  const setColumnOrder = (next: string[] | ((prev: string[]) => string[])) => {
    _setColumnOrder((prev) => {
      const v = typeof next === 'function' ? (next as any)(prev) : next;
      localStorage.setItem('prd.columnOrder', JSON.stringify(v));
      return v;
    });
  };
  const dragCol = useRef<string | null>(null);
  const resizingCol = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);

  // Mouse-based column drag (more reliable than HTML5 drag with antd fixed columns)
  const startColDrag = useCallback((colKey: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
    if (e.button !== 0) return; // left button only
    const startX = e.clientX, startY = e.clientY;
    let started = false;
    let ghostEl: HTMLDivElement | null = null;
    let lastOverKey: string | null = null; // last hovered target (for drop fallback)
    const label = (e.currentTarget as HTMLElement).innerText || colKey;

    const resolveTarget = (x: number, y: number): string | null => {
      // Hide ghost during hit-test, then restore
      const prev = ghostEl?.style.display;
      if (ghostEl) ghostEl.style.display = 'none';
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (ghostEl && prev !== undefined) ghostEl.style.display = prev;
      const th = el?.closest('[data-col-key]') as HTMLElement | null;
      const k = th?.getAttribute('data-col-key') || null;
      return k && k !== colKey ? k : null;
    };

    const onMove = (ev: MouseEvent) => {
      if (!started) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 5) return;
        started = true;
        dragCol.current = colKey;
        ghostEl = document.createElement('div');
        ghostEl.textContent = label.trim();
        ghostEl.style.cssText = [
          'position: fixed', 'z-index: 10000',
          'padding: 4px 10px', 'background: white',
          'border: 1px solid #1677ff', 'border-radius: 4px',
          'font-size: 12px', 'color: #1677ff',
          'box-shadow: 0 2px 8px rgba(0,0,0,0.15)',
          'pointer-events: none', 'white-space: nowrap',
        ].join(';');
        document.body.appendChild(ghostEl);
      }
      if (ghostEl) {
        ghostEl.style.left = ev.clientX + 10 + 'px';
        ghostEl.style.top = ev.clientY + 10 + 'px';
      }
      const over = resolveTarget(ev.clientX, ev.clientY);
      lastOverKey = over;
      setDragOverColKey(over);
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      if (!started) { ghostEl?.remove(); dragCol.current = null; return; }

      // Prefer live hit-test at mouseup position; fall back to last hovered
      const targetKey = resolveTarget(ev.clientX, ev.clientY) ?? lastOverKey;
      ghostEl?.remove();

      if (targetKey && targetKey !== colKey) {
        setColumnOrder((prev) => {
          const from = prev.indexOf(colKey);
          const to = prev.indexOf(targetKey);
          if (from < 0 || to < 0) return prev;
          const next = [...prev];
          next.splice(from, 1);
          next.splice(to, 0, colKey);
          return next;
        });
      }
      dragCol.current = null;
      setDragOverColKey(null);
    };

    // Capture phase so antd's own handlers can't swallow the events
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
    e.preventDefault();
  }, []);
  const [editingColKey, setEditingColKey] = useState<string | null>(null);
  const [colTitles, setColTitles] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('prd.colTitles') || '{}'); } catch { return {}; }
  });
  const saveColTitle = (key: string, value: string) => {
    const next = { ...colTitles, [key]: value };
    setColTitles(next);
    localStorage.setItem('prd.colTitles', JSON.stringify(next));
  };

  // ── 5-level category filter (lifted to global store so the Sider tree drives it) ──
  const activeTab = useAppStore((s) => s.activeL1);
  const activeL2 = useAppStore((s) => s.activeL2);
  const activeL3 = useAppStore((s) => s.activeL3);
  const activeL4 = useAppStore((s) => s.activeL4);
  const activeL5 = useAppStore((s) => s.activeL5);
  const [dragRow, setDragRow] = useState<{ key: string; isCategory: boolean; id: number } | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  // ── Excel import / export ──
  type ImportDiff = {
    added: Array<{ pn: string; payload: any; missingCategories: string[] }>;
    updated: Array<{ id: number; pn: string; diff: Record<string, [any, any]>; payload: any; categoryPath: string }>;
    removed: Array<{ id: number; pn: string; name: string; categoryPath: string }>;
    categoryRows?: Array<{ path: string[]; payload: Record<string, any> }>;
  };
  const [importDiff, setImportDiff] = useState<ImportDiff | null>(null);
  const [importTab, setImportTab] = useState<'added' | 'updated' | 'removed'>('updated');
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [selectedAdded, setSelectedAdded] = useState<Set<string>>(new Set());
  const [selectedUpdated, setSelectedUpdated] = useState<Set<number>>(new Set());
  const [selectedRemoved, setSelectedRemoved] = useState<Set<number>>(new Set());

  const handleExport = async () => {
    try {
      const res = await fetch('/api/export.csv');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `PRD-${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('已匯出 / Exported');
    } catch (e: any) {
      message.error(`匯出失敗 / Export failed: ${e.message}`);
    }
  };

  const handleImportFile = async (file: File) => {
    setImportLoading(true);
    setImportFile(file);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/import/diff', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json()).error || 'Import failed');
      const diff = (await res.json()) as ImportDiff;
      setImportDiff(diff);
      // Default: all selected (per user preference)
      setSelectedAdded(new Set(diff.added.map((x) => x.pn)));
      setSelectedUpdated(new Set(diff.updated.map((x) => x.id)));
      setSelectedRemoved(new Set(diff.removed.map((x) => x.id)));
      setImportTab(diff.updated.length > 0 ? 'updated' : diff.added.length > 0 ? 'added' : 'removed');
    } catch (e: any) {
      message.error(`讀取 CSV 失敗 / Failed: ${e.message}`);
    }
    setImportLoading(false);
  };

  // M1 — clear all products and rebuild from file (independent of diff)
  const replaceAllImport = () => {
    if (!importFile) return;
    Modal.confirm({
      title: '清空再匯入 / Clear & import',
      content: '這會把資料庫所有產品標記為刪除，然後依檔案內容重新匯入。確定嗎？ / This will mark all existing products as deleted, then reimport everything from the file. Confirm?',
      okText: '確認清空並匯入 / Confirm wipe & import',
      okButtonProps: { danger: true },
      cancelText: '取消 / Cancel',
      onOk: async () => {
        const fd = new FormData();
        fd.append('file', importFile);
        try {
          const res = await fetch('/api/import/replace-all', {
            method: 'POST',
            headers: currentUser ? { 'X-User': currentUser } : {},
            body: fd,
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Replace-all failed');
          const r = await res.json();
          message.success(
            `已清空並匯入 / Imported: ` +
            `產品 P=+${r.productsInserted}/~${r.productsUpdated}/-${r.productsDeleted} ` +
            `分類 C=+${r.categoriesInserted}/~${r.categoriesUpdated}/-${r.categoriesDeleted}`
          );
          setImportDiff(null);
          setImportFile(null);
          await loadRoot();
        } catch (e: any) {
          message.error(`清空失敗 / Failed: ${e.message}`);
        }
      },
    });
  };

  const applyImport = async () => {
    if (!importDiff) return;
    const selectedAddedList = importDiff.added.filter((x) => selectedAdded.has(x.pn));
    const selectedUpdatedList = importDiff.updated.filter((x) => selectedUpdated.has(x.id));
    const selectedRemovedList = importDiff.removed.filter((x) => selectedRemoved.has(x.id));
    try {
      const res = await fetch('/api/import/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(currentUser ? { 'X-User': currentUser } : {}) },
        body: JSON.stringify({
          added: selectedAddedList,
          updated: selectedUpdatedList,
          removed: selectedRemovedList,
          categoryRows: importDiff.categoryRows ?? [],
        }),
      });
      if (!res.ok) throw new Error('Apply failed');
      const result = await res.json();
      message.success(`已套用：新增 ${result.addedCount} / 修改 ${result.updatedCount} / 刪除 ${result.removedCount}${result.categoriesCreated ? ` / 建立分類 ${result.categoriesCreated}` : ''}`);
      setImportDiff(null);
      await loadRoot();
    } catch (e: any) {
      message.error(`套用失敗 / Apply failed: ${e.message}`);
    }
  };

  // ── Folder CRUD ──
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const addFolderModal = useAppStore((s) => s.addFolderModal);
  const setAddFolderModal = useAppStore((s) => s.setAddFolderModal);
  const [newFolderCode, setNewFolderCode] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  // Reset form fields whenever the modal opens (e.g. triggered from the Sider tree)
  useEffect(() => {
    if (addFolderModal) {
      setNewFolderCode('');
      setNewFolderName('');
    }
  }, [addFolderModal]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; record: RowData; field?: string } | null>(null);
  const FIELD_LABELS: Record<string, string> = {
    name: '名稱 / Name',
    pn: '料號 / PN',
    keynote: '重點 / Keynote',
    progress_note: '進度 / Progress',
    part_type: '類型 / Part type',
    cost: '成本 / Cost',
    quantity: '數量 / Quantity',
    unit_price: '售價 / Sale Price',
    total_price: '小計 / Total',
    owner: '負責人 / Owner',
    note: '備註 / Note',
    order_number: '訂單號 / Order#',
    description: '描述 / Description',
    lead_days: '交期 / Lead',
    profit: '利潤 / Profit',
    profit_margin: '利潤率 / Margin',
    discount_pct: '折扣% / Discount%',
    dis_profit: '折後利潤 / Dis.Profit',
    dis_pm: '折後利潤率 / Dis.Margin',
    link: '連結 / Link',
    remark: '附註 / Remark',
    internal_no: '內部編號 / Internal#',
    unit_weight: '單重 / Unit Wt',
    packet_weight: '包裝重 / Pack Wt',
    c1: 'C1', c2: 'C2', c3: 'C3',
  };
  const [colContextMenu, setColContextMenu] = useState<{ x: number; y: number; colKey: string } | null>(null);
  // Generic rename modal — works for columns, categories, and product fields
  const [renameModal, setRenameModal] = useState<{
    title: string;
    label: string;
    currentValue: string;
    onSave: (value: string) => Promise<void> | void;
  } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const confirmRename = async () => {
    if (!renameModal) return;
    const v = renameValue;
    try {
      await renameModal.onSave(v);
    } finally {
      setRenameModal(null);
    }
  };

  const openRenameForColumn = (colKey: string) => {
    const current = colTitles[colKey] ?? ((columnMap.get(colKey) as any)?.title ?? colKey);
    setRenameValue(typeof current === 'string' ? current : colKey);
    setRenameModal({
      title: '重新命名欄位 / Rename column',
      label: '欄位名稱 / Column name',
      currentValue: typeof current === 'string' ? current : colKey,
      onSave: async (v) => {
        const trimmed = v.trim();
        if (!trimmed) return;
        const next = { ...colTitles, [colKey]: trimmed };
        setColTitles(next);
        localStorage.setItem('prd.colTitles', JSON.stringify(next));
      },
    });
  };

  const openRenameForField = (record: RowData, field: string) => {
    const isCategory = record.nodeType === 'category';
    const current = isCategory
      ? ((record as any)[field] ?? (field === 'name' ? record.name : ''))
      : ((record.product as any)?.[field] ?? '');
    const labelBase = FIELD_LABELS[field] ?? field;
    setRenameValue(String(current ?? ''));
    setRenameModal({
      title: `修改 ${labelBase}`,
      label: labelBase,
      currentValue: String(current ?? ''),
      onSave: async (v) => {
        const trimmed = v.trim();
        if (isCategory) {
          if (field === 'name') {
            if (!trimmed) return;
            await handleRenameCategory(record, trimmed);
          } else {
            await saveCategoryField(record, field, trimmed || null);
          }
        } else {
          await saveField(record, field, trimmed || null);
        }
      },
    });
  };

  // ── Current user + audit log ──
  const [currentUser, setCurrentUser] = useState<string>(() => localStorage.getItem('prd.currentUser') || '');
  const setUser = (name: string) => {
    setCurrentUser(name);
    if (name) localStorage.setItem('prd.currentUser', name);
    else localStorage.removeItem('prd.currentUser');
  };
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const rows = await fetchAuditLog({ limit: 200 });
      setAuditRows(rows);
    } catch (e) {
      console.error(e);
      message.error('讀取紀錄失敗 / Failed to load audit log');
    }
    setAuditLoading(false);
  };

  useEffect(() => {
    if (changeLogOpen) loadAudit();
  }, [changeLogOpen]);

  const isEditing = (key: string, field: string) =>
    editingCell?.key === key && editingCell?.field === field;

  // Column resize handler — receives the current rendered width so fallback works for all columns (built-in + custom)
  const handleColResizeStart = useCallback((key: string, currentWidth: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = currentWidth;
    const onMouseMove = (ev: MouseEvent) => {
      const newW = Math.max(50, startW + ev.clientX - startX);
      setColumnWidths((prev) => ({ ...prev, [key]: newW }));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    loadedCategories.current.clear();
    try {
      if (search.trim()) {
        const results = await searchProducts(search);
        setSearchResults(results.map(productToRow));
        setExpandedKeys([]);
      } else {
        setSearchResults(null);
        await refetchCategoryTree();
        // Only default-expand roots on very first load; preserve user's expansion after CRUD
        setExpandedKeys((prev) => {
          if (prev.length > 0) return prev;
          return useAppStore.getState().categoryTree.map((c) => c.key);
        });
      }
    } catch (e) {
      console.error('Failed to load data', e);
    }
    setLoading(false);
  }, [search, refetchCategoryTree]);

  useEffect(() => { loadRoot(); }, [loadRoot]);

  // refetchCategoryTree() replaces the tree wholesale — products previously attached
  // in memory are wiped, but loadedCategories still says they're loaded so re-expanding
  // wouldn't re-fetch. Triggered only when the store's refetch-version bumps, NOT on
  // local in-place edits (those produce new array refs but don't lose products).
  const treeRefetchVersion = useAppStore((s) => s.treeRefetchVersion);
  const lastSeenVersionRef = useRef(treeRefetchVersion);
  useEffect(() => {
    if (lastSeenVersionRef.current === treeRefetchVersion) return;
    lastSeenVersionRef.current = treeRefetchVersion;
    loadedCategories.current.clear();
    if (expandedKeys.length === 0) return;
    const expandedSet = new Set(expandedKeys.map(String));
    const toReload: RowData[] = [];
    const visit = (nodes: RowData[]) => {
      for (const n of nodes) {
        if (n.nodeType === 'category' && expandedSet.has(n.key)) toReload.push(n);
        if (n.children) visit(n.children);
      }
    };
    visit(categoryTree);
    for (const node of toReload) {
      handleExpand(expandedKeys, { node, expanded: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeRefetchVersion]);

  // Auto-scroll table body while dragging a row — browser's native auto-scroll is unreliable inside antd's nested scroll container
  useEffect(() => {
    if (!dragRow) return;
    let rafId = 0;
    let velocityY = 0;
    let velocityX = 0;
    let scrollEl: HTMLElement | null = null;
    const EDGE = 80;
    const MAX_SPEED = 20;

    // Walk up from an element to find the nearest real scrollable ancestor (has scrollable overflow and can actually scroll)
    const findScrollable = (from: Element | null): HTMLElement | null => {
      let el: Element | null = from;
      while (el && el !== document.documentElement) {
        if (el instanceof HTMLElement) {
          const style = getComputedStyle(el);
          const canY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
          const canX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth;
          if (canY || canX) return el;
        }
        el = (el as HTMLElement).parentElement;
      }
      return null;
    };

    const tick = () => {
      if (scrollEl && (velocityY !== 0 || velocityX !== 0)) {
        scrollEl.scrollTop += velocityY;
        scrollEl.scrollLeft += velocityX;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const onDragOver = (e: DragEvent) => {
      // Must call preventDefault for drop to be allowed to fire later
      e.preventDefault();
      const target = e.target as Element | null;
      const found = findScrollable(target);
      if (found) scrollEl = found;
      if (!scrollEl) return;

      const rect = scrollEl.getBoundingClientRect();
      const y = e.clientY;
      const x = e.clientX;
      const fromTop = y - rect.top;
      const fromBottom = rect.bottom - y;
      const fromLeft = x - rect.left;
      const fromRight = rect.right - x;

      velocityY = fromTop < EDGE
        ? -Math.min(MAX_SPEED, Math.max(2, (EDGE - fromTop) / 3))
        : fromBottom < EDGE
          ? Math.min(MAX_SPEED, Math.max(2, (EDGE - fromBottom) / 3))
          : 0;
      velocityX = fromLeft < EDGE
        ? -Math.min(MAX_SPEED, Math.max(2, (EDGE - fromLeft) / 3))
        : fromRight < EDGE
          ? Math.min(MAX_SPEED, Math.max(2, (EDGE - fromRight) / 3))
          : 0;
    };

    const onWheel = (e: WheelEvent) => {
      const target = e.target as Element | null;
      const found = findScrollable(target);
      if (!found) return;
      found.scrollTop += e.deltaY;
      found.scrollLeft += e.deltaX;
      e.preventDefault();
    };

    const onDragEnd = () => { velocityY = 0; velocityX = 0; };

    document.addEventListener('dragover', onDragOver);
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('drop', onDragEnd);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('wheel', onWheel as any);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('drop', onDragEnd);
    };
  }, [dragRow]);

  // Close context menus on any outside click / scroll / escape
  useEffect(() => {
    if (!contextMenu && !colContextMenu) return;
    const close = () => { setContextMenu(null); setColContextMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu, colContextMenu]);

  // ── Folder/product CRUD handlers ──
  const refreshTree = async () => {
    loadedCategories.current.clear();
    await loadRoot();
  };

  const handleAddFolder = (record: RowData) => {
    const parentId = record.nodeType === 'category'
      ? Number(String(record.key).replace('cat:', ''))
      : null;
    setNewFolderCode('');
    setNewFolderName('');
    setAddFolderModal({ parentId, parentName: record.name || '根 / Root' });
  };

  const confirmAddFolder = async () => {
    if (!addFolderModal) return;
    if (!newFolderCode.trim() || !newFolderName.trim()) {
      message.warning('請輸入代碼與名稱 / Enter code and name'); return;
    }
    try {
      await createCategory({
        parent_id: addFolderModal.parentId,
        code: newFolderCode.trim(),
        name: newFolderName.trim(),
      });
      message.success('已新增資料夾 / Folder created');
      setAddFolderModal(null);
      await refreshTree();
    } catch (e: any) {
      message.error(`新增失敗 / Create failed: ${e.message || ''}`);
    }
  };

  const handleDeleteCategory = async (record: RowData) => {
    const id = Number(String(record.key).replace('cat:', ''));
    try {
      const res = await deleteCategory(id);
      message.success(`已刪除 ${res.categoryCount} 個資料夾與其產品 / Deleted ${res.categoryCount} folders and their products`);
      await refreshTree();
    } catch (e: any) {
      message.error(`刪除失敗 / Delete failed: ${e.message || ''}`);
    }
  };

  const handleDeleteProduct = async (record: RowData) => {
    if (!record.product) return;
    try {
      await deleteProduct(record.product.id);
      message.success('已刪除產品 / Product deleted');
      if (selectedProduct?.id === record.product.id) setSelectedProduct(null);
      await refreshTree();
    } catch (e: any) {
      message.error(`刪除失敗 / Delete failed: ${e.message || ''}`);
    }
  };

  const handleRenameCategory = async (record: RowData, newName: string) => {
    const id = Number(String(record.key).replace('cat:', ''));
    const trimmed = newName.trim();
    if (!trimmed || trimmed === record.name) {
      setEditingCategoryKey(null); return;
    }
    try {
      const updated = await updateCategory(id, { name: trimmed });
      // Local update — do NOT refetch tree, so expand/collapse state is preserved
      setTreeData((prev) => updateNodeInTree(prev, record.key, { name: updated.name }));
      message.success('已更新 / Updated');
    } catch (e: any) {
      message.error(`更新失敗 / Update failed: ${e.message || ''}`);
    }
    setEditingCategoryKey(null);
  };

  // Row drag-and-drop (tree mode)
  // Dragging X onto Y (category) → X becomes child of Y.
  //   - X is category: PATCH /api/categories/:id { parent_id: Y.id } (server recomputes level)
  //   - X is product : PUT /api/products/:id { category_id: Y.id }
  const handleRowDrop = async (targetRecord: RowData) => {
    const dragged = dragRow;
    setDragRow(null);
    setDropTargetKey(null);
    if (!dragged || targetRecord.key === dragged.key) return;
    if (targetRecord.nodeType !== 'category') {
      message.warning('只能放到分類上 / Drop onto a category');
      return;
    }
    const targetCatId = Number(String(targetRecord.key).replace('cat:', ''));

    try {
      if (dragged.isCategory) {
        await updateCategory(dragged.id, { parent_id: targetCatId });
      } else {
        await updateProduct(dragged.id, { category_id: targetCatId });
      }
      message.success('階層已更新 / Hierarchy updated');
      loadedCategories.current.clear();
      await loadRoot();
    } catch (e: any) {
      console.error('Reparent failed', e);
      message.error(`儲存失敗 / Save failed: ${e.message || ''}`);
    }
  };

  // Lazy load products when expanding a category
  const handleExpand = async (expanded: React.Key[], info: { node: any; expanded: boolean }) => {
    setExpandedKeys(expanded);
    const node = info.node as RowData;
    if (!info.expanded || node.nodeType !== 'category') return;

    const catId = String(node.key).replace('cat:', '');
    if (node.children && node.children.length > 0 && node.children[0].nodeType === 'category') {
      // Has subcategory children — still load direct products
    }
    if (loadedCategories.current.has(node.key)) return;

    setLoadingKeys((prev) => new Set(prev).add(node.key));
    try {
      const hasSubcategories = node.children && node.children.some((c) => c.nodeType === 'category');
      const result = await fetchProducts({
        category_id: catId,
        limit: 500,
        offset: 0,
        ...(hasSubcategories ? { direct_only: 1 } : {}),
      });
      const parentDepth = node._depth ?? 0;
      const productRows = result.data.map((p: Product) => ({
        ...productToRow(p),
        _depth: parentDepth + 1,
      }));

      setTreeData((prev) => updateChildren(prev, node.key, (existing) => {
        const categoryChildren = existing.filter((c) => c.nodeType === 'category');
        return [...categoryChildren, ...productRows];
      }));
      loadedCategories.current.add(node.key);
    } catch (e) {
      console.error('Failed to load products', e);
    }
    setLoadingKeys((prev) => { const n = new Set(prev); n.delete(node.key); return n; });
  };

  const updateChildren = (
    nodes: RowData[], parentKey: string,
    updater: (existing: RowData[]) => RowData[],
  ): RowData[] =>
    nodes.map((n) =>
      n.key === parentKey
        ? { ...n, children: updater(n.children || []) }
        : n.children
          ? { ...n, children: updateChildren(n.children, parentKey, updater) }
          : n,
    );

  const updateNodeInTree = (nodes: RowData[], key: string, updates: Partial<RowData>): RowData[] =>
    nodes.map((n) =>
      n.key === key
        ? { ...n, ...updates }
        : n.children
          ? { ...n, children: updateNodeInTree(n.children, key, updates) }
          : n,
    );

  // ── Save field ──

  const saveField = async (record: RowData, field: string, value: any) => {
    if (!record.product) { setEditingCell(null); return; }
    const oldVal = (record.product as any)[field];
    // Compare via JSON for objects (e.g. custom_fields); plain string compare otherwise
    const oldStr = typeof oldVal === 'object' ? JSON.stringify(oldVal ?? null) : String(oldVal ?? '');
    const newStr = typeof value === 'object' ? JSON.stringify(value ?? null) : String(value ?? '');
    if (oldStr === newStr) { setEditingCell(null); return; }
    try {
      const updated = await updateProduct(record.product.id, { [field]: value });
      const newProduct = { ...record.product, ...updated };
      setTreeData((prev) => updateNodeInTree(prev, record.key, {
        code: newProduct.pn || String(newProduct.id),
        name: newProduct.name,
        count: newProduct.quantity || 0,
        totalCost: newProduct.total_price || 0,
        product: newProduct,
      }));
      if (selectedProduct?.id === record.product.id) {
        setSelectedProduct(newProduct);
      }
      message.success('已儲存 / Saved');
    } catch (e: any) {
      message.error('儲存失敗 / Save failed');
    }
    setEditingCell(null);
  };

  // Save a single field on a category (progress_note, name, code…) with local tree update
  const saveCategoryField = async (record: RowData, field: string, value: any) => {
    const id = Number(String(record.key).replace('cat:', ''));
    try {
      const updated: any = await updateCategory(id, { [field]: value });
      // For `code` changes, the server cascade-renames descendant categories/products,
      // so the local single-node patch isn't enough — pull the full tree.
      if (field === 'code' && updated?.cascade && (updated.cascade.categories > 0 || updated.cascade.products > 0)) {
        await refetchCategoryTree();
        message.success(
          `已儲存，連動更新 ${updated.cascade.categories} 個子資料夾、${updated.cascade.products} 個產品 / Saved, cascade-renamed ${updated.cascade.categories} sub-folders and ${updated.cascade.products} products`,
        );
      } else {
        setTreeData((prev) => updateNodeInTree(prev, record.key, { [field]: updated[field] } as Partial<RowData>));
        message.success('已儲存 / Saved');
      }
    } catch (e: any) {
      message.error(`儲存失敗 / Failed: ${e.message || ''}`);
    }
    setEditingCell(null);
  };

  const handleRowClick = (record: RowData) => {
    if (record.nodeType === 'product' && record.product) {
      setSelectedProduct(record.product);
      setSelectedProductId(record.product.id);
    }
  };

  // Stable callback for ProductDetail — keeps React.memo intact across parent renders so
  // clicking different products doesn't force the entire detail panel to re-render its tree.
  const searchActiveRef = useRef(false);
  searchActiveRef.current = searchResults != null;
  const handleProductDetailSave = useCallback((updated: Product) => {
    setSelectedProduct(updated);
    const patch: Partial<RowData> = {
      code: updated.pn || String(updated.id),
      name: updated.name,
      count: updated.quantity || 0,
      totalCost: updated.total_price || 0,
      product: updated,
    };
    const updateTree = (nodes: RowData[]): RowData[] =>
      nodes.map((n) =>
        n.key === `prod:${updated.id}`
          ? { ...n, ...patch }
          : n.children ? { ...n, children: updateTree(n.children) } : n,
      );
    if (searchActiveRef.current) {
      setSearchResults((prev) => updateTree(prev ?? []));
    } else {
      setCategoryTree((prev: any) => updateTree(prev as RowData[]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatCurrency = (val: number | null) => {
    if (val == null) return '—';
    return `$${val.toLocaleString('zh-TW')}`;
  };

  // ── Double-click to edit — works for both products and categories, all fields ──
  const editableOnCell = (field: string) => (record: RowData) => {
    // Category + aggregated numeric field: read-only (shows sum), no click/edit handlers
    const isAggregatedCategoryNumeric = record.nodeType === 'category' && TOTALS_FIELDS.has(field);
    if (isAggregatedCategoryNumeric) {
      return { style: { cursor: 'default' } as React.CSSProperties };
    }
    return {
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        if (record.nodeType === 'product') handleRowClick(record);
      },
      onDoubleClick: (e: React.MouseEvent) => {
        if (isEditing(record.key, field)) return;
        e.stopPropagation();
        if (record.nodeType === 'category' && field === 'name') {
          setEditingCategoryKey(record.key);
        } else {
          if (record.nodeType === 'product') handleRowClick(record);
          setEditingCell({ key: record.key, field });
        }
      },
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, record, field });
      },
      style: { cursor: 'pointer' } as React.CSSProperties,
    };
  };

  // Generic field value + save (works for product and category; routes custom fields through custom_fields JSON)
  const isCustomField = (field: string) => field.startsWith('custom_');
  const TOTALS_FIELDS = new Set(['cost', 'unit_price', 'total_price']);
  const getFieldValue = (record: RowData, field: string): any => {
    if (isCustomField(field)) {
      const bag = record.nodeType === 'product'
        ? record.product?.custom_fields
        : record.custom_fields;
      return bag ? bag[field] : undefined;
    }
    // Category + aggregatable numeric field → use server-computed totals
    if (record.nodeType === 'category' && TOTALS_FIELDS.has(field)) {
      const v = record.totals?.[field as 'cost' | 'unit_price' | 'total_price'];
      return v && v > 0 ? v : null;
    }
    if (record.nodeType === 'product') return (record.product as any)?.[field];
    return (record as any)[field];
  };
  const saveFieldGeneric = (record: RowData, field: string, value: any) => {
    if (isCustomField(field)) {
      const existing = record.nodeType === 'product'
        ? (record.product?.custom_fields || {})
        : (record.custom_fields || {});
      const nextCF = { ...existing, [field]: value };
      if (value == null) delete nextCF[field];
      if (record.nodeType === 'product') saveField(record, 'custom_fields', nextCF);
      else saveCategoryField(record, 'custom_fields', nextCF);
      return;
    }
    if (record.nodeType === 'product') saveField(record, field, value);
    else saveCategoryField(record, field, value);
  };
  const ClickPlaceholder = () => (
    <span style={{ color: '#bbb', fontStyle: 'italic' }} title="雙擊修改 / Double-click to edit">DC</span>
  );

  // Collect all distinct non-empty owner values from treeData (recurse), for the Owner dropdown
  const collectOwners = (): string[] => {
    const set = new Set<string>();
    const walk = (rows: RowData[] | undefined) => {
      if (!rows) return;
      for (const r of rows) {
        const v = r.nodeType === 'product' ? r.product?.owner : r.owner;
        if (v && typeof v === 'string' && v.trim()) set.add(v.trim());
        if (r.children) walk(r.children);
      }
    };
    walk(treeData);
    return Array.from(set).sort();
  };

  // Legacy no-op wrapper (rendered content directly; whole-cell click is handled via onCell)
  const editableCell = (record: RowData, _field: string, display: React.ReactNode) => display;

  // Wrap an onCell function so every cell gets `paddingLeft = depth × 32px` indent.
  // Use on all non-tree columns. The first (code) column relies on antd's built-in tree indent.
  const INDENT_PX = 32;
  const withDepthIndent = (baseOnCell?: (r: RowData) => any) => (record: RowData) => {
    const base = baseOnCell ? baseOnCell(record) : {};
    const depth = record._depth ?? 0;
    return {
      ...base,
      style: {
        ...(base.style || {}),
        paddingLeft: 8 + depth * INDENT_PX,
      } as React.CSSProperties,
    };
  };

  // ── Columns ──

  const columns = [
    {
      title: t('products.pn'),
      dataIndex: 'code',
      key: 'code',
      width: 280,
      fixed: 'left' as const,
      sorter: (a: RowData, b: RowData) => (a.code || '').localeCompare(b.code || ''),
      render: (code: string, record: RowData) => {
        const dragHandle = (
          <HolderOutlined style={{ marginRight: 4, color: '#bbb', cursor: 'grab' }} />
        );
        const icon = record.nodeType === 'product'
          ? <FileOutlined style={{ marginRight: 6, color: '#1890ff' }} />
          : <FolderOutlined style={{ marginRight: 6, color: '#faad14' }} />;

        if (record.nodeType === 'product' && isEditing(record.key, 'pn')) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {dragHandle}{icon}
              <EditableText
                value={record.product?.pn || ''}
                onSave={(v) => saveField(record, 'pn', v || null)}
                style={{ fontFamily: 'monospace', fontSize: 12, width: 170 }}
              />
            </span>
          );
        }

        return (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {dragHandle}{icon}
            {record.nodeType === 'product' ? (
              <span
                style={{ fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', borderBottom: '1px dashed #d9d9d9' }}
                onClick={(e) => { e.stopPropagation(); setEditingCell({ key: record.key, field: 'pn' }); }}
              >
                {code} <EditOutlined style={{ fontSize: 10, color: '#bbb' }} />
              </span>
            ) : (
              <span style={{ fontSize: 12 }}>{code}</span>
            )}
            {loadingKeys.has(record.key) && <Spin size="small" style={{ marginLeft: 8 }} />}
          </span>
        );
      },
    },
    {
      title: t('products.name'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      onCell: withDepthIndent(editableOnCell('name')),
      sorter: (a: RowData, b: RowData) => (a.name || '').localeCompare(b.name || ''),
      render: (name: string, record: RowData) => {
        if (record.nodeType === 'category') {
          if (editingCategoryKey === record.key) {
            return (
              <Input
                size="small"
                autoFocus
                defaultValue={name}
                onPressEnter={(e) => handleRenameCategory(record, (e.target as HTMLInputElement).value)}
                onBlur={(e) => handleRenameCategory(record, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditingCategoryKey(null); }}
                onClick={(e) => e.stopPropagation()}
              />
            );
          }
          return (
            <strong
              onDoubleClick={(e) => { e.stopPropagation(); setEditingCategoryKey(record.key); }}
              style={{ cursor: 'text' }}
              title="雙擊改名 / Double-click to rename"
            >
              {name}
            </strong>
          );
        }
        if (isEditing(record.key, 'name')) {
          return (
            <EditableText
              value={record.product?.name || ''}
              onSave={(v) => saveField(record, 'name', v)}
            />
          );
        }
        return editableCell(record, 'name', name);
      },
    },
    {
      title: t('products.partType'),
      key: 'part_type',
      width: 120,
      onCell: (record: RowData) => {
        // Categories: no edit handler, just indent
        if (record.nodeType === 'category') {
          return { style: { paddingLeft: 8 + ((record._depth ?? 0) * 32) } };
        }
        return editableOnCell('part_type')(record);
      },
      sorter: (a: RowData, b: RowData) => (a.product?.part_type || '').localeCompare(b.product?.part_type || ''),
      render: (_: any, record: RowData) => {
        // Category rows: show subtree product count (not editable)
        if (record.nodeType === 'category') return <Tag>{record.count}</Tag>;
        if (isEditing(record.key, 'part_type')) {
          return (
            <Select
              size="small"
              autoFocus
              open
              defaultValue={getFieldValue(record, 'part_type') || undefined}
              style={{ width: 110 }}
              allowClear
              onClick={(e) => e.stopPropagation()}
              onChange={(v) => saveFieldGeneric(record, 'part_type', v || null)}
              onBlur={() => setEditingCell(null)}
              options={PART_TYPES.map((pt) => ({
                value: pt,
                label: `${t(`partTypes.${pt}`)} (${pt})`,
              }))}
            />
          );
        }
        const type = getFieldValue(record, 'part_type');
        if (!type) return <ClickPlaceholder />;
        return <Tag color={PART_TYPE_COLORS[type] || 'default'}>{t(`partTypes.${type}`, { defaultValue: type }) as string}</Tag>;
      },
    },
    {
      title: '成本 / Cost',
      key: 'cost',
      width: 120,
      align: 'right' as const,
      onCell: editableOnCell('cost'),
      sorter: (a: RowData, b: RowData) => (getFieldValue(a, 'cost') ?? 0) - (getFieldValue(b, 'cost') ?? 0),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'cost')) {
          return <EditableNumber value={getFieldValue(record, 'cost') ?? null} onSave={(v) => saveFieldGeneric(record, 'cost', v)} min={0} />;
        }
        const v = getFieldValue(record, 'cost');
        if (v == null) return record.nodeType === 'category' ? <span style={{ color: '#ccc' }}>—</span> : <ClickPlaceholder />;
        return <ShortCurrency value={v} />;
      },
    },
    {
      title: t('products.quantity'),
      key: 'quantity',
      width: 80,
      align: 'right' as const,
      onCell: editableOnCell('quantity'),
      sorter: (a: RowData, b: RowData) => (getFieldValue(a, 'quantity') ?? 0) - (getFieldValue(b, 'quantity') ?? 0),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'quantity')) {
          return <EditableNumber value={getFieldValue(record, 'quantity') ?? null} onSave={(v) => saveFieldGeneric(record, 'quantity', v)} min={0} />;
        }
        const v = getFieldValue(record, 'quantity');
        return v == null ? <ClickPlaceholder /> : <ShortNumber value={v} />;
      },
    },
    {
      title: '售價 / Sale Price',
      key: 'unit_price',
      width: 120,
      align: 'right' as const,
      onCell: editableOnCell('unit_price'),
      sorter: (a: RowData, b: RowData) => (getFieldValue(a, 'unit_price') ?? 0) - (getFieldValue(b, 'unit_price') ?? 0),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'unit_price')) {
          return <EditableNumber value={getFieldValue(record, 'unit_price') ?? null} onSave={(v) => saveFieldGeneric(record, 'unit_price', v)} min={0} />;
        }
        const v = getFieldValue(record, 'unit_price');
        if (v == null) return record.nodeType === 'category' ? <span style={{ color: '#ccc' }}>—</span> : <ClickPlaceholder />;
        return <ShortCurrency value={v} />;
      },
    },
    {
      title: t('products.owner'),
      key: 'owner',
      width: 120,
      onCell: editableOnCell('owner'),
      sorter: (a: RowData, b: RowData) => (getFieldValue(a, 'owner') || '').localeCompare(getFieldValue(b, 'owner') || ''),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'owner')) {
          return (
            <AutoCompleteEditor
              initial={getFieldValue(record, 'owner') || ''}
              options={collectOwners()}
              onSave={(v) => {
                saveFieldGeneric(record, 'owner', v);
                setEditingCell(null);
              }}
            />
          );
        }
        const v = getFieldValue(record, 'owner');
        return v ? <span>{v}</span> : <ClickPlaceholder />;
      },
    },
    {
      title: t('products.keynote'),
      key: 'keynote',
      width: 200,
      ellipsis: true,
      sorter: (a: RowData, b: RowData) => String(getFieldValue(a, 'keynote') ?? '').localeCompare(String(getFieldValue(b, 'keynote') ?? '')),
      onCell: editableOnCell('keynote'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'keynote')) {
          return (
            <EditableText
              value={getFieldValue(record, 'keynote') || ''}
              onSave={(v) => saveFieldGeneric(record, 'keynote', v || null)}
            />
          );
        }
        const text = getFieldValue(record, 'keynote');
        return text
          ? <span style={{ fontSize: 12, color: '#fa8c16' }}>📌 {text}</span>
          : <ClickPlaceholder />;
      },
    },
    {
      title: '進度 / Progress',
      key: 'progress_note',
      width: 130,
      sorter: (a: RowData, b: RowData) => String(getFieldValue(a, 'progress_note') ?? '').localeCompare(String(getFieldValue(b, 'progress_note') ?? '')),
      onCell: editableOnCell('progress_note'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'progress_note')) {
          return (
            <Select
              size="small"
              autoFocus
              open
              defaultValue={getFieldValue(record, 'progress_note') || undefined}
              style={{ width: 120 }}
              allowClear
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(v) => saveFieldGeneric(record, 'progress_note', v || null)}
              onBlur={() => setEditingCell(null)}
              options={PROGRESS_OPTIONS.map((o) => ({
                value: o.value,
                label: <Tag color={o.color} style={{ margin: 0 }}>{o.value}</Tag>,
              }))}
            />
          );
        }
        const v = getFieldValue(record, 'progress_note');
        const color = PROGRESS_OPTIONS.find((o) => o.value === v)?.color || 'default';
        const startEdit = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (record.nodeType === 'product') handleRowClick(record);
          setEditingCell({ key: record.key, field: 'progress_note' });
        };
        return v
          ? <Tag color={color} style={{ cursor: 'pointer' }} onDoubleClick={startEdit}>{v}</Tag>
          : <span
              style={{ color: '#bbb', fontStyle: 'italic', cursor: 'pointer', display: 'inline-block', width: '100%' }}
              onDoubleClick={startEdit}
              title="雙擊修改 / Double-click to edit"
            >DC</span>;
      },
    },
    // ── Extra columns (hidden by default; addable via right-click on column header) ──
    {
      title: '小計 / Total',
      key: 'total_price',
      width: 120,
      align: 'right' as const,
      sorter: (a: RowData, b: RowData) => (Number(getFieldValue(a, 'total_price')) || 0) - (Number(getFieldValue(b, 'total_price')) || 0),
      onCell: editableOnCell('total_price'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'total_price')) {
          return <EditableNumber value={getFieldValue(record, 'total_price') ?? null} onSave={(v) => saveFieldGeneric(record, 'total_price', v)} min={0} />;
        }
        const v = getFieldValue(record, 'total_price');
        if (v == null) return record.nodeType === 'category' ? <span style={{ color: '#ccc' }}>—</span> : <ClickPlaceholder />;
        return <ShortCurrency value={v} />;
      },
    },
    {
      title: '利潤率 / Margin',
      key: 'profit_margin',
      width: 100,
      align: 'right' as const,
      sorter: (a: RowData, b: RowData) => (a.product?.profit_margin ?? 0) - (b.product?.profit_margin ?? 0),
      render: (_: any, record: RowData) => {
        if (record.nodeType === 'category') return null;
        const pm = record.product?.profit_margin;
        if (pm == null) return <span style={{ color: '#ccc' }}>—</span>;
        return <span style={{ color: pm > 0.3 ? '#52c41a' : pm > 0.1 ? '#faad14' : '#ff4d4f' }}>{(pm * 100).toFixed(1)}%</span>;
      },
    },
    {
      title: '備註 / Note',
      key: 'note',
      width: 200,
      ellipsis: true,
      sorter: (a: RowData, b: RowData) => String(getFieldValue(a, 'note') ?? '').localeCompare(String(getFieldValue(b, 'note') ?? '')),
      onCell: editableOnCell('note'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'note')) {
          return <EditableText value={getFieldValue(record, 'note') || ''} onSave={(v) => saveFieldGeneric(record, 'note', v || null)} />;
        }
        const v = getFieldValue(record, 'note');
        return v ? <span>{v}</span> : <ClickPlaceholder />;
      },
    },
    {
      title: '訂單號 / Order#',
      key: 'order_number',
      width: 130,
      sorter: (a: RowData, b: RowData) => String(getFieldValue(a, 'order_number') ?? '').localeCompare(String(getFieldValue(b, 'order_number') ?? '')),
      onCell: editableOnCell('order_number'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'order_number')) {
          return <EditableText value={getFieldValue(record, 'order_number') || ''} onSave={(v) => saveFieldGeneric(record, 'order_number', v || null)} />;
        }
        const v = getFieldValue(record, 'order_number');
        return v ? <span>{v}</span> : <ClickPlaceholder />;
      },
    },
    {
      title: '描述 / Description',
      key: 'description',
      width: 200,
      ellipsis: true,
      sorter: (a: RowData, b: RowData) => String(getFieldValue(a, 'description') ?? '').localeCompare(String(getFieldValue(b, 'description') ?? '')),
      onCell: editableOnCell('description'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'description')) {
          return <EditableText value={getFieldValue(record, 'description') || ''} onSave={(v) => saveFieldGeneric(record, 'description', v || null)} />;
        }
        const v = getFieldValue(record, 'description');
        return v ? <span>{v}</span> : <ClickPlaceholder />;
      },
    },
    {
      title: '交期 / Lead',
      key: 'lead_days',
      width: 90,
      align: 'right' as const,
      sorter: (a: RowData, b: RowData) => (Number(getFieldValue(a, 'lead_days')) || 0) - (Number(getFieldValue(b, 'lead_days')) || 0),
      onCell: editableOnCell('lead_days'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'lead_days')) {
          return <EditableNumber value={getFieldValue(record, 'lead_days') ?? null} onSave={(v) => saveFieldGeneric(record, 'lead_days', v)} min={0} />;
        }
        const d = getFieldValue(record, 'lead_days');
        return d == null ? <ClickPlaceholder /> : <ShortNumber value={d} suffix=" 天" />;
      },
    },
    // ── Extra DB fields (full parity) ──
    {
      title: '利潤 / Profit', key: 'profit', width: 110, align: 'right' as const,
      sorter: (a: RowData, b: RowData) => (Number(getFieldValue(a, 'profit')) || 0) - (Number(getFieldValue(b, 'profit')) || 0),
      onCell: editableOnCell('profit'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'profit'))
          return <EditableNumber value={getFieldValue(record, 'profit') ?? null} onSave={(v) => saveFieldGeneric(record, 'profit', v)} />;
        const v = getFieldValue(record, 'profit');
        return v == null ? <ClickPlaceholder /> : <ShortCurrency value={v} />;
      },
    },
    {
      title: '折扣% / Discount%', key: 'discount_pct', width: 110, align: 'right' as const,
      sorter: (a: RowData, b: RowData) => (Number(getFieldValue(a, 'discount_pct')) || 0) - (Number(getFieldValue(b, 'discount_pct')) || 0),
      onCell: editableOnCell('discount_pct'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'discount_pct'))
          return <EditableNumber value={getFieldValue(record, 'discount_pct') ?? null} onSave={(v) => saveFieldGeneric(record, 'discount_pct', v)} />;
        const v = getFieldValue(record, 'discount_pct');
        return v == null ? <ClickPlaceholder /> : <span>{(Number(v) * 100).toFixed(1)}%</span>;
      },
    },
    {
      title: '折後利潤 / Dis.Profit', key: 'dis_profit', width: 130, align: 'right' as const,
      sorter: (a: RowData, b: RowData) => (Number(getFieldValue(a, 'dis_profit')) || 0) - (Number(getFieldValue(b, 'dis_profit')) || 0),
      onCell: editableOnCell('dis_profit'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'dis_profit'))
          return <EditableNumber value={getFieldValue(record, 'dis_profit') ?? null} onSave={(v) => saveFieldGeneric(record, 'dis_profit', v)} />;
        const v = getFieldValue(record, 'dis_profit');
        return v == null ? <ClickPlaceholder /> : <ShortCurrency value={v} />;
      },
    },
    {
      title: '折後利潤率 / Dis.Margin', key: 'dis_pm', width: 130, align: 'right' as const,
      sorter: (a: RowData, b: RowData) => (Number(getFieldValue(a, 'dis_pm')) || 0) - (Number(getFieldValue(b, 'dis_pm')) || 0),
      onCell: editableOnCell('dis_pm'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'dis_pm'))
          return <EditableNumber value={getFieldValue(record, 'dis_pm') ?? null} onSave={(v) => saveFieldGeneric(record, 'dis_pm', v)} />;
        const v = getFieldValue(record, 'dis_pm');
        return v == null ? <ClickPlaceholder /> : <span>{(Number(v) * 100).toFixed(1)}%</span>;
      },
    },
    {
      title: '連結 / Link', key: 'link', width: 160, ellipsis: true,
      sorter: (a: RowData, b: RowData) => String(getFieldValue(a, 'link') ?? '').localeCompare(String(getFieldValue(b, 'link') ?? '')),
      onCell: editableOnCell('link'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'link'))
          return <EditableText value={getFieldValue(record, 'link') || ''} onSave={(v) => saveFieldGeneric(record, 'link', v || null)} />;
        const v = getFieldValue(record, 'link');
        if (!v) return <ClickPlaceholder />;
        return (
          <a href={String(v)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            {String(v)}
          </a>
        );
      },
    },
    {
      title: '附註 / Remark', key: 'remark', width: 180, ellipsis: true,
      sorter: (a: RowData, b: RowData) => String(getFieldValue(a, 'remark') ?? '').localeCompare(String(getFieldValue(b, 'remark') ?? '')),
      onCell: editableOnCell('remark'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'remark'))
          return <EditableText value={getFieldValue(record, 'remark') || ''} onSave={(v) => saveFieldGeneric(record, 'remark', v || null)} />;
        const v = getFieldValue(record, 'remark');
        return v ? <span>{v}</span> : <ClickPlaceholder />;
      },
    },
    {
      title: '內部編號 / Internal#', key: 'internal_no', width: 140,
      sorter: (a: RowData, b: RowData) => String(getFieldValue(a, 'internal_no') ?? '').localeCompare(String(getFieldValue(b, 'internal_no') ?? '')),
      onCell: editableOnCell('internal_no'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'internal_no'))
          return <EditableText value={getFieldValue(record, 'internal_no') || ''} onSave={(v) => saveFieldGeneric(record, 'internal_no', v || null)} />;
        const v = getFieldValue(record, 'internal_no');
        return v ? <span>{v}</span> : <ClickPlaceholder />;
      },
    },
    {
      title: '單重 / Unit Wt', key: 'unit_weight', width: 110, align: 'right' as const,
      sorter: (a: RowData, b: RowData) => (Number(getFieldValue(a, 'unit_weight')) || 0) - (Number(getFieldValue(b, 'unit_weight')) || 0),
      onCell: editableOnCell('unit_weight'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'unit_weight'))
          return <EditableNumber value={getFieldValue(record, 'unit_weight') ?? null} onSave={(v) => saveFieldGeneric(record, 'unit_weight', v)} min={0} />;
        const v = getFieldValue(record, 'unit_weight');
        return v == null ? <ClickPlaceholder /> : <ShortNumber value={v} suffix=" kg" />;
      },
    },
    {
      title: '包裝重 / Pack Wt', key: 'packet_weight', width: 110, align: 'right' as const,
      sorter: (a: RowData, b: RowData) => (Number(getFieldValue(a, 'packet_weight')) || 0) - (Number(getFieldValue(b, 'packet_weight')) || 0),
      onCell: editableOnCell('packet_weight'),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, 'packet_weight'))
          return <EditableNumber value={getFieldValue(record, 'packet_weight') ?? null} onSave={(v) => saveFieldGeneric(record, 'packet_weight', v)} min={0} />;
        const v = getFieldValue(record, 'packet_weight');
        return v == null ? <ClickPlaceholder /> : <ShortNumber value={v} suffix=" kg" />;
      },
    },
    ...(['c1', 'c2', 'c3'].map((key) => ({
      title: key.toUpperCase(), key, width: 100, ellipsis: true,
      sorter: (a: RowData, b: RowData) => String(getFieldValue(a, key) ?? '').localeCompare(String(getFieldValue(b, key) ?? '')),
      onCell: editableOnCell(key),
      render: (_: any, record: RowData) => {
        if (isEditing(record.key, key))
          return <EditableText value={getFieldValue(record, key) || ''} onSave={(v) => saveFieldGeneric(record, key, v || null)} />;
        const v = getFieldValue(record, key);
        return v ? <span>{v}</span> : <ClickPlaceholder />;
      },
    }))),
  ];

  // Dynamically add user-defined custom columns
  const formatCurrencyNumber = (val: number | null | undefined) =>
    val == null ? null : `$${val.toLocaleString('zh-TW')}`;

  for (const cc of customColumns) {
    const isNumeric = cc.type === 'number' || cc.type === 'currency';
    const colDef: any = {
      title: cc.label,
      key: cc.key,
      width: 150,
      ellipsis: cc.type === 'text',
      align: isNumeric ? 'right' as const : undefined,
      sorter: isNumeric
        ? (a: RowData, b: RowData) => (Number(getFieldValue(a, cc.key)) || 0) - (Number(getFieldValue(b, cc.key)) || 0)
        : (a: RowData, b: RowData) => String(getFieldValue(a, cc.key) ?? '').localeCompare(String(getFieldValue(b, cc.key) ?? '')),
      onCell: editableOnCell(cc.key),
      render: (_: any, record: RowData) => {
        const v = getFieldValue(record, cc.key);
        if (isEditing(record.key, cc.key)) {
          if (cc.type === 'select') {
            return (
              <Select
                size="small"
                autoFocus
                open
                defaultValue={v || undefined}
                style={{ width: 140 }}
                allowClear
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(val) => saveFieldGeneric(record, cc.key, val || null)}
                onBlur={() => setEditingCell(null)}
                options={(cc.options || []).map((o) => ({ value: o, label: o }))}
              />
            );
          }
          if (cc.type === 'number' || cc.type === 'currency') {
            return (
              <EditableNumber
                value={v ?? null}
                onSave={(val) => saveFieldGeneric(record, cc.key, val)}
              />
            );
          }
          return (
            <EditableText
              value={v ?? ''}
              onSave={(val) => saveFieldGeneric(record, cc.key, val || null)}
            />
          );
        }
        // Display
        if (v == null || v === '') return <ClickPlaceholder />;
        if (cc.type === 'currency') return <ShortCurrency value={Number(v)} />;
        if (cc.type === 'number') return <ShortNumber value={Number(v)} />;
        if (cc.type === 'select') return <Tag>{String(v)}</Tag>;
        return <span>{String(v)}</span>;
      },
    };
    columns.push(colDef);
  }

  // Build column map by key
  const columnMap = new Map(columns.map((c) => [c.key, c]));

  // Reorder and apply widths + drag/resize title
  const orderedColumns = columnOrder
    .map((key) => columnMap.get(key))
    .filter(Boolean)
    .map((col: any) => {
      const w = columnWidths[col.key] || col.width || 100;
      return {
        ...col,
        width: w,
        title: (
          <div
            data-col-key={col.key}
            className={dragOverColKey === col.key ? 'prd-drop-target-col' : ''}
            onMouseDown={(e) => {
              if (editingColKey === col.key) return;
              startColDrag(col.key, e);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              openRenameForColumn(col.key);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setColContextMenu({ x: e.clientX, y: e.clientY, colKey: col.key });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: editingColKey === col.key ? 'text' : 'grab',
              userSelect: 'none',
            }}
            title="雙擊 / 右鍵改名 · 拖曳換位"
          >
            <span style={{ flex: 1 }}>{colTitles[col.key] ?? col.title}</span>
            <span
              data-resize-handle="true"
              onMouseDown={(e) => { e.stopPropagation(); handleColResizeStart(col.key, w, e); }}
              style={{ width: 8, cursor: 'col-resize', alignSelf: 'stretch', marginRight: -4, marginLeft: 4, background: 'transparent' }}
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(22,119,255,0.25)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              title="拖曳調整欄寬 / Drag to resize"
            />
          </div>
        ),
      };
    });

  const finalColumns = orderedColumns;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX, startY = e.clientY;
    const startRatio = listRatio;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      if (layoutDir === 'vertical') {
        const delta = ev.clientY - startY;
        saveListRatio(startRatio + (delta / rect.height) * 100);
      } else {
        const delta = ev.clientX - startX;
        saveListRatio(startRatio + (delta / rect.width) * 100);
      }
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [listRatio, layoutDir]);

  const PROGRESS_ORDER = ['1-重要', '2-商品中', '3-研發中', '4-評估中', '5-暫緩', '6-商品'];

  // ── 5-level category filter derivations (driven by global store) ──
  const rootTabs = treeData.filter((n) => n.nodeType === 'category');
  const selectedL1: RowData | undefined = activeTab !== 'all'
    ? rootTabs.find((r) => r.key === `cat:${activeTab}`)
    : undefined;
  const l2Tabs: RowData[] = selectedL1?.children?.filter((c) => c.nodeType === 'category') || [];
  const selectedL2: RowData | undefined = activeL2 !== 'all'
    ? l2Tabs.find((r) => r.key === `cat:${activeL2}`)
    : undefined;
  const l3Tabs: RowData[] = selectedL2?.children?.filter((c) => c.nodeType === 'category') || [];
  const selectedL3: RowData | undefined = activeL3 !== 'all'
    ? l3Tabs.find((r) => r.key === `cat:${activeL3}`)
    : undefined;
  const l4Tabs: RowData[] = selectedL3?.children?.filter((c) => c.nodeType === 'category') || [];
  const selectedL4: RowData | undefined = activeL4 !== 'all'
    ? l4Tabs.find((r) => r.key === `cat:${activeL4}`)
    : undefined;
  const l5Tabs: RowData[] = selectedL4?.children?.filter((c) => c.nodeType === 'category') || [];
  const selectedL5: RowData | undefined = activeL5 !== 'all'
    ? l5Tabs.find((r) => r.key === `cat:${activeL5}`)
    : undefined;
  // Focused node = deepest specific category
  const focusedNode: RowData | undefined =
    selectedL5 ?? selectedL4 ?? selectedL3 ?? selectedL2 ?? selectedL1;

  // When a sider category is focused, the breadcrumb already shows it — show only its
  // children (sub-folders + products) in the table to avoid the redundant first row.
  const tableData: RowData[] = useMemo(
    () => focusedNode ? (focusedNode.children ?? []) : treeData,
    [focusedNode, treeData],
  );

  // Auto-load direct products of the sider-focused category (since its row is no
  // longer shown, the user has no expand chevron to trigger the fetch themselves).
  useEffect(() => {
    if (!focusedNode) return;
    if (loadedCategories.current.has(focusedNode.key)) return;
    handleExpand(
      expandedKeys.includes(focusedNode.key) ? expandedKeys : [...expandedKeys, focusedNode.key],
      { node: focusedNode, expanded: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedNode?.key]);

  // Tab → expand the focused row's direct children (sub-folders + products).
  // Skipped while typing in inputs so form Tab navigation still works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.matches('input, textarea, select, [contenteditable="true"]') ||
                t.closest('input, textarea, select, [contenteditable="true"]'))) return;

      const findNode = (nodes: RowData[], key: string): RowData | null => {
        for (const n of nodes) {
          if (n.key === key) return n;
          if (n.children) {
            const f = findNode(n.children, key);
            if (f) return f;
          }
        }
        return null;
      };

      let target: RowData | null = null;
      if (focusedRowKey) target = findNode(treeData, focusedRowKey);
      // No clicked row → if the table has exactly one top-level row, expand that
      if (!target && tableData.length === 1 && tableData[0].nodeType === 'category') {
        target = tableData[0];
      }
      if (!target || target.nodeType !== 'category') return;

      e.preventDefault();
      e.stopPropagation();
      setFocusedRowKey(target.key);
      if (expandedKeys.includes(target.key)) return;
      const newKeys = [...expandedKeys, target.key];
      handleExpand(newKeys, { node: target, expanded: true });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedRowKey, expandedKeys, treeData, tableData]);

  const isVertical = layoutDir === 'vertical';

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        height: 'calc(100vh - 140px)',
      }}
    >
      {/* List: Product tree table */}
      <Card
        style={{
          ...(isVertical ? { height: `${listRatio}%` } : { width: `${listRatio}%` }),
          overflow: 'hidden',
          marginBottom: 0,
          flexShrink: 0,
        }}
        styles={{ body: { overflow: 'hidden', height: 'calc(100% - 57px)', display: 'flex', flexDirection: 'column' } }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h3 style={{ margin: 0 }}>{t('menu.products')}</h3>
            <Input
              prefix={<SearchOutlined />}
              placeholder={t('products.search')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              allowClear
              style={{ maxWidth: 400 }}
            />
            <div style={{ flex: 1 }} />
            <Input
              size="small"
              prefix={<UserOutlined />}
              placeholder="你的名字 / Your name"
              value={currentUser}
              onChange={(e) => setUser(e.target.value)}
              style={{ maxWidth: 180 }}
              allowClear
            />
            <Button
              size="small"
              onClick={() => setExpandedKeys([])}
            >
              全部收合 / Collapse all
            </Button>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={handleExport}
            >
              匯出 / Export
            </Button>
            <Button
              size="small"
              icon={<UploadOutlined />}
              loading={importLoading}
              onClick={() => document.getElementById('prd-import-input')?.click()}
            >
              匯入 / Import
            </Button>
            <input
              id="prd-import-input"
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
                (e.target as HTMLInputElement).value = '';
              }}
            />
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => setChangeLogOpen(true)}
            >
              變更紀錄 / Change log
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8, flexShrink: 0 }}>
          {/* Header row: breadcrumb of the current category path + layout toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#666' }}>分類 / Category:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
              {[selectedL1, selectedL2, selectedL3, selectedL4, selectedL5].filter(Boolean).length === 0 ? (
                <span style={{ color: '#999' }}>全部 / All</span>
              ) : (
                [selectedL1, selectedL2, selectedL3, selectedL4, selectedL5]
                  .filter((n): n is RowData => !!n)
                  .map((n, i, arr) => (
                    <span key={n.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontWeight: i === arr.length - 1 ? 600 : 500,
                        color: n.progress_note && PROGRESS_ROW_COLORS[n.progress_note]
                          ? PROGRESS_ROW_COLORS[n.progress_note]
                          : '#333',
                      }}>{n.code}</span>
                      {i < arr.length - 1 && <span style={{ color: '#bbb' }}>›</span>}
                    </span>
                  ))
              )}
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#666' }}>版面 / Layout:</span>
            <Segmented
              size="small"
              value={layoutDir}
              onChange={(v) => saveLayoutDir(v as 'vertical' | 'horizontal')}
              options={[
                { value: 'vertical', label: '上下 / Vertical', icon: <SplitCellsOutlined rotate={90} /> },
                { value: 'horizontal', label: '左右 / Horizontal', icon: <SplitCellsOutlined /> },
              ]}
            />
          </div>

          {/* Summary row — when L3/L4/L5 is selected; use the deepest selected node's aggregated totals */}
          {(activeL3 !== 'all' || activeL4 !== 'all' || activeL5 !== 'all') && (() => {
            const deepest = selectedL5 ?? selectedL4 ?? selectedL3;
            const totals = deepest?.productTotalsByProgress;
            if (!totals) return null;
            const sum = Object.values(totals).reduce((acc, v) => acc + (v || 0), 0);
            const shortName = (key: string) => key.split('-').slice(1).join('-') || key;
            return (
              <div style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
                padding: '6px 12px', marginLeft: 48,
                background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0',
                fontSize: 14,
              }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>合計 / Total: {sum} 產品</span>
                {PROGRESS_ORDER.map((key) => (
                  <span key={key} style={{ color: PROGRESS_ROW_COLORS[key], fontWeight: 500 }}>
                    {shortName(key)}({totals[key] ?? 0})
                  </span>
                ))}
                <span style={{ color: '#bbb', fontWeight: 500 }}>
                  未設({totals['_unset'] ?? 0})
                </span>
              </div>
            );
          })()}
        </div>
        <div ref={tableWrapperRef} style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <Table
          className="prd-compact-table"
          columns={finalColumns as any}
          dataSource={tableData}
          loading={loading}
          size="small"
          pagination={false}
          rowKey="key"
          scroll={{
            x: 800,
            y: tableScrollY,
          }}
          expandable={{
            expandedRowKeys: expandedKeys as string[],
            indentSize: 14, // chevron indents 1 CJK character per depth level
            onExpand: (expanded, record) => {
              const newKeys = expanded
                ? [...expandedKeys, record.key]
                : expandedKeys.filter((k) => k !== record.key);
              handleExpand(newKeys, { node: record, expanded });
            },
            rowExpandable: (record) =>
              record.nodeType === 'category' &&
              (record.count > 0 || (record.children !== undefined && record.children.length > 0)),
          }}
          onRow={(record) => {
            const id = record.nodeType === 'category'
              ? Number(String(record.key).replace('cat:', ''))
              : record.product?.id ?? 0;
            const isDragging = dragRow?.key === record.key;
            const isDropTarget = dropTargetKey === record.key && record.nodeType === 'category';
            const progress = record.nodeType === 'product'
              ? record.product?.progress_note
              : record.progress_note;
            const rowColor = progress ? PROGRESS_ROW_COLORS[progress] : undefined;
            const rowBg = progress ? PROGRESS_ROW_BG[progress] : undefined;
            return {
              onClick: () => {
                setFocusedRowKey(record.key);
                if (record.nodeType === 'category') {
                  const isExpanded = expandedKeys.includes(record.key);
                  const newKeys = isExpanded
                    ? expandedKeys.filter((k) => k !== record.key)
                    : [...expandedKeys, record.key];
                  handleExpand(newKeys, { node: record, expanded: !isExpanded });
                }
                handleRowClick(record);
              },
              onContextMenu: (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ x: e.clientX, y: e.clientY, record });
              },
              draggable: true,
              onDragStart: (e) => {
                setDragRow({ key: record.key, isCategory: record.nodeType === 'category', id });
                e.dataTransfer.effectAllowed = 'move';
                // Custom drag image: just the name, compact, doesn't obscure the drop target
                const labelText = record.nodeType === 'product'
                  ? (record.product?.name || record.name)
                  : record.name;
                const ghost = document.createElement('div');
                ghost.textContent = labelText;
                ghost.style.cssText = [
                  'position: absolute',
                  'top: -9999px',
                  'left: -9999px',
                  'padding: 4px 10px',
                  'background: #ffffff',
                  'border: 1px solid #1677ff',
                  'border-radius: 4px',
                  'font-size: 12px',
                  'color: #1677ff',
                  'box-shadow: 0 2px 8px rgba(0,0,0,0.15)',
                  'white-space: nowrap',
                  'pointer-events: none',
                ].join(';');
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 10, 10);
                setTimeout(() => ghost.remove(), 0);
              },
              onDragOver: (e) => {
                e.preventDefault();
                if (record.nodeType === 'category' && dragRow && dragRow.key !== record.key) {
                  setDropTargetKey(record.key);
                  e.dataTransfer.dropEffect = 'move';
                } else {
                  e.dataTransfer.dropEffect = 'none';
                }
              },
              onDragLeave: () => {
                if (dropTargetKey === record.key) setDropTargetKey(null);
              },
              onDrop: (e) => {
                e.preventDefault();
                handleRowDrop(record);
              },
              onDragEnd: () => { setDragRow(null); setDropTargetKey(null); },
              style: {
                cursor: 'grab',
                color: rowColor,
                backgroundColor:
                  !isDropTarget && (selectedProductId === record.product?.id || focusedRowKey === record.key)
                    ? '#e6f7ff'
                    : rowBg,
                boxShadow: isDropTarget
                  ? '0 0 32px rgba(22,119,255,1), 0 0 12px rgba(22,119,255,0.9)'
                  : undefined,
                opacity: isDragging ? 0.4 : 1,
                transition: 'box-shadow 0.12s ease',
              },
              className: isDropTarget ? 'prd-row-hover prd-drop-target' : 'prd-row-hover',
            };
          }}
        />
        </div>
      </Card>

      {/* Draggable divider (vertical or horizontal) */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          ...(isVertical
            ? { height: 8, cursor: 'row-resize', margin: '2px 0', background: 'linear-gradient(to bottom, #f0f0f0, #d9d9d9, #f0f0f0)' }
            : { width: 8, cursor: 'col-resize', margin: '0 2px', background: 'linear-gradient(to right, #f0f0f0, #d9d9d9, #f0f0f0)' }),
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={isVertical
            ? { width: 40, height: 3, borderTop: '1px solid #bbb', borderBottom: '1px solid #bbb' }
            : { width: 3, height: 40, borderLeft: '1px solid #bbb', borderRight: '1px solid #bbb' }}
        />
      </div>

      {/* Detail panel — all fields editable */}
      <Card title={t('products.details')} style={{ flex: 1, overflow: 'auto', minWidth: 0, minHeight: 0 }}>
        {selectedProduct ? (
          <ProductDetail
            product={selectedProduct}
            onSave={handleProductDetailSave}
          />
        ) : (
          <Empty description={t('products.selectProduct')} />
        )}
      </Card>

      {/* Column-header right-click menu */}
      {colContextMenu && (() => {
        const isCustom = customColumnsMap.has(colContextMenu.colKey);
        return (
          <div
            style={{
              position: 'fixed',
              left: colContextMenu.x,
              top: colContextMenu.y,
              zIndex: 9999,
              boxShadow: '0 6px 16px rgba(0,0,0,0.16)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Menu
              style={{ minWidth: 240, border: '1px solid #f0f0f0' }}
              items={[
                { key: 'rename', label: '重新命名欄位 / Rename column', icon: <EditOutlined /> },
                { key: 'reset', label: '還原原始欄名 / Reset name', icon: <HistoryOutlined /> },
                { type: 'divider' as const },
                { key: 'hide', label: '隱藏此欄位 / Hide column', icon: <DeleteOutlined />, danger: true, disabled: columnOrder.length <= 1 },
                { key: 'add', label: '新增欄位 / Add column…', icon: <PlusOutlined /> },
                ...(isCustom ? [
                  { type: 'divider' as const },
                  { key: 'delete_custom', label: '永久刪除自訂欄位 / Delete custom column', icon: <DeleteOutlined />, danger: true },
                ] : []),
              ]}
              onClick={({ key }) => {
                const { colKey } = colContextMenu;
                setColContextMenu(null);
                if (key === 'rename') {
                  openRenameForColumn(colKey);
                }
                else if (key === 'reset') {
                  const next = { ...colTitles };
                  delete next[colKey];
                  setColTitles(next);
                  localStorage.setItem('prd.colTitles', JSON.stringify(next));
                }
                else if (key === 'hide') {
                  setColumnOrder((prev) => prev.filter((k) => k !== colKey));
                }
                else if (key === 'add') {
                  setNewColLabel('');
                  setNewColType('text');
                  setNewColOptions('');
                  setAddColModal({ mode: 'custom', insertAfter: colKey });
                }
                else if (key === 'delete_custom') {
                  Modal.confirm({
                    title: `永久刪除自訂欄位「${customColumnsMap.get(colKey)?.label}」？`,
                    content: '此動作會從所有產品與資料夾清掉該欄位的資料，且無法復原。/ This will remove the column and all its saved values. Cannot be undone.',
                    okText: '刪除 / Delete',
                    cancelText: '取消 / Cancel',
                    okButtonProps: { danger: true },
                    onOk: () => {
                      // Remove from customColumns + columnOrder (values remain in DB but become orphaned)
                      setCustomColumns((prev) => prev.filter((c) => c.key !== colKey));
                      setColumnOrder((prev) => prev.filter((k) => k !== colKey));
                      const nextTitles = { ...colTitles };
                      delete nextTitles[colKey];
                      setColTitles(nextTitles);
                      localStorage.setItem('prd.colTitles', JSON.stringify(nextTitles));
                      message.success('已刪除 / Deleted');
                    },
                  });
                }
              }}
            />
          </div>
        );
      })()}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
            boxShadow: '0 6px 16px rgba(0,0,0,0.16)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Menu
            style={{ minWidth: 180, border: '1px solid #f0f0f0' }}
            items={(() => {
              const field = contextMenu.field;
              const fieldLabel = field && FIELD_LABELS[field] ? `「${FIELD_LABELS[field]}」` : '';
              const renameLabel = `重新命名${fieldLabel} / Rename${field ? ` ${field}` : ''}`;
              if (contextMenu.record.nodeType === 'category') {
                return [
                  { key: 'add', label: '新增子資料夾 / Add subfolder', icon: <FolderAddOutlined /> },
                  { key: 'rename', label: renameLabel, icon: <EditOutlined /> },
                  { type: 'divider' as const },
                  { key: 'delete', label: '刪除 / Delete', icon: <DeleteOutlined />, danger: true },
                ];
              }
              return [
                { key: 'rename', label: renameLabel, icon: <EditOutlined /> },
                { type: 'divider' as const },
                { key: 'delete', label: '刪除 / Delete', icon: <DeleteOutlined />, danger: true },
              ];
            })()}
            onClick={({ key }) => {
              const rec = contextMenu.record;
              const field = contextMenu.field ?? 'name';
              setContextMenu(null);
              if (key === 'add') handleAddFolder(rec);
              else if (key === 'rename') {
                openRenameForField(rec, field);
              }
              else if (key === 'delete') {
                Modal.confirm({
                  title: rec.nodeType === 'category'
                    ? `刪除「${rec.name}」及其所有子資料夾與產品？`
                    : `刪除產品「${rec.name}」？`,
                  content: '此動作無法復原（軟刪除）/ Cannot be undone (soft delete)',
                  okText: '刪除 / Delete',
                  cancelText: '取消 / Cancel',
                  okButtonProps: { danger: true },
                  onOk: () =>
                    rec.nodeType === 'category'
                      ? handleDeleteCategory(rec)
                      : handleDeleteProduct(rec),
                });
              }
            }}
          />
        </div>
      )}

      {/* Change log drawer */}
      <Drawer
        title="變更紀錄 / Change Log"
        placement="right"
        width={560}
        open={changeLogOpen}
        onClose={() => setChangeLogOpen(false)}
        extra={
          <Button size="small" onClick={loadAudit} loading={auditLoading}>重新整理 / Refresh</Button>
        }
      >
        <List
          loading={auditLoading}
          dataSource={auditRows}
          locale={{ emptyText: '目前無紀錄 / No audit entries yet' }}
          renderItem={(row: any) => {
            const actionLabel = {
              create: '新增',
              update: '修改',
              delete: '刪除',
              reparent: '搬移',
            }[row.action as string] || row.action;
            const color = {
              create: 'green',
              update: 'blue',
              delete: 'red',
              reparent: 'orange',
            }[row.action as string] || 'default';
            const entityLabel = row.entity_type === 'category' ? '資料夾' : '產品';

            let detail: React.ReactNode = null;
            if (row.changes) {
              if (row.action === 'update' || row.action === 'reparent') {
                detail = (
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {Object.entries(row.changes).map(([field, pair]: any) => {
                      const [oldV, newV] = Array.isArray(pair) ? pair : [null, pair];
                      return (
                        <div key={field}>
                          <code style={{ color: '#1677ff' }}>{field}</code>:{' '}
                          <span style={{ textDecoration: 'line-through', color: '#999' }}>{String(oldV ?? '—')}</span>
                          {' → '}
                          <strong>{String(newV ?? '—')}</strong>
                        </div>
                      );
                    })}
                  </div>
                );
              } else if (row.action === 'create') {
                detail = (
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {Object.entries(row.changes).map(([k, v]) => (
                      <span key={k} style={{ marginRight: 8 }}>
                        <code style={{ color: '#1677ff' }}>{k}</code>: {String(v)}
                      </span>
                    ))}
                  </div>
                );
              } else if (row.action === 'delete' && row.changes.cascaded_categories) {
                detail = (
                  <div style={{ fontSize: 12, color: '#666' }}>
                    連同 {row.changes.cascaded_categories} 個資料夾一起刪除
                  </div>
                );
              }
            }

            return (
              <List.Item>
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Tag color={color}>{actionLabel}{entityLabel}</Tag>
                    <strong style={{ fontSize: 12 }}>{row.entity_label || `#${row.entity_id}`}</strong>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: '#999' }}>
                      <UserOutlined /> {row.user || 'anonymous'}
                    </span>
                  </div>
                  {detail}
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{row.timestamp}</div>
                </div>
              </List.Item>
            );
          }}
        />
      </Drawer>

      {/* Import preview modal (Excel diff) */}
      <Modal
        title="匯入預覽 / Import preview"
        open={!!importDiff}
        onCancel={() => setImportDiff(null)}
        onOk={applyImport}
        okText={(() => {
          if (!importDiff) return '套用 / Apply';
          const total = selectedAdded.size + selectedUpdated.size + selectedRemoved.size;
          return `套用選取 ${total} 筆 / Apply ${total}`;
        })()}
        cancelText="取消 / Cancel"
        okButtonProps={{ disabled: !importDiff || (selectedAdded.size + selectedUpdated.size + selectedRemoved.size === 0) }}
        width={900}
        style={{ top: 40 }}
        destroyOnClose
      >
        {importDiff && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, padding: 8, background: '#fafafa', borderRadius: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>快速模式 / Quick mode:</span>
              <Button
                size="small"
                danger
                onClick={replaceAllImport}
                title="先把資料庫所有產品標記刪除，再依檔案重建 / Wipes all products then rebuilds from file (one-click action — does not use the checkboxes below)"
              >
                清空再匯入 / Clear &amp; import
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setSelectedAdded(new Set(importDiff.added.map((x) => x.pn)));
                  setSelectedUpdated(new Set(importDiff.updated.map((x) => x.id)));
                  setSelectedRemoved(new Set());
                }}
                title="新增 + 更新欄位，不刪除 / Add + update fields, no deletion"
              >
                僅匯入增加 / Add only
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setSelectedAdded(new Set(importDiff.added.map((x) => x.pn)));
                  setSelectedUpdated(new Set(importDiff.updated.map((x) => x.id)));
                  setSelectedRemoved(new Set(importDiff.removed.map((x) => x.id)));
                }}
                title="新增 + 更新 + 刪除 / Add + update + delete missing"
              >
                增加與刪除 / Add &amp; delete
              </Button>
            </div>
            <Segmented
              value={importTab}
              onChange={(v) => setImportTab(v as any)}
              style={{ marginBottom: 12 }}
              options={[
                { value: 'updated', label: `修改 / Updated (${importDiff.updated.length})` },
                { value: 'added',   label: `新增 / Added (${importDiff.added.length})` },
                { value: 'removed', label: `刪除 / Removed (${importDiff.removed.length})` },
              ]}
            />
            <div style={{ maxHeight: '55vh', overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 4, padding: 8 }}>
              {importTab === 'updated' && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <Button size="small" onClick={() => setSelectedUpdated(new Set(importDiff.updated.map((x) => x.id)))}>全選</Button>
                    <Button size="small" style={{ marginLeft: 8 }} onClick={() => setSelectedUpdated(new Set())}>全不選</Button>
                  </div>
                  {importDiff.updated.length === 0 ? (
                    <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>無修改 / No updates</div>
                  ) : (
                    importDiff.updated.map((u) => (
                      <div key={u.id} style={{ padding: 8, borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={selectedUpdated.has(u.id)}
                          onChange={(e) => {
                            const next = new Set(selectedUpdated);
                            if (e.target.checked) next.add(u.id); else next.delete(u.id);
                            setSelectedUpdated(next);
                          }}
                          style={{ marginTop: 4 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>
                            <span style={{ fontFamily: 'monospace' }}>{u.pn}</span>
                            <span style={{ color: '#999', fontSize: 11, marginLeft: 8 }}>{u.categoryPath}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                            {Object.entries(u.diff).map(([field, pair]) => (
                              <div key={field}>
                                <code style={{ color: '#1677ff' }}>{field}</code>:{' '}
                                <span style={{ textDecoration: 'line-through', color: '#999' }}>{String(pair[0] ?? '—')}</span>
                                {' → '}
                                <strong>{String(pair[1] ?? '—')}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
              {importTab === 'added' && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <Button size="small" onClick={() => setSelectedAdded(new Set(importDiff.added.map((x) => x.pn)))}>全選</Button>
                    <Button size="small" style={{ marginLeft: 8 }} onClick={() => setSelectedAdded(new Set())}>全不選</Button>
                  </div>
                  {importDiff.added.length === 0 ? (
                    <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>無新增 / No new items</div>
                  ) : (
                    importDiff.added.map((a) => (
                      <div key={a.pn} style={{ padding: 8, borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={selectedAdded.has(a.pn)}
                          onChange={(e) => {
                            const next = new Set(selectedAdded);
                            if (e.target.checked) next.add(a.pn); else next.delete(a.pn);
                            setSelectedAdded(next);
                          }}
                          style={{ marginTop: 4 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div>
                            <span style={{ fontFamily: 'monospace' }}>{a.pn}</span>
                            {a.payload.name && <span style={{ marginLeft: 8 }}>{a.payload.name}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                            {a.payload.category_path || '無分類路徑'}
                            {a.missingCategories.length > 0 && (
                              <span style={{ color: '#fa8c16', marginLeft: 8 }}>
                                ⚠ 需要建立新分類：{a.missingCategories.join(' › ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
              {importTab === 'removed' && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <Button size="small" onClick={() => setSelectedRemoved(new Set(importDiff.removed.map((x) => x.id)))}>全選</Button>
                    <Button size="small" style={{ marginLeft: 8 }} onClick={() => setSelectedRemoved(new Set())}>全不選</Button>
                  </div>
                  {importDiff.removed.length === 0 ? (
                    <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>無刪除 / No deletions</div>
                  ) : (
                    importDiff.removed.map((r) => (
                      <div key={r.id} style={{ padding: 8, borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={selectedRemoved.has(r.id)}
                          onChange={(e) => {
                            const next = new Set(selectedRemoved);
                            if (e.target.checked) next.add(r.id); else next.delete(r.id);
                            setSelectedRemoved(next);
                          }}
                          style={{ marginTop: 4 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div>
                            <span style={{ fontFamily: 'monospace' }}>{r.pn}</span>
                            {r.name && <span style={{ marginLeft: 8 }}>{r.name}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{r.categoryPath}</div>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* Add-column modal (existing built-in or new custom) */}
      <Modal
        title="新增欄位 / Add column"
        open={!!addColModal}
        onOk={() => {
          if (!addColModal) return;
          if (addColModal.mode === 'existing') {
            message.info('請從下拉選單挑一個 / Pick from the dropdown'); return;
          }
          const label = newColLabel.trim();
          if (!label) { message.warning('請輸入欄位名稱 / Enter a column name'); return; }
          if (newColType === 'select' && newColOptions.split('\n').filter(s => s.trim()).length === 0) {
            message.warning('下拉選單至少要有 1 個選項 / Select needs at least 1 option'); return;
          }
          const key = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24)}_${Date.now().toString(36).slice(-4)}`;
          const options = newColType === 'select'
            ? newColOptions.split('\n').map(s => s.trim()).filter(Boolean)
            : undefined;
          setCustomColumns((prev) => [...prev, { key, label, type: newColType, options }]);
          const insertAfter = addColModal.insertAfter;
          setColumnOrder((prev) => {
            if (insertAfter) {
              const idx = prev.indexOf(insertAfter);
              if (idx >= 0) { const next = [...prev]; next.splice(idx + 1, 0, key); return next; }
            }
            return [...prev, key];
          });
          message.success(`已新增欄位「${label}」`);
          setAddColModal(null);
        }}
        onCancel={() => setAddColModal(null)}
        okText="建立 / Create"
        cancelText="取消 / Cancel"
        destroyOnClose
        width={520}
      >
        {addColModal && (
          <Form layout="vertical">
            <Form.Item label="模式 / Mode">
              <Segmented
                value={addColModal.mode}
                onChange={(v) => setAddColModal({ ...addColModal, mode: v as 'existing' | 'custom' })}
                options={[
                  { value: 'existing', label: '加入既有欄位 / Existing' },
                  { value: 'custom', label: '新增自訂欄位 / Custom' },
                ]}
              />
            </Form.Item>
            {addColModal.mode === 'existing' ? (
              <Form.Item label="選擇欄位 / Pick column">
                <Select
                  placeholder="選一個隱藏的欄位..."
                  style={{ width: '100%' }}
                  options={columns
                    .filter((c) => !columnOrder.includes(c.key) && !customColumnsMap.has(c.key))
                    .map((c) => ({ value: c.key, label: typeof c.title === 'string' ? c.title : c.key }))}
                  onChange={(v) => {
                    const insertAfter = addColModal.insertAfter;
                    setColumnOrder((prev) => {
                      if (prev.includes(v)) return prev;
                      if (insertAfter) {
                        const idx = prev.indexOf(insertAfter);
                        if (idx >= 0) { const next = [...prev]; next.splice(idx + 1, 0, v); return next; }
                      }
                      return [...prev, v];
                    });
                    message.success('已加入 / Added');
                    setAddColModal(null);
                  }}
                />
              </Form.Item>
            ) : (
              <>
                <Form.Item label="欄位名稱 / Column name" required>
                  <Input
                    autoFocus
                    value={newColLabel}
                    onChange={(e) => setNewColLabel(e.target.value)}
                    placeholder="例如：功能類型、規格、頁數..."
                  />
                </Form.Item>
                <Form.Item label="資料格式 / Data type" required>
                  <Select
                    value={newColType}
                    onChange={(v) => setNewColType(v)}
                    options={[
                      { value: 'text', label: '文字 / Text' },
                      { value: 'number', label: '數字 / Number' },
                      { value: 'currency', label: '貨幣 / Currency ($)' },
                      { value: 'select', label: '下拉選單 / Select' },
                    ]}
                  />
                </Form.Item>
                {newColType === 'select' && (
                  <Form.Item label="選項（一行一個）/ Options (one per line)" required>
                    <Input.TextArea
                      rows={4}
                      value={newColOptions}
                      onChange={(e) => setNewColOptions(e.target.value)}
                      placeholder={'選項 A\n選項 B\n選項 C'}
                    />
                  </Form.Item>
                )}
              </>
            )}
          </Form>
        )}
      </Modal>

      {/* Generic rename modal */}
      <Modal
        title={renameModal?.title || ''}
        open={!!renameModal}
        onOk={confirmRename}
        onCancel={() => setRenameModal(null)}
        okText="儲存 / Save"
        cancelText="取消 / Cancel"
        destroyOnClose
      >
        <Form layout="vertical">
          <Form.Item label={renameModal?.label || ''}>
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onPressEnter={confirmRename}
              placeholder={renameModal?.currentValue || ''}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add-folder modal */}
      <Modal
        title={
          addFolderModal
            ? `新增資料夾到「${addFolderModal.parentName}」底下 / Add subfolder under "${addFolderModal.parentName}"`
            : ''
        }
        open={!!addFolderModal}
        onOk={confirmAddFolder}
        onCancel={() => setAddFolderModal(null)}
        okText="建立 / Create"
        cancelText="取消 / Cancel"
      >
        <Form layout="vertical">
          <Form.Item label="代碼 / Code" required>
            <Input
              autoFocus
              value={newFolderCode}
              onChange={(e) => setNewFolderCode(e.target.value)}
              placeholder="例如 / e.g. A10"
            />
          </Form.Item>
          <Form.Item label="名稱 / Name" required>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onPressEnter={confirmAddFolder}
              placeholder="資料夾名稱 / Folder name"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ── Product Detail Panel (all fields editable) ──
// Memoized: only re-render when product reference changes (ignores onSave closure churn)

const ProductDetail = React.memo(function ProductDetailInner({ product, onSave }: { product: Product; onSave: (p: Product) => void }) {
  const { t } = useTranslation();
  const [editingField, setEditingField] = useState<string | null>(null);

  const saveField = async (field: string, value: any) => {
    const oldVal = (product as any)[field];
    if (String(value ?? '') === String(oldVal ?? '')) { setEditingField(null); return; }
    try {
      const updated = await updateProduct(product.id, { [field]: value });
      onSave({ ...product, ...updated });
      message.success('已儲存 / Saved');
    } catch {
      message.error('儲存失敗 / Save failed');
    }
    setEditingField(null);
  };

  const textField = (field: string, val: string | null, mono?: boolean) => {
    if (editingField === field) {
      return (
        <Input
          size="small"
          autoFocus
          defaultValue={val || ''}
          style={mono ? { fontFamily: 'monospace' } : undefined}
          onPressEnter={(e) => saveField(field, (e.target as HTMLInputElement).value || null)}
          onBlur={(e) => saveField(field, e.target.value || null)}
        />
      );
    }
    return (
      <span
        style={{ cursor: 'pointer', borderBottom: '1px dashed #d9d9d9', display: 'inline-block', minWidth: 40, ...(mono ? { fontFamily: 'monospace' } : {}) }}
        onClick={() => setEditingField(field)}
      >
        {val || '—'} <EditOutlined style={{ fontSize: 10, color: '#bbb' }} />
      </span>
    );
  };

  const textAreaField = (field: string, val: string | null) => {
    if (editingField === field) {
      return (
        <Input.TextArea
          autoFocus
          rows={3}
          defaultValue={val || ''}
          onBlur={(e) => saveField(field, e.target.value || null)}
          style={{ fontSize: 12 }}
        />
      );
    }
    return (
      <span
        style={{ cursor: 'pointer', borderBottom: '1px dashed #d9d9d9', display: 'inline-block', minWidth: 40 }}
        onClick={() => setEditingField(field)}
      >
        {val ? <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0, maxHeight: 200, overflow: 'auto' }}>{val}</pre> : '—'}
        <EditOutlined style={{ fontSize: 10, color: '#bbb', marginLeft: 4 }} />
      </span>
    );
  };

  const numberField = (field: string, val: number | null, prefix?: string, suffix?: string) => {
    if (editingField === field) {
      return (
        <InputNumber
          size="small"
          autoFocus
          defaultValue={val ?? undefined}
          min={0}
          style={{ width: 150 }}
          onPressEnter={(e) => {
            const v = (e.target as HTMLInputElement).value;
            saveField(field, v === '' ? null : Number(v));
          }}
          onBlur={(e) => {
            const v = e.target.value;
            saveField(field, v === '' ? null : Number(v));
          }}
        />
      );
    }
    const display = val != null ? `${prefix || ''}${val.toLocaleString()}${suffix || ''}` : '—';
    return (
      <span
        style={{ cursor: 'pointer', borderBottom: '1px dashed #d9d9d9', display: 'inline-block', minWidth: 40 }}
        onClick={() => setEditingField(field)}
      >
        {display} <EditOutlined style={{ fontSize: 10, color: '#bbb' }} />
      </span>
    );
  };

  const selectField = (field: string, val: string | null, options: { value: string; label: string }[]) => {
    if (editingField === field) {
      return (
        <Select
          size="small"
          autoFocus
          open
          defaultValue={val || undefined}
          style={{ width: 200 }}
          allowClear
          onChange={(v) => saveField(field, v || null)}
          onBlur={() => setEditingField(null)}
          options={options}
        />
      );
    }
    const opt = options.find((o) => o.value === val);
    return (
      <span
        style={{ cursor: 'pointer', borderBottom: '1px dashed #d9d9d9', display: 'inline-block', minWidth: 40 }}
        onClick={() => setEditingField(field)}
      >
        {val ? (
          <Tag color={PART_TYPE_COLORS[val] || 'default'}>{opt?.label || val}</Tag>
        ) : '—'}
        <EditOutlined style={{ fontSize: 10, color: '#bbb', marginLeft: 4 }} />
      </span>
    );
  };

  const linkField = (field: string, val: string | null) => {
    if (editingField === field) {
      return (
        <Input
          size="small"
          autoFocus
          defaultValue={val || ''}
          onPressEnter={(e) => saveField(field, (e.target as HTMLInputElement).value || null)}
          onBlur={(e) => saveField(field, e.target.value || null)}
        />
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {val ? <a href={val} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{val}</a> : '—'}
        <EditOutlined
          style={{ fontSize: 10, color: '#bbb', cursor: 'pointer' }}
          onClick={() => setEditingField(field)}
        />
      </span>
    );
  };

  const items: { label: string; children: React.ReactNode }[] = [
    { label: t('products.pn'), children: textField('pn', product.pn, true) },
    { label: t('products.name'), children: textField('name', product.name) },
    {
      label: t('products.partType'),
      children: selectField('part_type', product.part_type, PART_TYPES.map((pt) => ({
        value: pt,
        label: `${t(`partTypes.${pt}`)} (${pt})`,
      }))),
    },
    { label: t('products.description'), children: textAreaField('description', product.description) },
    { label: t('products.cost'), children: numberField('cost', product.cost, '$') },
    { label: t('products.quantity'), children: numberField('quantity', product.quantity) },
    { label: t('products.unitPrice'), children: numberField('unit_price', product.unit_price, '$') },
    { label: t('products.totalPrice'), children: numberField('total_price', product.total_price, '$') },
    { label: t('products.profit'), children: numberField('profit', product.profit, '$') },
    {
      label: t('products.profitMargin'),
      children: (() => {
        if (editingField === 'profit_margin') {
          return (
            <InputNumber
              size="small"
              autoFocus
              defaultValue={product.profit_margin != null ? +(product.profit_margin * 100).toFixed(1) : undefined}
              min={0}
              max={100}
              style={{ width: 100 }}
              addonAfter="%"
              onPressEnter={(e) => {
                const v = (e.target as HTMLInputElement).value;
                saveField('profit_margin', v === '' ? null : Number(v) / 100);
              }}
              onBlur={(e) => {
                const v = e.target.value;
                saveField('profit_margin', v === '' ? null : Number(v) / 100);
              }}
            />
          );
        }
        const pm = product.profit_margin;
        return (
          <span
            style={{ cursor: 'pointer', borderBottom: '1px dashed #d9d9d9', display: 'inline-block', minWidth: 40 }}
            onClick={() => setEditingField('profit_margin')}
          >
            {pm != null ? (
              <span style={{ color: pm > 0.3 ? '#52c41a' : pm > 0.1 ? '#faad14' : '#ff4d4f' }}>
                {(pm * 100).toFixed(1)}%
              </span>
            ) : '—'}
            <EditOutlined style={{ fontSize: 10, color: '#bbb', marginLeft: 4 }} />
          </span>
        );
      })(),
    },
    { label: t('products.leadDays'), children: numberField('lead_days', product.lead_days, '', ' 天') },
    { label: t('products.owner'), children: textField('owner', product.owner) },
    { label: t('products.keynote'), children: textAreaField('keynote', product.keynote) },
    { label: t('products.note'), children: textAreaField('note', product.note) },
    { label: t('products.remark'), children: textAreaField('remark', product.remark) },
    { label: t('products.orderNumber'), children: textField('order_number', product.order_number) },
    { label: t('products.internalNo'), children: textField('internal_no', product.internal_no) },
    { label: t('products.unitWeight'), children: numberField('unit_weight', product.unit_weight, '', ' kg') },
    { label: t('products.packetWeight'), children: numberField('packet_weight', product.packet_weight, '', ' kg') },
    { label: t('products.link'), children: linkField('link', product.link) },
  ];

  return (
    <Descriptions
      column={1}
      size="small"
      bordered
      items={items.map((item, idx) => ({ key: idx, ...item }))}
    />
  );
}, (prev, next) => prev.product === next.product);
