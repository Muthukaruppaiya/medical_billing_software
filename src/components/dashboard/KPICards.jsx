import { TrendingUp, TrendingDown, AlertTriangle, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import clsx from 'clsx';
import dayjs from 'dayjs';

function KPICard({ title, value, sub, icon: Icon, iconBg, trend, trendUp }) {
  return (
    <div className="card flex items-center justify-between gap-4 hover:shadow-card-hover transition-shadow">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-slate-800 mt-1 truncate">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className="flex flex-col items-center gap-2 flex-shrink-0">
        <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center', iconBg)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {trend != null && (
          <div className={clsx('flex items-center gap-0.5 text-xs font-semibold',
            trendUp ? 'text-success' : 'text-danger'
          )}>
            {trendUp
              ? <TrendingUp className="w-3 h-3" />
              : <TrendingDown className="w-3 h-3" />}
            {trend}%
          </div>
        )}
      </div>
    </div>
  );
}

export default function KPICards() {
  const { state } = useApp();

  const todayStr = dayjs().format('DD-MM-YYYY');
  const yesterdayStr = dayjs().subtract(1, 'day').format('DD-MM-YYYY');

  // Dynamic calculations
  const todaySales = state.invoices
    .filter(i => i.date === todayStr && i.type === 'sale')
    .reduce((s, i) => s + i.amount, 0);

  const yesterdaySales = state.invoices
    .filter(i => i.date === yesterdayStr && i.type === 'sale')
    .reduce((s, i) => s + i.amount, 0);

  const todayPurchases = state.purchaseInvoices
    .filter(i => i.date === todayStr)
    .reduce((s, i) => s + i.amount, 0);

  const todayPurchaseCount = state.purchaseInvoices
    .filter(i => i.date === todayStr).length;

  const lowStock = state.products.filter(p => p.stock > 0 && p.stock <= p.minStock).length
                 + state.products.filter(p => p.stock === 0).length;

  const expiringSoon = state.products.filter(p => {
    const diff = dayjs(p.expiry).diff(dayjs(), 'day');
    return diff <= 90 && diff > 0;
  }).length;

  // Trend calculation
  const salesDiff = todaySales - yesterdaySales;
  const trendPercent = yesterdaySales > 0 ? Math.round((salesDiff / yesterdaySales) * 100) : 0;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <KPICard
        title="Today's Sales"
        value={`₹${todaySales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
        sub={`vs ₹${yesterdaySales.toLocaleString('en-IN', { minimumFractionDigits: 2 })} yesterday`}
        icon={TrendingUp}
        iconBg="bg-primary-500"
        trend={yesterdaySales > 0 ? Math.abs(trendPercent) : null}
        trendUp={trendPercent >= 0}
      />
      <KPICard
        title="Today's Purchases"
        value={`₹${todayPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
        sub={`${todayPurchaseCount} purchase orders`}
        icon={TrendingDown}
        iconBg="bg-teal-500"
        trend={null}
        trendUp={false}
      />
      <KPICard
        title="Low Stock Alert"
        value={`${lowStock} items`}
        sub="Requires attention"
        icon={AlertTriangle}
        iconBg="bg-danger"
        trend={null}
      />
      <KPICard
        title="Expiring Soon"
        value={`${expiringSoon} items`}
        sub="Within 90 days"
        icon={Clock}
        iconBg="bg-warning"
        trend={null}
      />
    </div>
  );
}
