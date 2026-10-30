#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [string]$PublicUrl,
    [string]$BackendEnv,
    [ValidatePattern('^[A-Za-z0-9_-]+$')][string]$MySqlService = 'MySQL80',
    [ValidateCount(1,32)][string[]]$ClientNetwork = @('LocalSubnet'),
    [ValidateRange(1024, 65535)][int]$ApiPort = 3000,
    [switch]$NoPause
)

. (Join-Path $PSScriptRoot 'Servidor-Comun.ps1')
$paths = Get-SysMantPaths
$installed = $false
$started = $false
try {
    Assert-Administrator
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Se requiere Windows x64.' }
    $framework = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full'
    if ($framework.Release -lt 528040) { throw 'Instala .NET Framework 4.8 antes de continuar.' }
    if (Get-Service -Name $paths.Service -ErrorAction SilentlyContinue) { throw 'SysMantLocal ya esta instalado. Usa Administrar-Servicio.ps1.' }
    if (Get-NetFirewallRule -Name $paths.Firewall -ErrorAction SilentlyContinue) { throw 'Ya existe una regla SysMantLocal-HTTPS. Revisa la instalacion anterior.' }
    foreach ($directory in @($paths.Program, $paths.Data)) {
        Assert-NoReparsePoint $directory
        if (Test-Path -LiteralPath $directory) {
            throw "La carpeta $directory ya existe. Se conserva su contenido; revisa la instalacion anterior."
        }
    }
    Write-Host 'Comprobando los archivos del paquete...'
    $manifest = Test-SysMantManifest $PSScriptRoot
    if (-not $PublicUrl) {
        $defaultUrl = 'https://' + $env:COMPUTERNAME.ToLowerInvariant() + ':8443'
        $answer = Read-Host "Direccion para los clientes [Enter = $defaultUrl]"
        if ($answer) { $PublicUrl = $answer.Trim() } else { $PublicUrl = $defaultUrl }
    }
    $endpoint = Get-PublicEndpoint $PublicUrl
    if ($endpoint.Port -eq $ApiPort) { throw 'Los puertos de la web y la API deben ser distintos.' }
    if ($endpoint.Hostname -in @('localhost', '127.0.0.1')) { throw 'Indica el nombre o la IP fija del servidor en la red local.' }
    if (-not $BackendEnv) {
        $candidate = 'D:\proyect\backend\.env'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $BackendEnv = $candidate }
        else { $BackendEnv = Read-Host 'Ruta completa del archivo backend\.env del servidor' }
    }
    $BackendEnv = (Resolve-Path -LiteralPath $BackendEnv).Path
    if (-not (Test-Path -LiteralPath $BackendEnv -PathType Leaf)) { throw 'No se encontro el archivo de configuracion del backend.' }
    foreach ($network in $ClientNetwork) {
        if ($network -ne 'LocalSubnet' -and $network -notmatch '^\d{1,3}(\.\d{1,3}){3}(/\d{1,2})?$') {
            throw 'ClientNetwork debe ser LocalSubnet o una red/direccion IPv4.'
        }
        if ($network -in @('0.0.0.0', '0.0.0.0/0')) { throw 'La regla de acceso debe limitarse a la red de la estacion.' }
    }
    foreach ($port in @($endpoint.Port, $ApiPort)) {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
            throw "El puerto $port esta ocupado. Deten la instancia anterior antes de instalar."
        }
    }
    $mysql = Get-Service -Name $MySqlService -ErrorAction Stop
    if ($mysql.StartType -eq 'Disabled') { throw 'El servicio MySQL esta deshabilitado.' }
    Write-Host 'Comprobando la conexion con MySQL...'
    Set-Service -Name $MySqlService -StartupType Automatic
    Start-Service -Name $MySqlService
    & (Join-Path $PSScriptRoot 'node\node.exe') (Join-Path $PSScriptRoot 'runtime\check-env.cjs') $BackendEnv
    if ($LASTEXITCODE -ne 0) { throw 'La configuracion o la base MySQL no esta preparada. No se modifico la base de datos.' }

    foreach ($directory in @($paths.Program, $paths.Data)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
        Set-SysMantAcl $directory
    }
    foreach ($directory in @($paths.Config, $paths.Logs, $paths.Clients)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
    }
    foreach ($name in @('backend', 'runtime', 'web', 'node', 'SysMantLocal.exe', 'manifest.json', 'Administrar-Servicio.ps1', 'Servidor-Comun.ps1', 'TERCEROS.txt', 'WinSW-LICENSE.txt')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $paths.Program -Recurse
    }
    Copy-Item -LiteralPath $BackendEnv -Destination (Join-Path $paths.Config 'backend.env')
    $certificate = New-SysMantCertificate $endpoint.Hostname $paths.Config $paths.Clients
    $config = [ordered]@{ publicUrl = $endpoint.Url; listenAddress = '0.0.0.0'; webPort = $endpoint.Port;
        apiPort = $ApiPort; backendEnv = (Join-Path $paths.Config 'backend.env');
        pfxPath = $certificate.Path; pfxPassword = $certificate.Password;
        certificateExpiresAt = $certificate.ExpiresAt; mysqlService = $MySqlService }
    Write-Utf8File (Join-Path $paths.Config 'service.json') ($config | ConvertTo-Json)
    $clientConfig = [ordered]@{ publicUrl = $endpoint.Url; certificateSha256 = $certificate.Sha256;
        certificateExpiresAt = $certificate.ExpiresAt }
    Write-Utf8File (Join-Path $paths.Clients 'acceso.json') ($clientConfig | ConvertTo-Json)
    foreach ($name in @('Instalar-Acceso.ps1', 'Instalar-Acceso.cmd')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $paths.Clients
    }
    $escape = { param($value) [Security.SecurityElement]::Escape([string]$value) }
    $nodePath = & $escape (Join-Path $paths.Program 'node\node.exe')
    $mainPath = & $escape (Join-Path $paths.Program 'runtime\main.cjs')
    $configPath = & $escape (Join-Path $paths.Config 'service.json')
    $programPath = & $escape $paths.Program
    $logPath = & $escape $paths.Logs
    $dependency = & $escape $MySqlService
    $xml = @"
