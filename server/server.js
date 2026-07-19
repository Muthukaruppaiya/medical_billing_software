import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, dbAll, dbRun, dbGet } from './db.js';
import { startBackupJob, performBackup } from './backup.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

async function syncProductStock(productId) {
  const total = await dbGet(
    'SELECT COALESCE(SUM(stock), 0) AS stock FROM product_batches WHERE productId = ?',
    [productId]
  );
  const primaryBatch = await dbGet(
    `SELECT batch, expiry, mrp, rate
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
         mrp = COALESCE(?, mrp), rate = COALESCE(?, rate)
     WHERE id = ?`,
    [
      total?.stock || 0, primaryBatch?.batch, primaryBatch?.expiry,
      primaryBatch?.mrp, primaryBatch?.rate, productId
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
    name, hsn, category, mrp, rate, cgst, sgst, stock, minStock,
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
      cgst: Number(cgst) || 0,
      sgst: Number(sgst) || 0,
    };
    const totalStock = requestedBatches.length
      ? requestedBatches.reduce((sum, item) => sum + item.stock, 0)
      : primaryBatch.stock;

    const result = await dbRun(
      `INSERT INTO products (name, hsn, category, mrp, rate, cgst, sgst, stock, minStock, expiry, batch, manufacturer, grams, packType, boxNo, rackLocation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, hsn, category, primaryBatch.mrp, primaryBatch.rate,
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
        `INSERT INTO product_batches (productId, batch, expiry, stock, mrp, rate, cgst, sgst)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.lastID, item.batch, item.expiry, item.stock,
          item.mrp, item.rate, item.cgst, item.sgst
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
  const { name, phone, gstin, address } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Supplier name is required' });
  }
  try {
    const result = await dbRun(
      `INSERT INTO suppliers (name, phone, gstin, address) VALUES (?, ?, ?, ?)`,
      [name.trim(), phone || '', gstin || '', address || '']
    );
    const newSupplier = await dbGet('SELECT * FROM suppliers WHERE id = ?', [result.lastID]);
    res.status(201).json(newSupplier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, gstin, address } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Supplier name is required' });
  }
  try {
    const result = await dbRun(
      `UPDATE suppliers
       SET name = ?, phone = ?, gstin = ?, address = ?
       WHERE id = ?`,
      [name.trim(), phone || '', gstin || '', address || '', id]
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
    items, discount, doctor, patient, gstin, customerAddress, createdAt
  } = req.body;
  let transactionStarted = false;
  try {
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;

    if (Array.isArray(items)) {
      const today = new Date().toISOString().slice(0, 10);
      for (const item of items) {
        if (!item.product?.id || !item.batchId) {
          throw new Error(`Select a batch for ${item.product?.name || 'every product'}`);
        }
        const result = await dbRun(
          `UPDATE product_batches
           SET stock = stock - ?
           WHERE id = ? AND productId = ? AND stock >= ?
             AND (expiry IS NULL OR expiry = '' OR expiry >= ?)`,
          [item.qty, item.batchId, item.product.id, item.qty, today]
        );
        if (result.changes === 0) {
          throw new Error(`Insufficient stock for ${item.product.name} (${item.batch || 'selected batch'})`);
        }
        await syncProductStock(item.product.id);
      }
    }

    const savedAt = Number(createdAt) || Date.now();
    await dbRun(
      `INSERT INTO invoices
       (id, date, customer, customerId, amount, tax, status, type, items, discount, doctor, patient, gstin, customerAddress, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, date, customer, customerId || null, amount, tax, status, type || 'sale',
        JSON.stringify(items || []), discount || 0, doctor || '', patient || '',
        gstin || '', customerAddress || '', savedAt
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
    });
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/purchase-invoices', async (req, res) => {
  const { id, date, supplier, supplierId, amount, status, items } = req.body;
  let transactionStarted = false;
  try {
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;

    await dbRun(
      `INSERT INTO purchase_invoices
       (id, date, supplier, supplierId, amount, status, items)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, date, supplier, supplierId || null, amount, status, JSON.stringify(items || [])]
    );

    // Merge repeated receipts into the same product + batch number.
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item.product?.id) continue;
        const batchName = String(item.batch || '').trim();
        if (!batchName) throw new Error(`Batch number is required for ${item.product.name}`);

        await dbRun(
          `INSERT INTO product_batches
             (productId, batch, expiry, stock, mrp, rate, cgst, sgst)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(productId, batch) DO UPDATE SET
             stock = product_batches.stock + excluded.stock,
             expiry = excluded.expiry,
             mrp = excluded.mrp,
             rate = excluded.rate,
             cgst = excluded.cgst,
             sgst = excluded.sgst`,
          [
            item.product.id, batchName, item.expiry || '', Number(item.qty) || 0,
            item.mrp, item.rate, item.cgst, item.sgst
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
    res.status(201).json(newPurchase);
  } catch (err) {
    if (transactionStarted) await dbRun('ROLLBACK').catch(() => {});
    res.status(400).json({ error: err.message });
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
app.post('/api/backup', (req, res) => {
  try {
    const result = performBackup();
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

app.listen(PORT, () => {
  console.log(`Local Pharmacy Billing server running on http://localhost:${PORT}`);
});
