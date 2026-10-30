@echo off
setlocal
set "SYSMANT_INSTALLER_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$installer = Join-Path $env:SYSMANT_INSTALLER_DIR 'Instalar-Servicio.ps1'; try { $process = Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File ' + [char]34 + $installer + [char]34) -PassThru -Wait; exit $process.ExitCode } catch { Write-Host 'No se inicio el instalador con permisos de administrador.'; exit 1 }"
if errorlevel 1 pause
endlocal
