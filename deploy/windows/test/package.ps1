#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$PackagePath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\Servidor-Comun.ps1')
$root = (Resolve-Path -LiteralPath $PackagePath).Path
$manifest = Test-SysMantManifest $root
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($root + '.zip')
try {
    $prefix = (Split-Path -Leaf $root) + '/'
    $entries = @{}
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\', '/')
        if (-not $name.StartsWith($prefix, [StringComparison]::Ordinal)) { throw 'Entrada ZIP fuera de la carpeta del paquete.' }
        $relative = $name.Substring($prefix.Length)
        if ($relative -match '(^|/)\.\.?(/|$)|[\\:]' -or $relative.StartsWith('/')) { throw 'Ruta ZIP invalida.' }
        if (-not $name.EndsWith('/')) {
            if ($entries.ContainsKey($relative)) { throw 'Entrada ZIP duplicada.' }
            $entries[$relative] = $entry
        }
    }
    if ($entries.Count -ne $manifest.files.Count + 1) { throw 'Cantidad de archivos ZIP incorrecta.' }
    foreach ($file in $manifest.files) {
        if (-not $entries.ContainsKey($file.path)) { throw "Falta en ZIP: $($file.path)" }
        $stream = $entries[$file.path].Open()
        $hasher = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $stream.Dispose(); $hasher.Dispose() }
        if ($hash -ne $file.sha256) { throw "Archivo ZIP alterado: $($file.path)" }
    }
    Write-Host "Carpeta y ZIP verificados: $($manifest.files.Count) archivos, mas el manifiesto."
} finally { $zip.Dispose() }
