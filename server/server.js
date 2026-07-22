import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDb, dbAll, dbRun, dbGet } from './db.js';
import { startBackupJob, performBackup } from './backup.js';

// In Electron we pass env from main; don't let a local .env override the desktop port.
if (!process.env.PHARMACY_PORT) {
  dotenv.config();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = process.env.UI_DIST_PATH
  ? path.resolve(process.env.UI_DIST_PATH)
  : path.join(__dirname, '..', 'dist');
const uploadRoot = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, 'uploads');
const purchaseDocDir = path.join(uploadRoot, 'purchase-docs');

const app = express();
// Prefer PHARMACY_PORT so a shell/dotenv PORT=5000 cannot steal the Electron port.
const PORT = Number(process.env.PHARMACY_PORT || process.env.PORT) || 5000;

app.use(cors());
app.use(express.json({ limit: '40mb' }));

/** Normalize pharmacy expiry to MM/YY. */
function normalizeExpiry(value) {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  let match = text.match(/^(0[1-9]|1[0-2])[\/\-](\d{2})$/);
  if (match) return `${match[1]}/${match[2]}`;
  match = text.match(/^(0[1-9]|1[0-2])[\/\-](\d{4})$/);
  if (match) return `${match[1]}/${match[2].slice(-2)}`;
  match = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
    return `${match[2]}/${match[1].slice(-2)}`;
  }
  match = text.match(/(0[1-9]|1[0-2])\D?(\d{2,4})/);
  if (match) return `${match[1]}/${match[2].slice(-2)}`;
  return text.slice(0, 7);
}

/** True if expiry month is still valid (end of month >= today). */
function isExpiryValid(value, asOf = new Date()) {
  const norm = normalizeExpiry(value);
  if (!norm) return true;
  const m = norm.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if (!m) {
    // Legacy YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return String(value) >= asOf.toISOString().slice(0, 10);
    }
    return true;
  }
  const end = new Date(2000 + Number(m[2]), Number(m[1]), 0, 23, 59, 59, 999);
  return end >= asOf;
}

function ensurePurchaseDocDir() {
  fs.mkdirSync(purchaseDocDir, { recursive: true });
}

