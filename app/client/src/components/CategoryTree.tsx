import { useEffect, useMemo, useState } from 'react';
import { Tree, Button, Tooltip, Input, Menu, Modal, message } from 'antd';
import { FolderAddOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore, type CategoryTreeRowData, type TabKey } from '../store/app';
import { updateCategory, deleteCategory } from '../api';
import type { DataNode } from 'antd/es/tree';
import type React from 'react';

const PROGRESS_COLORS: Record<string, string> = {
  '1-重要':   '#ff4d4f',
  '2-商品中': '#73d13d',
  '3-研發中': '#40a9ff',
  '4-評估中': '#ffc53d',
  '5-暫緩':   '#bfbfbf',
  '6-商品':   '#9254de',
  '7-停售':   '#bfbfbf',
};
const PROGRESS_ORDER = ['1-重要','2-商品中','3-研發中','4-評估中','5-暫緩','6-商品'];

function renderBadges(cat: CategoryTreeRowData): React.ReactNode {
  const subCats = (cat.children || []).filter((n) => n.nodeType === 'category');
  // Non-leaf: count subcategories by their own progress_note
  if (subCats.length > 0) {
    const counts: Record<string, number> = {};
    let unset = 0;
    for (const c of subCats) {
      const p = c.progress_note;
      if (p && PROGRESS_COLORS[p]) counts[p] = (counts[p] || 0) + 1;
      else unset++;
    }
    const parts: React.ReactNode[] = [
      <span key="_count" style={{ opacity: 0.55, fontSize: 11, marginLeft: 4 }}>({subCats.length})</span>,
    ];
    for (const key of PROGRESS_ORDER) {
      if (counts[key]) {
        parts.push(
          <span key={key} style={{ color: PROGRESS_COLORS[key], fontSize: 11, marginLeft: 4 }}>·{counts[key]}</span>
        );
      }
    }
    if (unset > 0) {
      parts.push(<span key="_unset" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 4 }}>·{unset}</span>);
    }
    return parts;
  }
  // Leaf: show direct product count + product breakdown by progress (square brackets distinguish from sub-cat badges)
  const totals = cat.productTotalsByProgress || {};
  const total = (cat.count as number | undefined) ?? 0;
  if (total === 0) return null;
  const parts: React.ReactNode[] = [
    <span key="_count" style={{ opacity: 0.55, fontSize: 11, marginLeft: 4 }}>[{total}]</span>,
  ];
  for (const key of PROGRESS_ORDER) {
    const n = totals[key];
    if (n) {
      parts.push(
        <span key={key} style={{ color: PROGRESS_COLORS[key], fontSize: 11, marginLeft: 4 }}>·{n}</span>
      );
    }
  }
  const unset = totals['_unset'];
  if (unset) {
    parts.push(<span key="_unset" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 4 }}>·{unset}</span>);
  }
  return parts;
}

function buildTreeNodes(
  treeData: CategoryTreeRowData[],
  renderTitle: (c: CategoryTreeRowData, depth: number) => React.ReactNode,
): DataNode[] {
  const build = (cats: CategoryTreeRowData[], depth: number): DataNode[] => {
    const out: DataNode[] = [];
    for (const c of cats.filter((n) => n.nodeType === 'category')) {
      const grand = build(c.children || [], depth + 1);
      out.push({
        key: c.key,
        title: renderTitle(c, depth),
        children: grand.length > 0 ? grand : undefined,
        isLeaf: grand.length === 0,
      });
    }
    return out;
  };
  return build(treeData, 0);
}

function collectAllKeys(nodes: DataNode[]): string[] {
  const keys: string[] = [];
  for (const n of nodes) {
    keys.push(String(n.key));
    if (n.children) keys.push(...collectAllKeys(n.children));
  }
  return keys;
}

// Find the path of category ids from root to the node with given id.
function findCategoryPath(tree: CategoryTreeRowData[], id: number): number[] | null {
  const path: number[] = [];
  const dfs = (nodes: CategoryTreeRowData[]): boolean => {
    for (const n of nodes) {
      if (n.nodeType !== 'category') continue;
      const nid = Number(n.key.replace('cat:', ''));
      path.push(nid);
      if (nid === id) return true;
      if (n.children && dfs(n.children)) return true;
      path.pop();
    }
    return false;
  };
  return dfs(tree) ? path : null;
}