<service>
  <id>SysMantLocal</id>
  <name>SysMant - Sistema local de mantenimiento</name>
  <description>API, interfaz web, alertas y sincronizacion de la estacion.</description>
  <executable>$nodePath</executable>
  <arguments>--max-old-space-size=256 &quot;$mainPath&quot; &quot;$configPath&quot;</arguments>
  <workingdirectory>$programPath</workingdirectory>
  <env name="NODE_ENV" value="production"/>
  <env name="NODE_OPTIONS" value=""/>
  <env name="NODE_EXTRA_CA_CERTS" value=""/>
  <env name="NODE_TLS_REJECT_UNAUTHORIZED" value="1"/>
  <startmode>Automatic</startmode>
  <delayedAutoStart/>
  <depend>$dependency</depend>
  <serviceaccount><domain>NT AUTHORITY</domain><user>LocalService</user></serviceaccount>
  <stoptimeout>25 sec</stoptimeout>
  <stopparentprocessfirst>true</stopparentprocessfirst>
  <onfailure action="restart" delay="15 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <onfailure action="restart" delay="60 sec"/>
  <resetfailure>1 hour</resetfailure>
  <logpath>$logPath</logpath>
  <log mode="roll-by-size"><sizeThreshold>5120</sizeThreshold><keepFiles>5</keepFiles></log>
</service>
"@
    Write-Utf8File (Join-Path $paths.Program 'SysMantLocal.xml') $xml
    & (Join-Path $paths.Program 'SysMantLocal.exe') install
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo registrar el servicio de Windows.' }
    $installed = $true
    & sc.exe sidtype $paths.Service unrestricted | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo habilitar la identidad propia del servicio.' }
    $account = New-Object Security.Principal.NTAccount('NT SERVICE', $paths.Service)
    $sid = $account.Translate([Security.Principal.SecurityIdentifier]).Value
    Set-SysMantAcl $paths.Program $sid
    Set-SysMantAcl $paths.Data $sid
    Set-SysMantAcl $paths.Config $sid
    Set-SysMantAcl $paths.Logs $sid -Write
    Set-SysMantAcl $paths.Clients -PublicRead
    New-NetFirewallRule -Name $paths.Firewall -DisplayName 'SysMant - acceso HTTPS de la estacion' `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort $endpoint.Port `
        -Program (Join-Path $paths.Program 'node\node.exe') -Profile Domain,Private `
        -RemoteAddress $ClientNetwork | Out-Null
    $metadata = [ordered]@{ product = 'SysMant-Windows'; installedAt = [DateTime]::UtcNow.ToString('o');
        publicUrl = $endpoint.Url; packageCreatedAt = $manifest.createdAt; nodeVersion = $manifest.nodeVersion;
        mysqlService = $MySqlService; clientNetwork = $ClientNetwork }
    Write-Utf8File (Join-Path $paths.Config 'installation.json') ($metadata | ConvertTo-Json)
    Start-Service -Name $paths.Service
    $started = $true
    Wait-SysMant $endpoint.Url $certificate.PublicCertificate
    Write-Host "`nInstalacion terminada. SysMant iniciara automaticamente con Windows."
    Write-Host "Direccion para los usuarios: $($endpoint.Url)"
    Write-Host "Copia SOLO la carpeta $($paths.Clients) a cada cliente y ejecuta Instalar-Acceso.cmd."
    Write-Host "Certificado valido hasta: $($certificate.ExpiresAt)"
} catch {
    if ($started) { Stop-Service -Name $paths.Service -ErrorAction SilentlyContinue }
    if ($installed) {
        Set-Service -Name $paths.Service -StartupType Manual -ErrorAction SilentlyContinue
        Write-Warning 'El servicio queda detenido y en inicio manual para corregir el error. La configuracion se conserva.'
    }
    Write-Error $_ -ErrorAction Continue
    if (-not $NoPause) { Read-Host 'Pulsa Enter para cerrar' | Out-Null }
    exit 1
}
if (-not $NoPause) { Read-Host 'Pulsa Enter para cerrar' | Out-Null }
