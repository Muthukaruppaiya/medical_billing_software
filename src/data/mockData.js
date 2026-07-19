// ─── Mock Products ────────────────────────────────────────────────────────────
export const mockProducts = [
  { id: 1,  name: 'Paracetamol 500mg',     hsn: '30049099', category: 'Tablet',    mrp: 25.00,  rate: 20.00, cgst: 6, sgst: 6, stock: 450, minStock: 50,  expiry: '2026-12-31', batch: 'B001', manufacturer: 'Cipla' },
  { id: 2,  name: 'Amoxicillin 250mg',     hsn: '30041011', category: 'Capsule',   mrp: 85.00,  rate: 68.00, cgst: 6, sgst: 6, stock: 120, minStock: 30,  expiry: '2025-09-15', batch: 'A012', manufacturer: 'Sun Pharma' },
  { id: 3,  name: 'Cetirizine 10mg',       hsn: '30049099', category: 'Tablet',    mrp: 18.00,  rate: 14.00, cgst: 6, sgst: 6, stock: 280, minStock: 50,  expiry: '2026-06-30', batch: 'C003', manufacturer: 'Mankind' },
  { id: 4,  name: 'Omeprazole 20mg',       hsn: '30049099', category: 'Capsule',   mrp: 55.00,  rate: 44.00, cgst: 6, sgst: 6, stock: 15,  minStock: 30,  expiry: '2026-03-31', batch: 'O007', manufacturer: 'Dr. Reddy' },
  { id: 5,  name: 'Azithromycin 500mg',    hsn: '30041011', category: 'Tablet',    mrp: 95.00,  rate: 76.00, cgst: 6, sgst: 6, stock: 80,  minStock: 20,  expiry: '2026-11-30', batch: 'AZ01', manufacturer: 'Pfizer' },
  { id: 6,  name: 'Metformin 500mg',       hsn: '30049099', category: 'Tablet',    mrp: 30.00,  rate: 24.00, cgst: 6, sgst: 6, stock: 320, minStock: 60,  expiry: '2027-01-31', batch: 'M004', manufacturer: 'Cipla' },
  { id: 7,  name: 'Atorvastatin 10mg',     hsn: '30049099', category: 'Tablet',    mrp: 120.00, rate: 96.00, cgst: 6, sgst: 6, stock: 0,   minStock: 25,  expiry: '2026-08-31', batch: 'AT02', manufacturer: 'Sun Pharma' },
  { id: 8,  name: 'Dolo 650',             hsn: '30049099', category: 'Tablet',    mrp: 30.00,  rate: 24.00, cgst: 6, sgst: 6, stock: 560, minStock: 100, expiry: '2026-10-31', batch: 'D011', manufacturer: 'Micro Labs' },
  { id: 9,  name: 'Vitamin D3 60K IU',    hsn: '30049099', category: 'Capsule',   mrp: 180.00, rate: 144.00,cgst: 6, sgst: 6, stock: 45,  minStock: 20,  expiry: '2025-08-15', batch: 'VD01', manufacturer: 'Abbott' },
  { id: 10, name: 'Betadine 500ml',        hsn: '30049099', category: 'Liquid',    mrp: 145.00, rate: 116.00,cgst: 6, sgst: 6, stock: 60,  minStock: 15,  expiry: '2026-05-31', batch: 'BD03', manufacturer: 'Win-Medicare' },
  { id: 11, name: 'Pantoprazole 40mg',     hsn: '30049099', category: 'Tablet',    mrp: 75.00,  rate: 60.00, cgst: 6, sgst: 6, stock: 200, minStock: 40,  expiry: '2026-09-30', batch: 'PP05', manufacturer: 'Alkem' },
  { id: 12, name: 'Ibuprofen 400mg',       hsn: '30049099', category: 'Tablet',    mrp: 22.00,  rate: 17.60, cgst: 6, sgst: 6, stock: 8,   minStock: 30,  expiry: '2025-07-31', batch: 'IB09', manufacturer: 'Cipla' },
  { id: 13, name: 'Salbutamol Inhaler',    hsn: '30049099', category: 'Inhaler',   mrp: 250.00, rate: 200.00,cgst: 6, sgst: 6, stock: 30,  minStock: 10,  expiry: '2026-04-30', batch: 'SL02', manufacturer: 'GSK' },
  { id: 14, name: 'Insulin Glargine 3ml',  hsn: '30043900', category: 'Injection', mrp: 850.00, rate: 680.00,cgst: 6, sgst: 6, stock: 12,  minStock: 5,   expiry: '2025-06-30', batch: 'IN01', manufacturer: 'Sanofi' },
  { id: 15, name: 'Multivitamin Syrup',    hsn: '30049099', category: 'Syrup',     mrp: 110.00, rate: 88.00, cgst: 6, sgst: 6, stock: 75,  minStock: 20,  expiry: '2026-07-31', batch: 'MV06', manufacturer: 'Abbott' },
];

