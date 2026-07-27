using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

// Backs the real QZ Tray browser-to-printer bridge (src/lib/qz.ts on the frontend): QZ Tray asks
// the page for a certificate to trust and a signature per print request, and the page relays both
// to this controller. Gated the same as Printer Setup's device list (Network/View), not
// AllowAnonymous like the reference project's standalone print-agent, because here it's always the
// already-authenticated cashier's own browser calling these — no separate local agent process.
[ApiController]
[Route("api/printer")]
[Authorize]
[RequireModule("/network/devices", PermissionAction.View)]
public class QzTrayController(AppDbContext db) : ControllerBase
{
    [HttpGet("qz-certificate")]
    public async Task<IActionResult> GetCertificate(CancellationToken ct)
    {
        var identity = await GetOrCreateAsync(db, ct);
        return Content(identity.CertificatePem, "text/plain");
    }

    [HttpPost("qz-sign")]
    public async Task<IActionResult> Sign([FromBody] QzSignRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ToSign)) return BadRequest(new { error = "toSign is required." });

        var identity = await GetOrCreateAsync(db, ct);
        using var rsa = RSA.Create();
        rsa.ImportFromPem(identity.PrivateKeyPem);
        var signature = rsa.SignData(Encoding.UTF8.GetBytes(request.ToSign), HashAlgorithmName.SHA1, RSASignaturePadding.Pkcs1);
        return Content(Convert.ToBase64String(signature), "text/plain");
    }

    // ── GET /api/printer/setup-installer ─────────────────────────────────────
    // One-click installer, detected by browser User-Agent: downloads + silently installs QZ
    // Tray, trusts our real cert (Windows/Linux — no per-print "Action Required" dialog), and
    // starts it. Reached via an <a download> click from an already-authenticated session, so
    // the auth cookie rides along on the navigation (SameSite=Lax allows top-level GET) —
    // unlike qz-trust-ps1 below, this does NOT need to be anonymous.
    [HttpGet("setup-installer")]
    public async Task<IActionResult> SetupInstaller(CancellationToken ct)
    {
        var (_, certBase64, validFrom, validTo, _) = await QzCertHelper.GetInfoAsync(db, ct);
        var ua = Request.Headers.UserAgent.ToString().ToLowerInvariant();

        if (ua.Contains("windows"))
            return File(Encoding.UTF8.GetBytes(QzInstallerScripts.WindowsBat(certBase64, validFrom, validTo)), "application/octet-stream", "BuildPOS-Printer-Setup.bat");

        if (ua.Contains("macintosh") || ua.Contains("mac os"))
            return File(Encoding.UTF8.GetBytes(QzInstallerScripts.MacCommand()), "application/octet-stream", "BuildPOS-Printer-Setup.command");

        return File(Encoding.UTF8.GetBytes(QzInstallerScripts.LinuxSh(certBase64, validFrom, validTo)), "application/x-sh", "BuildPOS-Printer-Setup.sh");
    }

    internal static async Task<QzCertificate> GetOrCreateAsync(AppDbContext db, CancellationToken ct)
    {
        var existing = await db.QzCertificates.FirstOrDefaultAsync(ct);
        if (existing is not null) return existing;

        using var rsa = RSA.Create(2048);
        var req = new CertificateRequest("CN=ECR Building POS, O=ECR Building, OU=BuildPOS", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var cert = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(10));

        var created = new QzCertificate
        {
            CertificatePem = cert.ExportCertificatePem(),
            PrivateKeyPem = rsa.ExportPkcs8PrivateKeyPem(),
        };
        db.QzCertificates.Add(created);
        await db.SaveChangesAsync(ct);
        return created;
    }
}

public record QzSignRequest(string ToSign);

