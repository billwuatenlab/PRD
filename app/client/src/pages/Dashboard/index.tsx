import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Spin } from 'antd';
import {
  DatabaseOutlined,
  AppstoreOutlined,
  UserOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { fetchStats } from '../../api';

interface Stats {
  totalProducts: number;
  totalCategories: number;
  owners: { owner: string; count: number }[];
  partTypes: { part_type: string; count: number }[];
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  if (!stats) return null;

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>{t('menu.dashboard')}</h2>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title={t('dashboard.totalProducts')}
              value={stats.totalProducts}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title={t('dashboard.totalCategories')}
              value={stats.totalCategories}
              prefix={<AppstoreOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title={t('dashboard.totalOwners')}
              value={stats.owners?.length || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title={t('dashboard.totalPartTypes')}
              value={stats.partTypes?.length || 0}
              prefix={<TagsOutlined />}
              valueStyle={{ color: '#eb2f96' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title={t('dashboard.byOwner')} size="small">
            {stats.owners?.map((o) => (
              <div key={o.owner} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span>{o.owner || '—'}</span>
                <span style={{ color: '#1890ff', fontWeight: 'bold' }}>{o.count}</span>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={t('dashboard.byPartType')} size="small">
            {stats.partTypes?.map((p) => (
              <div key={p.part_type} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span>{t(`partTypes.${p.part_type}`, p.part_type)}</span>
                <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{p.count}</span>
              </div>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
