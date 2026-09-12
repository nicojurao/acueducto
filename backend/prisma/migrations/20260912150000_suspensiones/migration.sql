-- AlterTable
ALTER TABLE "Suscriptor" ADD COLUMN "suspendido" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Suspension" (
    "id" SERIAL NOT NULL,
    "suscriptorId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "mesesMoraAlCrear" INTEGER,
    "textoAviso" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "fechaAprobacion" TIMESTAMP(3),
    "aprobadaPorId" INTEGER,
    "fechaEjecucion" TIMESTAMP(3),
    "fechaReactivacion" TIMESTAMP(3),
    "pqrId" INTEGER,
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suspension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Suspension_suscriptorId_idx" ON "Suspension"("suscriptorId");

-- CreateIndex
CREATE INDEX "Suspension_estado_idx" ON "Suspension"("estado");

-- AddForeignKey
ALTER TABLE "Suspension" ADD CONSTRAINT "Suspension_suscriptorId_fkey" FOREIGN KEY ("suscriptorId") REFERENCES "Suscriptor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suspension" ADD CONSTRAINT "Suspension_aprobadaPorId_fkey" FOREIGN KEY ("aprobadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suspension" ADD CONSTRAINT "Suspension_pqrId_fkey" FOREIGN KEY ("pqrId") REFERENCES "Pqr"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suspension" ADD CONSTRAINT "Suspension_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catálogo de permisos: mismo patrón ver/avanzado que el resto de módulos.
INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('suspensiones_ver', 'Suspensión del servicio', 'Ver los avisos y suspensiones del servicio por mora o mutuo acuerdo'),
    ('suspensiones_avanzado', 'Suspensión del servicio (avanzado)', 'Crear avisos, aprobar/ejecutar/reactivar suspensiones del servicio');

-- Solo el rol admin (esSistema) recibe los permisos nuevos por defecto.
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id
FROM "Rol" r
CROSS JOIN "Permiso" p
WHERE p.clave IN ('suspensiones_ver', 'suspensiones_avanzado') AND r."esSistema" = true
ON CONFLICT DO NOTHING;