internal static class QzCertHelper
{
    public static async Task<(string Pem, string Base64, string ValidFromUtc, string ValidToUtc, string FingerprintSha1)> GetInfoAsync(AppDbContext db, CancellationToken ct)
    {
        var identity = await QzTrayController.GetOrCreateAsync(db, ct);
        using var cert = X509Certificate2.CreateFromPem(identity.CertificatePem);
        var base64 = Convert.ToBase64String(Encoding.ASCII.GetBytes(identity.CertificatePem));
        var validFrom = cert.NotBefore.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss");
        var validTo = cert.NotAfter.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss");
        var fp = cert.GetCertHashString(HashAlgorithmName.SHA1).ToLowerInvariant();
        return (identity.CertificatePem, base64, validFrom, validTo, fp);
    }
}

// Reached via `powershell -c "iex(irm '<url>')"` — a bare PowerShell one-liner, not a browser
// request, so it carries no auth cookie at all. Must stay anonymous or the convenience "already
// have QZ Tray installed?" fix-trust flow simply cannot work. Low risk: the only secret this
// reveals is the server's own PUBLIC certificate (never the private key), which QZ Tray needs to
// see anyway to trust it — identical reasoning to the reference project's PrinterController.
[ApiController]
[Route("api/printer")]
[AllowAnonymous]
public class QzTrayTrustController(AppDbContext db) : ControllerBase
{
    [HttpGet("qz-trust-ps1")]
    public async Task<IActionResult> QzTrustPs1(CancellationToken ct)
    {
        var (_, certBase64, validFrom, validTo, _) = await QzCertHelper.GetInfoAsync(db, ct);
        return Content(QzInstallerScripts.WindowsTrustOnlyPs1(certBase64, validFrom, validTo), "text/plain");
    }
}

// Installer scripts, trimmed from the reference project (baqala-bright-flow) down to exactly
// what was asked for: detect OS, download + silently install QZ Tray, trust our cert, start it.
// Deliberately drops that project's kiosk desktop-shortcut / Chrome-enterprise-policy / USB
// thermal-printer CUPS auto-config extras — those solve a locked-down self-checkout kiosk
// deployment, not this admin-operated back-office POS.
internal static class QzInstallerScripts
{
    public static string WindowsBat(string certBase64, string validFrom, string validTo)
    {
        var trustPs = WindowsTrustOnlyPs1(certBase64, validFrom, validTo);
        var trustPsBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(trustPs));

