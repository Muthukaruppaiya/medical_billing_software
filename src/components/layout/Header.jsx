import { Bell, Search, ChevronDown } from 'lucide-react';
import dayjs from 'dayjs';
import { useApp } from '../../context/AppContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { expiryDaysLeft, formatExpiry } from '../../utils/expiry';

export default function Header() {
  const { state } = useApp();
  const navigate  = useNavigate();
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotif, setShowNotif] = useState(false);

  const handleSearch = (e) => {
    const q = e.target.value;
    setQuery(q);
    if (q.length > 1) {
      const found = state.products.filter(p =>
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.hsn.includes(q)
      ).slice(0, 5);
      setResults(found);
      setShowDropdown(found.length > 0);
    } else {
      setShowDropdown(false);
    }
  };

  // Notifications count and lists
  const lowStockList = state.products.filter(p => p.stock > 0 && p.stock <= (p.minStock || 5));
  const outStockList = state.products.filter(p => p.stock === 0);
  const expiringList = state.products.filter(p => {
    const diff = expiryDaysLeft(p.expiry);
    return diff != null && diff <= 90 && diff > 0;
  });
  
  const notifCount = lowStockList.length + outStockList.length + expiringList.length;

  return (
    <header className="h-15 min-h-[3.75rem] bg-white/90 backdrop-blur border-b border-surface-border px-6 flex items-center justify-between flex-shrink-0 z-30 shadow-sm">
      {/* Left: date */}
      <div className="text-sm text-slate-500 font-semibold hidden md:block">
        {dayjs().format('ddd, DD MMM YYYY')} &nbsp;·&nbsp; {dayjs().format('hh:mm A')}
      </div>

      {/* Center: search */}
      <div className="relative flex-1 max-w-md mx-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={handleSearch}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder="Search products, invoices..."
          className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-surface-border
                     rounded-full focus:outline-none focus:ring-2 focus:ring-primary-300
                     focus:bg-white transition-all"
        />
        {showDropdown && (
          <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl shadow-lg border
                          border-surface-border z-50 overflow-hidden animate-fade-in">
            {results.map(p => (
              <button
                key={p.id}
                onMouseDown={() => { navigate('/products'); setQuery(''); setShowDropdown(false); }}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50
                           text-sm text-left border-b border-surface-border last:border-0"
              >
                <span className="font-medium text-slate-700">{p.name}</span>
                <span className="text-slate-400 text-xs">HSN: {p.hsn}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: notif + avatar */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div className="relative">
          <button 
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center
                       justify-center text-slate-500 hover:text-slate-700 transition-colors"
            onClick={() => setShowNotif(!showNotif)}
            onBlur={() => setTimeout(() => setShowNotif(false), 200)}
          >
            <Bell className="w-5 h-5" />
          </button>
          {notifCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-danger
                             text-white text-[10px] font-bold flex items-center justify-center">
              {notifCount}
            </span>
          )}
          {showNotif && notifCount > 0 && (
            <div className="absolute top-full mt-2 right-0 w-80 bg-white rounded-xl shadow-lg border
                            border-surface-border z-50 overflow-hidden animate-fade-in max-h-96 overflow-y-auto">
              <div className="px-4 py-3 border-b border-surface-border font-semibold text-slate-700">
                Alerts ({notifCount})
              </div>
              {outStockList.map(p => (
                <div key={'out_'+p.id} className="px-4 py-3 border-b border-surface-border hover:bg-slate-50 text-sm">
                  <div className="font-medium text-slate-800">{p.name}</div>
                  <div className="text-danger font-semibold text-xs mt-0.5">Out of Stock!</div>
                </div>
              ))}
              {lowStockList.map(p => (
                <div key={'low_'+p.id} className="px-4 py-3 border-b border-surface-border hover:bg-slate-50 text-sm">
                  <div className="font-medium text-slate-800">{p.name}</div>
                  <div className="text-warning font-semibold text-xs mt-0.5">Low Stock: {p.stock} units left</div>
                </div>
              ))}
              {expiringList.map(p => (
                <div key={'exp_'+p.id} className="px-4 py-3 border-b border-surface-border hover:bg-slate-50 text-sm">
                  <div className="font-medium text-slate-800">{p.name}</div>
                  <div className="text-amber-600 font-semibold text-xs mt-0.5">EXP {formatExpiry(p.expiry)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-full px-2 py-1 transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600
                          flex items-center justify-center text-white text-xs font-bold">
            AD
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </div>
    </header>
  );
}
