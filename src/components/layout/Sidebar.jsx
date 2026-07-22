import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import clsx from 'clsx';
import {
  LayoutDashboard, ShoppingCart, PackagePlus, Package,
  Users, BarChart2, Settings, ChevronLeft, ChevronRight,
  ChevronDown, Pill, ClipboardList, TrendingUp, Calendar, Truck,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { label: 'Dashboard',    icon: LayoutDashboard, to: '/' },
  { label: 'New Sale',     icon: ShoppingCart,    to: '/new-sale' },
  { label: 'New Purchase', icon: PackagePlus,     to: '/new-purchase' },
  { label: 'Products',     icon: Package,         to: '/products' },
  { label: 'Customers',    icon: Users,           to: '/customers' },
  { label: 'Suppliers',    icon: Truck,           to: '/suppliers' },
  {
    label: 'Reports', icon: BarChart2, children: [
      { label: 'Sales Report',    icon: TrendingUp,   to: '/reports/sales' },
      { label: 'Purchase Report', icon: ClipboardList,to: '/reports/purchase' },
      { label: 'Expiry Report',   icon: Calendar,     to: '/reports/expiry' },
    ],
  },
  { label: 'Backup & Settings', icon: Settings, to: '/settings' },
];

export default function Sidebar() {
  const { state, dispatch } = useApp();
  const collapsed = state.sidebarCollapsed;
  const location  = useLocation();
  const [reportsOpen, setReportsOpen] = useState(
    location.pathname.startsWith('/reports')
  );

  return (
    <aside
      className={clsx(
        'flex flex-col h-screen bg-sidebar-bg shadow-sidebar transition-all duration-300 z-40 flex-shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* ── Brand ── */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
        {!collapsed && (
          <div className="flex items-center gap-2 animate-fade-in">
            <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
              <Pill className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">MediCare</p>
              <p className="text-slate-400 text-[10px]">Pharmacy POS · v2</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center mx-auto">
            <Pill className="w-4 h-4 text-white" />
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className="w-6 h-6 rounded-md bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          if (item.children) {
            const isActive = location.pathname.startsWith('/reports');
            return (
              <div key={item.label}>
                <button
                  onClick={() => !collapsed && setReportsOpen(p => !p)}
                  className={clsx(
                    'sidebar-item w-full',
                    isActive && 'active',
                    collapsed && 'justify-center'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-4.5 h-4.5 flex-shrink-0 w-5 h-5" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown
                        className={clsx('w-3.5 h-3.5 transition-transform', reportsOpen && 'rotate-180')}
                      />
                    </>
                  )}
                </button>
                {!collapsed && reportsOpen && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-700 pl-3 animate-fade-in">
                    {item.children.map(child => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={({ isActive }) =>
                          clsx('sidebar-item text-xs', isActive && 'active')
                        }
                      >
                        <child.icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                clsx('sidebar-item', isActive && 'active', collapsed && 'justify-center')
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* ── Collapse toggle (when collapsed) ── */}
      {collapsed && (
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className="mx-2 mb-4 w-12 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* ── Bottom user strip ── */}
      {!collapsed && (
        <div className="px-3 py-3 border-t border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold">
              AD
            </div>
            <div>
              <p className="text-white text-xs font-semibold">Admin</p>
              <p className="text-slate-400 text-[10px]">Super Admin</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
