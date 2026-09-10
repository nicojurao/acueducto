-- CreateTable
CREATE TABLE "DocumentoSgc" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "proceso" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'vigente',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoSgc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionDocumentoSgc" (
    "id" SERIAL NOT NULL,
    "documentoId" INTEGER NOT NULL,
    "numeroVersion" INTEGER NOT NULL,
    "archivoUrl" TEXT NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "fechaVigencia" TIMESTAMP(3) NOT NULL,
    "descripcionCambio" TEXT,
    "elaboroPor" TEXT,
    "revisoPor" TEXT,
    "aproboPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionDocumentoSgc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoSgc_codigo_key" ON "DocumentoSgc"("codigo");

-- CreateIndex
CREATE INDEX "DocumentoSgc_proceso_idx" ON "DocumentoSgc"("proceso");

-- CreateIndex
CREATE INDEX "DocumentoSgc_estado_idx" ON "DocumentoSgc"("estado");

-- CreateIndex
CREATE INDEX "VersionDocumentoSgc_documentoId_vigente_idx" ON "VersionDocumentoSgc"("documentoId", "vigente");

-- CreateIndex
CREATE UNIQUE INDEX "VersionDocumentoSgc_documentoId_numeroVersion_key" ON "VersionDocumentoSgc"("documentoId", "numeroVersion");

-- AddForeignKey
ALTER TABLE "VersionDocumentoSgc" ADD CONSTRAINT "VersionDocumentoSgc_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoSgc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Insertar los 2 permisos nuevos del catálogo (ver backend/src/lib/permisos.ts) para que ya
-- existan en la tabla Permiso y se puedan asignar a roles desde la pantalla de Roles.
INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
  ('documentos_sgc_ver', 'Documentos SGC', 'Ver el catálogo de documentos del SGC y el historial de versiones de cada uno'),
  ('documentos_sgc_avanzado', 'Documentos SGC (avanzado)', 'Crear documentos, subir nuevas versiones y cambiar su estado (vigente/obsoleto/en revisión)')
ON CONFLICT ("clave") DO NOTHING;
