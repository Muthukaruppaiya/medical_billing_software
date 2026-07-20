import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import KPICards      from '../components/dashboard/KPICards';
import SalesChart    from '../components/dashboard/SalesChart';
import CategoryDonut from '../components/dashboard/CategoryDonut';
import RecentTable   from '../components/dashboard/RecentTable';
import { Plus, ShoppingCart, PackagePlus, BarChart2, AlertTriangle } from 'lucide-react';
import { expiryDaysLeft, formatExpiry } from '../utils/expiry';

export default function Dashboard() {
  const navigate = useNavigate();
  const { state } = useApp();

  const outStockList = state.products.filter(p => p.stock === 0);
  const lowStockList = state.products.filter(p => p.stock > 0 && p.stock <= (p.minStock || 5));
  const expiringList = state.products.flatMap(product =>
    (product.batches || [])
      .map(batch => ({
        ...batch,
        name: product.name,
        daysLeft: expiryDaysLeft(batch.expiry),
      }))
      .filter(batch => batch.expiry && batch.stock > 0 && batch.daysLeft != null && batch.daysLeft <= 90 && batch.daysLeft > 0)
  );

  const alerts = [
    ...outStockList.map(p => `🚨 ${p.name} is OUT OF STOCK`),
    ...lowStockList.map(p => `⚠️ ${p.name} is Low Stock (${p.stock} left)`),
    ...expiringList.map(p => `⏳ ${p.name} batch ${p.batch} EXP ${formatExpiry(p.expiry)}`)
  ];

  return (
    <div className="space-y-6">
      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-3 overflow-hidden shadow-sm">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 animate-pulse z-10" />
          <div className="flex-1 overflow-hidden relative h-6 w-full">
            <div className="whitespace-nowrap absolute animate-marquee">
              {alerts.map((a, i) => (
                <span key={i} className="text-red-700 font-medium mr-12 text-sm">{a}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick action buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => navigate('/new-sale')}
          className="quick-btn bg-gradient-to-r from-primary-500 to-primary-600 text-white"
        >
          <Plus className="w-4 h-4" />
          New Sale
        </button>
        <button
          onClick={() => navigate('/new-purchase')}
          className="quick-btn bg-gradient-to-r from-teal-400 to-teal-500 text-white"
        >
          <Plus className="w-4 h-4" />
          New Purchase
        </button>
        <button
          onClick={() => navigate('/products')}
          className="quick-btn bg-gradient-to-r from-emerald-400 to-emerald-500 text-white"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
        <button
          onClick={() => navigate('/reports/sales')}
          className="quick-btn bg-gradient-to-r from-violet-400 to-violet-500 text-white"
        >
          <BarChart2 className="w-4 h-4" />
          View Reports
        </button>
      </div>

      {/* KPI cards */}
      <KPICards />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ minHeight: 280 }}>
        <div className="lg:col-span-2">
          <SalesChart />
        </div>
        <CategoryDonut />
      </div>

      {/* Recent transactions */}
      <RecentTable />
    </div>
  );
}
