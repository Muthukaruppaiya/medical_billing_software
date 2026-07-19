import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../context/AppContext';

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-surface-border rounded-xl shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold" style={{ color: payload[0].payload.color }}>{payload[0].name}</p>
      <p className="text-slate-600">{payload[0].value}% of sales</p>
    </div>
  );
};

export default function CategoryDonut() {
  const { state } = useApp();

  // Calculate category totals dynamically from sales invoices
  const categoryTotals = {};
  let totalSalesVal = 0;

  state.invoices.forEach(inv => {
    if (inv.type === 'sale' && Array.isArray(inv.items)) {
      inv.items.forEach(item => {
        const category = item.product?.category || 'Others';
        const itemTotal = item.qty * item.rate;
        categoryTotals[category] = (categoryTotals[category] || 0) + itemTotal;
        totalSalesVal += itemTotal;
      });
    }
  });

  const colors = {
    'Tablet': '#3b82f6',
    'Capsule': '#10b981',
    'Syrup': '#f59e0b',
    'Injection': '#ef4444',
    'Inhaler': '#8b5cf6',
    'Liquid': '#06b6d4',
  };

  const categoryData = Object.keys(categoryTotals).map(cat => {
    const val = categoryTotals[cat];
    const percentage = totalSalesVal > 0 ? Math.round((val / totalSalesVal) * 100) : 0;
    return {
      name: cat + 's', // Plural name: e.g., Tablets, Capsules
      value: percentage,
      color: colors[cat] || '#64748b'
    };
  }).filter(c => c.value > 0);

  // Fallback state if no sales exist yet
  const finalCategoryData = categoryData.length > 0 ? categoryData : [
    { name: 'No Sales Data', value: 100, color: '#e2e8f0' }
  ];

  return (
    <div className="card flex flex-col h-full">
      <div className="mb-3">
        <h3 className="font-semibold text-slate-700">Category-wise Sales</h3>
        <p className="text-xs text-slate-400">Breakdown by product type</p>
      </div>
      <div className="flex-1" style={{ minHeight: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={finalCategoryData}
              cx="50%"
              cy="48%"
              innerRadius="42%"
              outerRadius="72%"
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {finalCategoryData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value, entry) => (
                <span style={{ color: '#64748b', fontSize: 11 }}>{value} ({entry.payload.value}%)</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
