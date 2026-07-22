import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    // Prevent "database is locked" freezes when UI + backup hit SQLite together.
    db.configure('busyTimeout', 15000);
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA foreign_keys = ON');
  }
});

// Promise-based wrappers
export const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

export const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize Tables and seed default data
export async function initDb() {
  // Create tables
  await dbRun(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hsn TEXT,
      category TEXT,
      mrp REAL,
      rate REAL,
      cgst REAL,
      sgst REAL,
      stock INTEGER,
      minStock INTEGER,
      expiry TEXT,
      batch TEXT,
      manufacturer TEXT,
      grams TEXT,
      packType TEXT,
      boxNo TEXT,
      rackLocation TEXT,
      purchaseRate REAL DEFAULT 0,
      isCatalog INTEGER NOT NULL DEFAULT 0,
      catalogKey TEXT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS product_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL,
      batch TEXT NOT NULL,
      expiry TEXT,
      stock INTEGER NOT NULL DEFAULT 0,
      mrp REAL,
      rate REAL,
      purchaseRate REAL DEFAULT 0,
      cgst REAL,
      sgst REAL,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(productId, batch)
    )
  `);

  // Safe migrations for new columns on existing databases
  const newCols = [
    "ALTER TABLE products ADD COLUMN grams TEXT",
    "ALTER TABLE products ADD COLUMN packType TEXT",
    "ALTER TABLE products ADD COLUMN boxNo TEXT",
    "ALTER TABLE products ADD COLUMN rackLocation TEXT",
    "ALTER TABLE products ADD COLUMN consolidatedSaleEnabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN purchaseRate REAL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN isCatalog INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN catalogKey TEXT",
    "ALTER TABLE product_batches ADD COLUMN purchaseRate REAL DEFAULT 0"
  ];
  for (const sql of newCols) {
    try { await dbRun(sql); } catch (e) { /* column already exists */ }
  }
  await dbRun('CREATE INDEX IF NOT EXISTS idx_products_name_nocase ON products(name COLLATE NOCASE)');
  await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_catalog_key ON products(catalogKey) WHERE catalogKey IS NOT NULL');
  await dbRun('UPDATE products SET purchaseRate = COALESCE(NULLIF(purchaseRate, 0), rate, 0)');
  await dbRun('UPDATE product_batches SET purchaseRate = COALESCE(NULLIF(purchaseRate, 0), rate, 0)');

  // Backward-compatible one-time migration: every existing product becomes
  // the first batch for that product. Later purchases can add more batches.
  await dbRun(`
    INSERT OR IGNORE INTO product_batches
      (productId, batch, expiry, stock, mrp, rate, cgst, sgst)
    SELECT
      id,
      CASE WHEN TRIM(COALESCE(batch, '')) = '' THEN 'DEFAULT-' || id ELSE batch END,
      expiry,
      COALESCE(stock, 0),
      mrp,
      rate,
      cgst,
      sgst
    FROM products
    WHERE COALESCE(isCatalog, 0) = 0
  `);
  await dbRun(`
    DELETE FROM product_batches
    WHERE productId IN (
      SELECT id FROM products WHERE COALESCE(isCatalog, 0) = 1
    )
      AND stock = 0
      AND batch LIKE 'DEFAULT-%'
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      gstin TEXT,
      address TEXT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      gstin TEXT,
      address TEXT
    )
  `);

  try {
    await dbRun('ALTER TABLE suppliers ADD COLUMN pan TEXT');
  } catch (e) {
    // Column already exists
  }
  try {
    await dbRun('ALTER TABLE suppliers ADD COLUMN drugLicense TEXT');
  } catch (e) {
    // Column already exists
  }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS document_sequences (
      prefix TEXT NOT NULL,
      yymm TEXT NOT NULL,
      lastNo INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (prefix, yymm)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      customer TEXT NOT NULL,
      amount REAL NOT NULL,
      tax REAL NOT NULL,
      status TEXT NOT NULL,
      type TEXT DEFAULT 'sale',
      items TEXT,
      discount REAL DEFAULT 0,
      doctor TEXT,
      patient TEXT,
      gstin TEXT,
      customerAddress TEXT,
      customerId INTEGER,
      createdAt INTEGER
    )
  `);

  try {
    await dbRun('ALTER TABLE invoices ADD COLUMN items TEXT');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await dbRun('ALTER TABLE invoices ADD COLUMN discount REAL DEFAULT 0');
  } catch (e) {
    // Column already exists, ignore
  }

  const invoiceCols = [
    'ALTER TABLE invoices ADD COLUMN doctor TEXT',
    'ALTER TABLE invoices ADD COLUMN patient TEXT',
    'ALTER TABLE invoices ADD COLUMN gstin TEXT',
    'ALTER TABLE invoices ADD COLUMN customerAddress TEXT',
    'ALTER TABLE invoices ADD COLUMN customerId INTEGER',
    'ALTER TABLE invoices ADD COLUMN createdAt INTEGER',
    'ALTER TABLE invoices ADD COLUMN amountPaid REAL DEFAULT 0',
    'ALTER TABLE invoices ADD COLUMN dueAmount REAL DEFAULT 0',
    'ALTER TABLE invoices ADD COLUMN paymentStatus TEXT DEFAULT "Fully Paid"',
    'ALTER TABLE invoices ADD COLUMN paymentMethod TEXT DEFAULT "Cash"',
  ];
  for (const sql of invoiceCols) {
    try { await dbRun(sql); } catch (e) { /* column already exists */ }
  }

  // Backfill missing timestamps using SQLite insertion order (rowid).
  try {
    await dbRun(`
      UPDATE invoices
      SET createdAt = rowid
      WHERE createdAt IS NULL OR createdAt = 0
    `);
  } catch (e) { /* ignore */ }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      supplier TEXT NOT NULL,
      supplierId INTEGER,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      items TEXT
    )
  `);

  const purchaseCols = [
    'ALTER TABLE purchase_invoices ADD COLUMN documentName TEXT',
    'ALTER TABLE purchase_invoices ADD COLUMN documentMime TEXT',
    'ALTER TABLE purchase_invoices ADD COLUMN documentPath TEXT',
    'ALTER TABLE purchase_invoices ADD COLUMN supplierAddress TEXT',
    'ALTER TABLE purchase_invoices ADD COLUMN supplierPhone TEXT',
    'ALTER TABLE purchase_invoices ADD COLUMN supplierGstin TEXT',
    'ALTER TABLE purchase_invoices ADD COLUMN supplierPan TEXT',
    'ALTER TABLE purchase_invoices ADD COLUMN goodsValue REAL DEFAULT 0',
    'ALTER TABLE purchase_invoices ADD COLUMN discountAmount REAL DEFAULT 0',
    'ALTER TABLE purchase_invoices ADD COLUMN taxAmount REAL DEFAULT 0',
    'ALTER TABLE purchase_invoices ADD COLUMN roundOff REAL DEFAULT 0',
    'ALTER TABLE purchase_invoices ADD COLUMN cashDiscPercent REAL DEFAULT 0',
    'ALTER TABLE purchase_invoices ADD COLUMN amountPaid REAL DEFAULT 0',
    'ALTER TABLE purchase_invoices ADD COLUMN dueAmount REAL DEFAULT 0',
    'ALTER TABLE purchase_invoices ADD COLUMN paymentStatus TEXT DEFAULT "Fully Paid"',
    'ALTER TABLE purchase_invoices ADD COLUMN paymentMethod TEXT DEFAULT "Cash"',
    'ALTER TABLE purchase_invoices ADD COLUMN supplierDrugLicense TEXT',
  ];
  for (const sql of purchaseCols) {
    try { await dbRun(sql); } catch (e) { /* column already exists */ }
  }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL,
      batchId INTEGER NOT NULL,
      adjustmentType TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      stockBefore REAL NOT NULL,
      stockAfter REAL NOT NULL,
      purchaseRateBefore REAL,
      purchaseRateAfter REAL,
      saleRateBefore REAL,
      saleRateAfter REAL,
      mrpBefore REAL,
      mrpAfter REAL,
      reason TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (batchId) REFERENCES product_batches(id) ON DELETE CASCADE
    )
  `);
  await dbRun(
    'CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_product ON inventory_adjustments(productId, createdAt DESC)'
  );

  try {
    await dbRun('ALTER TABLE purchase_invoices ADD COLUMN items TEXT');
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await dbRun('ALTER TABLE purchase_invoices ADD COLUMN supplierId INTEGER');
  } catch (e) {
    // Column already exists, ignore
  }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS company_info (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      gstin TEXT,
      drugLicense TEXT,
      state TEXT,
      stateCode TEXT
    )
  `);

  // Ensure default company info exists (with blank values) to prevent UI errors
  const compCheck = await dbGet('SELECT COUNT(*) as count FROM company_info');
  if (compCheck.count === 0) {
    console.log('Initializing default company details...');
    await dbRun(
      `INSERT INTO company_info (id, name, address, phone, email, gstin, drugLicense, state, stateCode)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'MediCare Pharmacy',
        '',
        '',
        '',
        '',
        '',
        '',
        ''
      ]
    );
  }
}
