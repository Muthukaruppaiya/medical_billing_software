import { useState } from 'react';
import { FileUp, Keyboard } from 'lucide-react';
import PurchaseInvoice from '../components/purchase/PurchaseInvoice';
import PurchaseDocumentImport from '../components/purchase/PurchaseDocumentImport';

export default function NewPurchase() {
  const [mode, setMode] = useState('manual');

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Purchase</h1>
          <p className="page-subtitle">
            Record supplier stock manually or upload a purchase bill for review
          </p>
        </div>
        <span className="badge badge-info">v2.0</span>
      </div>

      <div className="mode-tabs">
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`mode-tab ${mode === 'manual' ? 'active' : ''}`}
        >
          <Keyboard className="w-4 h-4" />
          Manual Purchase
        </button>
        <button
          type="button"
          onClick={() => setMode('document')}
          className={`mode-tab ${mode === 'document' ? 'active' : ''}`}
        >
          <FileUp className="w-4 h-4" />
          Upload Purchase Document
        </button>
      </div>

      {mode === 'manual' ? <PurchaseInvoice /> : <PurchaseDocumentImport />}
    </div>
  );
}
