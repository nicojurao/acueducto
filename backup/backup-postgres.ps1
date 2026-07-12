# Respaldo de la base de datos Postgres del contenedor "appmedidores-db-1".
# Genera un .sql con fecha/hora, lo comprime a .zip y borra el .sql sin comprimir.
# Uso manual:   powershell -File backup-postgres.ps1
# Uso programado: ver backup\README.md para configurar Task Scheduler.

$ErrorActionPreference = "Stop"

$carpetaBackup = Join-Path $PSScriptRoot "postgres"
New-Item -ItemType Directory -Force -Path $carpetaBackup | Out-Null

$fecha = Get-Date -Format "yyyy-MM-dd_HHmm"
$archivoSql = Join-Path $carpetaBackup "medidores_$fecha.sql"
$archivoZip = Join-Path $carpetaBackup "medidores_$fecha.zip"

Write-Host "Generando dump de Postgres..."
docker exec appmedidores-db-1 pg_dump -U medidores medidores | Out-File -Encoding utf8 $archivoSql

if (-not (Test-Path $archivoSql) -or (Get-Item $archivoSql).Length -eq 0) {
    Write-Error "El dump salió vacío o falló. Revisa que el contenedor appmedidores-db-1 esté corriendo."
}

Write-Host "Comprimiendo..."
Compress-Archive -Path $archivoSql -DestinationPath $archivoZip -Force
Remove-Item $archivoSql

# Borra backups de Postgres con más de 30 días (el disco externo es el respaldo de largo
# plazo; esta carpeta local es solo el punto de partida que se copia hacia allá).
Get-ChildItem $carpetaBackup -Filter "medidores_*.zip" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force

Write-Host "Listo: $archivoZip"
