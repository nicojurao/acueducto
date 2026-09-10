-- CreateTable
CREATE TABLE "Pqr" (
    "id" SERIAL NOT NULL,
    "numeroRadicado" TEXT NOT NULL,
    "terceroId" INTEGER,
    "suscriptorId" INTEGER,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "email" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estado" TEXT NOT NULL DEFAULT 'radicada',
    "respuesta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pqr_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pqr_numeroRadicado_key" ON "Pqr"("numeroRadicado");

-- CreateIndex
CREATE INDEX "Pqr_terceroId_idx" ON "Pqr"("terceroId");

-- CreateIndex
CREATE INDEX "Pqr_suscriptorId_idx" ON "Pqr"("suscriptorId");

-- CreateIndex
CREATE INDEX "Pqr_estado_idx" ON "Pqr"("estado");

-- AddForeignKey
ALTER TABLE "Pqr" ADD CONSTRAINT "Pqr_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pqr" ADD CONSTRAINT "Pqr_suscriptorId_fkey" FOREIGN KEY ("suscriptorId") REFERENCES "Suscriptor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
