import { create } from 'zustand';
import { fetchCategoryTree } from '../api';

export type TabKey = 'all' | number;

// Minimal tree-node shape used by both Sider CategoryTree and Products page.
// Products page uses an extended `RowData` that adds product-specific fields,
// but it's structurally compatible with this interface.
export interface CategoryTreeRowData {
  key: string;
  code: string;
  name: string;
  nodeType: 'category' | 'product';
  count?: number;
  children?: CategoryTreeRowData[];
  progress_note?: string | null;
  productTotalsByProgress?: Record<string, number>;
  [key: string]: any;
}

function buildCategoryRowData(nodes: any[], depth = 0): CategoryTreeRowData[] {
  return nodes.map((node: any) => ({
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
    children: node.children?.length > 0 ? buildCategoryRowData(node.children, depth + 1) : [],
  }));
}

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  selectedProductId: number | null;
  setSelectedProductId: (id: number | null) => void;

  // Category tree shared between Sider and Products
  categoryTree: CategoryTreeRowData[];
  setCategoryTree: (
    next: CategoryTreeRowData[] | ((prev: CategoryTreeRowData[]) => CategoryTreeRowData[])
  ) => void;
  refetchCategoryTree: () => Promise<void>;
  // Bumps each time refetchCategoryTree replaces the tree wholesale; consumers use this
  // to invalidate per-category product caches without reacting to local in-place edits.
  treeRefetchVersion: number;

  // Active 5-level category filter
  activeL1: TabKey;
  activeL2: TabKey;
  activeL3: TabKey;
  activeL4: TabKey;
  activeL5: TabKey;
  setActiveL1: (k: TabKey) => void;
  setActiveL2: (k: TabKey) => void;
  setActiveL3: (k: TabKey) => void;
  setActiveL4: (k: TabKey) => void;
  setActiveL5: (k: TabKey) => void;
  setActiveCategoryPath: (p: { l1?: TabKey; l2?: TabKey; l3?: TabKey; l4?: TabKey; l5?: TabKey }) => void;

  // Sider category tree expansion (persisted; defaults to fully expanded on first load)
  categorySiderExpanded: string[];
  setCategorySiderExpanded: (keys: string[]) => void;
  categorySiderInitialized: boolean;
  markCategorySiderInitialized: () => void;

  // Visual selection in the Sider tree — persisted so clicking a synthetic "全部 / All"
  // node remains highlighted. May diverge from L1..L5 (e.g. user clicked the synthetic
  // child vs. its parent — same filter, different visual).
  selectedSiderKey: string;
  setSelectedSiderKey: (key: string) => void;

  // "Add folder" modal — lifted so the Sider tree (in MainLayout) can also trigger it
  addFolderModal: { parentId: number | null; parentName: string } | null;
  setAddFolderModal: (v: { parentId: number | null; parentName: string } | null) => void;
}

const KEY_EXPANDED = 'prd.categorySiderExpanded';
const KEY_INITIALIZED = 'prd.categorySiderInitialized';
const KEY_ACTIVE = 'prd.activeCategoryFilter';
const KEY_SELECTED = 'prd.selectedSiderKey';

const loadExpanded = (): string[] => {
  try {
    const v = localStorage.getItem(KEY_EXPANDED);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
};
const loadInitialized = (): boolean => localStorage.getItem(KEY_INITIALIZED) === '1';
const loadActive = (): { l1?: TabKey; l2?: TabKey; l3?: TabKey; l4?: TabKey; l5?: TabKey } | null => {
  try {
    const v = localStorage.getItem(KEY_ACTIVE);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
};
const persistActive = (s: { activeL1: TabKey; activeL2: TabKey; activeL3: TabKey; activeL4: TabKey; activeL5: TabKey }) => {
  try {
    localStorage.setItem(KEY_ACTIVE, JSON.stringify({
      l1: s.activeL1, l2: s.activeL2, l3: s.activeL3, l4: s.activeL4, l5: s.activeL5,
    }));
  } catch {}
};

export const useAppStore = create<AppState>((set, get) => {
  const stored = loadActive();
  return {
    sidebarCollapsed: false,
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    selectedProductId: null,
    setSelectedProductId: (id) => set({ selectedProductId: id }),

    categoryTree: [],
    setCategoryTree: (next) => set((s) => ({
      categoryTree: typeof next === 'function' ? (next as any)(s.categoryTree) : next,
    })),
    refetchCategoryTree: async () => {
      try {
        const raw = await fetchCategoryTree();
        set((s) => ({
          categoryTree: buildCategoryRowData(raw),
          treeRefetchVersion: s.treeRefetchVersion + 1,
        }));
      } catch (e) {
        console.error('refetchCategoryTree failed', e);
      }
    },
    treeRefetchVersion: 0,

    activeL1: stored?.l1 ?? 'all',
    activeL2: stored?.l2 ?? 'all',
    activeL3: stored?.l3 ?? 'all',
    activeL4: stored?.l4 ?? 'all',
    activeL5: stored?.l5 ?? 'all',
    setActiveL1: (k) => {
      set({ activeL1: k, activeL2: 'all', activeL3: 'all', activeL4: 'all', activeL5: 'all' });
      persistActive(get());
    },
    setActiveL2: (k) => {
      set({ activeL2: k, activeL3: 'all', activeL4: 'all', activeL5: 'all' });
      persistActive(get());
    },
    setActiveL3: (k) => {
      set({ activeL3: k, activeL4: 'all', activeL5: 'all' });
      persistActive(get());
    },
    setActiveL4: (k) => {
      set({ activeL4: k, activeL5: 'all' });
      persistActive(get());
    },
    setActiveL5: (k) => {
      set({ activeL5: k });
      persistActive(get());
    },
    setActiveCategoryPath: (p) => {
      set((s) => ({
        activeL1: p.l1 ?? s.activeL1,
        activeL2: p.l2 ?? 'all',
        activeL3: p.l3 ?? 'all',
        activeL4: p.l4 ?? 'all',
        activeL5: p.l5 ?? 'all',
      }));
      persistActive(get());
    },

    categorySiderExpanded: loadExpanded(),
    setCategorySiderExpanded: (keys) => {
      set({ categorySiderExpanded: keys });
      try { localStorage.setItem(KEY_EXPANDED, JSON.stringify(keys)); } catch {}
    },
    categorySiderInitialized: loadInitialized(),
    markCategorySiderInitialized: () => {
      set({ categorySiderInitialized: true });
      try { localStorage.setItem(KEY_INITIALIZED, '1'); } catch {}
    },

    addFolderModal: null,
    setAddFolderModal: (v) => set({ addFolderModal: v }),

    selectedSiderKey: (() => {
      const v = localStorage.getItem(KEY_SELECTED) || '';
      // Clear stale synthetic keys from earlier versions
      return v.startsWith('syn-all') ? '' : v;
    })(),
    setSelectedSiderKey: (key) => {
      set({ selectedSiderKey: key });
      try { localStorage.setItem(KEY_SELECTED, key); } catch {}
    },
  };
});
