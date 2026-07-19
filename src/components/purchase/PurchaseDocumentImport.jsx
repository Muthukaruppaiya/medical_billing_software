import { useEffect, useMemo, useState } from 'react';
import {
  Upload, FileImage, Loader2, Plus, Trash2, Save, AlertTriangle, CheckCircle,
} from 'lucide-react';
import { createWorker } from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useApp } from '../../context/AppContext';
import { genInvoiceNo } from '../../hooks/useInvoice';
import dayjs from 'dayjs';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const emptyRow = () => ({
  manufacturer: '',
  hsn: '',
  batch: '',
  expiry: '',
  mrp: 0,
  name: '',
  pack: '',
  qty: 1,
  rate: 0,
  value: 0,
  discount: 0,
  tax: 0,
  matchedProductId: '',
  confidence: 0,
});

const COLUMN_FIELDS = [
  { key: 'manufacturer', label: 'Manufacturer', width: 'w-28' },
  { key: 'hsn', label: 'HSN', width: 'w-24' },
  { key: 'batch', label: 'Batch *', width: 'w-28' },
  { key: 'expiry', label: 'Expiry', width: 'w-32' },
  { key: 'mrp', label: 'MRP', width: 'w-24', numeric: true },
  { key: 'name', label: 'Product Name *', width: 'w-64' },
  { key: 'pack', label: 'Pack', width: 'w-24' },
  { key: 'qty', label: 'Qty *', width: 'w-20', numeric: true },
  { key: 'rate', label: 'Trade Rate', width: 'w-24', numeric: true },
  { key: 'value', label: 'Value', width: 'w-24', numeric: true },
  { key: 'discount', label: 'Discount %', width: 'w-24', numeric: true },
  { key: 'tax', label: 'Tax %', width: 'w-20', numeric: true },
];

const DEFAULT_COLUMN_MAPPING = Object.fromEntries(
  COLUMN_FIELDS.map(field => [field.key, field.key])
);

function applyColumnMapping(row, mapping) {
  const mapped = {
    ...emptyRow(),
    matchedProductId: row.matchedProductId,
    confidence: row.confidence,
  };

  for (const source of COLUMN_FIELDS) {
    const target = mapping[source.key];
    if (!target || target === 'ignore') continue;
    const value = row[source.key];
    mapped[target] = target === 'expiry'
      ? (parseExpiry(value) || value)
      : value;
  }
  return mapped;
}

const normalizeName = value =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function parseExpiry(value) {
  const match = String(value || '').match(/(0[1-9]|1[0-2])\D?(\d{2,4})/);
  if (!match) return '';
  const month = match[1];
  const yearPart = match[2].slice(-2);
  return `20${yearPart}-${month}-01`;
}