function findCategoryById(tree: CategoryTreeRowData[], id: number): CategoryTreeRowData | null {
  for (const n of tree) {
    if (n.nodeType !== 'category') continue;
    if (Number(n.key.replace('cat:', '')) === id) return n;
    if (n.children) {
      const f = findCategoryById(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

// Returns parent (null = root level) of the category with the given id.
function findParentOf(tree: CategoryTreeRowData[], id: number): CategoryTreeRowData | null | undefined {
  // undefined = not found, null = found at root
  for (const n of tree) {
    if (n.nodeType !== 'category') continue;
    if (Number(n.key.replace('cat:', '')) === id) return null;
    const cats = (n.children || []).filter((c) => c.nodeType === 'category');
    if (cats.some((c) => Number(c.key.replace('cat:', '')) === id)) return n;
    if (n.children) {
      const r = findParentOf(n.children, id);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

export default function CategoryTree() {
  const navigate = useNavigate();
  const location = useLocation();
  const categoryTree = useAppStore((s) => s.categoryTree);
  const refetchCategoryTree = useAppStore((s) => s.refetchCategoryTree);
  const setActiveCategoryPath = useAppStore((s) => s.setActiveCategoryPath);
  const expanded = useAppStore((s) => s.categorySiderExpanded);
  const setExpanded = useAppStore((s) => s.setCategorySiderExpanded);
  const initialized = useAppStore((s) => s.categorySiderInitialized);
  const markInitialized = useAppStore((s) => s.markCategorySiderInitialized);
  const setAddFolderModal = useAppStore((s) => s.setAddFolderModal);
  const selectedSiderKey = useAppStore((s) => s.selectedSiderKey);
  const setSelectedSiderKey = useAppStore((s) => s.setSelectedSiderKey);

  useEffect(() => {
    if (categoryTree.length === 0) refetchCategoryTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inline rename for the category code (料號)
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // Right-click context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; key: string; name: string; code: string } | null>(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  const handleDelete = (catKey: string, label: string) => {
    Modal.confirm({
      title: `刪除「${label}」及其所有子分類與產品？`,
      content: '此動作無法復原（軟刪除）/ Cannot be undone (soft delete)',
      okText: '刪除 / Delete',
      cancelText: '取消 / Cancel',
      okButtonProps: { danger: true },
      onOk: async () => {
        const id = Number(catKey.replace('cat:', ''));
        try {
          const res = await deleteCategory(id);
          await refetchCategoryTree();
          message.success(`已刪除 ${res.categoryCount} 個資料夾及其產品 / Deleted ${res.categoryCount} folders`);
        } catch (e: any) {
          message.error(`刪除失敗 / Delete failed: ${e.message || ''}`);
        }
      },
    });
  };

  const commitEdit = async (cat: CategoryTreeRowData, rawValue: string) => {
    const trimmed = rawValue.trim();
    setEditingKey(null);
    if (!trimmed || trimmed === cat.code) return;
    const id = Number(cat.key.replace('cat:', ''));
    try {
      const res: any = await updateCategory(id, { code: trimmed });
      await refetchCategoryTree();
      const cascade = res?.cascade as { categories: number; products: number } | null | undefined;
      if (cascade && (cascade.categories > 0 || cascade.products > 0)) {
        message.success(
          `料號已更新，連動更新 ${cascade.categories} 個子資料夾、${cascade.products} 個產品 / Updated, cascade-renamed ${cascade.categories} sub-folders and ${cascade.products} products`,
        );
      } else {
        message.success('料號已更新 / Code updated');
      }
    } catch (e: any) {
      message.error(`更新失敗 / Update failed: ${e.message || ''}`);
    }
  };

  const renderTitle = (c: CategoryTreeRowData, depth: number): React.ReactNode => {
    const labelColor = c.progress_note && PROGRESS_COLORS[c.progress_note]
      ? PROGRESS_COLORS[c.progress_note]
      : depth === 0 ? '#ffffff' : 'rgba(255,255,255,0.85)';
    if (editingKey === c.key) {
      return (
        <Input
          size="small"
          autoFocus
          defaultValue={c.code}
          onPressEnter={(e) => commitEdit(c, (e.target as HTMLInputElement).value)}
          onBlur={(e) => commitEdit(c, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditingKey(null);
            e.stopPropagation();
          }}
          style={{ width: 'calc(100% - 8px)', fontSize: 12 }}
        />
      );
    }
    return (
      <span
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditingKey(c.key);
        }}
        title="雙擊修改料號 / Double-click to edit code"
      >
        <span style={{ color: labelColor, fontWeight: depth === 0 ? 600 : 400 }}>{c.code}</span>
        {renderBadges(c)}
      </span>
    );
  };

  const treeNodes = useMemo(
    () => buildTreeNodes(categoryTree, renderTitle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryTree, editingKey],
  );

  useEffect(() => {
    if (!initialized && treeNodes.length > 1) {
      setExpanded(collectAllKeys(treeNodes));
      markInitialized();
    }
  }, [initialized, treeNodes, setExpanded, markInitialized]);

  const goProductsIfNeeded = () => {
    if (!location.pathname.startsWith('/products')) navigate('/products');
  };

  const applyPath = (path: number[]) => {
    const p: { l1?: TabKey; l2?: TabKey; l3?: TabKey; l4?: TabKey; l5?: TabKey } = {};
    if (path[0] !== undefined) p.l1 = path[0];
    if (path[1] !== undefined) p.l2 = path[1];
    if (path[2] !== undefined) p.l3 = path[2];
    if (path[3] !== undefined) p.l4 = path[3];
    if (path[4] !== undefined) p.l5 = path[4];
    setActiveCategoryPath(p);
  };

  const handleDrop = async (info: any) => {
    const dragKey = String(info.dragNode.key);
    const dropKey = String(info.node.key);
    if (!dragKey.startsWith('cat:') || !dropKey.startsWith('cat:')) return;
    const dragId = Number(dragKey.replace('cat:', ''));
    const dropId = Number(dropKey.replace('cat:', ''));

    const dropPos: string[] = String(info.node.pos).split('-');
    const relativePos = info.dropPosition - Number(dropPos[dropPos.length - 1]);

    // Determine new parent id
    let newParentId: number | null = null;
    if (info.dropToGap) {
      // Dropped between siblings of `info.node` → new parent = drop target's parent
      const dp = findParentOf(categoryTree, dropId);
      newParentId = dp ? Number(dp.key.replace('cat:', '')) : null;
    } else {
      // Dropped INTO node → becomes its child
      newParentId = dropId;
    }

    // Prevent dropping onto self or own descendant (would create a cycle)
    if (newParentId === dragId) {
      message.warning('不能放入自己 / Cannot drop into itself');
      return;
    }
    if (newParentId !== null) {
      const draggedSubtree = findCategoryById(categoryTree, dragId);
      if (draggedSubtree && findCategoryById(draggedSubtree.children || [], newParentId)) {
        message.warning('不能放入自己的子分類 / Cannot drop into a descendant');
        return;
      }
    }

    // Build the new ordered sibling list of the new parent (excluding the dragged node).
    const newParentNode = newParentId !== null ? findCategoryById(categoryTree, newParentId) : null;
    const siblingsBase: CategoryTreeRowData[] = (
      (newParentId === null ? categoryTree : (newParentNode?.children || []))
    ).filter((c) => c.nodeType === 'category' && Number(c.key.replace('cat:', '')) !== dragId);

    let insertIndex: number;
    if (info.dropToGap) {
      const di = siblingsBase.findIndex((s) => Number(s.key.replace('cat:', '')) === dropId);
      if (di === -1) {
        insertIndex = siblingsBase.length;
      } else {
        insertIndex = relativePos > 0 ? di + 1 : di;
      }
    } else {
      insertIndex = siblingsBase.length; // append as last child
    }

    const draggedNode = findCategoryById(categoryTree, dragId);
    if (!draggedNode) return;
    const newOrder: CategoryTreeRowData[] = [
      ...siblingsBase.slice(0, insertIndex),
      draggedNode,
      ...siblingsBase.slice(insertIndex),
    ];

    const oldParent = findParentOf(categoryTree, dragId);
    const oldParentId = oldParent ? Number(oldParent.key.replace('cat:', '')) : null;
    const reparenting = oldParentId !== newParentId;

    // PATCH each affected sibling with its new sort_order. The dragged item also
    // gets parent_id when reparenting (server handles level recomputation).
    const patches: Promise<any>[] = [];
    for (let i = 0; i < newOrder.length; i++) {
      const cat = newOrder[i];
      const id = Number(cat.key.replace('cat:', ''));
      const data: { sort_order: number; parent_id?: number | null } = { sort_order: i };
      if (id === dragId && reparenting) data.parent_id = newParentId;
      patches.push(updateCategory(id, data));
    }
    // If reparenting, also re-number the OLD parent's remaining children to keep things tidy.
    if (reparenting) {
      const oldSiblings = (
        (oldParentId === null ? categoryTree : (findCategoryById(categoryTree, oldParentId)?.children || []))
      ).filter((c) => c.nodeType === 'category' && Number(c.key.replace('cat:', '')) !== dragId);
      for (let i = 0; i < oldSiblings.length; i++) {
        const id = Number(oldSiblings[i].key.replace('cat:', ''));
        patches.push(updateCategory(id, { sort_order: i }));
      }
    }

    try {
      await Promise.all(patches);
      await refetchCategoryTree();
      message.success('順序已更新 / Order updated');
    } catch (e: any) {
      message.error(`儲存失敗 / Save failed: ${e.message || ''}`);
      await refetchCategoryTree();
    }
  };

  const handleSelect = (keys: React.Key[]) => {
    if (keys.length === 0) {
      // Click on a selected node deselects → show everything
      setSelectedSiderKey('');
      setActiveCategoryPath({ l1: 'all' });
      return;
    }
    const key = String(keys[0]);
    setSelectedSiderKey(key);
    if (!key.startsWith('cat:')) return;
    const id = Number(key.replace('cat:', ''));
    const path = findCategoryPath(categoryTree, id);
    if (path) {
      applyPath(path.slice(0, 5));
      goProductsIfNeeded();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 4px',
        color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 0.5,
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ flex: 1 }}>分類 / CATEGORIES</span>
        <Tooltip title="新增根資料夾 / Add root folder">
          <Button
            size="small"
            type="text"
            icon={<FolderAddOutlined />}
            style={{ color: 'rgba(255,255,255,0.65)' }}
            onClick={() => {
              goProductsIfNeeded();
              setAddFolderModal({ parentId: null, parentName: '根 / Root' });
            }}
          />
        </Tooltip>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 4px 8px' }} className="prd-sider-tree">
        <Tree
          treeData={treeNodes}
          expandedKeys={expanded}
          onExpand={(keys) => setExpanded(keys.map(String))}
          selectedKeys={[selectedSiderKey]}
          onSelect={handleSelect}
          blockNode
          draggable={{
            icon: false,
            // Only real category nodes can be dragged (not synthetic "全部 / All")
            nodeDraggable: (node: any) => String(node.key).startsWith('cat:'),
          }}
          onDrop={handleDrop}
          onRightClick={({ event, node }) => {
            event.preventDefault();
            const k = String((node as any).key);
            if (!k.startsWith('cat:')) return;
            const cat = findCategoryById(categoryTree, Number(k.replace('cat:', '')));
            if (!cat) return;
            setCtxMenu({ x: event.clientX, y: event.clientY, key: k, name: cat.name, code: cat.code });
          }}
          style={{
            background: 'transparent',
            color: 'rgba(255,255,255,0.85)',
          }}
        />
        {ctxMenu && (
          <div
            style={{
              position: 'fixed',
              left: ctxMenu.x,
              top: ctxMenu.y,
              zIndex: 9999,
              boxShadow: '0 6px 16px rgba(0,0,0,0.16)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Menu
              style={{ minWidth: 220, border: '1px solid #f0f0f0' }}
              items={[
                { key: 'delete', label: `刪除「${ctxMenu.code}」 / Delete`, icon: <DeleteOutlined />, danger: true },
              ]}
              onClick={({ key }) => {
                const target = ctxMenu;
                setCtxMenu(null);
                if (!target) return;
                if (key === 'delete') handleDelete(target.key, `${target.code} ${target.name}`);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
