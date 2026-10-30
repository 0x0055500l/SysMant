Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Administrator {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Abre el instalador con permisos de administrador.'
    }
}

function Get-SysMantPaths {
    [pscustomobject]@{
        Program = Join-Path $env:ProgramFiles 'SysMant'
        Data = Join-Path $env:ProgramData 'SysMant'
        Config = Join-Path $env:ProgramData 'SysMant\config'
        Logs = Join-Path $env:ProgramData 'SysMant\logs'
        Clients = Join-Path $env:ProgramData 'SysMant\Clientes'
        Service = 'SysMantLocal'
        Firewall = 'SysMantLocal-HTTPS'
    }
}

function Write-Utf8File([string]$Path, [string]$Text) {
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}

function Assert-NoReparsePoint([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "No se admiten enlaces ni puntos de union: $current"
            }
        }
        $parent = Split-Path -Parent $current
        if ($parent -eq $current) { break }
        $current = $parent
    }
}

function Set-SysMantAcl([string]$Path, [string]$ServiceSid = '', [switch]$Write, [switch]$PublicRead) {
    Assert-NoReparsePoint $Path
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer) { $acl = New-Object Security.AccessControl.DirectorySecurity }
    else { $acl = New-Object Security.AccessControl.FileSecurity }
    $acl.SetAccessRuleProtection($true, $false)
    $inherit = [Security.AccessControl.InheritanceFlags]::None
    if ($item.PSIsContainer) { $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' }
    $propagation = [Security.AccessControl.PropagationFlags]::None
    foreach ($sidText in @('S-1-5-18', 'S-1-5-32-544')) {
        $sid = New-Object Security.Principal.SecurityIdentifier($sidText)
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', $inherit, $propagation, 'Allow')
        $acl.AddAccessRule($rule)
    }
    if ($ServiceSid) {
        $sid = New-Object Security.Principal.SecurityIdentifier($ServiceSid)
        $rights = [Security.AccessControl.FileSystemRights]::ReadAndExecute
        if ($Write) { $rights = [Security.AccessControl.FileSystemRights]::Modify }
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, $rights, $inherit, $propagation, 'Allow')))
    }
    if ($PublicRead) {
        $sid = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, 'ReadAndExecute', $inherit, $propagation, 'Allow')))
    }
    $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Test-SysMantManifest([string]$PackageRoot) {
    $root = [IO.Path]::GetFullPath($PackageRoot).TrimEnd('\')
    Assert-NoReparsePoint $root
    $manifest = Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.product -ne 'SysMant-Windows' -or $manifest.version -ne 1) { throw 'Paquete no compatible.' }
    $items = @(Get-ChildItem -LiteralPath $root -Recurse -Force)
    foreach ($item in $items) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'El paquete contiene un enlace o punto de union.' }
    }
    $names = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $manifest.files) {
        if ($entry.path -match '(^|/)\.\.?(/|$)|[\\:]' -or $entry.path.StartsWith('/') -or $entry.sha256 -notmatch '^[a-f0-9]{64}$') {
            throw 'El manifiesto contiene una ruta o huella invalida.'
        }
        if (-not $names.Add($entry.path)) { throw 'El manifiesto contiene rutas duplicadas.' }
        $full = [IO.Path]::GetFullPath((Join-Path $root $entry.path))
        if (-not $full.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta fuera del paquete.' }
        if ((Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) {
            throw "Archivo alterado o incompleto: $($entry.path)"
        }
    }
    foreach ($required in @('node/node.exe', 'SysMantLocal.exe', 'runtime/main.cjs', 'backend/src/server.js', 'web/index.html')) {
        if (-not $names.Contains($required)) { throw "Falta un componente: $required" }
    }
    foreach ($item in $items) {
        if (-not $item.PSIsContainer) {
            $relative = $item.FullName.Substring($root.Length + 1).Replace('\', '/')
            if ($relative -ne 'manifest.json' -and -not $names.Contains($relative)) {
                throw "Archivo no declarado en el manifiesto: $relative"
            }
        }
    }
    $wrapperHash = 'b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f'
    if ((Get-FileHash -LiteralPath (Join-Path $root 'SysMantLocal.exe') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $wrapperHash) {
        throw 'WinSW no coincide con la version autorizada.'
    }
    return $manifest
}

function Get-PublicEndpoint([string]$Value) {
    $uri = $null
    if ((-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) -or
        $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/') {
        throw 'Usa una direccion HTTPS, por ejemplo https://SERVIDOR:8443, sin ruta adicional.'
    }
    if ($uri.HostNameType -notin @([UriHostNameType]::Dns, [UriHostNameType]::IPv4)) {
        throw 'Usa un nombre DNS o una direccion IPv4 fija.'
    }
    [pscustomobject]@{ Url = $uri.GetLeftPart([UriPartial]::Authority); Hostname = $uri.DnsSafeHost; Port = $uri.Port }
}

function New-SysMantCertificate([string]$Hostname, [string]$ConfigDir, [string]$ClientDir) {
    $address = $null
    $san = 'DNS=' + $Hostname
    if ([Net.IPAddress]::TryParse($Hostname, [ref]$address)) { $san = 'IPAddress=' + $Hostname }
    $bytes = New-Object byte[] 36
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $password = [Convert]::ToBase64String($bytes)
    $certificate = New-SelfSignedCertificate -Type Custom -Subject ('CN=' + $Hostname) `
        -FriendlyName 'SysMant - servidor local' -KeyAlgorithm RSA -KeyLength 3072 `
        -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment `
        -CertStoreLocation 'Cert:\LocalMachine\My' -NotAfter (Get-Date).AddYears(2) `
        -TextExtension @("2.5.29.17={text}$san", '2.5.29.37={text}1.3.6.1.5.5.7.3.1', '2.5.29.19={text}CA=false')
    try {
        $pfx = Join-Path $ConfigDir 'servidor.pfx'
        $cer = Join-Path $ClientDir 'SysMant-local.cer'
        $secure = ConvertTo-SecureString -String $password -AsPlainText -Force
        Export-PfxCertificate -Cert $certificate -FilePath $pfx -Password $secure -ChainOption EndEntityCertOnly -CryptoAlgorithmOption AES256_SHA256 -Force | Out-Null
        Export-Certificate -Cert $certificate -FilePath $cer -Type CERT -Force | Out-Null
        return [pscustomobject]@{ Path = $pfx; Password = $password; PublicCertificate = $cer;
            Sha256 = (Get-FileHash -LiteralPath $cer -Algorithm SHA256).Hash.ToLowerInvariant();
            ExpiresAt = $certificate.NotAfter.ToUniversalTime().ToString('o') }
    } finally {
        Remove-Item -LiteralPath ('Cert:\LocalMachine\My\' + $certificate.Thumbprint)
    }
}

function Wait-SysMant([string]$Url, [string]$CertificateFile, [int]$TimeoutSeconds = 90) {
    $paths = Get-SysMantPaths
    $probe = Join-Path $paths.Program 'runtime\probe.cjs'
    $node = Join-Path $paths.Program 'node\node.exe'
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        & $node $probe $Url $CertificateFile 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw "SysMant no respondio a tiempo. Revisa los registros en $($paths.Logs)."
}
