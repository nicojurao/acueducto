-- CreateTable
CREATE TABLE "PqrMensaje" (
    "id" SERIAL NOT NULL,
    "pqrId" INTEGER NOT NULL,
    "autor" TEXT NOT NULL,
    "autorNombre" TEXT,
    "texto" TEXT NOT NULL,
    "archivos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "esRespuestaFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrMensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PqrMensaje_pqrId_idx" ON "PqrMensaje"("pqrId");

-- AddForeignKey
ALTER TABLE "PqrMensaje" ADD CONSTRAINT "PqrMensaje_pqrId_fkey" FOREIGN KEY ("pqrId") REFERENCES "Pqr"("id") ON DELETE CASCADE ON UPDATE CASCADE;
