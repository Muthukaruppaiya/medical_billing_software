import { useState } from 'react';
import { FileUp, Keyboard } from 'lucide-react';
import PurchaseInvoice from '../components/purchase/PurchaseInvoice';
import PurchaseDocumentImport from '../components/purchase/PurchaseDocumentImport';

export default function NewPurchase() {
  const [mode, setMode] = useState('manual');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl w-fit border border-slate-200">
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            mode === 'manual'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <Keyboard className="w-4 h-4" />
          Manual Purchase
        </button>
        <button
          type="button"
          onClick={() => setMode('document')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            mode === 'document'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <FileUp className="w-4 h-4" />
          Upload Purchase Document
        </button>
      </div>

      {mode === 'manual' ? <PurchaseInvoice /> : <PurchaseDocumentImport />}
    </div>
  );
}
