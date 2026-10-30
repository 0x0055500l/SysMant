#Requires -Version 5.1
[CmdletBinding()]
param([switch]$NoOpen, [switch]$NoPause)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
try {
    $config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'acceso.json') -Raw | ConvertFrom-Json
    $uri = [Uri]$config.publicUrl
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/') {
        throw 'La direccion del servidor no es valida.'
    }
    $certFile = Join-Path $PSScriptRoot 'SysMant-local.cer'
    $hash = (Get-FileHash -LiteralPath $certFile -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($config.certificateSha256 -notmatch '^[a-f0-9]{64}$' -or $hash -ne $config.certificateSha256) {
        throw 'El certificado no coincide con el entregado por el administrador.'
    }
    $certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($certFile)
    if ($certificate.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow -or $certificate.NotBefore.ToUniversalTime() -gt [DateTime]::UtcNow) {
        throw 'El certificado esta vencido o el reloj de la PC es incorrecto.'
    }
    Write-Host "Servidor: $($config.publicUrl)"
    Write-Host "Huella SHA256: $hash"
    Write-Host 'Este acceso instala el certificado del servidor en el perfil actual y crea un acceso directo.'
    Write-Host 'Comprueba que esta carpeta fue entregada por el administrador de la estacion.'
    $answer = Read-Host 'Escribe INSTALAR para continuar'
    if ($answer -cne 'INSTALAR') { throw 'Instalacion de acceso cancelada.' }
    Import-Certificate -FilePath $certFile -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
    $desktop = [Environment]::GetFolderPath('Desktop')
    $shortcut = Join-Path $desktop 'SysMant.url'
    [IO.File]::WriteAllText($shortcut, "[InternetShortcut]`r`nURL=$($config.publicUrl)`r`n", (New-Object Text.UTF8Encoding($false)))
    Write-Host 'Acceso SysMant creado en el escritorio. Ingresa con tu cuenta del sistema local.'
    if (-not $NoOpen) { Start-Process -FilePath $config.publicUrl }
} catch {
    Write-Error $_ -ErrorAction Continue
    if (-not $NoPause) { Read-Host 'Pulsa Enter para cerrar' | Out-Null }
    exit 1
}
if (-not $NoPause) { Read-Host 'Pulsa Enter para cerrar' | Out-Null }
