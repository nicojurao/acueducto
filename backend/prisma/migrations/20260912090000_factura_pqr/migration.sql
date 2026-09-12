-- AlterTable
ALTER TABLE "Factura" ADD COLUMN "pqrId" INTEGER;

-- CreateIndex
CREATE INDEX "Factura_pqrId_idx" ON "Factura"("pqrId");

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_pqrId_fkey" FOREIGN KEY ("pqrId") REFERENCES "Pqr"("id") ON DELETE SET NULL ON UPDATE CASCADE;