// ─── Mock Customers ───────────────────────────────────────────────────────────
export const mockCustomers = [
  { id: 1,  name: 'Rajesh Kumar',     phone: '9876543210', email: 'rajesh@email.com',    gstin: '',              address: '12, Gandhi Nagar, Chennai' },
  { id: 2,  name: 'Priya Sharma',     phone: '9865432101', email: 'priya@email.com',     gstin: '',              address: '45, Anna Salai, Chennai' },
  { id: 3,  name: 'Apollo Pharmacy',  phone: '9944332211', email: 'apollo@pharma.com',   gstin: '33AABCA1234B1Z5', address: '78, Mount Road, Chennai' },
  { id: 4,  name: 'MedPlus Stores',   phone: '9933221100', email: 'medplus@store.com',   gstin: '33BBBCA5678C2Z7', address: '23, Anna Nagar, Chennai' },
  { id: 5,  name: 'Anitha Devi',      phone: '9812345678', email: 'anitha@email.com',    gstin: '',              address: '67, T Nagar, Chennai' },
  { id: 6,  name: 'Global Medicals',  phone: '9922110033', email: 'global@medicals.com', gstin: '33CCCCA9012D3Z9', address: '34, Velachery, Chennai' },
];

// ─── Mock Suppliers ───────────────────────────────────────────────────────────
export const mockSuppliers = [
  { id: 1, name: 'Cipla Distributors',    phone: '9900112233', gstin: '27AABCC1234A1Z5', address: 'Mumbai' },
  { id: 2, name: 'Sun Pharma Depot',      phone: '9911223344', gstin: '27BBBCC5678B2Z7', address: 'Mumbai' },
  { id: 3, name: 'Mankind Pharma Ltd',    phone: '9922334455', gstin: '07CCCCA9012C3Z9', address: 'Delhi' },
  { id: 4, name: 'Dr. Reddys Dist.',      phone: '9933445566', gstin: '36DDDDA1234D4Z1', address: 'Hyderabad' },
  { id: 5, name: 'Abbott Healthcare',     phone: '9944556677', gstin: '27EEEEA5678E5Z3', address: 'Mumbai' },
];

// ─── Mock Invoices ────────────────────────────────────────────────────────────
export const mockInvoices = [
  { id: 'INV-150301', date: '25-05-2024', customer: 'Rajesh Kumar',    amount: 45230.00, tax: 2400.00, status: 'Paid',    type: 'sale' },
  { id: 'INV-150302', date: '27-04-2024', customer: 'Apollo Pharmacy', amount: 376.00,   tax: 40.00,   status: 'Unpaid',  type: 'sale' },
  { id: 'INV-150303', date: '18-04-2024', customer: 'Priya Sharma',    amount: 245.00,   tax: 26.00,   status: 'Paid',    type: 'sale' },
  { id: 'INV-150304', date: '15-04-2024', customer: 'MedPlus Stores',  amount: 1850.00,  tax: 196.00,  status: 'Paid',    type: 'sale' },
  { id: 'INV-150305', date: '10-04-2024', customer: 'Anitha Devi',     amount: 680.00,   tax: 72.00,   status: 'Pending', type: 'sale' },
  { id: 'INV-150306', date: '05-04-2024', customer: 'Global Medicals', amount: 3200.00,  tax: 340.00,  status: 'Paid',    type: 'sale' },
];

// ─── Mock Purchase Invoices ───────────────────────────────────────────────────
export const mockPurchaseInvoices = [
  { id: 'PUR-000101', date: '24-05-2024', supplier: 'Cipla Distributors', amount: 18500.00, status: 'Received' },
  { id: 'PUR-000102', date: '20-04-2024', supplier: 'Sun Pharma Depot',   amount: 32000.00, status: 'Received' },
  { id: 'PUR-000103', date: '15-04-2024', supplier: 'Mankind Pharma Ltd', amount: 9800.00,  status: 'Pending' },
];

// ─── Chart Data ───────────────────────────────────────────────────────────────
export const weeklyChartData = [
  { day: 'Mon', sales: 12400, purchases: 5200 },
  { day: 'Tue', sales: 8900,  purchases: 3100 },
  { day: 'Wed', sales: 15600, purchases: 7800 },
  { day: 'Thu', sales: 10200, purchases: 4400 },
  { day: 'Fri', sales: 18300, purchases: 9200 },
  { day: 'Sat', sales: 22100, purchases: 11500 },
  { day: 'Sun', sales: 9600,  purchases: 3800 },
];

export const categoryData = [
  { name: 'Tablets',    value: 42, color: '#3b82f6' },
  { name: 'Capsules',   value: 22, color: '#10b981' },
  { name: 'Syrups',     value: 15, color: '#f59e0b' },
  { name: 'Injections', value: 10, color: '#ef4444' },
  { name: 'Inhalers',   value: 6,  color: '#8b5cf6' },
  { name: 'Others',     value: 5,  color: '#06b6d4' },
];

// ─── Monthly trend for reports ────────────────────────────────────────────────
export const monthlyTrend = [
  { month: 'Jan', sales: 125000, purchases: 68000 },
  { month: 'Feb', sales: 138000, purchases: 72000 },
  { month: 'Mar', sales: 142000, purchases: 85000 },
  { month: 'Apr', sales: 165000, purchases: 91000 },
  { month: 'May', sales: 158000, purchases: 88000 },
  { month: 'Jun', sales: 172000, purchases: 95000 },
];

// ─── Company Info ─────────────────────────────────────────────────────────────
export const companyInfo = {
  name: 'MediCare Pharmacy',
  address: '190, Senary Address, Farasal Road, Munt Street, Bonm, Ben 593202',
  phone: '9876543210',
  email: 'medicare@pharmacy.com',
  gstin: '33AABCM1234M1Z5',
  drugLicense: 'TN/DL/2024/12345',
  state: 'Tamil Nadu',
  stateCode: '33',
};
