import { useEffect, useState } from 'react';
import { Tree, Input, Badge, Spin } from 'antd';
import {
  FolderOutlined,
  FolderOpenOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { fetchCategoryTree } from '../api';
import { useAppStore } from '../store/app';
import type { DataNode } from 'antd/es/tree';

interface CategoryNode {
  id: number;
  code: string;
  name: string;
  level: number;
  children: CategoryNode[];
  totalProductCount: number;
  productCount: number;
}

interface Props {
  onSelect?: () => void;
}

export default function CategoryTree({ onSelect }: Props) {
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const { selectedCategoryId, setSelectedCategoryId } = useAppStore();

  useEffect(() => {
    loadTree();
  }, []);

  const loadTree = async () => {
    setLoading(true);
    try {
      const data = await fetchCategoryTree();
      const nodes = convertToTreeData(data);
      setTreeData(nodes);
      // Expand top-level by default
      setExpandedKeys(data.map((d: CategoryNode) => String(d.id)));
    } catch (e) {
      console.error('Failed to load tree', e);
    }
    setLoading(false);
  };

  const convertToTreeData = (nodes: CategoryNode[]): DataNode[] => {
    return nodes.map((node) => ({
      key: String(node.id),
      title: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <span style={{
            color: node.level === 0 ? '#fff' : 'rgba(255,255,255,0.85)',
            fontWeight: node.level === 0 ? 'bold' : 'normal',
            fontSize: node.level === 0 ? 14 : 13,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {node.code}..{node.name}
          </span>
          {node.totalProductCount > 0 && (
            <Badge
              count={node.totalProductCount}
              style={{
                backgroundColor: node.level === 0 ? '#1890ff' : '#52c41a',
                fontSize: 10,
                boxShadow: 'none',
              }}
              overflowCount={9999}
              size="small"
            />
          )}
        </span>
      ),
      icon: ({ expanded }: any) =>
        expanded ? <FolderOpenOutlined style={{ color: '#faad14' }} /> :
          <FolderOutlined style={{ color: '#faad14' }} />,
      children: node.children.length > 0 ? convertToTreeData(node.children) : undefined,
    }));
  };

  const handleSelect = (keys: React.Key[]) => {
    if (keys.length > 0) {
      setSelectedCategoryId(Number(keys[0]));
      onSelect?.();
    }
  };

  const handleSearch = (value: string) => {
    setSearchValue(value);
    // TODO: filter tree
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="small" />
      </div>
    );
  }

  return (
    <div className="category-tree" style={{ padding: '0 4px' }}>
      <div style={{ padding: '4px 8px 8px' }}>
        <Input
          prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
          placeholder="搜尋分類..."
          size="small"
          value={searchValue}
          onChange={(e) => handleSearch(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: '#fff',
          }}
          styles={{ input: { color: '#fff' } }}
        />
      </div>
      <Tree
        showIcon
        treeData={treeData}
        expandedKeys={expandedKeys}
        onExpand={(keys) => setExpandedKeys(keys)}
        selectedKeys={selectedCategoryId ? [String(selectedCategoryId)] : []}
        onSelect={handleSelect}
        style={{
          background: 'transparent',
          color: 'rgba(255,255,255,0.85)',
        }}
      />
    </div>
  );
}
