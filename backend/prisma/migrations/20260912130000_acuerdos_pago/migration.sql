-- CreateTable
CREATE TABLE "AcuerdoPago" (
    "id" SERIAL NOT NULL,
    "suscriptorId" INTEGER NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "valorTotal" DECIMAL(12,2) NOT NULL,
    "numeroCuotas" INTEGER NOT NULL,
    "concepto" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "pqrId" INTEGER,
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcuerdoPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuotaAcuerdoPago" (
    "id" SERIAL NOT NULL,
    "acuerdoPagoId" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "facturaAplicadaId" INTEGER,
    "aplicadaEn" TIMESTAMP(3),

    CONSTRAINT "CuotaAcuerdoPago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcuerdoPago_suscriptorId_idx" ON "AcuerdoPago"("suscriptorId");

-- CreateIndex
CREATE INDEX "AcuerdoPago_estado_idx" ON "AcuerdoPago"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "CuotaAcuerdoPago_acuerdoPagoId_numero_key" ON "CuotaAcuerdoPago"("acuerdoPagoId", "numero");

-- CreateIndex
CREATE INDEX "CuotaAcuerdoPago_acuerdoPagoId_estado_idx" ON "CuotaAcuerdoPago"("acuerdoPagoId", "estado");

-- AddForeignKey
ALTER TABLE "AcuerdoPago" ADD CONSTRAINT "AcuerdoPago_suscriptorId_fkey" FOREIGN KEY ("suscriptorId") REFERENCES "Suscriptor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcuerdoPago" ADD CONSTRAINT "AcuerdoPago_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcuerdoPago" ADD CONSTRAINT "AcuerdoPago_pqrId_fkey" FOREIGN KEY ("pqrId") REFERENCES "Pqr"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcuerdoPago" ADD CONSTRAINT "AcuerdoPago_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuotaAcuerdoPago" ADD CONSTRAINT "CuotaAcuerdoPago_acuerdoPagoId_fkey" FOREIGN KEY ("acuerdoPagoId") REFERENCES "AcuerdoPago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuotaAcuerdoPago" ADD CONSTRAINT "CuotaAcuerdoPago_facturaAplicadaId_fkey" FOREIGN KEY ("facturaAplicadaId") REFERENCES "Factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;
