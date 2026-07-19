import clsx from 'clsx';

export default function StockBadge({ stock, minStock }) {
  if (stock === 0) return <span className="badge badge-danger">Out of Stock</span>;
  if (stock <= minStock) return <span className="badge badge-warning">Low Stock</span>;
  return <span className="badge badge-success">In Stock</span>;
}
