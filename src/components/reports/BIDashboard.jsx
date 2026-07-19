import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Activity, TrendingUp, CalendarDays, ShoppingBag } from 'lucide-react';
import dayjs from 'dayjs';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];

export default function BIDashboard() {
  const { state } = useApp();
  const [period, setPeriod] = useState('month');

  // --- KPI Data ---
  const saleInvoices = state.invoices.filter(i => i.type === 'sale');
  const totalSalesVal = saleInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);
  
  const todayDate = dayjs().format('DD-MM-YYYY');
  const todaySales = saleInvoices
    .filter(i => i.date === todayDate)
    .reduce((s, i) => s + Number(i.amount || 0), 0);

  // --- Sales by Category ---
  const categoryTotals = {};
  saleInvoices.forEach(inv => {
    if (Array.isArray(inv.items)) {
      inv.items.forEach(item => {
        const category = item.product?.category || 'Others';
        const itemTotal = item.qty * item.rate;
        categoryTotals[category] = (categoryTotals[category] || 0) + itemTotal;
      });
    }
  });

  const categoryData = Object.keys(categoryTotals).map(cat => {
    const val = categoryTotals[cat];
    const percentage = totalSalesVal > 0 ? Math.round((val / totalSalesVal) * 100) : 0;
    return { name: cat + 's', value: percentage };
  }).filter(c => c.value > 0);

  const finalCategoryData = categoryData.length > 0 ? categoryData : [
    { name: 'No Data', value: 100 }
  ];

  // --- Monthly Trend (Last 6 Months) ---
  const monthlyTrend = Array.from({ length: 6 }).map((_, idx) => {
    const d = dayjs().subtract(5 - idx, 'month');
    const monthName = d.format('MMM');
    const yearMonth = d.format('MM-YYYY');

    const sales = saleInvoices
      .filter(i => i.date.substring(3) === yearMonth)
      .reduce((sum, i) => sum + i.amount, 0);

    const purchases = state.purchaseInvoices
      .filter(i => i.date.substring(3) === yearMonth)
      .reduce((sum, i) => sum + i.amount, 0);

    return { month: monthName, sales, purchases };
  });

  // --- Daily Sales Heatmap/Chart (Last 14 Days) ---
  const dailyData = Array.from({ length: 14 }).map((_, idx) => {
    const d = dayjs().subtract(13 - idx, 'day');
    const dateStr = d.format('DD-MM-YYYY');
    const shortDate = d.format('DD MMM');
    
    const daySalesCount = saleInvoices.filter(i => i.date === dateStr).length;
    const daySalesAmount = saleInvoices
      .filter(i => i.date === dateStr)
      .reduce((sum, i) => sum + i.amount, 0);
      
    return { date: shortDate, count: daySalesCount, amount: daySalesAmount, fullDate: dateStr };
  });

  // Find the day with maximum sales amount
  let maxSaleDay = { date: 'N/A', amount: 0 };
  dailyData.forEach(d => {
    if (d.amount > maxSaleDay.amount) maxSaleDay = d;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Analytics KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card flex items-center gap-4 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-0 shadow-lg shadow-indigo-200">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-medium text-indigo-100 uppercase tracking-wider">Total Revenue</p>
            <p className="text-2xl font-bold">₹{totalSalesVal.toLocaleString('en-IN')}</p>
          </div>
        </div>

        <div className="card flex items-center gap-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg shadow-emerald-200">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-100 uppercase tracking-wider">Today's Sales</p>
            <p className="text-2xl font-bold">₹{todaySales.toLocaleString('en-IN')}</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
            <CalendarDays className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Best Sales Day (Last 14d)</p>
            <p className="text-xl font-bold text-slate-800">{maxSaleDay.date}</p>
            <p className="text-xs text-purple-600 font-semibold">₹{maxSaleDay.amount.toLocaleString('en-IN')}</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
            <ShoppingBag className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Order Value</p>
            <p className="text-xl font-bold text-slate-800">
              ₹{(totalSalesVal / (saleInvoices.length || 1)).toFixed(0)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Daily Sales Performance */}
        <div className="card col-span-1 lg:col-span-2 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Daily Sales Performance</h3>
              <p className="text-xs text-slate-500">Sales volume over the last 14 days to spot trends</p>
            </div>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip 
                  formatter={(value, name) => [name === 'amount' ? `₹${value.toLocaleString('en-IN')}` : value, name === 'amount' ? 'Revenue' : 'Invoices']}
                  labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
                />
                <Line type="monotone" dataKey="amount" name="amount" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sales by Category */}
        <div className="card shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-2">Category Breakdown</h3>
          <p className="text-xs text-slate-500 mb-6">Which types of medicines sell the most?</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={finalCategoryData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" paddingAngle={2} stroke="none">
                  {finalCategoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: '12px' }} formatter={v => <span className="text-slate-600 font-medium ml-1">{v}</span>} />
                <Tooltip 
                  formatter={(v) => [`${v}%`, 'Share']} 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly trend */}
        <div className="card shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-2">6-Month Trend</h3>
          <p className="text-xs text-slate-500 mb-6">Compare Sales vs Purchases month over month</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} barSize={16} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip 
                  formatter={v => `₹${v.toLocaleString('en-IN')}`}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
                <Bar dataKey="sales" name="Sales" fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="purchases" name="Purchases" fill="#f59e0b" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
