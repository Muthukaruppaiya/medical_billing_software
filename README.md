# MediCare Pharmacy Billing

Local pharmacy billing software (React + Express + SQLite).

## Daily use on the pharmacy PC (recommended)

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
