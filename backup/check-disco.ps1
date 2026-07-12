# Revisa el espacio libre del disco donde vive el proyecto (fotos en minio_data/ + backups
# de Postgres crecen ahi con el tiempo). Si queda poco espacio, deja un archivo bien visible
# ALERTA_DISCO.txt en esta misma carpeta (ademas de un log con el historial de mediciones).
# Uso manual:   powershell -File check-disco.ps1
# Programado: ver backup\README.md.

$ErrorActionPreference = "Stop"
$umbralPorcentaje = 15

$raizProyecto = Split-Path $PSScriptRoot -Parent
$letraDisco = (Get-Item $raizProyecto).PSDrive.Name
$disco = Get-PSDrive -Name $letraDisco

$totalGB = [math]::Round(($disco.Used + $disco.Free) / 1GB, 1)
$libreGB = [math]::Round($disco.Free / 1GB, 1)
$librePct = [math]::Round(($disco.Free / ($disco.Used + $disco.Free)) * 100, 1)

$archivoAlerta = Join-Path $PSScriptRoot "ALERTA_DISCO.txt"
$archivoLog = Join-Path $PSScriptRoot "disco-log.txt"
$fecha = Get-Date -Format "yyyy-MM-dd HH:mm"

$lineaLog = "$fecha - Disco ${letraDisco} - $libreGB GB libres de $totalGB GB ($librePct por ciento)"
Add-Content -Encoding utf8 -Path $archivoLog -Value $lineaLog

if ($librePct -lt $umbralPorcentaje) {
    $lineas = @(
        "ALERTA generada: $fecha",
        "",
        "El disco $letraDisco tiene solo $libreGB GB libres de $totalGB GB ($librePct por ciento libre)",
        "menos del umbral de $umbralPorcentaje por ciento.",
        "",
        "Las carpetas que mas crecen con el tiempo son:",
        "  - minio_data (fotos de lecturas, actas, novedades, usuarios)",
        "  - backup postgres (respaldos de la base de datos, se borran solos a los 30 dias)",
        "",
        "Revisa si hace falta liberar espacio o mover minio_data a un disco mas grande.",
        "Este archivo se borra solo apenas el espacio libre vuelva a estar por encima del umbral."
    )
    Set-Content -Encoding utf8 -Path $archivoAlerta -Value $lineas
    Write-Host "ALERTA: solo $librePct por ciento de espacio libre en disco $letraDisco. Ver $archivoAlerta"
} elseif (Test-Path $archivoAlerta) {
    Remove-Item $archivoAlerta -Force
    Write-Host "Espacio recuperado ($librePct por ciento libre) - se quito la alerta anterior."
} else {
    Write-Host "OK: $libreGB GB libres de $totalGB GB ($librePct por ciento)."
}
