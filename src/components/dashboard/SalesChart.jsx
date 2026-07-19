import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { useApp } from '../../context/AppContext';
import dayjs from 'dayjs';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-surface-border rounded-xl shadow-lg px-4 py-3">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="text-sm" style={{ color: p.fill }}>
          {p.name}: ₹{p.value.toLocaleString('en-IN')}
        </p>
      ))}
    </div>
  );
};

export default function SalesChart() {
  const { state } = useApp();

  // Generate last 7 days of data dynamically
  const weeklyChartData = Array.from({ length: 7 }).map((_, idx) => {
    const d = dayjs().subtract(6 - idx, 'day');
    const dayName = d.format('ddd'); // e.g. Mon, Tue
    const dateStr = d.format('DD-MM-YYYY');

    const sales = state.invoices
      .filter(i => i.date === dateStr && i.type === 'sale')
      .reduce((sum, i) => sum + i.amount, 0);

    const purchases = state.purchaseInvoices
      .filter(i => i.date === dateStr)
      .reduce((sum, i) => sum + i.amount, 0);

    return { day: dayName, sales, purchases };
  });
  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-700">Charts Section</h3>
          <p className="text-xs text-slate-400">Sales vs Purchases — Last 7 days</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-primary-500 inline-block" />
            Last 7 days
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-warning inline-block" />
            Purchases
          </span>
        </div>
      </div>
      <div className="flex-1" style={{ minHeight: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeklyChartData} barSize={14} barGap={4}
                    margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
            <Bar dataKey="sales"     name="Sales"    fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="purchases" name="Purchases" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
