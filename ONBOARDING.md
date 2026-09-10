# Onboarding de un cliente nuevo

Guía para levantar una instancia de Fluvi para un acueducto distinto a ACBUM. El modelo es "un
stack por cliente": servidor, base de datos, bucket de archivos y dominios propios — no comparte
nada con ninguna otra instancia. Sigue estos pasos en orden.

La parametrización "de negocio" (nombre, logo, color de marca, información catastral, dominios,
correo SMTP) ya NO se edita a mano en archivos — se hace una sola vez, desde dentro de la propia
app, con un wizard que aparece automáticamente la primera vez que alguien entra con el usuario
admin. Esta guía solo cubre lo que sí sigue siendo infraestructura (servidor, secretos, túnel).

## 1. Requisitos previos

- Un servidor (VPS) con Docker y Docker Compose instalados.
- Un dominio que el cliente controle (o un subdominio que te ceda), con acceso a su DNS.
- Una cuenta de Cloudflare (gratis alcanza) para el túnel — así no hay que abrir puertos en el
  servidor ni depender de una IP fija.
- Datos del cliente a la mano para cuando llegues al wizard: NIT con dígito de verificación,
  nombre completo y sigla de la entidad, dirección/teléfonos/correo, código DANE de su municipio,
  logo en PNG/JPG, color de marca, y credenciales SMTP para el correo que va a notificar (puede
  ser un correo nuevo tipo `pqrs@dominio-del-cliente.com`).

## 2. Cloudflare: túnel y dominios

1. En el dashboard de Cloudflare → Zero Trust → Networks → Tunnels, crea un túnel nuevo. Copia el
   token (es el valor de `CLOUDFLARE_TUNNEL_TOKEN`).
2. Configura 3 "Public Hostnames" apuntando los tres al mismo servicio (`http://frontend:5173`,
   el nombre del contenedor dentro del docker-compose):
   - `operativo.<dominio-cliente>` — panel interno.
   - `pqrs.<dominio-cliente>` — sitio público de PQRS.
   - `calidad.<dominio-cliente>` — documentos SGC públicos.
   Estos mismos 3 nombres son los que le vas a dar al wizard en el paso 6 (subdominios) — no hace
   falta que coincidan con nada más en este archivo.
3. Si el DNS del dominio no está ya en Cloudflare, hay que pasarlo (cambiar los nameservers) o
   usar CNAMEs apuntando al túnel, según cómo esté delegado el dominio del cliente.

## 3. Copiar el proyecto y configurar `.env`

```bash
git clone <repo> fluvi-<nombre-cliente>
cd fluvi-<nombre-cliente>
cp .env.example .env
```

`.env` solo lleva secretos de infraestructura (sin ellos la app ni arranca): contraseña de
Postgres, `JWT_SECRET` (genéralo con `openssl rand -base64 48`), credenciales de MinIO y el token
del túnel de Cloudflare del paso anterior. Cada variable tiene su explicación en el propio
archivo. Nada de nombre/logo/color/dominios/SMTP va acá — eso es el wizard.

## 4. Levantar los contenedores

```bash
docker compose -f docker-compose.prod.yml up -d db minio
# espera a que ambos queden "healthy" (docker compose ps)
docker compose -f docker-compose.prod.yml build backend frontend
docker compose -f docker-compose.prod.yml up -d
```

Las migraciones se aplican solas al arrancar el backend y, al ser una base de datos nueva, además
crean el usuario `admin` / `admin` (nunca tocan una base que ya tenga usuarios — ver
`backend/prisma/migrations/20260909214535_empresa`). No hace falta correr nada a mano ni crear un
usuario aparte.

## 5. Entrar por primera vez

Abre `https://operativo.<dominio-cliente>` y entra con `admin` / `admin`. Como todavía no hay
ninguna fila en la tabla `Empresa`, la app te muestra el wizard de inmediato y bloquea el resto
hasta terminarlo (ver `frontend/src/pages/SetupWizardPage.tsx` y el gate en `App.tsx`) — nadie más
que entre mientras tanto ve pantallas rotas, solo un aviso de "sistema no configurado".

## 6. El wizard (5 pasos, cada uno se guarda al avanzar)

1. **Datos de la empresa**: NIT (el dígito de verificación se sugiere solo, editable), nombre
   completo, sigla, dirección, sitio web, correo, teléfonos.
