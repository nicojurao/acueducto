-- CreateTable
CREATE TABLE "HistorialCambio" (
    "id" SERIAL NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" INTEGER NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorNuevo" TEXT,
    "usuarioId" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistorialCambio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HistorialCambio_entidad_entidadId_idx" ON "HistorialCambio"("entidad", "entidadId");

-- AddForeignKey
ALTER TABLE "HistorialCambio" ADD CONSTRAINT "HistorialCambio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: nuevo permiso para ver el historial de cambios, otorgado a admin (mismo criterio que
-- módulos previos: admin recibe todos los permisos nuevos por defecto).
INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('historial', 'Historial de cambios', 'Ver el historial de cambios de medidores y suscriptores');

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id FROM "Rol" r, "Permiso" p WHERE r.nombre = 'admin' AND p.clave = 'historial';
