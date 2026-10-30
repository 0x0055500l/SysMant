#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$PackagePath)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'output')).Path
$package = (Resolve-Path -LiteralPath $PackagePath).Path
if ((Split-Path -Parent $package) -ne $root -or (Split-Path -Leaf $package) -notlike 'SysMant-Windows-*') {
    throw 'Solo se comprimen los paquetes generados en output.'
}
$zip = $package + '.zip'
if (Test-Path -LiteralPath $zip) { throw 'El archivo ZIP ya existe.' }
Compress-Archive -LiteralPath $package -DestinationPath $zip -CompressionLevel Optimal
Write-Host "ZIP listo: $zip"
