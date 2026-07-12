-- CreateTable
CREATE TABLE "NovedadLectura" (
    "id" SERIAL NOT NULL,
    "medidorId" INTEGER NOT NULL,
    "periodo" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NovedadLectura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NovedadLectura_medidorId_periodo_key" ON "NovedadLectura"("medidorId", "periodo");

-- AddForeignKey
ALTER TABLE "NovedadLectura" ADD CONSTRAINT "NovedadLectura_medidorId_fkey" FOREIGN KEY ("medidorId") REFERENCES "Medidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
