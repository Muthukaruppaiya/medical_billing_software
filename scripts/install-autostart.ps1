#Requires -Version 5.1
<#
.SYNOPSIS
  Installs MediCare Pharmacy Billing to start automatically when Windows logs on.

.DESCRIPTION
  - Builds the production UI (if needed)
  - Creates a Windows Scheduled Task that starts the app at user logon
  - Creates a Desktop shortcut
  - Optionally allows local firewall access on port 5000

  Run once on the pharmacy PC (Right-click -> Run with PowerShell).
  Prefer "Run as Administrator" so firewall + task options always succeed.
#>

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TaskName = 'MediCarePharmacyBilling'
$StartBat = Join-Path $ProjectRoot 'scripts\start-pharmacy.bat'
$Port = 5000
$Url = "http://localhost:$Port"

Write-Host ""
Write-Host "=== MediCare Pharmacy - Auto Start Installer ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host ""

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$isAdmin = Test-IsAdmin
if (-not $isAdmin) {
  Write-Host "Tip: Run this script as Administrator for firewall + reliable startup task." -ForegroundColor Yellow
}

# 1) Node.js check
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js was not found in PATH. Install Node.js LTS from https://nodejs.org first."
}
Write-Host "[OK] Node.js: $($node.Source)"

# 2) Dependencies
Push-Location $ProjectRoot
try {
  if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
    Write-Host "Installing npm dependencies..."
    npm install
  }

  # 3) Production build
  Write-Host "Building production UI..."
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
  Write-Host "[OK] Build complete (dist/)"
}
finally {
  Pop-Location
}

# 4) Scheduled Task at logon
Write-Host "Creating Scheduled Task '$TaskName'..."
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction `
  -Execute 'cmd.exe' `
  -Argument "/c `"$StartBat`"" `
  -WorkingDirectory $ProjectRoot

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Starts MediCare Pharmacy Billing server and opens the UI at Windows logon.' `
  -Force | Out-Null

Write-Host "[OK] Scheduled Task installed (runs at logon)"

# 5) Desktop shortcut
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'MediCare Pharmacy Billing.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $StartBat
$shortcut.WorkingDirectory = $ProjectRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Start MediCare Pharmacy Billing'
$shortcut.Save()
Write-Host "[OK] Desktop shortcut: $shortcutPath"

# 6) Firewall (optional, admin)
if ($isAdmin) {
  $ruleName = 'MediCare Pharmacy Billing (TCP 5000)'
  $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($rule) {
    Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  }
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $Port `
    -Action Allow `
    -Profile Any `
    -Description 'Allows local access to MediCare Pharmacy Billing' | Out-Null
  Write-Host "[OK] Firewall rule added for port $Port"
} else {
  Write-Host "[SKIP] Firewall rule (needs Administrator)" -ForegroundColor Yellow
}

# 7) Start now
Write-Host ""
Write-Host "Starting the app now..."
Start-Process -FilePath $StartBat -WorkingDirectory $ProjectRoot

Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host "From now on, when this Windows user logs in, the software will start automatically."
Write-Host "Open manually anytime with the Desktop shortcut or: $Url"
Write-Host ""
Write-Host "To remove auto-start later, run: scripts\uninstall-autostart.ps1"
Write-Host ""
