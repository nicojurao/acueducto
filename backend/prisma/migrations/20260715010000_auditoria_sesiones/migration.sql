-- CreateTable
CREATE TABLE "InicioSesion" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "dispositivo" TEXT,
    "ciudad" TEXT,
    "region" TEXT,
    "pais" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InicioSesion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InicioSesion_usuarioId_fecha_idx" ON "InicioSesion"("usuarioId", "fecha");

-- AddForeignKey
ALTER TABLE "InicioSesion" ADD CONSTRAINT "InicioSesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: nuevo permiso de auditoría de sesiones, otorgado a admin por defecto (mismo criterio
-- que módulos previos).
INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('auditoria', 'Auditoría de sesiones', 'Ver los inicios de sesión (IP, ubicación, dispositivo) y los cambios hechos en cada una');

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id FROM "Rol" r, "Permiso" p WHERE r.nombre = 'admin' AND p.clave = 'auditoria';
