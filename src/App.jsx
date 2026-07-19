import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import MainLayout  from './components/layout/MainLayout';
import Dashboard   from './pages/Dashboard';
import NewSale     from './pages/NewSale';
import NewPurchase from './pages/NewPurchase';
import Products    from './pages/Products';
import Customers   from './pages/Customers';
import Suppliers   from './pages/Suppliers';
import Reports     from './pages/Reports';
import Settings    from './pages/Settings';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route index            element={<Dashboard />} />
            <Route path="new-sale"     element={<NewSale />} />
            <Route path="new-purchase" element={<NewPurchase />} />
            <Route path="products"     element={<Products />} />
            <Route path="customers"    element={<Customers />} />
            <Route path="suppliers"    element={<Suppliers />} />
            <Route path="reports"      element={<Navigate to="/reports/sales" replace />} />
            <Route path="reports/sales"    element={<Reports />} />
            <Route path="reports/purchase" element={<Reports />} />
            <Route path="reports/expiry"   element={<Reports />} />
            <Route path="settings"     element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
