# MediCare Pharmacy Billing

Local pharmacy billing software (React + Express + SQLite).

## Desktop app (.exe installer) — recommended for clients

The project can be packaged as a standalone Windows desktop app with **Electron**. This produces a single
`Setup.exe` installer. Nothing else (Node.js, terminals, browsers) is needed on the client PC.

### Build the installer (on a dev machine)

```powershell
npm install
npm run dist
```

Output: `release\PharmacyBilling-Setup-<version>.exe`

Give that one `.exe` file to the client.

### Install on the client PC

1. Double-click `PharmacyBilling-Setup-<version>.exe`
2. Choose the install folder (or accept the default) and finish
3. A **Desktop** and **Start Menu** shortcut named *Pharmacy Billing* are created

### What the desktop app does

- Bundles the Express + SQLite server and the UI inside one window — no browser needed.
- **Starts automatically at login** (registered as a login item on first launch).
- Stores its database at `%APPDATA%\pharmacy-billing\database.sqlite` (survives app updates/reinstalls).
- Local backups are written to `%APPDATA%\pharmacy-billing\backups` (plus any E:/G: drive targets if present).
- Runs the internal server on port `41730` (change via the `PHARMACY_PORT` environment variable if needed).

### Handy scripts

```powershell
npm run electron:dev   # build UI + run the desktop app locally (for testing)
npm run dist           # build the full NSIS installer (.exe)
npm run dist:dir       # build an unpacked app folder only (faster, for testing)
```

> The database lives in `%APPDATA%`, not inside the install folder, so uninstalling/reinstalling the app
> never deletes pharmacy data. To move data to a new PC, copy that `database.sqlite` file across.

## Daily use on the pharmacy PC (Node/browser alternative)

If you prefer running from Node instead of the packaged desktop app, use the auto-start scripts below.

The client should **not** run `npm run dev` every day. Install once, then the app starts when Windows logs on.

### One-time setup on the client PC

1. Install **Node.js LTS** from https://nodejs.org  
2. Copy this project folder to a fixed location, for example:  
   `C:\MediCare\medical_billing_software-main`
3. Open PowerShell **as Administrator** in that folder and run:

```powershell
npm install
npm run install:autostart
```

What this does:

- Builds the production UI (`dist/`)
- Creates a Windows **Scheduled Task** (`MediCarePharmacyBilling`) that starts at logon
- Creates a **Desktop shortcut**: `MediCare Pharmacy Billing`
- Adds a local firewall rule for port `5000` (if run as Admin)
- Starts the app immediately and opens http://localhost:5000

After this, whenever the pharmacy PC is turned on and the user logs in, the billing software starts automatically.

### Manual start / stop

- **Start:** double-click Desktop shortcut, or run `scripts\start-pharmacy.bat`
- **Open UI:** http://localhost:5000
- **Remove auto-start:**

```powershell
npm run uninstall:autostart
```

### System configuration checklist

| Item | Required |
|------|----------|
| Node.js LTS installed and in PATH | Yes |
| Project kept in a fixed folder path | Yes (do not move after install) |
| Windows user can log on (task runs at logon) | Yes |
| Port `5000` free | Yes |
| Run installer as Administrator | Recommended (firewall + reliable task) |
| Keep PC clock/date correct | Recommended (expiry / reports) |
| Backup drives configured in app | Optional |

> Note: This uses a **Windows Scheduled Task at logon** (most reliable for a desktop UI app). It starts the server and opens the billing screen. A pure Windows Service would start before login but would **not** open the browser UI by itself.

## Suppliers (mandatory fields)

When creating or editing a supplier, these fields are **required**:

| Field | Rule |
|------|------|
| Supplier Name | Required |
| Full Address | Required |
| Phone Number | Required (valid phone) |
| GST Number (GSTIN) | Required — 15-character Indian GSTIN |
| PAN Number | Required — 10-character PAN; must match GSTIN characters 3–12 |

PAN is auto-filled from the GSTIN when you type it. Both are validated on save (UI + API).

## Document numbers (Purchase / Sale)

Numbers are generated automatically on save:

| Type | Format | Example |
|------|--------|---------|
| Purchase Order | `PO` + YY + MM + continuous 3-digit seq | **PO2607001** |
| Sale Invoice | `SL` + YY + MM + continuous 3-digit seq | **SL2607001** |

- **YY** = year (e.g. 26 for 2026)
- **MM** = month (e.g. 07 for July)
- **Sequence** continues within that month (`001`, `002`, …) and restarts next month

Imported purchase documents can still use a supplier bill number if entered manually; otherwise a new `PO…` number is assigned.

## Developer commands

```bash
npm install
npm run dev      # API + Vite hot reload
npm run build    # production UI -> dist/
npm start        # production server (serves dist + API on :5000)
```

## Uninstall auto-start only

```powershell
npm run uninstall:autostart
```

Project files and database remain on disk.
