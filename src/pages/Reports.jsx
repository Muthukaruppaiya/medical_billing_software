import { NavLink, Outlet, useLocation } from 'react-router-dom';
import BIDashboard     from '../components/reports/BIDashboard';
import SalesReport    from '../components/reports/SalesReport';
import PurchaseReport from '../components/reports/PurchaseReport';
import ExpiryReport   from '../components/reports/ExpiryReport';
import { TrendingUp, ClipboardList, Calendar, BarChart3 } from 'lucide-react';

const tabs = [
  { label: 'BI Analytics',    to: '/reports',          icon: BarChart3     },
  { label: 'Sales Report',    to: '/reports/sales',    icon: TrendingUp    },
  { label: 'Purchase Report', to: '/reports/purchase', icon: ClipboardList },
  { label: 'Expiry Report',   to: '/reports/expiry',   icon: Calendar      },
];

export default function Reports() {
  const location = useLocation();

  const renderContent = () => {
    if (location.pathname === '/reports/sales')    return <SalesReport />;
    if (location.pathname === '/reports/purchase') return <PurchaseReport />;
    if (location.pathname === '/reports/expiry')   return <ExpiryReport />;
    return <BIDashboard />; // Default is /reports
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Pharmacy analytics and insights</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-surface-border pb-0">
        {tabs.map(t => {
          const active = location.pathname === t.to;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px
                ${active
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </NavLink>
          );
        })}
      </div>

      <div className="animate-fade-in">
        {renderContent()}
      </div>
    </div>
  );
}