        return $$"""
@echo off
setlocal EnableDelayedExpansion
title BuildPOS Printer Setup

:: ── Auto-elevate to Administrator ─────────────────────────────────────────
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Set UAC = CreateObject^("Shell.Application"^) > "%TEMP%\elevate.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%TEMP%\elevate.vbs"
    "%TEMP%\elevate.vbs"
    del "%TEMP%\elevate.vbs"
    exit /B
)

echo.
echo  ========================================
echo   BuildPOS - Printer Setup
echo  ========================================
echo.

echo [1/3] Downloading QZ Tray...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $r = Invoke-RestMethod 'https://api.github.com/repos/qzind/tray/releases/latest'; $a = $r.assets | Where-Object { $_.name -like '*.exe' -and $_.name -notlike '*arm64*' } | Select-Object -First 1; $url = $a.browser_download_url } catch { $url = 'https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-x86_64.exe' }; Invoke-WebRequest -Uri $url -OutFile $env:TEMP\qz-tray-setup.exe -UseBasicParsing"

echo [2/3] Installing QZ Tray silently...
"%TEMP%\qz-tray-setup.exe" /S
timeout /t 8 /nobreak >nul
del "%TEMP%\qz-tray-setup.exe" 2>nul

echo [3/3] Trusting this server's certificate (no print dialogs will appear)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$tp = Join-Path $env:TEMP 'qz-trust-step.ps1'; [System.IO.File]::WriteAllBytes($tp, [Convert]::FromBase64String('{{trustPsBase64}}')); powershell -NoProfile -ExecutionPolicy Bypass -File $tp; Remove-Item $tp -Force -ErrorAction SilentlyContinue"

echo.
echo  ========================================
echo   Setup complete!
echo   QZ Tray is running in the system tray.
echo.
echo   Go back to the browser, open Printer Setup,
echo   click Connect, then pick your printer.
echo  ========================================
echo.
pause
""";
    }

    // Shared by the full Windows installer (as its final trust step) and the standalone
    // "already have QZ Tray installed?" fix-trust flow. Stops QZ Tray, writes override.crt +
    // authcert.override + allowed.dat so it silently trusts our cert on the next connection,
    // then restarts it. override.crt is the piece that actually suppresses the dialog —
    // allowed.dat alone does not, verified against a live QZ Tray instance.
    public static string WindowsTrustOnlyPs1(string certBase64, string validFrom, string validTo) => $$"""
$ErrorActionPreference = 'Continue'
$cert = [System.Text.Encoding]::ASCII.GetString([Convert]::FromBase64String('{{certBase64}}'))
$qzDir = $null; $ready = $false
for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
  $qzDir = @("$env:ProgramFiles\QZ Tray", "${env:ProgramFiles(x86)}\QZ Tray", "$env:LOCALAPPDATA\QZ Tray") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($qzDir) { $p = Join-Path $qzDir 'qz-tray.properties'; if ((Test-Path $p) -and (Select-String -Path $p -Pattern 'wss.keystore' -Quiet)) { $ready = $true } }
  if (-not $ready) { Start-Sleep -Seconds 1 }
}
Get-Process qz-tray,qz-tray-console,javaw -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
if ($qzDir) {
  Set-Content -Path (Join-Path $qzDir 'override.crt') -Value $cert -Encoding ASCII
  $propsPath = Join-Path $qzDir 'qz-tray.properties'
  $propLines = if (Test-Path $propsPath) { Get-Content $propsPath | Where-Object { $_ -notmatch '^authcert\.override=' } } else { @() }
  $propLines += 'authcert.override=override.crt'
  Set-Content -Path $propsPath -Value $propLines -Encoding ASCII
  Write-Host ('   Trusted cert written to ' + $qzDir)
} else {
  Write-Host '   WARNING: QZ Tray install directory not found — the trust dialog may still appear.'
}
$fp = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new([System.Text.Encoding]::ASCII.GetBytes($cert)).GetCertHashString('SHA1').ToLower()
$allowedDir = Join-Path $env:APPDATA 'qz'; New-Item -ItemType Directory -Force $allowedDir | Out-Null
$entry = $fp + "`tBuildPOS`tECR Building`t{{validFrom}}`t{{validTo}}`ttrue"
$allowed = Join-Path $allowedDir 'allowed.dat'
$lines = if (Test-Path $allowed) { Get-Content $allowed | Where-Object { $_ -notmatch $fp } } else { @() }
($lines + $entry) | Set-Content -Path $allowed -Encoding ASCII
$qz = @("$env:ProgramFiles\QZ Tray\qz-tray.exe", "$env:LOCALAPPDATA\QZ Tray\qz-tray.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($qz) { Start-Process $qz }
Write-Host '   Done — QZ Tray restarted and will trust this server silently.'
""";

    public static string MacCommand() => $$"""
#!/bin/bash
# Double-click to run — opens Terminal automatically
clear
echo " ========================================"
echo "  BuildPOS - Printer Setup"
echo " ========================================"
echo ""

if ! [ -d "/Applications/QZ Tray.app" ]; then
  echo "[1/2] Downloading QZ Tray..."
  RELEASE=$(curl -s https://api.github.com/repos/qzind/tray/releases/latest 2>/dev/null)
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    URL=$(echo "$RELEASE" | grep -o '"browser_download_url":"[^"]*arm64\.pkg"' | grep -o 'https://[^"]*' | head -1)
    [ -z "$URL" ] && URL="https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-arm64.pkg"
  else
    URL=$(echo "$RELEASE" | grep -o '"browser_download_url":"[^"]*x86_64\.pkg"' | grep -o 'https://[^"]*' | head -1)
    [ -z "$URL" ] && URL="https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-x86_64.pkg"
  fi
  curl -L --progress-bar -o /tmp/qz-tray.pkg "$URL"
  echo "[2/2] Installing QZ Tray (may ask for password)..."
  sudo installer -pkg /tmp/qz-tray.pkg -target / && rm /tmp/qz-tray.pkg
else
  echo "[1/2] QZ Tray already installed — skipping."
fi

echo ""
open -a "QZ Tray" 2>/dev/null || true
osascript -e 'tell application "System Events" to make new login item at end with properties {path:"/Applications/QZ Tray.app", hidden:true}' 2>/dev/null || true

echo " ========================================"
echo "  Setup complete! QZ Tray is running in the menu bar."
echo ""
echo "  Go back to the browser, open Printer Setup, click Connect."
echo "  First print: QZ Tray will ask to Allow unsigned content — click Allow."
echo " ========================================"
""";

    public static string LinuxSh(string certBase64, string validFrom, string validTo) => $$"""
#!/bin/bash
clear
echo " ========================================"
echo "  BuildPOS - Printer Setup"
echo " ========================================"
echo ""

echo "[1/3] Downloading QZ Tray..."
ARCH=$(uname -m)
RELEASE=$(curl -sf https://api.github.com/repos/qzind/tray/releases/latest 2>/dev/null || echo "")
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  URL=$(echo "$RELEASE" | grep -o '"browser_download_url":"[^"]*arm64\.run"' | grep -o 'https://[^"]*' | head -1)
  [ -z "$URL" ] && URL="https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-arm64.run"
else
  URL=$(echo "$RELEASE" | grep -o '"browser_download_url":"[^"]*x86_64\.run"' | grep -o 'https://[^"]*' | head -1)
  [ -z "$URL" ] && URL="https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-x86_64.run"
fi
curl -L --progress-bar -o /tmp/qz-tray-setup.run "$URL"

echo ""
echo "[2/3] Installing QZ Tray (enter your password when asked)..."
chmod +x /tmp/qz-tray-setup.run
sudo /tmp/qz-tray-setup.run --accept --quiet
rm -f /tmp/qz-tray-setup.run

echo ""
echo "[3/3] Trusting this server's certificate (no print dialogs will appear)..."
QZ_CERT=$(echo "{{certBase64}}" | base64 -d 2>/dev/null || echo "")
if [ -n "$QZ_CERT" ]; then
  echo "$QZ_CERT" | sudo tee /opt/qz-tray/override.crt >/dev/null
  QZ_FP=$(echo "$QZ_CERT" | openssl x509 -noout -fingerprint -sha1 2>/dev/null | cut -d= -f2 | tr -d ':' | tr 'A-F' 'a-f')
  mkdir -p ~/.qz
  grep -v "^$QZ_FP" ~/.qz/allowed.dat 2>/dev/null > /tmp/qz_allowed.tmp || true
  printf "%s\tBuildPOS\tECR Building\t{{validFrom}}\t{{validTo}}\ttrue\r\n" "$QZ_FP" >> /tmp/qz_allowed.tmp
  mv /tmp/qz_allowed.tmp ~/.qz/allowed.dat
  sudo sed -i '/^authcert\.override=/d' /opt/qz-tray/qz-tray.properties 2>/dev/null || true
  echo "authcert.override=override.crt" | sudo tee -a /opt/qz-tray/qz-tray.properties >/dev/null
  echo "   Trusted — no dialogs will appear."
else
  echo "   Could not embed cert — you may see one Allow prompt on first print."
fi

nohup qz-tray > /dev/null 2>&1 &

echo ""
echo " ========================================"
echo "  Setup complete! QZ Tray is running."
echo ""
echo "  Go back to the browser, open Printer Setup, click Connect."
echo " ========================================"
""";
}
