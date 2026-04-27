import { useState, useEffect } from 'react';
import { Layout, Menu, Button, Tooltip, Drawer } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  EditOutlined,
  FileTextOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  GlobalOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/app';
import CategoryTree from '../components/CategoryTree';

const { Sider, Content, Header } = Layout;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function MainLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'zh-TW' ? 'en' : 'zh-TW');
  };

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: t('menu.dashboard') },
    { key: '/products', icon: <AppstoreOutlined />, label: t('menu.products') },
    { key: '/edit', icon: <EditOutlined />, label: t('menu.edit') },
    { key: '/quotation', icon: <FileTextOutlined />, label: t('menu.quotation') },
    { key: '/system', icon: <SettingOutlined />, label: t('menu.system') },
  ];

  const menuContent = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[location.pathname]}
      items={menuItems}
      onClick={({ key }) => { navigate(key); if (isMobile) setDrawerOpen(false); }}
    />
  );

  const onProductsPage = location.pathname.startsWith('/products');

  const siderInner = (showTree: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flexShrink: 0 }}>{menuContent}</div>
      {showTree && onProductsPage && <CategoryTree />}
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={220}
          styles={{ body: { padding: 0, background: '#001529' } }}
          closable={false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div style={{
              height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 20, fontWeight: 'bold', background: '#001529', gap: 8, flexShrink: 0,
            }}>
              <DatabaseOutlined />
              {t('app.title')}
            </div>
            {siderInner(true)}
          </div>
        </Drawer>
      )}

      {!isMobile && (
        <Sider
          trigger={null}
          collapsible
          collapsed={sidebarCollapsed}
          style={{ background: '#001529', height: '100vh', position: 'sticky', top: 0, overflow: 'hidden' }}
          width={240}
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div style={{
              height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: sidebarCollapsed ? 16 : 20, fontWeight: 'bold', gap: 8, flexShrink: 0,
            }}>
              <DatabaseOutlined />
              {!sidebarCollapsed && t('app.shortTitle')}
            </div>
            {siderInner(!sidebarCollapsed)}
          </div>
        </Sider>
      )}

      <Layout>
        <Header style={{
          background: '#fff', padding: '0 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <Button
            type="text"
            icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={isMobile ? () => setDrawerOpen(true) : toggleSidebar}
          />
          <Tooltip title={i18n.language === 'zh-TW' ? 'Switch to English' : '切換至中文'}>
            <Button type="text" icon={<GlobalOutlined />} onClick={toggleLang}>
              {i18n.language === 'zh-TW' ? 'EN' : '中'}
            </Button>
          </Tooltip>
        </Header>

        <Content style={{ flex: 1, padding: isMobile ? 12 : 24, overflow: 'auto', background: '#f5f5f5' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
