# Respaldo de las fotos de MinIO (actas, lecturas, novedades, perfiles de usuario).
# MinIO ya escribe directo en ../minio_data — este script solo espeja esa carpeta hacia
# backup/minio_espejo con robocopy, mismo criterio que backup-postgres.ps1: esta carpeta local
# es el punto de partida que después se copia al disco externo (ver backup/README.md).
# Uso manual:   powershell -File backup-minio.ps1
# Uso programado: ver backup\README.md para configurar Task Scheduler.

$ErrorActionPreference = "Stop"

$origen = Join-Path (Split-Path $PSScriptRoot -Parent) "minio_data"
$destino = Join-Path $PSScriptRoot "minio_espejo"

if (-not (Test-Path $origen)) {
    Write-Error "No se encontró la carpeta $origen. ¿MinIO llegó a arrancar al menos una vez?"
}

New-Item -ItemType Directory -Force -Path $destino | Out-Null

Write-Host "Espejando $origen -> $destino ..."
# /MIR espeja el contenido (borra en destino lo que ya no está en origen); /R:2 /W:5 limita
# reintentos por archivo bloqueado a algo razonable en vez del default (1 millón de reintentos,
# que puede colgar la tarea programada toda la noche si un archivo quedó con lock).
robocopy $origen $destino /MIR /R:2 /W:5 /NFL /NDL /NP | Out-Null

# Códigos de robocopy 0-7 son éxito (distintas combinaciones de "copió archivos"/"nada que
# copiar"); 8 o más es error real.
if ($LASTEXITCODE -ge 8) {
    Write-Error "robocopy terminó con código $LASTEXITCODE (falla real, no solo diferencias copiadas)."
}

Write-Host "Listo: $destino"
