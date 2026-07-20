import { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Upload, Download, FileSpreadsheet, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

const inferCategory = value => {
  const text = value.toLowerCase();
  if (/\b(tablet|tablets|tab)\b/.test(text)) return 'Tablet';
  if (/\b(capsule|capsules|cap)\b/.test(text)) return 'Capsule';
  if (/\b(syrup|suspension)\b/.test(text)) return 'Syrup';
  if (/\b(injection|injectable|cartridge|penfill|flexpen|vial)\b/.test(text)) return 'Injection';
  if (/\b(inhaler|respule)\b/.test(text)) return 'Inhaler';
  if (/\b(cream|ointment|gel|lotion)\b/.test(text)) return 'Ointment';
  if (/\b(drops|solution|liquid)\b/.test(text)) return 'Liquid';
  return 'Others';
};

const inferPackType = value => {
  const text = value.toLowerCase();
  if (/\b(strip|tablet|tablets|capsule|capsules|tab|cap)\b/.test(text)) return 'Strip';
  if (/\b(bottle|syrup|drops|solution|suspension)\b/.test(text)) return 'Bottle';
  if (/\b(vial|injection|injectable)\b/.test(text)) return 'Vial';
  if (/\b(cream|ointment|gel|lotion)\b/.test(text)) return 'Tube';
  if (/\b(box|cartridge|penfill|flexpen)\b/.test(text)) return 'Box';
  return '';
};

const normalizeKaggleDrug = rawValue => {
  const catalogKey = String(rawValue || '').trim();
  const withoutSourceId = catalogKey.replace(/-\d+$/, '');
  const words = withoutSourceId
    .split('-')
    .filter(Boolean)
    .map(word => {
      if (/^\d+(?:\.\d+)?(?:mg|mcg|gm|g|ml|iu)$/i.test(word)) return word.toLowerCase();
      if (/^(sr|cr|xr|ds|od|mr)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
  const name = words.join(' ').replace(/\s+/g, ' ').trim();
  const grams = name.match(/\b\d+(?:\.\d+)?\s?(?:mg|mcg|gm|g|ml|iu)\b/i)?.[0] || '';

  return {
    name,
    catalogKey,
    category: inferCategory(name),
    packType: inferPackType(name),
    grams,
    mrp: 0,
    rate: 0,
    stock: 0,
  };
};

export default function BulkImportModal({ onClose }) {
  const { dispatch } = useApp();
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importMode, setImportMode] = useState('inventory');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, imported: 0, skipped: 0 });
  const fileInputRef = useRef(null);

  const handleDownloadSample = () => {
    const sampleData = [
      {
        name: 'Paracetamol 500mg',
        manufacturer: 'GSK',
        category: 'Tablet',
        hsn: '3004',
        batch: 'B123',
        grams: '500mg',
        mrp: 50,
        purchaseRate: 35,
        saleRate: 42,
        stock: 100,
        minStock: 20,
        expiry: '2025-12-31',
        boxNo: 'B1',
        rackLocation: 'R1-A',
        gst: 12
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sample Products');
    XLSX.writeFile(wb, 'sample_products.xlsx');
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      if (!selected.name.match(/\.(xlsx|xls|csv)$/)) {
        setError('Please select a valid Excel or CSV file.');
        setFile(null);
        return;
      }
      setFile(selected);
      setError(null);
      parseFile(selected);
    }
  };

  const parseFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        
        if (json.length === 0) {
          setError('The uploaded file is empty.');
          setPreview([]);
          return;
        }

        const isKaggleDrugList = Object.prototype.hasOwnProperty.call(json[0], 'drug');
        if (isKaggleDrugList) {
          const seen = new Set();
          const catalogItems = json
            .map(item => normalizeKaggleDrug(item.drug))
            .filter(item => {
              const key = item.catalogKey.toLowerCase();
              if (!item.name || !key || seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          setImportMode('catalog');
          setPreview(catalogItems);
          setError(null);
        } else {
          const validItems = json.filter(item =>
            item.name && item.mrp && (item.purchaseRate ?? item.rate) !== undefined
          );
          if (validItems.length !== json.length) {
            setError(`Found ${json.length - validItems.length} items missing required fields (name, mrp, purchaseRate). They will be ignored.`);
          }
          setImportMode('inventory');
          setPreview(validItems);
        }
      } catch (err) {
        setError('Failed to read the file. Ensure it is a valid Excel format.');
        setPreview([]);
      }
    };
    reader.onerror = () => {
      setError('Error reading file.');
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    if (preview.length === 0) return;

    setImporting(true);
    setError(null);
    setProgress({ processed: 0, imported: 0, skipped: 0 });
    try {
      if (importMode === 'catalog') {
        const chunkSize = 500;
        let imported = 0;
        let skipped = 0;
        for (let start = 0; start < preview.length; start += chunkSize) {
          const rows = preview.slice(start, start + chunkSize);
          const response = await fetch('/api/products/catalog-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Catalog import failed');
          imported += result.imported;
          skipped += result.skipped;
          setProgress({
            processed: Math.min(start + rows.length, preview.length),
            imported,
            skipped,
          });
        }
        if (imported === 0 && skipped > 0) {
          alert(
            `All ${skipped.toLocaleString('en-IN')} medicines are already in your catalog.\n` +
            `Nothing new to add.\n\n` +
            `Search them in New Purchase (they stay hidden from Products until first purchase).`
          );
        } else {
          alert(
            `Medicine catalog import complete.\n` +
            `${imported.toLocaleString('en-IN')} added · ${skipped.toLocaleString('en-IN')} already existed or skipped`
          );
        }
      } else {
        let imported = 0;
        for (const item of preview) {
          const gst = Number(item.gst || 0);
          await dispatch({
            type: 'ADD_PRODUCT',
            payload: {
              name: item.name || '',
              manufacturer: item.manufacturer || '',
              category: item.category || 'Others',
              hsn: String(item.hsn || ''),
              batch: String(item.batch || ''),
              grams: String(item.grams || ''),
              packType: String(item.packType || ''),
              mrp: Number(item.mrp || 0),
              purchaseRate: Number(item.purchaseRate ?? item.rate ?? 0),
              rate: Number(item.saleRate ?? item.rate ?? item.mrp ?? 0),
              stock: Number(item.stock || 0),
              minStock: Number(item.minStock || 0),
              expiry: item.expiry || '',
              boxNo: String(item.boxNo || ''),
              rackLocation: String(item.rackLocation || ''),
              cgst: Number(item.cgst ?? gst / 2),
              sgst: Number(item.sgst ?? gst / 2),
            }
          });
          imported += 1;
          setProgress({ processed: imported, imported, skipped: 0 });
        }
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Bulk Import Products</h2>
              <p className="text-sm text-slate-500">Supports inventory sheets and Kaggle drug-name catalogs</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">Need a template?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Full inventory uses this template. A CSV with a single <b>drug</b> column is also accepted.
                </p>
              </div>
              <button onClick={handleDownloadSample} className="btn-secondary text-sm">
                <Download className="w-4 h-4 mr-2" />
                Sample Excel
              </button>
            </div>

            <div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
              />
              
              {!file ? (
                <div 
                  onClick={() => fileInputRef.current.click()}
                  className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/50 transition-colors"
                >
                  <Upload className="w-8 h-8 text-slate-400 mb-3" />
                  <p className="text-sm font-medium text-slate-700">Click to upload Excel file</p>
                  <p className="text-xs text-slate-500 mt-1">Supports .xlsx, .xls, .csv</p>
                </div>
              ) : (
                <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="w-6 h-6 text-primary-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{file.name}</p>
                      <p className="text-xs text-slate-500">
                        {importMode === 'catalog' ? 'Medicine catalog detected' : 'Inventory sheet detected'}
                        {' · '}{preview.length.toLocaleString('en-IN')} items
                      </p>
                    </div>
                  </div>
                  <button
                    disabled={importing}
                    onClick={() => {
                      setFile(null);
                      setPreview([]);
                      setError(null);
                      setImportMode('inventory');
                      setProgress({ processed: 0, imported: 0, skipped: 0 });
                    }}
                    className="text-xs text-danger font-medium hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {importMode === 'catalog' && preview.length > 0 && (
              <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm">
                <p className="font-semibold">Kaggle medicine-name catalog</p>
                <p className="text-xs mt-1">
                  Names will be imported with zero stock and hidden from normal inventory.
                  Search them in New Purchase, then enter batch, expiry, purchase rate, MRP,
                  tax and quantity. After purchase they become available for sales.
                </p>
              </div>
            )}

            {importing && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Importing medicines — keep this window open</span>
                  <span>{progress.processed.toLocaleString('en-IN')} / {preview.length.toLocaleString('en-IN')}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all"
                    style={{ width: `${preview.length ? (progress.processed / preview.length) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  {progress.imported.toLocaleString('en-IN')} added · {progress.skipped.toLocaleString('en-IN')} skipped
                </p>
              </div>
            )}

            {preview.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-700">Preview (First 3 items)</h3>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Category</th>
                      <th className="px-4 py-2 font-medium">
                        {importMode === 'catalog' ? 'Pack' : 'MRP'}
                      </th>
                      <th className="px-4 py-2 font-medium">
                        {importMode === 'catalog' ? 'Strength' : 'Stock'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {preview.slice(0, 3).map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 font-medium text-slate-800">{item.name}</td>
                        <td className="px-4 py-2 text-slate-600">{item.category}</td>
                        <td className="px-4 py-2 text-slate-600">
                          {importMode === 'catalog' ? (item.packType || '-') : `₹${item.mrp}`}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {importMode === 'catalog' ? (item.grams || '-') : item.stock}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 3 && (
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-center text-slate-500">
                    + {(preview.length - 3).toLocaleString('en-IN')} more items
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} disabled={importing} className="btn-secondary disabled:opacity-50">
            Cancel
          </button>
          <button 
            onClick={handleImport} 
            disabled={preview.length === 0 || importing}
            className={`btn-primary ${preview.length === 0 || importing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {importing
              ? `Importing ${progress.processed.toLocaleString('en-IN')} / ${preview.length.toLocaleString('en-IN')}`
              : `Import ${preview.length > 0 ? preview.length.toLocaleString('en-IN') : ''} ${importMode === 'catalog' ? 'Medicine Names' : 'Items'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
