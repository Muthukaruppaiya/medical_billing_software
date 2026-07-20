import { useEffect, useMemo, useState } from 'react';
import {
  Upload, FileImage, Loader2, Plus, Trash2, Save, AlertTriangle, CheckCircle,
} from 'lucide-react';
import { createWorker } from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useApp } from '../../context/AppContext';
import { nextDocumentNo } from '../../hooks/useInvoice';
import ExpiryInput from '../ui/ExpiryInput';
import { normalizeExpiry } from '../../utils/expiry';
import dayjs from 'dayjs';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_PDF_PAGES = 6;
const MAX_IMAGES = 5;
const MAX_FILE_SIZE_MB = 25;

const emptyRow = () => ({
  manufacturer: '',
  rack: '',
  batch: '',
  expiry: '',
  hsn: '',
  name: '',
  pack: '',
  mrp: 0,
  qty: 1,
  free: 0,
  rate: 0,
  oldMrp: 0,
  discount: 0,
  value: 0,
  tax: 0,
  matchedProductId: '',
  confidence: 0,
});

/** Invoice column headers — match distributor bill layout. */
const COLUMN_FIELDS = [
  { key: 'manufacturer', label: 'MFR', width: 'w-20' },
  { key: 'rack', label: 'RACK', width: 'w-20' },
  { key: 'batch', label: 'BATCH', width: 'w-28' },
  { key: 'expiry', label: 'EXP', width: 'w-28', expiry: true },
  { key: 'hsn', label: 'HSN', width: 'w-24' },
  { key: 'name', label: 'PRODUCT NAME', width: 'w-56' },
  { key: 'pack', label: 'PACK', width: 'w-20' },
  { key: 'mrp', label: 'MRP', width: 'w-24', numeric: true },
  { key: 'qty', label: 'QTY', width: 'w-16', numeric: true },
  { key: 'free', label: 'FREE', width: 'w-16', numeric: true },
  { key: 'rate', label: 'RATE', width: 'w-24', numeric: true },
  { key: 'oldMrp', label: 'Old MRP', width: 'w-24', numeric: true },
  { key: 'discount', label: 'Disc%', width: 'w-20', numeric: true },
  { key: 'value', label: 'Amount', width: 'w-24', numeric: true },
  { key: 'tax', label: 'GST%', width: 'w-16', numeric: true },
];

const DEFAULT_COLUMN_MAPPING = Object.fromEntries(
  COLUMN_FIELDS.map(field => [field.key, field.key])
);

const SKIP_LINE_RE =
  /PENDING BILLS|ITEM DESCRIPTION|GRAND TOTAL|BANK DETAILS|HAVE A NICE|TAXABLE|SGST|CGST|TOTAL QTY|SALE VALUE|INVOICE NO|BILL NO|PAGE\s*\d|CONTINUED|AUTHORISED|SIGNATURE|TERMS\s*&?\s*CONDITIONS|AMOUNT IN WORDS|ROUND OFF|NET AMOUNT|SUB\s*TOTAL|DISCOUNT AMT|\bMFR\b.*\bBATCH\b.*\bEXP\b|\bPRODUCT NAME\b|\bOld MRP\b/i;

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
      ? (normalizeExpiry(value) || value)
      : value;
  }
  return mapped;
}

const normalizeName = value =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function fixOcrToken(value) {
  return String(value || '')
    .replace(/[|]/g, 'I')
    .replace(/\u00A0/g, ' ');
}

/** Fix common OCR mistakes inside numeric tokens only. */
function fixOcrDigits(token) {
  return String(token || '')
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Zz]/g, '2')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '');
}

