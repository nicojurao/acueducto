-- CreateTable
CREATE TABLE "VerificacionPeriodo" (
    "id" SERIAL NOT NULL,
    "periodo" TIMESTAMP(3) NOT NULL,
    "paso" TEXT NOT NULL,
    "usuarioId" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificacionPeriodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerificacionPeriodo_periodo_paso_key" ON "VerificacionPeriodo"("periodo", "paso");

-- AddForeignKey
ALTER TABLE "VerificacionPeriodo" ADD CONSTRAINT "VerificacionPeriodo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
