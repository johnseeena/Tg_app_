// Generates a ready-to-run Windows PowerShell setup script for a specific
// device, with the certificate paths already filled in — the user only has
// to download it and run it (it self-elevates to Administrator).
//
// Why this exists: Windows IKEv2 with a client certificate needs several
// fiddly, easy-to-get-wrong steps (import the CA into LocalMachine\Root,
// import the .p12 into LocalMachine\My WITH its private key using the right
// password, then create the VPN with MachineCertificate auth). Two earlier
// hand-edited-script attempts failed on exactly these: a blank import
// password (which silently drops the private key) and the CurrentUser store
// (MachineCertificate auth reads LocalMachine). This script encodes the
// correct sequence once, verified against a real Libreswan server that was
// confirmed to establish a full tunnel from a fresh cert.
//
// The script is ASCII-only on purpose: PowerShell 5.1 reads a .ps1 without
// a UTF-8 BOM in the system ANSI codepage, so any non-ASCII byte (e.g. an
// em-dash in a comment) corrupts the file and breaks parsing.

import type { ServerParams } from "./types";
import { PKCS12_EXPORT_PASSWORD } from "./pkcs12Password";

// The .p12 is saved to the Downloads folder by downloadWindowsCert() using
// this same sanitized name, so the script can point straight at it. Keep
// the two in sync — that's the whole point of the shared helper.
export function safeWindowsFilename(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  return cleaned || "vpn-device";
}

// Escape a value for a PowerShell single-quoted string literal: only the
// single quote is special there (doubled to escape).
function psSingleQuote(s: string): string {
  return s.replace(/'/g, "''");
}

export function buildWindowsSetupScript(server: ServerParams, deviceName: string): string {
  const p12File = psSingleQuote(safeWindowsFilename(deviceName) + ".p12");
  const host = psSingleQuote(server.endpoint_host);
  const pwd = psSingleQuote(PKCS12_EXPORT_PASSWORD);
  const vpnName = psSingleQuote("IKEv2 VPN");

  return `# === IKEv2 VPN setup for Windows ===
# Just run this file - it will ask for Administrator rights and do everything:
# import the CA + device certificate and create the VPN connection.
# Make sure the CA (.cer) and device (.p12) files are in your Downloads folder.
$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    if ($PSCommandPath) {
        Write-Host 'Requesting Administrator rights...'
        Start-Process powershell -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"')
        exit
    } else {
        Write-Host 'Please run this script in an ADMINISTRATOR PowerShell.' -ForegroundColor Yellow
        return
    }
}

$Downloads     = Join-Path $env:USERPROFILE 'Downloads'
$ClientP12Path = Join-Path $Downloads '${p12File}'
$CaCertPath    = Join-Path $Downloads 'ikev2-vpn-ca.cer'
$VpnName       = '${vpnName}'
$ServerAddress = '${host}'
$P12Password   = '${pwd}'

# Fall back to the newest matching file if the exact name was renamed on download.
if (-not (Test-Path $ClientP12Path)) {
    $newest = Get-ChildItem (Join-Path $Downloads '*.p12') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($newest) { $ClientP12Path = $newest.FullName }
}
if (-not (Test-Path $CaCertPath)) {
    $newestCer = Get-ChildItem (Join-Path $Downloads '*.cer') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($newestCer) { $CaCertPath = $newestCer.FullName }
}
if (-not (Test-Path $ClientP12Path)) { throw 'Device certificate (.p12) not found in your Downloads folder.' }
if (-not (Test-Path $CaCertPath))    { throw 'CA certificate (.cer) not found in your Downloads folder.' }

Write-Host ('Device cert: ' + $ClientP12Path)
Write-Host ('CA cert:     ' + $CaCertPath)

Write-Host 'Removing old IKEv2 VPN certificates from all stores...'
Get-ChildItem Cert:\\CurrentUser\\My, Cert:\\CurrentUser\\Root, Cert:\\LocalMachine\\My, Cert:\\LocalMachine\\Root -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -like '*IKEv2 VPN*' } |
    ForEach-Object { Remove-Item $_.PSPath -Force }

Write-Host 'Importing CA into LocalMachine Trusted Root...'
$ca = Import-Certificate -FilePath $CaCertPath -CertStoreLocation Cert:\\LocalMachine\\Root

Write-Host 'Importing device certificate into LocalMachine Personal...'
$pfxPwd = ConvertTo-SecureString -String $P12Password -AsPlainText -Force
$pfx = Import-PfxCertificate -FilePath $ClientP12Path -CertStoreLocation Cert:\\LocalMachine\\My -Password $pfxPwd

# The import also drops a copy of the CA into Personal; remove it so only the leaf remains there.
Get-ChildItem Cert:\\LocalMachine\\My | Where-Object { $_.Thumbprint -eq $ca.Thumbprint } | Remove-Item -Force

$leaf = Get-ChildItem Cert:\\LocalMachine\\My | Where-Object { $_.Thumbprint -eq $pfx.Thumbprint }
if (-not $leaf -or -not $leaf.HasPrivateKey) {
    throw 'Certificate imported WITHOUT its private key - wrong password. Re-download a fresh .p12 and run again.'
}
Write-Host 'OK: private key attached.' -ForegroundColor Green

Write-Host 'Creating the VPN connection...'
Remove-VpnConnection -Name $VpnName -AllUserConnection -Force -ErrorAction SilentlyContinue
Add-VpnConnection -Name $VpnName -ServerAddress $ServerAddress -TunnelType Ikev2 -AuthenticationMethod MachineCertificate -EncryptionLevel Required -AllUserConnection -Force

Write-Host ''
Write-Host ('Done! Connect via Settings > Network and Internet > VPN > ' + $VpnName) -ForegroundColor Green
Read-Host 'Press Enter to close'
`;
}