function cleanProductName(value) {
  return String(value || '')
    .replace(/\b(0+|X+|O00|000)\b/gi, ' ')
    .replace(/[^\w\s\-/.()%+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNumbers(line) {
  return [...String(line).matchAll(/(\d+(?:\.\d+)?)/g)].map(match => Number(match[1]));
}

/**
 * Text-line parser for distributor invoices like SORNAA AGENCIES.
 * Works for both digital PDF text and OCR text.
 */
function textToRows(rawText, confidence = 70) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const parsed = [];
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (
      /PENDING BILLS|ITEM DESCRIPTION|GRAND TOTAL|BANK DETAILS|HAVE A NICE|TAXABLE|SGST|CGST|TOTAL QTY|SALE VALUE/.test(upper)
    ) {
      continue;
    }

    // Batch + expiry (MMYY / MM-YY / MM/YY) somewhere in the product row.
    const marker = line.match(
      /([A-Z0-9][A-Z0-9\-]{3,18})\s+(0[1-9]|1[0-2])[-/.:]?(\d{2})\b/i
    );
    if (!marker) continue;

    const batch = marker[1].replace(/[^A-Z0-9\-]/gi, '');
    const expiry = parseExpiry(`${marker[2]}${marker[3]}`);
    const afterExpiry = line.slice(marker.index + marker[0].length).trim();
    const beforeBatch = line.slice(0, marker.index).trim();

    const hsnMatch = beforeBatch.match(/(\d{6,8})\b/);
    const hsn = hsnMatch ? hsnMatch[1] : '';
    const manufacturer = beforeBatch
      .replace(hsn, '')
      .replace(/[^A-Za-z]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(-1)[0] || '';

    // After expiry: MRP, product name, pack, qty, rate, value, discounts, tax.
    const numbers = extractNumbers(afterExpiry);
    if (numbers.length < 2) continue;

    const mrp = numbers[0] || 0;
    // Prefer last few numbers as qty/rate/value/tax.
    const tax = numbers.length >= 5 ? numbers[numbers.length - 1] : 0;
    const value = numbers.length >= 4 ? numbers[numbers.length - (tax ? 2 : 1)] : 0;
    const rate = numbers.length >= 3 ? numbers[numbers.length - (tax ? 3 : 2)] : 0;
    const qtyCandidate = numbers.find((num, index) =>
      index > 0 &&
      index < numbers.length - 2 &&
      Number.isInteger(num) &&
      num > 0 &&
      num <= 500
    );
    const qty = Math.max(1, Math.round(qtyCandidate || 1));

    // Product name is the alpha-heavy middle section after MRP.
    const nameMatch = afterExpiry.match(
      /[A-Za-z][A-Za-z0-9\s\-/.()%]{3,}?(?=\s+\d|\s*$)/
    );
    let name = cleanProductName(nameMatch?.[0] || '');
    // Catch glued OCR like "3454SPOOBABYSHAMPOO"
    if (!name) {
      const glued = afterExpiry.match(/\d{2,4}([A-Z][A-Z0-9\s\-/.()]{4,})/i);
      name = cleanProductName(glued?.[1] || '');
    }
    if (!name || name.length < 3) continue;

    const packMatch = afterExpiry.match(/\b(\d+\s?(?:GM|MG|ML|TAB|CAPS?|'S|S))\b/i);
    const pack = packMatch?.[1] || '';

    parsed.push({
      ...emptyRow(),
      manufacturer,
      hsn,
      batch,
      expiry,
      mrp,
      name,
      pack,
      qty,
      rate,
      value: value || Number((qty * rate).toFixed(2)),
      tax: tax <= 40 ? tax : 0,
      confidence,
    });
  }

  // Deduplicate near-identical batch + name rows.
  const unique = [];
  for (const row of parsed) {
    const key = `${row.batch}|${normalizeName(row.name)}`;
    if (!unique.some(item => `${item.batch}|${normalizeName(item.name)}` === key)) {
      unique.push(row);
    }
  }
  return unique;
}

function wordsToRows(words, imageWidth) {
  const usableWords = (words || [])
    .filter(word => word.text?.trim() && Number(word.confidence || 0) > 20)
    .map(word => ({
      text: word.text.trim(),
      confidence: Number(word.confidence || 0),
      x: (word.bbox.x0 + word.bbox.x1) / 2 / imageWidth,
      y: (word.bbox.y0 + word.bbox.y1) / 2,
      height: Math.max(8, word.bbox.y1 - word.bbox.y0),
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const lines = [];
  for (const word of usableWords) {
    let line = lines.find(candidate =>
      Math.abs(candidate.y - word.y) <= Math.max(10, word.height * 0.8)
    );
    if (!line) {
      line = { y: word.y, words: [] };
      lines.push(line);
    }
    line.words.push(word);
    line.y = line.words.reduce((sum, item) => sum + item.y, 0) / line.words.length;
  }

  const lineTexts = lines.map(line =>
    line.words.sort((a, b) => a.x - b.x).map(word => word.text).join(' ')
  );
  return textToRows(lineTexts.join('\n'), 60);
}

function mergeDetectedRows(...groups) {
  const merged = [];
  for (const group of groups) {
    for (const row of group) {
      const key = `${String(row.batch).toUpperCase()}|${normalizeName(row.name)}`;
      const existing = merged.find(
        item => `${String(item.batch).toUpperCase()}|${normalizeName(item.name)}` === key
      );
      if (!existing) {
        merged.push(row);
        continue;
      }
      // Keep the richer / higher-confidence version.
      if ((row.confidence || 0) > (existing.confidence || 0) ||
          (row.hsn && !existing.hsn) ||
          (row.rate && !existing.rate)) {
        Object.assign(existing, {
          ...existing,
          ...Object.fromEntries(
            Object.entries(row).filter(([, value]) => value !== '' && value !== 0)
          ),
          confidence: Math.max(existing.confidence || 0, row.confidence || 0),
        });
      }
    }
  }
  return merged;
}

function preprocessForOcr(imageLike) {
  const sourceWidth = imageLike.naturalWidth || imageLike.width;
  const sourceHeight = imageLike.naturalHeight || imageLike.height;
  const scale = Math.max(2, 2000 / Math.max(sourceWidth, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(imageLike, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // Boost contrast for printed invoices photographed on phone.
    const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
    data[i] = contrast;
    data[i + 1] = contrast;
    data[i + 2] = contrast;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function extractPdfNativeText(file) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageTexts = [];
  let charCount = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items || [];
    // Reconstruct roughly readable lines using Y positions.
    const lines = [];
    for (const item of items) {
      const text = item.str?.trim();
      if (!text) continue;
      const y = item.transform?.[5] ?? 0;
      let line = lines.find(candidate => Math.abs(candidate.y - y) < 4);
      if (!line) {
        line = { y, parts: [] };
        lines.push(line);
      }
      line.parts.push({ x: item.transform?.[4] ?? 0, text });
      charCount += text.length;
    }
    pageTexts.push(
      lines
        .sort((a, b) => b.y - a.y)
        .map(line => line.parts.sort((a, b) => a.x - b.x).map(part => part.text).join(' '))
        .join('\n')
    );
  }

  // Scanned/photo PDFs usually have almost no selectable text.
  if (charCount < 80) return null;
  return pageTexts.join('\n\n');
}

function matchProduct(row, products) {
  const rowName = normalizeName(row.name);
  const rowTokens = new Set(rowName.split(' ').filter(token => token.length > 2));
  let best = null;
  let bestScore = 0;

  for (const product of products) {
    const productName = normalizeName(product.name);
    const productTokens = productName.split(' ').filter(token => token.length > 2);
    const overlap = productTokens.filter(token => rowTokens.has(token)).length;
    const nameScore = Math.max(
      rowName === productName ? 100 : 0,
      rowName.includes(productName) || productName.includes(rowName) ? 80 : 0,
      productTokens.length ? (overlap / productTokens.length) * 70 : 0
    );
    const hsnScore = row.hsn && product.hsn && String(product.hsn) === row.hsn ? 30 : 0;
    const score = nameScore + hsnScore;
    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }
  return bestScore >= 45 ? best : null;
}

async function pdfToImages(file) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const images = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;
    const processed = preprocessForOcr(canvas);
    images.push({
      source: processed,
      preview: canvas.toDataURL('image/jpeg', 0.92),
      width: processed.width,
    });
  }
  return images;
}

async function imageFileToSource(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  const processed = preprocessForOcr(image);
  return {
    source: processed,
    preview: url,
    width: processed.width,
  };
}

export default function PurchaseDocumentImport() {
  const { state, dispatch } = useApp();
  const [file, setFile] = useState(null);
  const [previews, setPreviews] = useState([]);
  const [rows, setRows] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [billDate, setBillDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [billNumber, setBillNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [rawText, setRawText] = useState('');
  const [columnMapping, setColumnMapping] = useState(DEFAULT_COLUMN_MAPPING);

  useEffect(() => () => {
    previews.forEach(preview => {
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    });
  }, [previews]);

  const setRow = (index, field, value) => {
    setRows(current =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  };

  const autoMatchRows = detectedRows =>
    detectedRows.map(row => {
      const match = matchProduct(row, state.products);
      return { ...row, matchedProductId: match?.id || '' };
    });

  const changeColumnMapping = (source, target) => {
    setColumnMapping(current => {
      const previousTarget = current[source];
      const next = { ...current, [source]: target };

      // Keep each destination unique by swapping the other column.
      if (target !== 'ignore') {
        const otherSource = COLUMN_FIELDS.find(
          field => field.key !== source && current[field.key] === target
        )?.key;
        if (otherSource) next[otherSource] = previousTarget;
      }
      return next;
    });
    setRows(current => current.map(row => ({ ...row, matchedProductId: '' })));
  };

  const processDocument = async selectedFile => {
    setFile(selectedFile);
    setProcessing(true);
    setProgress(0);
    setRows([]);
    setRawText('');
    setColumnMapping(DEFAULT_COLUMN_MAPPING);
    setStatus('Preparing document...');

    let worker;
    try {
      // 1) Digital PDFs with selectable text are far more accurate than photos.
      if (selectedFile.type === 'application/pdf') {
        setStatus('Checking whether this PDF has selectable text...');
        const nativeText = await extractPdfNativeText(selectedFile);
        if (nativeText) {
          const nativeRows = textToRows(nativeText, 95);
          setRawText(nativeText);
          setPreviews([]);
          setRows(autoMatchRows(nativeRows));
          setStatus(
            nativeRows.length
              ? `Digital PDF text used · ${nativeRows.length} rows found. Review values, then save.`
              : 'PDF text was found, but product rows were not detected. Add rows manually from the raw text.'
          );
          return;
        }
      }

      // 2) Photos / scanned PDFs: enhance image, OCR, then parse with text rules.
      const sources = selectedFile.type === 'application/pdf'
        ? await pdfToImages(selectedFile)
        : [await imageFileToSource(selectedFile)];
      setPreviews(sources.map(item => item.preview));

      worker = await createWorker('eng', 1, {
        logger: message => {
          if (message.status === 'recognizing text') {
            setProgress(Math.round(message.progress * 100));
            setStatus('Recognizing purchase table from image...');
          }
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
      });

      const allRows = [];
      const textParts = [];
      for (let index = 0; index < sources.length; index += 1) {
        setStatus(`Recognizing page ${index + 1} of ${sources.length}...`);
        const result = await worker.recognize(
          sources[index].source,
          {},
          { blocks: true }
        );
        const pageText = result.data.text || '';
        textParts.push(pageText);

        const words = (result.data.blocks || []).flatMap(block =>
          block.paragraphs.flatMap(paragraph =>
            paragraph.lines.flatMap(line => line.words)
          )
        );
        const fromWords = wordsToRows(words, sources[index].width);
        const fromText = textToRows(pageText, 65);
        allRows.push(...mergeDetectedRows(fromText, fromWords));
      }

      const detected = mergeDetectedRows(allRows);
      setRawText(textParts.join('\n\n'));
      setRows(autoMatchRows(detected));
      setStatus(
        detected.length
          ? `${detected.length} product rows detected from image OCR. Please verify every batch, qty and rate before saving. Tip: a digital supplier PDF (selectable text) is more accurate than a phone photo.`
          : 'No product rows were auto-detected. Use Raw OCR Text to add rows manually, or upload a clearer scan / digital PDF.'
      );
    } catch (error) {
      console.error(error);
      setStatus(`Recognition failed: ${error.message}`);
    } finally {
      if (worker) await worker.terminate();
      setProcessing(false);
    }
  };

  const selectedSupplier = state.suppliers.find(
    supplier => Number(supplier.id) === Number(supplierId)
  );

  const reviewedRows = useMemo(
    () => rows.map(row => applyColumnMapping(row, columnMapping)),
    [rows, columnMapping]
  );

  const total = useMemo(
    () => reviewedRows.reduce(
      (sum, row) => sum + (Number(row.value) || Number(row.qty) * Number(row.rate) || 0),
      0
    ),
    [reviewedRows]
  );

  const savePurchase = async () => {
    if (!selectedSupplier) return alert('Select a supplier');
    if (!reviewedRows.length) return alert('Add at least one reviewed product row');
    const invalid = reviewedRows.find(row =>
      !row.name.trim() || !row.batch.trim() || Number(row.qty) <= 0
    );
    if (invalid) {
      return alert('Product name, batch number, and quantity are required for every row');
    }

    setSaving(true);
    try {
      const purchaseItems = [];
      const resolvedProducts = [...state.products];
      for (const row of reviewedRows) {
        let product = resolvedProducts.find(
          item => Number(item.id) === Number(row.matchedProductId)
        );
        if (!product) product = matchProduct(row, resolvedProducts);
        if (!product) {
          product = await dispatch({
            type: 'ADD_PRODUCT',
            payload: {
              name: row.name.trim(),
              hsn: row.hsn || '',
              category: 'Others',
              manufacturer: row.manufacturer || '',
              grams: row.pack || '',
              packType: 'Others',
              minStock: 0,
              cgst: Number(row.tax || 0) / 2,
              sgst: Number(row.tax || 0) / 2,
              batches: [{
                batch: row.batch.trim(),
                expiry: row.expiry || '',
                stock: 0,
                mrp: Number(row.mrp || 0),
                rate: Number(row.rate || 0),
                cgst: Number(row.tax || 0) / 2,
                sgst: Number(row.tax || 0) / 2,
              }],
            },
          });
          resolvedProducts.push(product);
        }

        purchaseItems.push({
          product: { id: product.id, name: product.name },
          qty: Number(row.qty),
          rate: Number(row.rate || 0),
          mrp: Number(row.mrp || 0),
          cgst: Number(row.tax || 0) / 2,
          sgst: Number(row.tax || 0) / 2,
          batch: row.batch.trim(),
          expiry: row.expiry || '',
          lineAmt: Number(row.qty) * Number(row.rate || 0),
          total: Number(row.value) || Number(row.qty) * Number(row.rate || 0),
        });
      }

      await dispatch({
        type: 'ADD_PURCHASE',
        payload: {
          id: billNumber.trim() || genInvoiceNo('PUR'),
          date: dayjs(billDate).format('DD-MM-YYYY'),
          supplier: selectedSupplier.name,
          supplierId: selectedSupplier.id,
          amount: total,
          status: 'Received',
          items: purchaseItems,
        },
      });

      alert(`Purchase saved successfully with ${rows.length} reviewed products.`);
      setRows([]);
      setFile(null);
      setPreviews([]);
      setRawText('');
      setBillNumber('');
      setStatus('');
      setColumnMapping(DEFAULT_COLUMN_MAPPING);
    } catch (error) {
      alert(error.message || 'Failed to save reviewed purchase');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Import Purchase Document</h1>
        <p className="page-subtitle">
          Upload a distributor invoice, review recognized rows, then save them as purchase and batch stock.
          A digital PDF with selectable text is more accurate than a phone photo. Saving a photo as PDF does not improve recognition.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold">Best accuracy tips</p>
        <ul className="mt-1 text-xs space-y-1 list-disc pl-4">
          <li>Prefer the original digital PDF from the supplier (text selectable with mouse).</li>
          <li>Phone photo / WhatsApp image / photo saved as PDF all use OCR and may need manual corrections.</li>
          <li>Capture the full product table flat, bright, and without handwritten marks over quantity.</li>
        </ul>
      </div>

      <div className="card">
        <label className="block border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            disabled={processing}
            onChange={event => {
              const selected = event.target.files?.[0];
              if (selected) processDocument(selected);
              event.target.value = '';
            }}
          />
          {processing ? (
            <>
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-700 mt-3">{status}</p>
              <div className="h-2 bg-slate-100 rounded-full max-w-md mx-auto mt-3 overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-primary-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 mt-3">
                Upload Purchase Bill Image or PDF
              </p>
              <p className="text-xs text-slate-400 mt-1">
                JPG, PNG, WEBP or PDF · OCR runs locally in this browser
              </p>
            </>
          )}
        </label>
        {file && !processing && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <FileImage className="w-4 h-4" />
            <span>{file.name}</span>
          </div>
        )}
      </div>

      {status && !processing && (
        <div className={`rounded-xl border px-4 py-3 flex items-start gap-2 text-sm ${
          rows.length
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {rows.length
            ? <CheckCircle className="w-4 h-4 mt-0.5" />
            : <AlertTriangle className="w-4 h-4 mt-0.5" />}
          {status}
        </div>
      )}

      {previews.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-slate-700 text-sm mb-3">Document Preview</h3>
          <div className="flex gap-3 overflow-x-auto">
            {previews.map((preview, index) => (
              <img
                key={preview}
                src={preview}
                alt={`Purchase document page ${index + 1}`}
                className="h-64 rounded-lg border border-slate-200 object-contain bg-slate-50"
              />
            ))}
          </div>
        </div>
      )}

      {(rows.length > 0 || rawText) && (
        <>
          <div className="card space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Supplier *</label>
                <select
                  value={supplierId}
                  onChange={event => setSupplierId(event.target.value)}
                  className="form-select"
                >
                  <option value="">Select supplier...</option>
                  {state.suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Supplier Bill Number</label>
                <input
                  value={billNumber}
                  onChange={event => setBillNumber(event.target.value)}
                  className="form-input"
                  placeholder="Leave blank for auto number"
                />
              </div>
              <div>
                <label className="form-label">Bill Date *</label>
                <input
                  type="date"
                  value={billDate}
                  onChange={event => setBillDate(event.target.value)}
                  className="form-input"
                  required
                />
              </div>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-700">Map Columns and Review Products</h3>
                <p className="text-xs text-slate-400">
                  Use each header dropdown to identify that invoice column. Select “Ignore column” for unwanted data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRows(current => [...current, emptyRow()])}
                className="btn-secondary text-xs gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Row
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1700px]">
                <thead>
                  <tr>
                    <th>Match / Create</th>
                    {COLUMN_FIELDS.map(source => (
                      <th key={source.key} className="min-w-36">
                        <select
                          value={columnMapping[source.key]}
                          onChange={event => changeColumnMapping(source.key, event.target.value)}
                          className="form-select min-w-32 bg-white text-xs font-semibold"
                          title={`Choose what the values in this column mean (detected as ${source.label})`}
                        >
                          <option value="ignore">Ignore column</option>
                          {COLUMN_FIELDS.map(target => (
                            <option key={target.key} value={target.key}>
                              {target.label}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                    <th>OCR</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      <td className="min-w-52">
                        <select
                          value={
                            row.matchedProductId ||
                            matchProduct(reviewedRows[index], state.products)?.id ||
                            ''
                          }
                          onChange={event => {
                            const value = event.target.value;
                            const product = state.products.find(
                              item => Number(item.id) === Number(value)
                            );
                            const nameSource = COLUMN_FIELDS.find(
                              field => columnMapping[field.key] === 'name'
                            )?.key;
                            const hsnSource = COLUMN_FIELDS.find(
                              field => columnMapping[field.key] === 'hsn'
                            )?.key;
                            setRows(current => current.map((item, rowIndex) =>
                              rowIndex === index
                                ? {
                                    ...item,
                                    matchedProductId: value,
                                    ...(nameSource
                                      ? { [nameSource]: product?.name || item[nameSource] }
                                      : {}),
                                    ...(hsnSource
                                      ? { [hsnSource]: product?.hsn || item[hsnSource] }
                                      : {}),
                                  }
                                : item
                            ));
                          }}
                          className="form-select text-xs"
                        >
                          <option value="">Create new product</option>
                          {state.products.map(product => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      {COLUMN_FIELDS.map(source => {
                        const targetKey = columnMapping[source.key];
                        const target = COLUMN_FIELDS.find(field => field.key === targetKey);
                        return (
                        <td key={source.key}>
                          <input
                            type={target?.key === 'expiry' ? 'date' : target?.numeric ? 'number' : 'text'}
                            step={target?.numeric ? '0.01' : undefined}
                            min={target?.numeric ? '0' : undefined}
                            value={row[source.key]}
                            onChange={event => setRow(index, source.key, event.target.value)}
                            className={`form-input text-xs ${target?.width || 'w-28'} ${
                              targetKey === 'ignore' ? 'bg-slate-100 text-slate-400' : ''
                            }`}
                          />
                        </td>
                        );
                      })}
                      <td>
                        <span className={`badge ${
                          row.confidence >= 70 ? 'badge-success' :
                          row.confidence >= 45 ? 'badge-warning' : 'badge-danger'
                        }`}>
                          {row.confidence}%
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setRows(current => current.filter((_, i) => i !== index))}
                          className="text-slate-400 hover:text-danger p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <details className="card">
            <summary className="text-sm font-semibold text-slate-600 cursor-pointer">
              View Raw OCR Text
            </summary>
            <pre className="mt-3 p-3 bg-slate-900 text-slate-100 rounded-lg text-xs whitespace-pre-wrap overflow-x-auto max-h-64">
              {rawText || 'No OCR text available.'}
            </pre>
          </details>

          <div className="card flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400">Reviewed Purchase Total</p>
              <p className="text-2xl font-bold text-primary-600">
                ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <button
              type="button"
              onClick={savePurchase}
              disabled={saving || !rows.length}
              className="btn-success gap-2 px-6 disabled:opacity-50"
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />}
              {saving ? 'Saving Purchase...' : 'Save Reviewed Purchase'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
