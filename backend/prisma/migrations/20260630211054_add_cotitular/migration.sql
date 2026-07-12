-- CreateTable
CREATE TABLE "Cotitular" (
    "id" SERIAL NOT NULL,
    "medidorId" INTEGER NOT NULL,
    "suscriptorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cotitular_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cotitular_suscriptorId_key" ON "Cotitular"("suscriptorId");

-- AddForeignKey
ALTER TABLE "Cotitular" ADD CONSTRAINT "Cotitular_medidorId_fkey" FOREIGN KEY ("medidorId") REFERENCES "Medidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotitular" ADD CONSTRAINT "Cotitular_suscriptorId_fkey" FOREIGN KEY ("suscriptorId") REFERENCES "Suscriptor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
