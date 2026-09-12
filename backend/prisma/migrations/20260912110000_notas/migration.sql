-- CreateSequence: mismo patrón que factura_numero_seq / comprobante_numero_seq.
CREATE SEQUENCE IF NOT EXISTS nota_numero_seq;

-- CreateTable
CREATE TABLE "Nota" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "numero" INTEGER NOT NULL DEFAULT nextval('nota_numero_seq')::integer,
    "suscriptorId" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "concepto" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "facturaAplicadaId" INTEGER,
    "aplicadaEn" TIMESTAMP(3),
    "pqrId" INTEGER,
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Nota_numero_key" ON "Nota"("numero");

-- CreateIndex
CREATE INDEX "Nota_suscriptorId_idx" ON "Nota"("suscriptorId");

-- CreateIndex
CREATE INDEX "Nota_estado_idx" ON "Nota"("estado");

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_suscriptorId_fkey" FOREIGN KEY ("suscriptorId") REFERENCES "Suscriptor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_facturaAplicadaId_fkey" FOREIGN KEY ("facturaAplicadaId") REFERENCES "Factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_pqrId_fkey" FOREIGN KEY ("pqrId") REFERENCES "Pqr"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