function savePurchaseDocument(purchaseId, document) {
  if (!document?.dataBase64) return null;
  ensurePurchaseDocDir();
  const safeId = String(purchaseId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const originalName = String(document.name || 'purchase-document').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  const mime = String(document.mime || 'application/octet-stream');
  const ext = path.extname(originalName)
    || (mime.includes('pdf') ? '.pdf'
      : mime.includes('png') ? '.png'
        : mime.includes('webp') ? '.webp'
          : '.jpg');
  const fileName = `${safeId}_${Date.now()}${ext}`;
  const filePath = path.join(purchaseDocDir, fileName);
  const base64 = String(document.dataBase64).replace(/^data:[^;]+;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return {
    documentName: originalName,
    documentMime: mime,
    documentPath: filePath,
  };
}

async function syncProductStock(productId) {
  const total = await dbGet(
    'SELECT COALESCE(SUM(stock), 0) AS stock FROM product_batches WHERE productId = ?',
    [productId]
  );
  const primaryBatch = await dbGet(
    `SELECT batch, expiry, mrp, rate, purchaseRate
     FROM product_batches
     WHERE productId = ?
     ORDER BY CASE WHEN stock > 0 THEN 0 ELSE 1 END,
              CASE WHEN expiry IS NULL OR expiry = '' THEN 1 ELSE 0 END,
              expiry ASC, id ASC
     LIMIT 1`,
    [productId]
  );
  await dbRun(
    `UPDATE products
     SET stock = ?, batch = COALESCE(?, batch), expiry = COALESCE(?, expiry),
         mrp = COALESCE(?, mrp), rate = COALESCE(?, rate),
         purchaseRate = COALESCE(?, purchaseRate)
     WHERE id = ?`,
    [
      total?.stock || 0, primaryBatch?.batch, primaryBatch?.expiry,
      primaryBatch?.mrp, primaryBatch?.rate, primaryBatch?.purchaseRate, productId
    ]
  );
}

async function getProductsWithBatches(where = '', params = []) {
  const products = await dbAll(`SELECT * FROM products ${where}`, params);
  if (!products.length) return products;

  const ids = products.map(product => product.id);
  const placeholders = ids.map(() => '?').join(',');
  const batches = await dbAll(
    `SELECT * FROM product_batches
     WHERE productId IN (${placeholders})
     ORDER BY CASE WHEN expiry IS NULL OR expiry = '' THEN 1 ELSE 0 END, expiry ASC, id ASC`,
    ids
  );

  return products.map(product => {
    const productBatches = batches.filter(batch => batch.productId === product.id);
    return {
      ...product,
      consolidatedSaleEnabled: Number(product.consolidatedSaleEnabled) === 1 ? 1 : 0,
      stock: productBatches.reduce((sum, batch) => sum + Number(batch.stock || 0), 0),
      batches: productBatches,
    };
  });
}

// Initialize Database & Start Cron Backup
initDb()
  .then(() => {
    console.log('Database initialized successfully.');
    startBackupJob();
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
  });

// ─── PRODUCTS ENDPOINTS ──────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    // Catalog-only medicines stay out of the normal inventory payload until
    // their first purchase creates stock and promotes them to inventory.
    const products = await getProductsWithBatches(
      'WHERE COALESCE(isCatalog, 0) = 0'
    );
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/catalog-stats', async (req, res) => {
  try {
    const inventory = await dbGet(
      'SELECT COUNT(*) AS count FROM products WHERE COALESCE(isCatalog, 0) = 0'
    );
    const catalog = await dbGet(
      'SELECT COUNT(*) AS count FROM products WHERE COALESCE(isCatalog, 0) = 1'
    );
    res.json({
      inventory: Number(inventory?.count) || 0,
      catalog: Number(catalog?.count) || 0,
      total: (Number(inventory?.count) || 0) + (Number(catalog?.count) || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/catalog', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const where = query
      ? `WHERE name LIKE ? COLLATE NOCASE
         OR COALESCE(hsn, '') LIKE ?
         OR COALESCE(manufacturer, '') LIKE ? COLLATE NOCASE`
      : '';
    const params = query ? [`%${query}%`, `%${query}%`, `%${query}%`] : [];

    const countRow = await dbGet(
      `SELECT COUNT(*) AS count FROM products ${where}`,
      params
    );
    const total = Number(countRow?.count) || 0;
    const products = await dbAll(
      `SELECT id, name, hsn, category, manufacturer, grams, packType,
              mrp, rate, purchaseRate, stock, minStock, expiry, batch,
              boxNo, rackLocation, isCatalog
       FROM products
       ${where}
       ORDER BY name COLLATE NOCASE
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      products,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json([]);

    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 20));
    const prefix = `${query}%`;
    const contains = `%${query}%`;
    const products = await getProductsWithBatches(
      `WHERE name LIKE ? COLLATE NOCASE OR COALESCE(hsn, '') LIKE ?
       ORDER BY CASE WHEN name LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, name COLLATE NOCASE
       LIMIT ?`,
      [contains, contains, prefix, limit]
    );
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/catalog-import', async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows || rows.length === 0 || rows.length > 1000) {
    return res.status(400).json({ error: 'rows must contain between 1 and 1000 medicines' });
  }

  let transactionStarted = false;
  let imported = 0;
  let skipped = 0;
  try {
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;

    for (const row of rows) {
      const name = String(row?.name || '').trim().slice(0, 240);
      const catalogKey = String(row?.catalogKey || '').trim().slice(0, 500);
      if (!name || !catalogKey) {
        skipped += 1;
        continue;
      }

      const result = await dbRun(
        `INSERT OR IGNORE INTO products
          (name, hsn, category, mrp, rate, cgst, sgst, stock, minStock,
           expiry, batch, manufacturer, grams, packType, boxNo, rackLocation,
           isCatalog, catalogKey)
         SELECT ?, '', ?, 0, 0, 0, 0, 0, 0, '', '', '', ?, ?, '', '', 1, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM products WHERE name = ? COLLATE NOCASE
         )`,
        [
          name, row.category || 'Others', row.grams || '', row.packType || '',
          catalogKey, name
        ]
      );
      if (result.changes > 0) imported += 1;
      else skipped += 1;
    }

    await dbRun('COMMIT');
    transactionStarted = false;
    res.json({ imported, skipped, processed: rows.length });
  } catch (err) {
    if (transactionStarted) await dbRun('ROLLBACK').catch(() => {});
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  const {
    name, hsn, category, mrp, rate, purchaseRate, cgst, sgst, stock, minStock,
    expiry, batch, batches, manufacturer, grams, packType, boxNo, rackLocation
  } = req.body;
  let transactionStarted = false;
  try {
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;

    const requestedBatches = Array.isArray(batches)
      ? batches
          .map(item => ({
            batch: String(item.batch || '').trim(),
            expiry: item.expiry || '',
            stock: Math.max(0, Number(item.stock) || 0),
            mrp: Number(item.mrp ?? mrp) || 0,
            rate: Number(item.rate ?? rate) || 0,
            purchaseRate: Number(item.purchaseRate ?? purchaseRate ?? item.rate ?? rate) || 0,
            cgst: Number(item.cgst ?? cgst) || 0,
            sgst: Number(item.sgst ?? sgst) || 0,
          }))
          .filter(item => item.batch)
      : [];

    const duplicateBatch = requestedBatches.find(
      (item, index) =>
        requestedBatches.findIndex(
          candidate => candidate.batch.toLowerCase() === item.batch.toLowerCase()
        ) !== index
    );
    if (duplicateBatch) {
      throw new Error(`Duplicate batch number: ${duplicateBatch.batch}`);
    }

    const primaryBatch = requestedBatches[0] || {
      batch: String(batch || '').trim(),
      expiry: expiry || '',
      stock: Math.max(0, Number(stock) || 0),
      mrp: Number(mrp) || 0,
      rate: Number(rate) || 0,
      purchaseRate: Number(purchaseRate ?? rate) || 0,
      cgst: Number(cgst) || 0,
      sgst: Number(sgst) || 0,
    };
    const totalStock = requestedBatches.length
      ? requestedBatches.reduce((sum, item) => sum + item.stock, 0)
      : primaryBatch.stock;

    const result = await dbRun(
      `INSERT INTO products (name, hsn, category, mrp, rate, purchaseRate, cgst, sgst, stock, minStock, expiry, batch, manufacturer, grams, packType, boxNo, rackLocation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, hsn, category, primaryBatch.mrp, primaryBatch.rate, primaryBatch.purchaseRate,
        primaryBatch.cgst, primaryBatch.sgst, totalStock, minStock,
        primaryBatch.expiry, primaryBatch.batch, manufacturer,
        grams || '', packType || '', boxNo || '', rackLocation || ''
      ]
    );
    const batchesToInsert = requestedBatches.length
      ? requestedBatches
      : [{ ...primaryBatch, batch: primaryBatch.batch || `DEFAULT-${result.lastID}` }];
    for (const item of batchesToInsert) {
      await dbRun(
        `INSERT INTO product_batches (productId, batch, expiry, stock, mrp, rate, purchaseRate, cgst, sgst)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.lastID, item.batch, item.expiry, item.stock,
          item.mrp, item.rate, item.purchaseRate, item.cgst, item.sgst
        ]
      );
    }
    await dbRun('COMMIT');
    transactionStarted = false;

    const [newProduct] = await getProductsWithBatches('WHERE id = ?', [result.lastID]);
    res.status(201).json(newProduct);
  } catch (err) {
    if (transactionStarted) await dbRun('ROLLBACK').catch(() => {});
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, hsn, category, mrp, rate, cgst, sgst, stock, minStock, expiry, batch, manufacturer, grams, packType, boxNo, rackLocation } = req.body;
  try {
    await dbRun(
      `UPDATE products SET name = ?, hsn = ?, category = ?, mrp = ?, rate = ?, cgst = ?, sgst = ?, stock = ?, minStock = ?, expiry = ?, batch = ?, manufacturer = ?, grams = ?, packType = ?, boxNo = ?, rackLocation = ?
       WHERE id = ?`,
      [name, hsn, category, mrp, rate, cgst, sgst, stock, minStock, expiry, batch, manufacturer, grams || '', packType || '', boxNo || '', rackLocation || '', id]
    );
    const batchCount = await dbGet(
      'SELECT COUNT(*) AS count FROM product_batches WHERE productId = ?',
      [id]
    );
    // Product editing may adjust inventory only while the product has one
    // batch. Multi-batch stock is changed through purchases and sales.
    if (batchCount.count <= 1) {
      const batchName = String(batch || `DEFAULT-${id}`).trim();
      const existingBatch = await dbGet(
        'SELECT * FROM product_batches WHERE productId = ?',
        [id]
      );
      if (existingBatch) {
        await dbRun(
          `UPDATE product_batches
           SET batch = ?, expiry = ?, stock = ?, mrp = ?, rate = ?, cgst = ?, sgst = ?
           WHERE id = ?`,
          [batchName, expiry || '', Number(stock) || 0, mrp, rate, cgst, sgst, existingBatch.id]
        );
      } else {
        await dbRun(
          `INSERT INTO product_batches (productId, batch, expiry, stock, mrp, rate, cgst, sgst)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, batchName, expiry || '', Number(stock) || 0, mrp, rate, cgst, sgst]
        );
      }
    }
    await syncProductStock(id);
    const [updated] = await getProductsWithBatches('WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id/adjustments', async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT adjustment.*, batch.batch
       FROM inventory_adjustments adjustment
       JOIN product_batches batch ON batch.id = adjustment.batchId
       WHERE adjustment.productId = ?
       ORDER BY adjustment.createdAt DESC
       LIMIT 50`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/:id/adjustments', async (req, res) => {
  const productId = Number(req.params.id);
  const adjustmentType = String(req.body?.adjustmentType || '').toLowerCase();
  const quantity = Math.max(0, Number(req.body?.quantity) || 0);
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  const allowedTypes = new Set(['increase', 'decrease', 'set', 'price', 'add_stock']);
  const batchName = String(req.body?.batch || '').trim();
  const rawBatchId = Number(req.body?.batchId);
  const hasValidBatchId = Number.isInteger(rawBatchId) && rawBatchId > 0;
  // Any free-text batch number is allowed — create/reuse that batch for catalog or temp stock.
  const createNewBatch =
    Boolean(req.body?.createNewBatch) ||
    adjustmentType === 'add_stock' ||
    Boolean(batchName) ||
    !hasValidBatchId;
  let batchId = hasValidBatchId ? rawBatchId : NaN;

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Select a valid product' });
  }
  if (!allowedTypes.has(adjustmentType)) {
    return res.status(400).json({ error: 'Invalid adjustment type' });
  }
  if (adjustmentType !== 'price' && adjustmentType !== 'set' && quantity <= 0) {
    return res.status(400).json({ error: 'Adjustment quantity must be greater than zero' });
  }
  if (!reason) {
    return res.status(400).json({ error: 'Adjustment reason is required' });
  }
  if (createNewBatch && !batchName) {
    return res.status(400).json({ error: 'Enter a batch number' });
  }

  let transactionStarted = false;
  try {
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;

    const product = await dbGet('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) throw new Error('Product was not found');

    // Catalog / temporary stock: accept any batch number string and create it if needed.
    if (createNewBatch) {
      const newBatchName = batchName || `TEMP-${Date.now().toString().slice(-6)}`;
      const existing = await dbGet(
        'SELECT id FROM product_batches WHERE productId = ? AND LOWER(batch) = LOWER(?)',
        [productId, newBatchName]
      );
      if (existing) {
        batchId = existing.id;
      } else {
        const inserted = await dbRun(
          `INSERT INTO product_batches (productId, batch, expiry, stock, mrp, rate, purchaseRate, cgst, sgst)
           VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
          [
            productId,
            newBatchName,
            req.body?.expiry || '',
            Math.max(0, Number(req.body?.mrp ?? product.mrp) || 0),
            Math.max(0, Number(req.body?.saleRate ?? product.rate) || 0),
            Math.max(0, Number(req.body?.purchaseRate ?? product.purchaseRate ?? product.rate) || 0),
            Number(product.cgst) || 0,
            Number(product.sgst) || 0,
          ]
        );
        batchId = inserted.lastID;
      }
    }

    const batch = await dbGet(
      'SELECT * FROM product_batches WHERE id = ? AND productId = ?',
      [batchId, productId]
    );
    if (!batch) throw new Error('Could not create or find the batch. Please try again.');

    const effectiveType = adjustmentType === 'add_stock' ? 'increase' : adjustmentType;
    const stockBefore = Number(batch.stock) || 0;
    let stockAfter = stockBefore;
    if (effectiveType === 'increase') stockAfter = stockBefore + quantity;
    if (effectiveType === 'decrease') stockAfter = stockBefore - quantity;
    if (effectiveType === 'set') stockAfter = quantity;
    if (stockAfter < 0) throw new Error('Adjustment cannot make batch stock negative');

    const purchaseRateAfter = req.body.purchaseRate === '' || req.body.purchaseRate == null
      ? Number(batch.purchaseRate) || 0
      : Math.max(0, Number(req.body.purchaseRate) || 0);
    const saleRateAfter = req.body.saleRate === '' || req.body.saleRate == null
      ? Number(batch.rate) || 0
      : Math.max(0, Number(req.body.saleRate) || 0);
    const mrpAfter = req.body.mrp === '' || req.body.mrp == null
      ? Number(batch.mrp) || 0
      : Math.max(0, Number(req.body.mrp) || 0);
    const expiryAfter = req.body.expiry != null && String(req.body.expiry).trim() !== ''
      ? normalizeExpiry(req.body.expiry)
      : normalizeExpiry(batch.expiry);

    await dbRun(
      `UPDATE product_batches
       SET stock = ?, purchaseRate = ?, rate = ?, mrp = ?, expiry = ?
       WHERE id = ?`,
      [stockAfter, purchaseRateAfter, saleRateAfter, mrpAfter, expiryAfter || '', batchId]
    );

    // Promote catalog medicines into active inventory once stock is added.
    await dbRun(
      `UPDATE products
       SET isCatalog = 0,
           purchaseRate = ?,
           rate = ?,
           mrp = ?,
           batch = ?,
           expiry = COALESCE(NULLIF(?, ''), expiry)
       WHERE id = ?`,
      [purchaseRateAfter, saleRateAfter, mrpAfter, batch.batch, expiryAfter || '', productId]
    );

    await dbRun(
      `INSERT INTO inventory_adjustments
       (productId, batchId, adjustmentType, quantity, stockBefore, stockAfter,
        purchaseRateBefore, purchaseRateAfter, saleRateBefore, saleRateAfter,
        mrpBefore, mrpAfter, reason, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId, batchId, effectiveType, quantity, stockBefore, stockAfter,
        Number(batch.purchaseRate) || 0, purchaseRateAfter,
        Number(batch.rate) || 0, saleRateAfter,
        Number(batch.mrp) || 0, mrpAfter, reason, Date.now()
      ]
    );
    await syncProductStock(productId);

    await dbRun('COMMIT');
    transactionStarted = false;
    const [updated] = await getProductsWithBatches('WHERE id = ?', [productId]);
    res.json(updated);
  } catch (err) {
    if (transactionStarted) await dbRun('ROLLBACK').catch(() => {});
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await dbRun('DELETE FROM product_batches WHERE productId = ?', [id]);
    await dbRun('DELETE FROM products WHERE id = ?', [id]);
    res.json({ success: true, message: `Product ${id} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CUSTOMERS ENDPOINTS ─────────────────────────────────────────────────────
app.get('/api/customers', async (req, res) => {
  try {
    const customers = await dbAll('SELECT * FROM customers');
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', async (req, res) => {
  const { name, phone, email, gstin, address } = req.body;
  try {
    const result = await dbRun(
      `INSERT INTO customers (name, phone, email, gstin, address) VALUES (?, ?, ?, ?, ?)`,
      [name, phone, email, gstin, address]
    );
    const newCustomer = await dbGet('SELECT * FROM customers WHERE id = ?', [result.lastID]);
    res.status(201).json(newCustomer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DOCUMENT NUMBER SEQUENCES (PO2607001 / SL2607001) ───────────────────────
function currentYyMm(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

async function nextDocumentNumber(prefix) {
  const yymm = currentYyMm();
  await dbRun('BEGIN IMMEDIATE TRANSACTION');
  try {
    let row = await dbGet(
      'SELECT lastNo FROM document_sequences WHERE prefix = ? AND yymm = ?',
      [prefix, yymm]
    );
    let next = 1;
    if (row) {
      next = Number(row.lastNo || 0) + 1;
      await dbRun(
        'UPDATE document_sequences SET lastNo = ? WHERE prefix = ? AND yymm = ?',
        [next, prefix, yymm]
      );
    } else {
      // Seed from any existing docs already saved for this month (legacy / imports).
      const like = `${prefix}${yymm}%`;
      const existing = await dbAll(
        `SELECT id FROM invoices WHERE id LIKE ?
         UNION ALL
         SELECT id FROM purchase_invoices WHERE id LIKE ?`,
        [like, like]
      );
      let max = 0;
      for (const item of existing) {
        const match = String(item.id || '').match(new RegExp(`^${prefix}${yymm}(\\d+)$`));
        if (match) max = Math.max(max, Number(match[1]));
      }
      next = max + 1;
      await dbRun(
        'INSERT INTO document_sequences (prefix, yymm, lastNo) VALUES (?, ?, ?)',
        [prefix, yymm, next]
      );
    }
    await dbRun('COMMIT');
    return `${prefix}${yymm}${String(next).padStart(3, '0')}`;
  } catch (err) {
    await dbRun('ROLLBACK').catch(() => {});
    throw err;
  }
}

app.post('/api/document-numbers/next', async (req, res) => {
  try {
    const type = String(req.body?.type || '').toLowerCase();
    const prefix = type === 'purchase' || type === 'po' ? 'PO'
      : type === 'sale' || type === 'sl' ? 'SL'
        : null;
    if (!prefix) {
      return res.status(400).json({ error: 'type must be purchase or sale' });
    }
    const id = await nextDocumentNumber(prefix);
    res.json({ id, prefix });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function validateSupplierPayload(body) {
  const name = String(body?.name || '').trim();
  const phone = String(body?.phone || '').trim();
  const gstin = String(body?.gstin || '').trim().toUpperCase();
  const pan = String(body?.pan || '').trim().toUpperCase();
  const address = String(body?.address || '').trim();
  const drugLicense = String(body?.drugLicense || '').trim();

  if (!name) return { error: 'Supplier name is required' };
  if (!address) return { error: 'Full address is required' };
  if (!phone) return { error: 'Phone number is required' };
  if (!/^\d{10}$/.test(phone.replace(/\D/g, '')) && !/^\+?\d{10,15}$/.test(phone.replace(/[\s-]/g, ''))) {
    return { error: 'Enter a valid phone number (10 digits)' };
  }
  if (!gstin) return { error: 'GST number is mandatory' };
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    return { error: 'Enter a valid 15-character GSTIN' };
  }
  if (!pan) return { error: 'PAN number is mandatory' };
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    return { error: 'Enter a valid PAN (e.g. ABCDE1234F)' };
  }
  // PAN should match GSTIN characters 3–12
  if (gstin.slice(2, 12) !== pan) {
    return { error: 'PAN must match the GSTIN (characters 3–12 of GSTIN)' };
  }

  return {
    data: {
      name,
      phone: phone.replace(/[\s-]/g, ''),
      gstin,
      pan,
      address,
      drugLicense,
    },
  };
}

// ─── SUPPLIERS ENDPOINTS ─────────────────────────────────────────────────────
app.get('/api/suppliers', async (req, res) => {
  try {
    const suppliers = await dbAll('SELECT * FROM suppliers');
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppliers', async (req, res) => {
  const checked = validateSupplierPayload(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const { name, phone, gstin, pan, address, drugLicense } = checked.data;
  try {
    const result = await dbRun(
      `INSERT INTO suppliers (name, phone, gstin, pan, address, drugLicense) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, phone, gstin, pan, address, drugLicense || null]
    );
    const newSupplier = await dbGet('SELECT * FROM suppliers WHERE id = ?', [result.lastID]);
    res.status(201).json(newSupplier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const checked = validateSupplierPayload(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const { name, phone, gstin, pan, address, drugLicense } = checked.data;
  try {
    const result = await dbRun(
      `UPDATE suppliers
       SET name = ?, phone = ?, gstin = ?, pan = ?, address = ?, drugLicense = ?
       WHERE id = ?`,
      [name, phone, gstin, pan, address, drugLicense || null, id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    const updated = await dbGet('SELECT * FROM suppliers WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await dbRun('DELETE FROM suppliers WHERE id = ?', [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json({ success: true, id: Number(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── INVOICES ENDPOINTS ──────────────────────────────────────────────────────
app.get('/api/invoices', async (req, res) => {
  try {
    const invoices = await dbAll(`
      SELECT *, COALESCE(createdAt, rowid) AS createdAt
      FROM invoices
      ORDER BY
        CASE
          WHEN date LIKE '__-__-____' THEN
            substr(date, 7, 4) || substr(date, 4, 2) || substr(date, 1, 2)
          ELSE date
        END ASC,
        COALESCE(createdAt, rowid) ASC
    `);
    invoices.forEach(inv => {
      if (inv.items) {
        try {
          inv.items = JSON.parse(inv.items);
        } catch (e) {
          inv.items = [];
        }
      } else {
        inv.items = [];
      }
    });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices', async (req, res) => {
  const {
    id, date, customer, customerId, amount, tax, status, type,
    items, discount, doctor, patient, gstin, customerAddress, createdAt,
    amountPaid, dueAmount, paymentStatus, paymentMethod,
  } = req.body;
  let transactionStarted = false;
  try {
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;

    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item.product?.id || !item.batchId) {
          throw new Error(`Select a batch for ${item.product?.name || 'every product'}`);
        }
        const batch = await dbGet(
          'SELECT * FROM product_batches WHERE id = ? AND productId = ?',
          [item.batchId, item.product.id]
        );
        if (!batch) throw new Error(`Batch not found for ${item.product.name}`);
        if (!isExpiryValid(batch.expiry)) {
          throw new Error(`${item.product.name} (${batch.batch}) is expired`);
        }
        if (Number(batch.stock) < Number(item.qty)) {
          throw new Error(`Insufficient stock for ${item.product.name} (${item.batch || batch.batch})`);
        }
        await dbRun(
          `UPDATE product_batches SET stock = stock - ? WHERE id = ? AND productId = ? AND stock >= ?`,
          [item.qty, item.batchId, item.product.id, item.qty]
        );
        await syncProductStock(item.product.id);
      }
    }

    const billAmount = Number(amount) || 0;
    const paid = amountPaid != null ? Number(amountPaid) : billAmount;
    const due = dueAmount != null ? Number(dueAmount) : Math.max(0, billAmount - paid);
    const payStatus = paymentStatus
      || (due <= 0.009 ? 'Fully Paid' : (paid > 0 ? 'Partial' : 'Unpaid'));
    const invoiceStatus = status || (due <= 0.009 ? 'Paid' : (paid > 0 ? 'Pending' : 'Unpaid'));
    const payMethod = String(paymentMethod || 'Cash').trim() || 'Cash';

    const savedAt = Number(createdAt) || Date.now();
    await dbRun(
      `INSERT INTO invoices
       (id, date, customer, customerId, amount, tax, status, type, items, discount, doctor, patient, gstin, customerAddress, createdAt, amountPaid, dueAmount, paymentStatus, paymentMethod)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, date, customer, customerId || null, billAmount, tax, invoiceStatus, type || 'sale',
        JSON.stringify(items || []), discount || 0, doctor || '', patient || '',
        gstin || '', customerAddress || '', savedAt, paid, due, payStatus, payMethod,
      ]
    );

    await dbRun('COMMIT');
    transactionStarted = false;

    const newInvoice = await dbGet('SELECT * FROM invoices WHERE id = ?', [id]);
    if (newInvoice && newInvoice.items) {
      newInvoice.items = JSON.parse(newInvoice.items);
    }
    res.status(201).json(newInvoice);
  } catch (err) {
    if (transactionStarted) await dbRun('ROLLBACK').catch(() => {});
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/invoices/:id', async (req, res) => {
  const { id } = req.params;
  let transactionStarted = false;

  try {
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;

    const invoice = await dbGet('SELECT * FROM invoices WHERE id = ?', [id]);
    if (!invoice) throw new Error(`Invoice ${id} was not found`);
    if (invoice.type && invoice.type !== 'sale') {
      throw new Error('Only sales invoices can be deleted from sales history');
    }

    let items = [];
    try {
      items = invoice.items ? JSON.parse(invoice.items) : [];
    } catch {
      throw new Error('Invoice items are invalid; stock was not changed');
    }

    for (const item of items) {
      const productId = item.product?.id;
      if (!productId || !Number(item.qty)) continue;
      const productExists = await dbGet('SELECT id FROM products WHERE id = ?', [productId]);
      if (!productExists) {
        throw new Error(
          `Cannot delete invoice because product ${item.product?.name || productId} no longer exists`
        );
      }

      let targetBatch = item.batchId
        ? await dbGet(
            'SELECT * FROM product_batches WHERE id = ? AND productId = ?',
            [item.batchId, productId]
          )
        : null;

      if (!targetBatch) {
        const historicalBatch = String(item.batch || item.product?.batch || '').trim();
        if (historicalBatch) {
          targetBatch = await dbGet(
            'SELECT * FROM product_batches WHERE productId = ? AND batch = ?',
            [productId, historicalBatch]
          );
        }
      }

      if (!targetBatch) {
        targetBatch = await dbGet(
          `SELECT * FROM product_batches
           WHERE productId = ?
           ORDER BY id ASC
           LIMIT 1`,
          [productId]
        );
      }

      if (targetBatch) {
        await dbRun(
          'UPDATE product_batches SET stock = stock + ? WHERE id = ?',
          [Number(item.qty), targetBatch.id]
        );
      } else {
        const restoredBatch = String(
          item.batch || item.product?.batch || `RESTORED-${productId}`
        ).trim();
        await dbRun(
          `INSERT INTO product_batches
             (productId, batch, expiry, stock, mrp, rate, cgst, sgst)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            productId, restoredBatch, item.expiry || item.product?.expiry || '',
            Number(item.qty), item.product?.mrp || item.rate, item.rate,
            item.cgst || 0, item.sgst || 0
          ]
        );
      }

      await syncProductStock(productId);
    }

    await dbRun('DELETE FROM invoices WHERE id = ?', [id]);
    await dbRun('COMMIT');
    transactionStarted = false;

    res.json({ success: true, id, restoredItems: items.length });
  } catch (err) {
    if (transactionStarted) await dbRun('ROLLBACK').catch(() => {});
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// ─── PURCHASE INVOICES ENDPOINTS ──────────────────────────────────────────────
app.get('/api/purchase-invoices', async (req, res) => {
  try {
    const purchases = await dbAll('SELECT * FROM purchase_invoices ORDER BY id DESC');
    purchases.forEach(pur => {
      if (pur.items) {
        try {
          pur.items = JSON.parse(pur.items);
        } catch (e) {
          pur.items = [];
        }
      } else {
        pur.items = [];
      }
      pur.hasDocument = Boolean(pur.documentName || pur.documentPath);
      // Do not expose absolute filesystem paths to the browser
      delete pur.documentPath;
    });
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/purchase-invoices', async (req, res) => {
  const {
    id, date, supplier, supplierId, amount, status, items, document,
    supplierAddress, supplierPhone, supplierGstin, supplierPan,
    goodsValue, discountAmount, taxAmount, roundOff, cashDiscPercent,
    amountPaid, dueAmount, paymentStatus, paymentMethod, supplierDrugLicense,
  } = req.body;
  let transactionStarted = false;
  let savedDoc = null;
  try {
    // Prefer attaching document via /document endpoint for large files.
    // Still accept small payloads here for compatibility.
    if (document?.dataBase64) {
      try {
        savedDoc = savePurchaseDocument(id, document);
      } catch (docErr) {
        console.error('[Purchase] Document save failed (will continue without file):', docErr.message);
        savedDoc = null;
      }
    }

    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;

    const billAmount = Number(amount) || 0;
    const paid = amountPaid != null ? Number(amountPaid) : billAmount;
    const due = dueAmount != null ? Number(dueAmount) : Math.max(0, billAmount - paid);
    const payStatus = paymentStatus
      || (due <= 0.009 ? 'Fully Paid' : (paid > 0 ? 'Partial' : 'Unpaid'));
    const payMethod = String(paymentMethod || 'Cash').trim() || 'Cash';

    await dbRun(
      `INSERT INTO purchase_invoices
       (id, date, supplier, supplierId, amount, status, items, documentName, documentMime, documentPath,
        supplierAddress, supplierPhone, supplierGstin, supplierPan, supplierDrugLicense,
        goodsValue, discountAmount, taxAmount, roundOff, cashDiscPercent,
        amountPaid, dueAmount, paymentStatus, paymentMethod)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, date, supplier, supplierId || null, billAmount, status, JSON.stringify(items || []),
        savedDoc?.documentName || null,
        savedDoc?.documentMime || null,
        savedDoc?.documentPath || null,
        supplierAddress || null,
        supplierPhone || null,
        supplierGstin || null,
        supplierPan || null,
        supplierDrugLicense || null,
        Number(goodsValue) || 0,
        Number(discountAmount) || 0,
        Number(taxAmount) || 0,
        Number(roundOff) || 0,
        Number(cashDiscPercent) || 0,
        paid,
        due,
        payStatus,
        payMethod,
      ]
    );

    // Merge repeated receipts into the same product + batch number.
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item.product?.id) continue;
        const batchName = String(item.batch || '').trim();
        if (!batchName) throw new Error(`Batch number is required for ${item.product.name}`);
        const expiry = normalizeExpiry(item.expiry || '');

        await dbRun(
          `INSERT INTO product_batches
             (productId, batch, expiry, stock, mrp, rate, purchaseRate, cgst, sgst)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(productId, batch) DO UPDATE SET
             stock = product_batches.stock + excluded.stock,
             expiry = excluded.expiry,
             mrp = excluded.mrp,
             rate = excluded.rate,
             purchaseRate = excluded.purchaseRate,
             cgst = excluded.cgst,
             sgst = excluded.sgst`,
          [
            item.product.id, batchName, expiry, Number(item.qty) || 0,
            item.mrp, item.saleRate ?? item.mrp ?? item.rate, item.rate,
            item.cgst, item.sgst
          ]
        );
        await dbRun(
          `UPDATE products
           SET isCatalog = 0, cgst = ?, sgst = ?
           WHERE id = ?`,
          [Number(item.cgst) || 0, Number(item.sgst) || 0, item.product.id]
        );
        await syncProductStock(item.product.id);
      }
    }

    await dbRun('COMMIT');
    transactionStarted = false;

    const newPurchase = await dbGet('SELECT * FROM purchase_invoices WHERE id = ?', [id]);
    if (newPurchase && newPurchase.items) {
      newPurchase.items = JSON.parse(newPurchase.items);
    }
    if (newPurchase) {
      newPurchase.hasDocument = Boolean(newPurchase.documentName || newPurchase.documentPath);
      delete newPurchase.documentPath;
    }
    res.status(201).json(newPurchase);
  } catch (err) {
    if (transactionStarted) await dbRun('ROLLBACK').catch(() => {});
    if (savedDoc?.documentPath) {
      try { fs.unlinkSync(savedDoc.documentPath); } catch { /* ignore */ }
    }
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/purchase-invoices/:id/document', async (req, res) => {
  try {
    const purchaseId = String(req.params.id || '').trim();
    const purchase = await dbGet('SELECT id, documentPath FROM purchase_invoices WHERE id = ?', [purchaseId]);
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    if (!req.body?.dataBase64) {
      return res.status(400).json({ error: 'Document data is required' });
    }

    const savedDoc = savePurchaseDocument(purchaseId, {
      name: req.body.name,
      mime: req.body.mime,
      dataBase64: req.body.dataBase64,
    });
    if (!savedDoc) return res.status(400).json({ error: 'Failed to save document' });

    // Remove previous file if replacing
    if (purchase.documentPath && purchase.documentPath !== savedDoc.documentPath) {
      try { fs.unlinkSync(purchase.documentPath); } catch { /* ignore */ }
    }

    await dbRun(
      `UPDATE purchase_invoices
       SET documentName = ?, documentMime = ?, documentPath = ?
       WHERE id = ?`,
      [savedDoc.documentName, savedDoc.documentMime, savedDoc.documentPath, purchaseId]
    );

    res.json({
      id: purchaseId,
      documentName: savedDoc.documentName,
      documentMime: savedDoc.documentMime,
      hasDocument: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/purchase-invoices/:id/document', async (req, res) => {
  try {
    const purchase = await dbGet(
      'SELECT documentName, documentMime, documentPath FROM purchase_invoices WHERE id = ?',
      [req.params.id]
    );
    if (!purchase?.documentPath || !fs.existsSync(purchase.documentPath)) {
      return res.status(404).json({ error: 'No purchase document attached' });
    }
    res.setHeader('Content-Type', purchase.documentMime || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(purchase.documentName || 'purchase-document')}"`
    );
    fs.createReadStream(purchase.documentPath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CONSOLIDATED SALE PRODUCT SETTINGS ──────────────────────────────────────
app.get('/api/settings/consolidated-sale-products', async (req, res) => {
  try {
    const rows = await dbAll(
      'SELECT id FROM products WHERE consolidatedSaleEnabled = 1 ORDER BY name ASC'
    );
    res.json({ productIds: rows.map(row => row.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings/consolidated-sale-products', async (req, res) => {
  const rawIds = Array.isArray(req.body?.productIds) ? req.body.productIds : null;
  if (!rawIds) {
    return res.status(400).json({ error: 'productIds must be an array' });
  }

  const productIds = [...new Set(
    rawIds
      .map(id => Number(id))
      .filter(id => Number.isInteger(id) && id > 0)
  )];

  let transactionStarted = false;
  try {
    if (productIds.length > 0) {
      const placeholders = productIds.map(() => '?').join(',');
      const existing = await dbAll(
        `SELECT id FROM products WHERE id IN (${placeholders})`,
        productIds
      );
      if (existing.length !== productIds.length) {
        return res.status(400).json({ error: 'One or more product IDs are invalid' });
      }
    }

    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;
    await dbRun('UPDATE products SET consolidatedSaleEnabled = 0');
    if (productIds.length > 0) {
      const placeholders = productIds.map(() => '?').join(',');
      await dbRun(
        `UPDATE products SET consolidatedSaleEnabled = 1 WHERE id IN (${placeholders})`,
        productIds
      );
    }
    await dbRun('COMMIT');
    transactionStarted = false;

    res.json({ productIds });
  } catch (err) {
    if (transactionStarted) await dbRun('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// ─── COMPANY INFO ENDPOINTS ──────────────────────────────────────────────────
app.get('/api/company', async (req, res) => {
  try {
    const company = await dbGet('SELECT * FROM company_info WHERE id = 1');
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/company', async (req, res) => {
  const { name, address, phone, email, gstin, drugLicense, state, stateCode } = req.body;
  try {
    await dbRun(
      `UPDATE company_info SET name = ?, address = ?, phone = ?, email = ?, gstin = ?, drugLicense = ?, state = ?, stateCode = ?
       WHERE id = 1`,
      [name, address, phone, email, gstin, drugLicense, state, stateCode]
    );
    const updated = await dbGet('SELECT * FROM company_info WHERE id = 1');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BACKUP ENDPOINT ─────────────────────────────────────────────────────────
app.post('/api/backup', async (req, res) => {
  try {
    const result = await performBackup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PRODUCTION UI (Vite build) ──────────────────────────────────────────────
app.use(express.static(distPath));
app.get(/^(?!\/api).*/, (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.sendFile(path.join(distPath, 'index.html'), err => {
    if (err) next();
  });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Local Pharmacy Billing server running on http://127.0.0.1:${PORT}`);
  try {
    const logDir = process.env.UPLOAD_DIR
      ? path.dirname(process.env.UPLOAD_DIR)
      : path.join(__dirname);
    fs.writeFileSync(
      path.join(logDir, 'server-listen-ok.log'),
      `${new Date().toISOString()}\nlistening on 127.0.0.1:${PORT}\n`,
      'utf8'
    );
  } catch (_) { /* ignore */ }
});
server.on('error', (err) => {
  console.error(`Failed to bind API on port ${PORT}:`, err);
  try {
    const logDir = process.env.UPLOAD_DIR
      ? path.dirname(process.env.UPLOAD_DIR)
      : path.join(__dirname);
    fs.writeFileSync(
      path.join(logDir, 'server-listen-error.log'),
      `${new Date().toISOString()}\nPORT=${PORT}\n${err.stack || err}\n`,
      'utf8'
    );
  } catch (_) { /* ignore */ }
});
