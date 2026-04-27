import { Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhTW from 'antd/locale/zh_TW';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import ProductEdit from './pages/ProductEdit';
import Quotation from './pages/Quotation';
import SystemPage from './pages/System';

export default function App() {
  return (
    <ConfigProvider locale={zhTW} theme={{ token: { colorPrimary: '#1890ff', fontSize: 12.32 } }}>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="edit" element={<ProductEdit />} />
          <Route path="quotation" element={<Quotation />} />
          <Route path="system" element={<SystemPage />} />
        </Route>
      </Routes>
    </ConfigProvider>
  );
}
