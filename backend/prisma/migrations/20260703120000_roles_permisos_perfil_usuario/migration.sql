-- CreateTable
CREATE TABLE "Rol" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "esSistema" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permiso" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "Permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolPermiso" (
    "rolId" INTEGER NOT NULL,
    "permisoId" INTEGER NOT NULL,

    CONSTRAINT "RolPermiso_pkey" PRIMARY KEY ("rolId","permisoId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rol_nombre_key" ON "Rol"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Permiso_clave_key" ON "Permiso"("clave");

-- AddForeignKey
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_permisoId_fkey" FOREIGN KEY ("permisoId") REFERENCES "Permiso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: catálogo fijo de permisos (debe coincidir con backend/src/lib/permisos.ts)
INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('suscriptores_ver', 'Suscriptores', 'Ver el listado y la ficha de suscriptores'),
    ('suscriptores_avanzado', 'Suscriptores (avanzado)', 'Editar, importar, exportar y eliminar suscriptores'),
    ('medidores', 'Medidores', 'Inventario y catálogo de medidores'),
    ('lecturas', 'Lecturas', 'Captura y edición de lecturas mensuales'),
    ('actas', 'Actas de instalación', 'Crear, editar y generar PDF de actas'),
    ('catalogos', 'Catálogos', 'Marcas, modelos y diámetros de medidores'),
    ('dashboard', 'Dashboard', 'KPIs, gráficas y consumos atípicos'),
    ('reportes', 'Reportes', 'Reportes de consumo y facturación'),
    ('mapa', 'Mapa', 'Ubicación de predios en el mapa'),
    ('usuarios', 'Usuarios', 'Crear, editar y eliminar usuarios'),
    ('roles', 'Roles y permisos', 'Crear roles y asignarles permisos');

-- Seed: roles de sistema (no editables/eliminables desde la UI), replicando el
-- comportamiento que hoy está fijo en el código para "admin" y "fontanero".
INSERT INTO "Rol" ("nombre", "descripcion", "esSistema") VALUES
    ('admin', 'Acceso completo al sistema', true),
    ('fontanero', 'Captura de lecturas y consulta de suscriptores', true);

-- admin: todos los permisos
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id FROM "Rol" r CROSS JOIN "Permiso" p WHERE r.nombre = 'admin';

-- fontanero: mismo alcance que tiene hoy en el código (suscriptores básico + lecturas)
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id FROM "Rol" r, "Permiso" p
WHERE r.nombre = 'fontanero' AND p.clave IN ('suscriptores_ver', 'lecturas');

-- AlterTable: nuevos campos de perfil + relación a Rol
ALTER TABLE "Usuario" ADD COLUMN "rolId" INTEGER;
ALTER TABLE "Usuario" ADD COLUMN "cedula" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "celular" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "fechaNacimiento" TIMESTAMP(3);
ALTER TABLE "Usuario" ADD COLUMN "foto" TEXT;

-- Backfill: cada usuario existente apunta al Rol cuyo nombre coincide con su antiguo campo "rol"
UPDATE "Usuario" u SET "rolId" = (SELECT id FROM "Rol" WHERE nombre = u."rol");

ALTER TABLE "Usuario" ALTER COLUMN "rolId" SET NOT NULL;
ALTER TABLE "Usuario" DROP COLUMN "rol";

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_cedula_key" ON "Usuario"("cedula");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
