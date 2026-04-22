import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Table, Input, InputNumber, Select, Tag, Empty, Descriptions, Spin, message } from 'antd';
import { SearchOutlined, FolderOutlined, FileOutlined, EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { fetchCategoryTree, fetchProducts, searchProducts, updateProduct } from '../../api';
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
}

const PART_TYPE_COLORS: Record<string, string> = {
  C: 'blue', S: 'cyan', E: 'green', D: 'orange',
  A: 'purple', M: 'magenta', N: 'lime', B: 'gold',
  U: 'geekblue', F: 'volcano', P: 'red', J: 'default',
  X: 'default', W: 'default',
};

const PART_TYPES = ['C', 'S', 'E', 'D', 'A', 'M', 'N', 'B', 'U', 'F', 'P', 'J', 'X', 'W'];

// ── Build category tree into RowData ──

function buildCategoryTree(nodes: CategoryNode[]): RowData[] {
  return nodes.map((node) => ({
    key: `cat:${node.id}`,
    code: node.code,
    name: `${node.code}..${node.name}`,
    count: node.totalProductCount,
    totalCost: 0,
    nodeType: 'category' as const,
    children: node.children.length > 0
      ? buildCategoryTree(node.children)
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
  const [treeData, setTreeData] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ key: string; field: string } | null>(null);
  const loadedCategories = useRef<Set<string>>(new Set());

  const isEditing = (key: string, field: string) =>
    editingCell?.key === key && editingCell?.field === field;

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
        setTreeData(results.map(productToRow));
        setExpandedKeys([]);
      } else {
        const categories = await fetchCategoryTree();
        setTreeData(buildCategoryTree(categories));
        setExpandedKeys(categories.map((c: CategoryNode) => `cat:${c.id}`));
      }
    } catch (e) {
      console.error('Failed to load data', e);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { loadRoot(); }, [loadRoot]);

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
      const productRows = result.data.map(productToRow);

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
    if (String(value ?? '') === String(oldVal ?? '')) { setEditingCell(null); return; }
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

  const handleRowClick = (record: RowData) => {
    if (record.nodeType === 'product' && record.product) {
      setSelectedProduct(record.product);
      setSelectedProductId(record.product.id);
    }
  };

  const formatCurrency = (val: number | null) => {
    if (val == null) return '—';
    return `$${val.toLocaleString('zh-TW')}`;
  };

  // ── Clickable editable wrapper ──

  const editableCell = (record: RowData, field: string, display: React.ReactNode) => {
    if (record.nodeType !== 'product') return display;
    return (
      <span
        style={{ cursor: 'pointer', borderBottom: '1px dashed #d9d9d9', display: 'inline-block', minWidth: 30 }}
        onClick={(e) => { e.stopPropagation(); setEditingCell({ key: record.key, field }); }}
      >
        {display} <EditOutlined style={{ fontSize: 10, color: '#bbb', marginLeft: 2 }} />
      </span>
    );
  };

  // ── Columns ──

  const columns = [
    {
      title: t('products.pn'),
      dataIndex: 'code',
      key: 'code',
      width: 240,
      render: (code: string, record: RowData) => {
        const icon = record.nodeType === 'product'
          ? <FileOutlined style={{ marginRight: 6, color: '#1890ff' }} />
          : <FolderOutlined style={{ marginRight: 6, color: '#faad14' }} />;

        if (record.nodeType === 'product' && isEditing(record.key, 'pn')) {
          return (
            <span>
              {icon}
              <EditableText
                value={record.product?.pn || ''}
                onSave={(v) => saveField(record, 'pn', v || null)}
                style={{ fontFamily: 'monospace', fontSize: 12, width: 170 }}
              />
            </span>
          );
        }

        return (
          <span>
            {icon}
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
      render: (name: string, record: RowData) => {
        if (record.nodeType === 'category') return <strong>{name}</strong>;
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
      render: (_: any, record: RowData) => {
        if (record.nodeType === 'category') return <Tag>{record.count}</Tag>;
        if (isEditing(record.key, 'part_type')) {
          return (
            <Select
              size="small"
              autoFocus
              open
              defaultValue={record.product?.part_type || undefined}
              style={{ width: 110 }}
              allowClear
              onClick={(e) => e.stopPropagation()}
              onChange={(v) => saveField(record, 'part_type', v || null)}
              onBlur={() => setEditingCell(null)}
              options={PART_TYPES.map((pt) => ({
                value: pt,
                label: `${t(`partTypes.${pt}`)} (${pt})`,
              }))}
            />
          );
        }
        const type = record.product?.part_type;
        const display = type ? (
          <Tag color={PART_TYPE_COLORS[type] || 'default'}>{t(`partTypes.${type}`, type)}</Tag>
        ) : <span style={{ color: '#ccc' }}>—</span>;
        return editableCell(record, 'part_type', display);
      },
    },
    {
      title: t('products.cost'),
      key: 'cost',
      width: 110,
      align: 'right' as const,
      render: (_: any, record: RowData) => {
        if (record.nodeType === 'category') return null;
        if (isEditing(record.key, 'cost')) {
          return <EditableNumber value={record.product?.cost ?? null} onSave={(v) => saveField(record, 'cost', v)} min={0} />;
        }
        return editableCell(record, 'cost', formatCurrency(record.product?.cost ?? null));
      },
    },
    {
      title: t('products.quantity'),
      key: 'quantity',
      width: 80,
      align: 'right' as const,
      render: (_: any, record: RowData) => {
        if (record.nodeType === 'category') return null;
        if (isEditing(record.key, 'quantity')) {
          return <EditableNumber value={record.product?.quantity ?? null} onSave={(v) => saveField(record, 'quantity', v)} min={0} />;
        }
        return editableCell(record, 'quantity', <span>{record.product?.quantity ?? '—'}</span>);
      },
    },
    {
      title: t('products.unitPrice'),
      key: 'unit_price',
      width: 110,
      align: 'right' as const,
      render: (_: any, record: RowData) => {
        if (record.nodeType === 'category') return null;
        if (isEditing(record.key, 'unit_price')) {
          return <EditableNumber value={record.product?.unit_price ?? null} onSave={(v) => saveField(record, 'unit_price', v)} min={0} />;
        }
        return editableCell(record, 'unit_price', formatCurrency(record.product?.unit_price ?? null));
      },
    },
    {
      title: t('products.owner'),
      key: 'owner',
      width: 90,
      render: (_: any, record: RowData) => {
        if (record.nodeType === 'category') return null;
        if (isEditing(record.key, 'owner')) {
          return (
            <EditableText
              value={record.product?.owner || ''}
              onSave={(v) => saveField(record, 'owner', v || null)}
            />
          );
        }
        return editableCell(record, 'owner', <span>{record.product?.owner || '—'}</span>);
      },
    },
    {
      title: t('products.keynote'),
      key: 'keynote',
      width: 200,
      ellipsis: true,
      render: (_: any, record: RowData) => {
        if (record.nodeType === 'category') return null;
        if (isEditing(record.key, 'keynote')) {
          return (
            <EditableText
              value={record.product?.keynote || ''}
              onSave={(v) => saveField(record, 'keynote', v || null)}
            />
          );
        }
        const text = record.product?.keynote;
        const display = text
          ? <span style={{ fontSize: 12, color: '#fa8c16' }}>📌 {text}</span>
          : <span style={{ color: '#ccc' }}>—</span>;
        return editableCell(record, 'keynote', display);
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
      {/* Top: Product tree table */}
      <Card
        style={{ flex: 1, overflow: 'auto', marginBottom: 12 }}
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
          </div>
        }
      >
        <Table
          columns={columns as any}
          dataSource={treeData}
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ x: 800, y: 'calc(50vh - 200px)' }}
          expandable={{
            expandedRowKeys: expandedKeys as string[],
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
          onRow={(record) => ({
            onClick: () => {
              if (record.nodeType === 'category') {
                const isExpanded = expandedKeys.includes(record.key);
                const newKeys = isExpanded
                  ? expandedKeys.filter((k) => k !== record.key)
                  : [...expandedKeys, record.key];
                handleExpand(newKeys, { node: record, expanded: !isExpanded });
              }
              handleRowClick(record);
            },
            style: {
              cursor: 'pointer',
              backgroundColor: selectedProductId === record.product?.id ? '#e6f7ff' : undefined,
            },
            className: 'prd-row-hover',
          })}
        />
      </Card>

      {/* Bottom: Product detail — all fields editable */}
      <Card title={t('products.details')} style={{ flex: 1, overflow: 'auto' }}>
        {selectedProduct ? (
          <ProductDetail
            product={selectedProduct}
            onSave={(updated) => {
              setSelectedProduct(updated);
              setTreeData((prev) => updateNodeInTree(prev, `prod:${updated.id}`, {
                code: updated.pn || String(updated.id),
                name: updated.name,
                count: updated.quantity || 0,
                totalCost: updated.total_price || 0,
                product: updated,
              }));
            }}
          />
        ) : (
          <Empty description={t('products.selectProduct')} />
        )}
      </Card>
    </div>
  );
}

// ── Product Detail Panel (all fields editable) ──

function ProductDetail({ product, onSave }: { product: Product; onSave: (p: Product) => void }) {
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
}
