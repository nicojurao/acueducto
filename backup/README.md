# Backup — Acueducto / Medidores

Esta carpeta genera el respaldo de la base de datos. **Vos te encargás de copiar todo esto (más `minio_data`) hacia tu disco externo** — esta guía es la parte de "qué generar y dónde queda" para que ese paso sea simple.

## 1. Qué hay que respaldar

| Qué | Dónde queda | Cómo se genera |
|---|---|---|
| Base de datos (suscriptores, medidores, lecturas, usuarios, todo) | `backup/postgres/*.zip` | Corriendo `backup-postgres.ps1` (ver abajo) |
| Fotos (actas, lecturas, novedades, perfiles de usuario) | `backup/minio_espejo/` | Corriendo `backup-minio.ps1` (ver abajo) — espeja `../minio_data/` con robocopy |
| Secretos (`JWT_SECRET`, token de Cloudflare, credenciales de MinIO) | `../.env` | Ya está guardado; solo asegurate de tener una copia en algún lugar seguro (gestor de contraseñas), no hace falta respaldarlo a diario, casi nunca cambia. |
| Excel histórico original | `../LECTURAS DE MEDIDORES 2026 .xlsx` | Ya existe, es la fuente de datos original — vale la pena conservarlo aunque ya esté todo en la base de datos. |
| Código de la app | Toda la carpeta `app medidores/` | **Recomendado a futuro**: subir el proyecto a un repositorio git (GitHub, GitLab, o uno privado propio) además de la copia en disco. Un backup en disco no tiene historial de cambios ni te deja volver atrás fácil si algo se rompe. |

**En resumen, para tu copia al disco externo necesitas al menos:**
```
app medidores/backup/postgres/      (dumps de la base de datos)
app medidores/backup/minio_espejo/  (espejo de las fotos, generado por backup-minio.ps1)
app medidores/.env                  (secretos — copia una vez, no hace falta todos los días)
```

## 2. Generar los backups

Postgres, manual desde PowerShell:
```powershell
powershell -File "C:\Users\SERVIDOR\Documents\app medidores\backup\backup-postgres.ps1"
```
Esto crea `backup/postgres/medidores_AAAA-MM-DD_HHMM.zip`. Guarda los últimos 30 días automáticamente y borra los más viejos (tu disco externo es el respaldo de largo plazo, esta carpeta es solo el punto de partida).

Fotos de MinIO, manual desde PowerShell:
```powershell
powershell -File "C:\Users\SERVIDOR\Documents\app medidores\backup\backup-minio.ps1"
```
Esto espeja `../minio_data/` hacia `backup/minio_espejo/` con robocopy (`/MIR`: si borras una foto en `minio_data`, también desaparece del espejo — es una copia de trabajo, no un histórico acumulativo).

## 3. Programado

Tareas en el Programador de tareas de Windows:

- **"Backup Postgres - Medidores"** — todos los días a las 11:00 PM, corre `backup-postgres.ps1`.
- **"Backup MinIO - Medidores"** — todos los días a las 11:05 PM, corre `backup-minio.ps1`.
- **"Check Disco - Medidores"** — todos los días a las 8:00 AM, corre `check-disco.ps1` (ver punto 6).

Para revisarlas o cambiarles el horario: abre **Programador de tareas** (Task Scheduler) desde el menú de inicio y búscalas por nombre. Ambas tienen *"Ejecutar la tarea lo antes posible si se omite un inicio programado"* activado, por si el PC está apagado a esa hora.

## 4. Tu copia al disco externo

Con el backup de Postgres generándose solo cada noche, lo único que te falta es programar (o hacer a mano) la copia de estas carpetas hacia tu disco:

```
app medidores\backup\postgres\
app medidores\backup\minio_espejo\
```

Si quieres automatizar también ese paso, `robocopy` (viene instalado en Windows) es la herramienta más simple:

```powershell
robocopy "C:\Users\SERVIDOR\Documents\app medidores\backup\postgres" "D:\Backups\medidores\postgres" /MIR
robocopy "C:\Users\SERVIDOR\Documents\app medidores\backup\minio_espejo" "D:\Backups\medidores\fotos" /MIR
```
(`D:\` es un ejemplo — cámbialo por la letra de tu disco externo. `/MIR` espeja la carpeta, o sea que si borras algo acá también se borra allá — si prefieres que el disco externo solo acumule sin borrar nunca, usa `/E` en vez de `/MIR`.)

Puedes agregar esos dos `robocopy` como una segunda tarea programada (mismo procedimiento del punto 3), puesta unos minutos después de la del backup de Postgres, para que siempre copie el .zip más reciente.

## 5. Ver que todo esté sano

MinIO tiene una consola web para revisar el contenido de las fotos directamente:
- http://localhost:9001 (usuario/contraseña en `.env`, variables `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`)

Para restaurar un backup de Postgres (si alguna vez hace falta), avísame y te acompaño con el comando exacto — depende de si es una restauración completa o parcial.

## 6. Alerta de espacio en disco

`check-disco.ps1` revisa cuánto espacio libre queda en el disco donde vive el proyecto (las fotos en `minio_data/` son lo que más va a crecer con el tiempo). Corre todos los días a las 8 AM:

- Deja un registro en `backup/disco-log.txt` con la medición de cada día.
- Si el espacio libre baja de **15%**, crea `backup/ALERTA_DISCO.txt` — un archivo bien visible con la explicación. Se borra solo apenas el espacio libre vuelva a estar por encima del umbral.

No manda ningún correo ni notificación (no hay servidor de correo configurado) — la forma de enterarte es que ese archivo aparezca en la carpeta. Si prefieres una alerta más activa (correo, WhatsApp, etc.), avísame y lo conectamos a algo.