2. **Marca**: color de marca (recalcula toda la escala de la app en caliente, sin reconstruir
   nada) y logo.
3. **Información catastral**: códigos DANE departamento/municipio/centro poblado (buscarlos en el
   [Divipola del DANE](https://geoportal.dane.gov.co/laboratoriogeoportal/servicios-ide/divipola/))
   y el GLN de GS1 si el cliente tiene convenio de recaudo bancario con código de barras.
4. **Subdominios**: los mismos 3 hostnames que configuraste en Cloudflare (paso 2) — sin esto
   correcto, el sitio público de PQRS/SGC no se reconoce y el CORS del backend rechaza el panel.
5. **Correo**: servidor/puerto/usuario/contraseña SMTP para las notificaciones de PQRS. Se puede
   dejar vacío — el sistema sigue funcionando igual, solo no manda esos correos.

El botón "Finalizar configuración" del último paso es lo único que marca el wizard como completo
y deja pasar al resto de la app. Todos estos campos quedan editables después desde
Panel de administración → pestaña "Empresa", para el admin que quiera corregir algo.

La contraseña `admin`/`admin` queda tal cual tras el wizard — no se fuerza a cambiarla. Vale la
pena cambiarla a mano desde Usuarios apenas termine el onboarding.

## 7. Nota para desarrollo local (no producción)

Si vas a correr `docker-compose.yml` (modo desarrollo, servidor Vite) en vez de
`docker-compose.prod.yml` (nginx, lo que usa producción), ajusta `allowedHosts` en
`frontend/vite.config.ts` — hoy trae fijo `"operativo.acbum.com.co"`. Vite rechaza cualquier host
que no esté en esa lista. No afecta producción, que no pasa por el dev server.

## 8. Qué queda vacío y qué ya viene listo

**Ya viene sembrado (mismo para cualquier cliente, es catálogo nacional/regulatorio):**
- Diámetros de medidor más comunes (1/2" a 6") — marcas y modelos quedan vacíos, se crean según
  lo que use cada cliente.
- Catálogo de causales del reporte SUI (Anexo A) — 37 causales, las que aplican a un prestador
  solo de acueducto. Si el cliente también presta alcantarillado/aseo, se agregan las que falten
  desde PQRS → Parametrización dentro de la app.
- Roles: "admin" con todos los permisos.

**Hereda texto de ACBUM y HAY QUE EDITARLO (importante, no es automático):** los 3 encabezados de
correo de PQRS (radicación/respuesta/cierre) se siembran con un texto institucional que menciona
a ACBUM por nombre. Entra a PQRS → Parametrización con el usuario admin y reescríbelos para el
cliente nuevo — es un formulario, no hace falta tocar código ni la base de datos.

**Vacío, lo carga el cliente o tú por él:**
- Barrios y Estratos (Suscriptores → esas pestañas).
- Tarifas por vigencia (Facturación → Tarifas) — sin esto no se puede facturar.
- Suscriptores/medidores/histórico de lecturas, si el cliente viene de otro sistema — hay un
  importador genérico por Excel en varias pantallas (ImportExcelModal), o se puede escribir un
  script puntual como se hizo para la carga inicial de ACBUM si el formato de origen es raro.
- Plantilla de factura (Facturación → Plantillas) — cada imprenta tiene su propio diseño
  pre-impreso, hay que ubicar los marcadores a mano con el editor visual.

## 9. Checklist final

- [ ] Los 3 dominios cargan (operativo/pqrs/calidad) y el logo/nombre correctos aparecen en los
      tres.
- [ ] El wizard quedó marcado como terminado (si vuelves a entrar no debería reaparecer).
- [ ] Un correo de prueba (radicar una PQR de prueba) llega y trae el nombre del cliente, no
      "ACBUM" — bórrala después de probar.
- [ ] Los encabezados de PQRS (Parametrización) ya no mencionan a ACBUM.
- [ ] Cambiar la contraseña del usuario `admin` desde Usuarios.
- [ ] Backups: revisar que `docker-compose.prod.yml` esté respaldando `db_data` y `minio_data`
      con la misma disciplina que ACBUM (fuera del alcance de esta guía, pero no lo dejes para
      después).
