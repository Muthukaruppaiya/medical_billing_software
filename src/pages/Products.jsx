import { useState } from 'react';
import { useApp } from '../context/AppContext';
import ProductTable from '../components/products/ProductTable';
import ProductModal from '../components/products/ProductModal';
import ProductDetailModal from '../components/products/ProductDetailModal';

export default function Products() {
  const { dispatch } = useApp();
  const [modal, setModal]       = useState(false);
  const [editing, setEditing]   = useState(null);
  const [viewing, setViewing]   = useState(null);  // product to show detail popup

  const handleAdd   = ()  => { setEditing(null); setModal(true); };
  const handleEdit  = (p) => { setEditing(p);    setModal(true); };
  const handleClose = ()  => setModal(false);
  const handleView  = (p) => setViewing(p);

  const handleSave = (form) => {
    if (editing) {
      dispatch({ type: 'UPDATE_PRODUCT', payload: form });
    } else {
      dispatch({ type: 'ADD_PRODUCT', payload: form });
    }
    setModal(false);
  };

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Products &amp; Inventory</h1>
          <p className="page-subtitle">Manage your pharmacy stock · Click any row number to view full details</p>
        </div>
      </div>

      <ProductTable onAdd={handleAdd} onEdit={handleEdit} onView={handleView} />

      {modal && (
        <ProductModal
          product={editing}
          onSave={handleSave}
          onClose={handleClose}
        />
      )}

      {viewing && (
        <ProductDetailModal
          product={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
