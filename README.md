# Fluvi — Sistema de Gestión Operativa (Acueducto Comunitario Barrios Unidos de Mocoa, ACBUM)

Aplicación web interna para la gestión operativa y ambiental de un acueducto comunitario. Reemplaza el manejo manual en Excel de suscriptores, medidores y lecturas, y suma módulos de aforos de caudal, inventario general y reportería.

> **Estado de datos (producción, julio 2026):** ~4.308 suscriptores · ~219 medidores instalados · ~3.788 lecturas históricas (2024–2026) · 10 vínculos de cotitular.

---

## Índice

- [Arquitectura y stack](#arquitectura-y-stack)
- [Módulos de la aplicación](#módulos-de-la-aplicación)
- [Modelo de datos](#modelo-de-datos)
- [Roles y permisos](#roles-y-permisos)
- [Puesta en marcha (desarrollo)](#puesta-en-marcha-desarrollo)
- [Despliegue a producción](#despliegue-a-producción)
- [Migraciones de Prisma](#migraciones-de-prisma)
- [Almacenamiento de archivos (MinIO)](#almacenamiento-de-archivos-minio)
- [Copias de seguridad](#copias-de-seguridad)
- [Scripts útiles](#scripts-útiles)
- [Convenciones del proyecto](#convenciones-del-proyecto)

---

## Arquitectura y stack

| Capa | Tecnología |
|------|-----------|
| **Backend** | Node.js + Express + TypeScript (ESM), Prisma ORM |
| **Base de datos** | PostgreSQL 16 |
| **Frontend** | React 18 + Vite + TypeScript + Tailwind CSS (PWA) |
| **Almacenamiento de archivos** | MinIO (S3-compatible, self-hosted) |
| **Mapas** | Leaflet + react-leaflet + markercluster |
| **Gráficas** | Recharts |
| **Reportes** | PDFKit (PDF) + ExcelJS (Excel con estilos) |
| **Orquestación** | Docker Compose |
| **Exposición externa** | Cloudflare Tunnel (`cloudflared`) → `operativo.acbum.com.co` |

El frontend consume la API en el mismo origen; Vite (en desarrollo) y nginx (en producción) hacen de proxy hacia el backend y hacia `/uploads/*`, de modo que no hace falta exponer puertos adicionales por el túnel de Cloudflare.

```
┌────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend  │────▶│   Backend    │────▶│  PostgreSQL  │
│ React/Vite │     │ Express/Prisma│     └──────────────┘
└────────────┘     │              │────▶┌──────────────┐
       ▲           └──────────────┘     │    MinIO     │
       │                                └──────────────┘
┌────────────┐
│ cloudflared│  ← túnel hacia operativo.acbum.com.co
└────────────┘
```

---

## Módulos de la aplicación

### Inicio (`/`)
Dashboard general de bienvenida. Muestra un resumen condicional por módulo según los permisos del usuario (Medición, Inventario), con enlaces a cada módulo completo. Visible para cualquier sesión.

### Medición (`/medicion`)
Dashboard de medición: KPIs de cobertura, consumo del mes, promedio por usuario, lecturas pendientes; consumos atípicos, top consumidores, tendencia multianual y distribución de medidores. En móvil se simplifica a las tarjetas principales.

### Suscriptores
- **Listado:** tabla paginada/filtrable, importación/exportación por Excel (bulk upsert por NUID), modal de detalle con edición in-place e historial de medidores retirados.
- **Barrios y estratos:** catálogos administrables (FK real hacia `Suscriptor`).

### Medidores
- **Inventario:** tabla paginada/filtrable, alta de medidores, eliminación segura (solo sin historial), acta de calibración por medidor.
- **Catálogo:** jerarquía Marca → Modelo → Diámetro gestionada en un modal único; catálogo de **Lotes** (rango de seriales consecutivos por caja de fábrica).
- **Actas:** actas de instalación con fotos de evidencia, PDF de plantilla para firmar, y carga del acta firmada escaneada.

### Lecturas
Captura de lecturas por periodo con **foto obligatoria** y GPS. Soporta **cola offline** (IndexedDB) para trabajo en campo sin señal, registro de **novedades** (imposibilidad de leer), e **informe de lecturas por rango** en Excel institucional.

### Aforos
Medición de caudal en fuentes/bocatomas (independiente de los medidores de suscriptor):
- **Puntos de aforo:** catálogo de fuentes.
- **Registros:** métodos **volumétrico** (volumen/tiempo) y **flotador** (velocidad superficial × área de la sección, replicando el formato oficial `F-SIG-GA-001`).
- **Dashboard:** KPIs de caudal, tendencia de caudal por punto en el tiempo y alertas de caudal bajo.
- Reporte PDF por aforo.

### Inventario general
Herramientas, equipos e insumos de la operación (distinto del inventario de medidores):
- **Ítems** con unidad de medida, foto, código/placa, valor y disponibilidad calculada.
- **Préstamos** (asignación a responsable con devolución) y **entradas/salidas** de stock.
- **Catálogos:** categorías, ubicaciones y proveedores.
- **Dashboard** con KPIs y gráficas; exportación Excel/PDF institucional.

### Mapa
Predios georreferenciados con Leaflet y agrupamiento de marcadores (clustering).

### Usuarios y Roles
- **Usuarios:** CRUD con foto de perfil, cédula, celular y fecha de nacimiento.
- **Roles:** roles configurables con permisos por módulo (ver [Roles y permisos](#roles-y-permisos)).
- **Perfil autoservicio:** cualquier usuario edita sus propios datos sin permisos de administración.

---

## Modelo de datos

Definido en [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma). Modelos principales:

- **`Suscriptor`** — datos del predio/cliente, con FK a `Barrio` y `Estrato`, estado de facturación y estado de predio.
- **`Medidor`** — con FK a `MarcaMedidor` / `ModeloMedidor` / `DiametroMedidor` y `Lote`; acta de calibración; estado (bodega/instalado) y condición física.
- **`ActaInstalacion`** — documento de instalación con fotos, acta firmada y fecha de retiro (historial no destructivo).
- **`Cotitular`** — suscriptor adicional que comparte un medidor (el consumo se reparte por igual).
- **`Lectura`** — lectura mensual por medidor (único `[medidorId, periodo]`), con foto y GPS.
- **`NovedadLectura`** — imposibilidad de tomar lectura en un periodo (se borra al capturar la real).
- **`PuntoAforo` / `Aforo`** — fuentes y mediciones de caudal.
- **`ItemInventario` / `PrestamoInventario` / `MovimientoInventario`** + catálogos de inventario.
- **`Usuario` / `Rol` / `Permiso` / `RolPermiso`** — autenticación y autorización.
- **`HistorialCambio`** — auditoría de cambios en medidores y suscriptores.

---

## Roles y permisos

La autorización es por **permiso de módulo**, no por rol fijo. Cada usuario tiene un `Rol` y cada rol un conjunto de permisos (catálogo definido en [`backend/src/lib/permisos.ts`](backend/src/lib/permisos.ts)).

- Muchos módulos separan **`_ver`** (lectura) de **`_avanzado`** (crear/editar/eliminar/importar): `suscriptores`, `medidores`, `aforos`, `inventario`.
- Roles de sistema: **`admin`** (protegido, no se puede renombrar ni eliminar) y **`fontanero`** (editable).
- **Login por cédula o nombre de usuario** (no correo). El endpoint `POST /api/auth/login` recibe `{ identificador, password }`.

> Al agregar un módulo nuevo con control de acceso, dar de alta su permiso en `permisos.ts`, sembrarlo en una migración, gatear la ruta con `requirePermiso(...)` y usar la clave en `RutaProtegida` / `Sidebar` del frontend.

---

## Puesta en marcha (desarrollo)

### Requisitos
- Docker Desktop
- Un archivo `.env` en la raíz (ver abajo)

### Variables de entorno (`.env` en la raíz)

```env
JWT_SECRET=<secreto largo y aleatorio>
CLOUDFLARE_TUNNEL_TOKEN=<token del túnel>   # solo si se expone externamente
MINIO_ROOT_USER=<usuario minio>
MINIO_ROOT_PASSWORD=<password minio>
# Opcional: CORS_ORIGINS=https://operativo.acbum.com.co,http://localhost:5173
```

> Las credenciales de PostgreSQL están fijadas en `docker-compose.yml` (`medidores`/`medidores`/`medidores`).

### Levantar el entorno

```bash
docker compose up -d
```

Servicios: `db` (5432), `backend` (3001), `frontend` (5173), `minio` (9000 API / 9001 consola), `cloudflared`.

En desarrollo el código se monta en vivo (bind mounts) y corre con `tsx watch` (backend) y `vite` (frontend):

- **Frontend:** tras editar `frontend/src`, `docker restart appmedidores-frontend-1` y hacer **Ctrl+F5** (por el service worker de la PWA). Si un cambio no aparece pese al hard refresh, `docker compose restart frontend`.
- **Backend:** `tsx watch` recarga solo. Tras cambios de schema de Prisma sí hace falta acción manual (ver [Migraciones](#migraciones-de-prisma)).

### Crear el primer usuario administrador

```bash
docker compose exec backend npm run create-admin
```

---

## Despliegue a producción

Los `Dockerfile.prod` de ambos servicios están guardados aparte (frontend con nginx + `nginx.conf` sirviendo en el puerto **5173** para no tocar la config del túnel de Cloudflare). Para pasar a producción:

1. Copiar `Dockerfile.prod` sobre `Dockerfile` en `backend/` y `frontend/`.
2. Quitar los bind mounts (`./backend:/app`, `./frontend:/app`) y los volúmenes de `node_modules` de `docker-compose.yml`.
3. `docker compose build backend frontend && docker compose up -d`.

> En `nginx.conf`, usar el modificador `^~` para las rutas de proxy (`/api/`, `/uploads/`) para que no las capturen reglas `location` con regex.

---

## Migraciones de Prisma

`prisma migrate dev` **no funciona** en este entorno (el contenedor corre sin TTY interactivo). Para crear una migración a mano:

1. Editar `backend/prisma/schema.prisma`.
2. Generar el SQL del diff:
   ```bash
   docker exec appmedidores-backend-1 sh -c \
     "npx prisma migrate diff --from-url \$DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script"
   ```
3. Crear `backend/prisma/migrations/<timestamp>_<nombre>/migration.sql` con ese SQL.
4. **Si el cambio preserva datos** (renombrar columnas, pasar texto a FK, etc.), reordenar el SQL a mano: crear lo nuevo → *backfill* con `INSERT ... SELECT` / `UPDATE ... FROM` → recién ahí `DROP`/`DELETE`.
5. Aplicar y regenerar el cliente:
   ```bash
   docker exec appmedidores-backend-1 npx prisma migrate deploy
   docker exec appmedidores-backend-1 npx prisma generate
   docker compose restart backend
   ```

---

## Almacenamiento de archivos (MinIO)

Todas las fotos (lecturas, actas, novedades, inventario, perfil) se guardan en **MinIO** (bind mount `./minio_data:/data`, para que el backup sea copiar esa carpeta). La capa de abstracción está en [`backend/src/lib/storage.ts`](backend/src/lib/storage.ts); las rutas guardadas en BD tienen la forma `/uploads/carpeta/archivo.ext`.

El acceso a `/uploads/*` requiere autenticación mediante un **token de media efímero (20 min)**, distinto del token de sesión. En el frontend, construir siempre la URL de una foto con `urlFoto(ruta)` de `api/client.ts`, nunca a mano.

Consola web de MinIO: `http://localhost:9001`.

---

## Copias de seguridad

Scripts en [`backup/`](backup/) (ejecutados vía Windows Task Scheduler):

- **`backup-postgres.ps1`** — `pg_dump` comprimido a `.zip`, purga dumps de +30 días.
- **`backup-minio.ps1`** — copia de `minio_data/`.
- **`check-disco.ps1`** — vigila el espacio libre y crea `ALERTA_DISCO.txt` si baja del 15%.

Ver [`backup/README.md`](backup/README.md) para qué respaldar (Postgres, `minio_data/`, `.env`, el Excel histórico) y cómo programarlo.

---

## Scripts útiles

Desde `backend/` (o vía `docker compose exec backend npm run <script>`):

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Backend en modo watch |
| `npm run build` | Compila TypeScript |
| `npm run test` | Tests con Vitest |
| `npm run create-admin` | Crea/actualiza un usuario admin |
| `npm run import` | Importa desde el Excel histórico |
| `npm run migrate-uploads-to-minio` | Migra fotos del volumen viejo a MinIO |
| `npm run split-nombres` | Separa `nombre` en nombres/apellidos |

Frontend (`frontend/`): `npm run dev`, `npm run build`, `npm run test`.

---

## Convenciones del proyecto

- **Color de marca:** `#00487f` (paleta `brand-*` de Tailwind). No usar `cyan-*`.
- **Logo:** `logo-acbum.png` (en `frontend/public/` y `backend/src/assets/`). PDFs usan el helper `pdfBranding.ts`; Excel usa `excelBranding.ts`.
- **Fotos:** comprimir siempre en el navegador con `comprimirFoto`/`comprimirFotos` antes de subir. Nunca usar `<input capture="environment">`; usar `CamaraModal` + input de galería.
- **Descargas protegidas:** usar `descargarArchivo(...)` (un `<a href>` no manda el token).
- **Campos denormalizados:** si un campo es copia de texto de un catálogo, la edición del catálogo debe cascadear el cambio (`updateMany`).
- **Conteos con soft-delete:** filtrar `activo: true` en los `_count` de relaciones.
- **Paginación:** patrón "sin `page` = todo (compat), con `page` = pagina".
```