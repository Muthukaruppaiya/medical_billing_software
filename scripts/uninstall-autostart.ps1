#Requires -Version 5.1
<#
.SYNOPSIS
  Removes MediCare Pharmacy Billing auto-start (Scheduled Task, shortcut, firewall rule).
#>

$ErrorActionPreference = 'Continue'

$TaskName = 'MediCarePharmacyBilling'
$RuleName = 'MediCare Pharmacy Billing (TCP 5000)'
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'MediCare Pharmacy Billing.lnk'

Write-Host "=== MediCare Pharmacy - Remove Auto Start ===" -ForegroundColor Cyan

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "[OK] Scheduled Task removed"
} else {
  Write-Host "[SKIP] Scheduled Task not found"
}

if (Test-Path $DesktopShortcut) {
  Remove-Item $DesktopShortcut -Force
  Write-Host "[OK] Desktop shortcut removed"
} else {
  Write-Host "[SKIP] Desktop shortcut not found"
}

$rule = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($rule) {
  Remove-NetFirewallRule -DisplayName $RuleName
  Write-Host "[OK] Firewall rule removed"
} else {
  Write-Host "[SKIP] Firewall rule not found"
}

Write-Host ""
Write-Host "Auto-start removed. The project files are still on disk." -ForegroundColor Green
Write-Host "You can still start manually with scripts\start-pharmacy.bat"
Write-Host ""