function cleanProductName(value) {
  return fixOcrToken(value)
    .replace(/\b(0+|X+|O00|000)\b/gi, ' ')
    .replace(/[^\w\s\-/.()%+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract decimal numbers with OCR digit repair.
 * Prefers tokens that look like money/qty (not glued into words).
 */
function extractNumbers(line) {
  const text = fixOcrToken(line);
  const matches = [...text.matchAll(/(?<![A-Za-z])(\d[\dOoIlSsBbZz|,]*\.?\d*)(?![A-Za-z])/g)];
  return matches
    .map(match => {
      const cleaned = fixOcrDigits(match[1]);
      if (!cleaned || cleaned === '.') return null;
      const num = Number(cleaned);
      return Number.isFinite(num) ? num : null;
    })
    .filter(num => num != null);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isPdfFile(file) {
  return (
    file?.type === 'application/pdf' ||
    /\.pdf$/i.test(file?.name || '')
  );
}

function isImageFile(file) {
  return (
    /^image\/(jpeg|jpg|png|webp|bmp|gif)$/i.test(file?.type || '') ||
    /\.(jpe?g|png|webp|bmp|gif)$/i.test(file?.name || '')
  );
}

/**
 * Text-line parser for distributor invoices.
 * Columns: … HSN | PRODUCT NAME | PACK | MRP | QTY | …
 * PRODUCT NAME keeps strength text (50MG, 10ML, TAB).
 * PACK is only the pack column (10, 15, 15 gm, 10S) — never MG/ML from the name.
 */
function textToRows(rawText, confidence = 70) {
  const rawLines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => fixOcrToken(line).replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Glue orphan pack fragments OCR put on their own line (e.g. "10'S").
  const lines = [];
  for (const line of rawLines) {
    if (/^\d+\s*'?[sS]$/i.test(line) && lines.length) {
      lines[lines.length - 1] = `${lines[lines.length - 1]} ${line}`;
      continue;
    }
    lines.push(line);
  }

  const parsed = [];
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    const upper = line.toUpperCase();
    if (SKIP_LINE_RE.test(upper)) continue;
    // Skip ghost rows that are only a pack token
    if (/^\d+\s*(?:gm|'?[sS])?$/i.test(line)) continue;

    // Join a product name that OCR split onto the next short line.
    const next = lines[i + 1] || '';
    if (
      next &&
      next.length < 40 &&
      !SKIP_LINE_RE.test(next) &&
      !/\b(0[1-9]|1[0-2])[-/.:]?\d{2}\b/.test(next) &&
      (/[A-Za-z]{3,}/.test(next) || /^\d+\s*'?[sS]$/i.test(next)) &&
      extractNumbers(next).length <= 1
    ) {
      line = `${line} ${next}`;
      i += 1;
    }

    // Batch + expiry (MMYY / MM-YY / MM/YY) somewhere in the product row.
    const marker = line.match(
      /([A-Z0-9][A-Z0-9\-]{2,18})\s+(0[1-9]|1[0-2]|[O0][1-9]|1[O0Il12])[-/.:]?(\d{2})\b/i
    );
    if (!marker) continue;

    const batch = marker[1]
      .replace(/[^A-Z0-9\-]/gi, '')
      .toUpperCase();
    if (batch.length < 3) continue;

    const expiry = normalizeExpiry(`${marker[2]}/${marker[3]}`);
    const afterExpiry = line.slice(marker.index + marker[0].length).trim();
    const beforeBatch = line.slice(0, marker.index).trim();

    // Before BATCH: MFR + optional RACK
    const beforeParts = beforeBatch.split(/\s+/).filter(Boolean);
    let manufacturer = '';
    let rack = '';
    if (beforeParts.length >= 2) {
      manufacturer = beforeParts[0].replace(/[^A-Za-z0-9]/g, '');
      rack = beforeParts[1].replace(/[^A-Za-z0-9\-]/g, '');
    } else if (beforeParts.length === 1) {
      manufacturer = beforeParts[0].replace(/[^A-Za-z0-9]/g, '');
    }

    const hsnMatch = afterExpiry.match(/^(\d{4,8})\b/) || afterExpiry.match(/\b(\d{6,8})\b/);
    const hsn = hsnMatch ? hsnMatch[1] : '';
    const afterHsn = hsn
      ? afterExpiry.replace(hsn, ' ').replace(/\s+/g, ' ').trim()
      : afterExpiry;

    // Split at first PACK + MRP pair.
    // Pack = 10 / 15 gm / 10S only. Strength like 50MG / 10ML stays in PRODUCT NAME.
    const packUnit = String.raw`\d+\s*(?:gm|'?[sS])?`;
    let name = '';
    let pack = '';
    let afterPack = '';

    const withDecimalMrp = afterHsn.match(
      new RegExp(String.raw`^(.+?)\s+(${packUnit})(?![A-Za-z])\s+(\d+\.\d+)\b\s*(.*)$`, 'i')
    );
    const withPlainMrp = !withDecimalMrp
      ? afterHsn.match(
          new RegExp(String.raw`^(.+?)\s+(${packUnit})(?![A-Za-z])\s+(\d{2,5}(?:\.\d+)?)\b\s*(.*)$`, 'i')
        )
      : null;
    const split = withDecimalMrp || withPlainMrp;

    if (split) {
      name = cleanProductName(split[1]);
      pack = String(split[2] || '').replace(/\s+/g, ' ').trim();
      afterPack = `${split[3] || ''} ${split[4] || ''}`.replace(/\s+/g, ' ').trim();
    } else {
      // No reliable pack/MRP split — keep whole text as product name, leave pack empty
      const nameOnly = afterHsn.match(/^([A-Za-z].*?)(?=\s+\d+\.\d+|\s*$)/);
      name = cleanProductName(nameOnly?.[1] || afterHsn);
      afterPack = nameOnly ? afterHsn.slice(nameOnly[0].length).trim() : '';
      pack = '';
    }

    // Reject rows that are really just a pack fragment
    if (!name || name.length < 3 || /^\d+\s*(?:gm|'?[sS])?$/i.test(name)) continue;
    // Never allow MG/ML strength tokens as pack
    if (/mg|ml/i.test(pack)) {
      name = cleanProductName(`${name} ${pack}`);
      pack = '';
    }

    const numbers = extractNumbers(afterPack);
    if (numbers.length < 1) continue;

    let mrp = numbers[0] || 0;
    let qty = 1;
    let free = 0;
    let rate = 0;
    let oldMrp = 0;
    let discount = 0;
    let value = 0;
    let tax = 0;

    const afterMrp = numbers.slice(1);
    const qtyIdx = afterMrp.findIndex(n => Number.isInteger(n) && n > 0 && n <= 999);
    if (qtyIdx >= 0) {
      qty = afterMrp[qtyIdx];
      if (Number.isInteger(afterMrp[qtyIdx + 1]) && afterMrp[qtyIdx + 1] < 50) {
        free = afterMrp[qtyIdx + 1];
      }
      const money = afterMrp.slice(qtyIdx + (free ? 2 : 1));
      rate = money[0] || 0;
      oldMrp = money[1] || 0;
      const last = money[money.length - 1] || 0;
      const secondLast = money[money.length - 2] || 0;
      if (last > 0 && last <= 28 && Number.isInteger(last)) {
        tax = last;
        value = secondLast || Number((qty * rate).toFixed(2));
        const maybeDisc = money[money.length - 3];
        if (maybeDisc != null && maybeDisc >= 0 && maybeDisc <= 100) discount = maybeDisc;
      } else {
        value = last || Number((qty * rate).toFixed(2));
      }
    } else if (afterMrp.length >= 2) {
      rate = afterMrp[0] || 0;
      value = afterMrp[afterMrp.length - 1] || 0;
    }

    let rowConfidence = confidence;
    if (hsn && hsn.length >= 6) rowConfidence += 3;
    if (batch.length >= 5) rowConfidence += 3;
    if (mrp > 0 && rate > 0) rowConfidence += 5;
    if (qty > 0 && value > 0) rowConfidence += 4;
    if (rate > 0 && Math.abs((qty * rate) - value) < 1.5) rowConfidence += 5;
    rowConfidence = Math.min(98, rowConfidence);

    parsed.push({
      ...emptyRow(),
      manufacturer,
      rack,
      hsn,
      batch,
      expiry,
      mrp,
      name,
      pack,
      qty: Math.max(1, Math.round(qty)),
      free: Math.max(0, Math.round(free)),
      rate,
      oldMrp,
      discount,
      value: value || Number((qty * rate).toFixed(2)),
      tax: tax <= 40 ? tax : 0,
      confidence: rowConfidence,
    });
  }

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
    .filter(word => word.text?.trim() && Number(word.confidence || 0) > 35)
    .map(word => ({
      text: fixOcrToken(word.text.trim()),
      confidence: Number(word.confidence || 0),
      x: (word.bbox.x0 + word.bbox.x1) / 2 / imageWidth,
      y: (word.bbox.y0 + word.bbox.y1) / 2,
      height: Math.max(8, word.bbox.y1 - word.bbox.y0),
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const lines = [];
  for (const word of usableWords) {
    let line = lines.find(candidate =>
      Math.abs(candidate.y - word.y) <= Math.max(12, word.height * 0.85)
    );
    if (!line) {
      line = { y: word.y, words: [] };
      lines.push(line);
    }
    line.words.push(word);
    line.y = line.words.reduce((sum, item) => sum + item.y, 0) / line.words.length;
  }

  const avgConfidence = usableWords.length
    ? Math.round(usableWords.reduce((sum, w) => sum + w.confidence, 0) / usableWords.length)
    : 60;

  const lineTexts = lines.map(line =>
    line.words.sort((a, b) => a.x - b.x).map(word => word.text).join(' ')
  );
  return textToRows(lineTexts.join('\n'), Math.max(55, Math.min(90, avgConfidence)));
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
        merged.push({ ...row });
        continue;
      }
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

/**
 * Stronger preprocess: upscale, grayscale, contrast stretch, and soft binarize.
 * Fast enough for multi-page PDFs while improving digit/table OCR accuracy.
 */
function preprocessForOcr(imageLike) {
  const sourceWidth = imageLike.naturalWidth || imageLike.width;
  const sourceHeight = imageLike.naturalHeight || imageLike.height;
  // Target ~2800px on the long side for clearer table digits.
  const scale = Math.max(2.2, Math.min(3.5, 2800 / Math.max(sourceWidth, 1)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageLike, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  // First pass: grayscale + gather histogram for a global threshold.
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    hist[gray] += 1;
  }

  // Otsu-like threshold from histogram.
  const total = canvas.width * canvas.height;
  let sumAll = 0;
  for (let t = 0; t < 256; t += 1) sumAll += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 140;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  // Second pass: contrast + soft mix of grayscale and binary (keeps edges for OCR).
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i];
    const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.65 + 128));
    const binary = contrast < threshold ? 0 : 255;
    const out = Math.round(contrast * 0.4 + binary * 0.6);
    data[i] = out;
    data[i + 1] = out;
    data[i + 2] = out;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function extractPdfNativeText(file) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pageTexts = [];
  let charCount = 0;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items || [];
    const lines = [];
    for (const item of items) {
      const text = item.str?.trim();
      if (!text) continue;
      const y = item.transform?.[5] ?? 0;
      let line = lines.find(candidate => Math.abs(candidate.y - y) < 5);
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

  if (charCount < 80) return null;
  return {
    text: pageTexts.join('\n\n'),
    pageCount,
    totalPages: pdf.numPages,
  };
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

async function pdfToImages(file, onProgress) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new Error(
      `This PDF has ${pdf.numPages} pages. Please upload a PDF with up to ${MAX_PDF_PAGES} pages.`
    );
  }

  const images = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress?.(
      Math.round(((pageNumber - 1) / pdf.numPages) * 20),
      `Rendering PDF page ${pageNumber} of ${pdf.numPages}...`
    );
    const page = await pdf.getPage(pageNumber);
    // Higher scale for clearer OCR on dense invoice tables.
    const viewport = page.getViewport({ scale: 3.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;
    const processed = preprocessForOcr(canvas);
    images.push({
      source: processed,
      preview: canvas.toDataURL('image/jpeg', 0.88),
      width: processed.width,
      label: `Page ${pageNumber}`,
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
    label: file.name,
  };
}

async function recognizePage(worker, source, baseConfidence) {
  // Pass 1: full invoice text (letters + numbers).
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/%.'() +",
  });
  const resultA = await worker.recognize(source.source, {}, { blocks: true });

  // Pass 2: sparse layout.
  await worker.setParameters({
    tessedit_pageseg_mode: '4',
    preserve_interword_spaces: '1',
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/%.'() +",
  });
  const resultB = await worker.recognize(source.source, {}, { blocks: true });

  // Pass 3: digits-focused — improves MRP / QTY / RATE / Amount accuracy.
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
    tessedit_char_whitelist: '0123456789./%- ',
  });
  const resultC = await worker.recognize(source.source, {}, { blocks: true });

  const textA = resultA.data.text || '';
  const textB = resultB.data.text || '';
  const textC = resultC.data.text || '';
  const meanConfA = Number(resultA.data.confidence || 0);
  const meanConfB = Number(resultB.data.confidence || 0);

  const wordsFrom = result =>
    (result.data.blocks || []).flatMap(block =>
      (block.paragraphs || []).flatMap(paragraph =>
        (paragraph.lines || []).flatMap(line => line.words || [])
      )
    );

  const fromWordsA = wordsToRows(wordsFrom(resultA), source.width);
  const fromWordsB = wordsToRows(wordsFrom(resultB), source.width);
  const fromTextA = textToRows(textA, Math.max(baseConfidence, Math.round(meanConfA || baseConfidence)));
  const fromTextB = textToRows(textB, Math.max(baseConfidence - 5, Math.round(meanConfB || baseConfidence - 5)));
  // Merge digit-pass numbers into letter-pass rows by repairing numeric fields.
  const letterRows = mergeDetectedRows(fromTextA, fromTextB, fromWordsA, fromWordsB);
  const digitNumbers = extractNumbers(textC);
  if (letterRows.length && digitNumbers.length >= letterRows.length * 2) {
    // Soft-correct money fields when digit pass is denser.
    letterRows.forEach((row, index) => {
      const sliceStart = index * Math.floor(digitNumbers.length / letterRows.length);
      const slice = digitNumbers.slice(sliceStart, sliceStart + 8);
      if (!slice.length) return;
      const money = slice.filter(n => !Number.isInteger(n) || n > 28);
      if (money[0] && (!row.mrp || Math.abs(row.mrp - money[0]) > 0.05)) {
        // Prefer digit-pass MRP when current looks like OCR garbage (too round / zero).
        if (!row.mrp || row.mrp < 1) row.mrp = money[0];
      }
      const rateCand = money.find(n => n > 0 && n < (row.mrp || Infinity));
      if (rateCand && (!row.rate || row.rate < 1)) row.rate = rateCand;
      const amountCand = money[money.length - 1];
      if (amountCand && (!row.value || row.value < 1)) row.value = amountCand;
      const qtyCand = slice.find(n => Number.isInteger(n) && n > 0 && n <= 999);
      if (qtyCand && row.qty === 1 && qtyCand !== 1) row.qty = qtyCand;
    });
  }

  const combinedText = [textA, textB, '--- digits ---\n' + textC]
    .sort((a, b) => b.length - a.length)[0];
  return { text: combinedText.includes('digits') ? `${textA}\n${textC}` : combinedText, rows: letterRows };
}

function validateUploadSelection(files) {
  if (!files.length) {
    return { error: 'Please select at least one file.' };
  }

  const oversized = files.find(file => file.size > MAX_FILE_SIZE_MB * 1024 * 1024);
  if (oversized) {
    return {
      error: `"${oversized.name}" is larger than ${MAX_FILE_SIZE_MB} MB. Compress or split the document.`,
    };
  }

  const pdfs = files.filter(isPdfFile);
  const images = files.filter(isImageFile);
  const others = files.filter(file => !isPdfFile(file) && !isImageFile(file));

  if (others.length) {
    return { error: `Unsupported file type: ${others[0].name}. Use JPG, PNG, WEBP or PDF.` };
  }
  if (pdfs.length && images.length) {
    return { error: 'Upload either PDF files or images in one go — not both together.' };
  }
  if (pdfs.length > 1) {
    return { error: 'Upload one PDF at a time (multi-page PDFs up to 6 pages are supported).' };
  }
  if (images.length > MAX_IMAGES) {
    return { error: `You can upload up to ${MAX_IMAGES} images at once.` };
  }

  return { pdfs, images };
}

export default function PurchaseDocumentImport() {
  const { state, dispatch } = useApp();
  const [files, setFiles] = useState([]);
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

  const processDocuments = async selectedFiles => {
    const validation = validateUploadSelection(selectedFiles);
    if (validation.error) {
      setStatus(validation.error);
      return;
    }

    setFiles(selectedFiles);
    setProcessing(true);
    setProgress(0);
    setRows([]);
    setRawText('');
    setColumnMapping(DEFAULT_COLUMN_MAPPING);
    setStatus('Preparing document...');

    let worker;
    try {
      const { pdfs, images } = validation;

      // 1) Digital PDFs with selectable text are far more accurate than photos.
      if (pdfs.length === 1) {
        const selectedFile = pdfs[0];
        setStatus('Checking whether this PDF has selectable text...');
        const native = await extractPdfNativeText(selectedFile);
        if (native) {
          if (native.totalPages > MAX_PDF_PAGES) {
            setStatus(
              `This PDF has ${native.totalPages} pages. Only the first ${MAX_PDF_PAGES} pages were used.`
            );
          }
          const nativeRows = textToRows(native.text, 95);
          setRawText(native.text);
          setPreviews([]);
          setRows(autoMatchRows(nativeRows));
          setProgress(100);
          setStatus(
            nativeRows.length
              ? `Digital PDF text used · ${native.pageCount} page(s) · ${nativeRows.length} rows found. Review values, then save.`
              : 'PDF text was found, but product rows were not detected. Add rows manually from the raw text.'
          );
          return;
        }
      }

      // 2) Photos / scanned PDFs: enhance image, dual-pass OCR, then parse.
      let sources = [];
      if (pdfs.length === 1) {
        sources = await pdfToImages(pdfs[0], (pct, message) => {
          setProgress(pct);
          setStatus(message);
        });
      } else {
        setStatus(`Preparing ${images.length} image(s)...`);
        for (let i = 0; i < images.length; i += 1) {
          setProgress(Math.round((i / images.length) * 15));
          sources.push(await imageFileToSource(images[i]));
        }
      }

      setPreviews(sources.map(item => item.preview));

      worker = await createWorker('eng', 1, {
        logger: message => {
          if (message.status === 'recognizing text') {
            // Dual pass OCR: map 0-100 within current page window later.
            setProgress(prev => Math.max(prev, 15 + Math.round(message.progress * 10)));
          }
        },
      });

      const allRows = [];
      const textParts = [];
      for (let index = 0; index < sources.length; index += 1) {
        const pageLabel = sources[index].label || `page ${index + 1}`;
        setStatus(`Recognizing ${pageLabel} (${index + 1} of ${sources.length}) — pass 1/2...`);
        const pageStart = 20 + Math.round((index / sources.length) * 75);
        setProgress(pageStart);

        const { text, rows: pageRows } = await recognizePage(worker, sources[index], 78);
        textParts.push(`--- ${pageLabel} ---\n${text}`);
        allRows.push(...pageRows);

        setProgress(20 + Math.round(((index + 1) / sources.length) * 75));
        setStatus(`Recognizing ${pageLabel} (${index + 1} of ${sources.length}) — done`);
      }

      const detected = mergeDetectedRows(allRows);
      setRawText(textParts.join('\n\n'));
      setRows(autoMatchRows(detected));
      setProgress(100);
      setStatus(
        detected.length
          ? `${detected.length} product rows detected from ${sources.length} page(s)/image(s). Please verify batch, qty and rate before saving.`
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
        const expiry = normalizeExpiry(row.expiry) || '';
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
              rackLocation: row.rack || '',
              minStock: 0,
              cgst: Number(row.tax || 0) / 2,
              sgst: Number(row.tax || 0) / 2,
              batches: [{
                batch: row.batch.trim(),
                expiry,
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
          free: Number(row.free) || 0,
          rate: Number(row.rate || 0),
          mrp: Number(row.mrp || 0),
          oldMrp: Number(row.oldMrp) || 0,
          discount: Number(row.discount) || 0,
          cgst: Number(row.tax || 0) / 2,
          sgst: Number(row.tax || 0) / 2,
          batch: row.batch.trim(),
          expiry,
          rack: row.rack || '',
          manufacturer: row.manufacturer || '',
          pack: row.pack || '',
          lineAmt: Number(row.qty) * Number(row.rate || 0),
          total: Number(row.value) || Number(row.qty) * Number(row.rate || 0),
        });
      }

      let documentPayload = null;
      const sourceFile = files[0];
      if (sourceFile) {
        const dataUrl = await fileToBase64(sourceFile);
        documentPayload = {
          name: sourceFile.name,
          mime: sourceFile.type || 'application/octet-stream',
          dataBase64: dataUrl,
        };
      } else if (previews[0] && String(previews[0]).startsWith('data:')) {
        // Fallback: attach first rendered page preview if original File was lost
        documentPayload = {
          name: 'purchase-document.jpg',
          mime: 'image/jpeg',
          dataBase64: previews[0],
        };
      }

      const purchaseId = billNumber.trim() || await nextDocumentNo('purchase');
      const saved = await dispatch({
        type: 'ADD_PURCHASE',
        payload: {
          id: purchaseId,
          date: dayjs(billDate).format('DD-MM-YYYY'),
          supplier: selectedSupplier.name,
          supplierId: selectedSupplier.id,
          amount: total,
          status: 'Received',
          items: purchaseItems,
          document: documentPayload,
        },
      });

      const attached = Boolean(saved?.hasDocument || saved?.documentName);
      alert(
        attached
          ? `Purchase ${saved.id} saved with document attached.`
          : `Purchase ${saved.id} saved.${documentPayload ? ' Warning: document was not attached — try re-uploading from purchase details.' : ''}`
      );
      setRows([]);
      setFiles([]);
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
          Upload a distributor invoice (multi-page PDF or multiple photos), review recognized rows,
          then save them as purchase and batch stock.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold">Best accuracy tips</p>
        <ul className="mt-1 text-xs space-y-1 list-disc pl-4">
          <li>Prefer the original digital PDF from the supplier (text selectable with mouse) — near 95% accurate.</li>
          <li>PDF invoices: up to {MAX_PDF_PAGES} pages are accepted in one upload.</li>
          <li>Phone photos: upload up to {MAX_IMAGES} clear images of the product table (one page per photo).</li>
          <li>Capture the full product table flat, bright, and without handwritten marks over quantity.</li>
        </ul>
      </div>

      <div className="card">
        <label className="block border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30">
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf,.pdf"
            multiple
            className="hidden"
            disabled={processing}
            onChange={event => {
              const selected = Array.from(event.target.files || []);
              if (selected.length) processDocuments(selected);
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
                Upload Purchase Bill Image(s) or PDF
              </p>
              <p className="text-xs text-slate-400 mt-1">
                JPG / PNG / WEBP (up to {MAX_IMAGES} images) or PDF (up to {MAX_PDF_PAGES} pages) · OCR runs locally
              </p>
            </>
          )}
        </label>
        {files.length > 0 && !processing && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <FileImage className="w-4 h-4" />
            <span>{files.map(file => file.name).join(', ')}</span>
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
            ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          {status}
        </div>
      )}

      {previews.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-slate-700 text-sm mb-3">
            Document Preview ({previews.length} page{previews.length > 1 ? 's' : ''})
          </h3>
          <div className="flex gap-3 overflow-x-auto">
            {previews.map((preview, index) => (
              <img
                key={`${preview}-${index}`}
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
              <table className="data-table min-w-[2100px]">
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
                        if (target?.expiry || source.key === 'expiry') {
                          return (
                            <td key={source.key}>
                              <ExpiryInput
                                value={row[source.key]}
                                onChange={value => setRow(index, source.key, value)}
                                className={`form-input text-xs ${target?.width || 'w-28'} ${
                                  targetKey === 'ignore' ? 'bg-slate-100 text-slate-400' : ''
                                }`}
                              />
                            </td>
                          );
                        }
                        return (
                        <td key={source.key}>
                          <input
                            type={target?.numeric ? 'number' : 'text'}
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
                          row.confidence >= 80 ? 'badge-success' :
                          row.confidence >= 60 ? 'badge-warning' : 'badge-danger'
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
