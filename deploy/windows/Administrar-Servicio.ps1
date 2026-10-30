#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('Estado', 'Iniciar', 'Detener', 'Reiniciar', 'RenovarCertificado', 'Desinstalar')]
    [string]$Accion = 'Estado'
)

. (Join-Path $PSScriptRoot 'Servidor-Comun.ps1')
Assert-Administrator
$paths = Get-SysMantPaths
$configFile = Join-Path $paths.Config 'service.json'
$config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
$service = Get-Service -Name $paths.Service -ErrorAction Stop
$publicCertificate = Join-Path $paths.Clients 'SysMant-local.cer'

switch ($Accion) {
    'Estado' {
        [pscustomobject]@{ Servicio = $service.Name; Estado = $service.Status; Inicio = $service.StartType;
            Direccion = $config.publicUrl; CertificadoHastaUTC = $config.certificateExpiresAt; Registros = $paths.Logs }
        if ($service.Status -eq 'Running') {
            Wait-SysMant $config.publicUrl $publicCertificate -TimeoutSeconds 10
            Write-Host 'Web, API, TLS y MySQL responden correctamente.'
        }
    }
    'Iniciar' {
        if ($PSCmdlet.ShouldProcess('SysMantLocal', 'Iniciar y habilitar arranque automatico')) {
            Set-Service -Name $paths.Service -StartupType Automatic
            & sc.exe config $paths.Service start= delayed-auto | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'No se pudo configurar el inicio diferido.' }
            Start-Service -Name $paths.Service
            Wait-SysMant $config.publicUrl $publicCertificate
        }
    }
    'Detener' {
        if ($PSCmdlet.ShouldProcess('SysMantLocal', 'Detener servicio')) { Stop-Service -Name $paths.Service }
    }
    'Reiniciar' {
        if ($PSCmdlet.ShouldProcess('SysMantLocal', 'Reiniciar servicio')) {
            if ($service.Status -eq 'Running') { Restart-Service -Name $paths.Service }
            else { Start-Service -Name $paths.Service }
            Wait-SysMant $config.publicUrl $publicCertificate
        }
    }
    'RenovarCertificado' {
        if ($PSCmdlet.ShouldProcess($config.publicUrl, 'Renovar certificado y actualizar instaladores de clientes')) {
            $backup = Join-Path $paths.Config ('certificado-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))
            New-Item -ItemType Directory -Path $backup | Out-Null
            Copy-Item -LiteralPath $configFile, $config.pfxPath, $publicCertificate, (Join-Path $paths.Clients 'acceso.json') -Destination $backup
            $wasRunning = $service.Status -eq 'Running'
            Stop-Service -Name $paths.Service
            try {
                $endpoint = Get-PublicEndpoint $config.publicUrl
                $certificate = New-SysMantCertificate $endpoint.Hostname $paths.Config $paths.Clients
                $config.pfxPath = $certificate.Path
                $config.pfxPassword = $certificate.Password
                $config.certificateExpiresAt = $certificate.ExpiresAt
                Write-Utf8File $configFile ($config | ConvertTo-Json)
                $access = [ordered]@{ publicUrl = $config.publicUrl; certificateSha256 = $certificate.Sha256;
                    certificateExpiresAt = $certificate.ExpiresAt }
                Write-Utf8File (Join-Path $paths.Clients 'acceso.json') ($access | ConvertTo-Json)
                if ($wasRunning) { Start-Service -Name $paths.Service; Wait-SysMant $config.publicUrl $publicCertificate }
                Write-Host "Certificado renovado. Redistribuye la carpeta $($paths.Clients) a los usuarios."
            } catch {
                Stop-Service -Name $paths.Service -ErrorAction SilentlyContinue
                Copy-Item -LiteralPath (Join-Path $backup 'service.json'), (Join-Path $backup 'servidor.pfx') -Destination $paths.Config -Force
                Copy-Item -LiteralPath (Join-Path $backup 'SysMant-local.cer'), (Join-Path $backup 'acceso.json') -Destination $paths.Clients -Force
                if ($wasRunning) { Start-Service -Name $paths.Service }
                throw
            }
        }
    }
    'Desinstalar' {
        if ($PSCmdlet.ShouldProcess('SysMantLocal', 'Desinstalar servicio y retirar su regla de firewall')) {
            Stop-Service -Name $paths.Service -ErrorAction SilentlyContinue
            & (Join-Path $paths.Program 'SysMantLocal.exe') uninstall
            if ($LASTEXITCODE -ne 0) { throw 'No se pudo desinstalar el servicio.' }
            Get-NetFirewallRule -Name $paths.Firewall -ErrorAction SilentlyContinue | Remove-NetFirewallRule
            Write-Host 'Servicio desinstalado. Se conservan MySQL, los datos, la configuracion, los certificados y los archivos de programa.'
        }
    }
}
