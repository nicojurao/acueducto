-- CreateTable
CREATE TABLE "Tarifa" (
    "id" SERIAL NOT NULL,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "cma" DECIMAL(12,2) NOT NULL,
    "cmo" DECIMAL(12,2) NOT NULL,
    "cmi" DECIMAL(12,2) NOT NULL,
    "cmt" DECIMAL(12,2) NOT NULL,
    "rangoBasicoHastaM3" INTEGER NOT NULL DEFAULT 16,
    "rangoComplementarioHastaM3" INTEGER NOT NULL DEFAULT 32,
    "consumoSinMedidorM3" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "alcantarilladoCargoFijo" DECIMAL(12,2),
    "alcantarilladoM3" DECIMAL(12,2),
    "aseoCargoFijo" DECIMAL(12,2),
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tarifa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarifaEstrato" (
    "id" SERIAL NOT NULL,
    "tarifaId" INTEGER NOT NULL,
    "estratoId" INTEGER NOT NULL,
    "porcentaje" DECIMAL(6,2) NOT NULL DEFAULT 0,

    CONSTRAINT "TarifaEstrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "suscriptorId" INTEGER NOT NULL,
    "periodo" TIMESTAMP(3) NOT NULL,
    "tarifaId" INTEGER NOT NULL,
    "consumoM3" DECIMAL(12,2) NOT NULL,
    "estratoCodigo" TEXT,
    "estadoFacturacion" TEXT NOT NULL,
    "sinMedidor" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "ajusteEstrato" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMP(3),
    "observaciones" TEXT,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaConcepto" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2),
    "valorUnitario" DECIMAL(12,2),
    "valor" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "FacturaConcepto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "medio" TEXT NOT NULL DEFAULT 'efectivo',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,
    "registradoPorId" INTEGER,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tarifa_vigenciaDesde_key" ON "Tarifa"("vigenciaDesde");

-- CreateIndex
CREATE UNIQUE INDEX "TarifaEstrato_tarifaId_estratoId_key" ON "TarifaEstrato"("tarifaId", "estratoId");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_numero_key" ON "Factura"("numero");

-- CreateIndex
CREATE INDEX "Factura_periodo_idx" ON "Factura"("periodo");

-- CreateIndex
CREATE INDEX "Factura_estado_idx" ON "Factura"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_suscriptorId_periodo_key" ON "Factura"("suscriptorId", "periodo");

-- CreateIndex
CREATE INDEX "Pago_facturaId_idx" ON "Pago"("facturaId");

-- CreateIndex
CREATE INDEX "Pago_fecha_idx" ON "Pago"("fecha");

-- AddForeignKey
ALTER TABLE "TarifaEstrato" ADD CONSTRAINT "TarifaEstrato_tarifaId_fkey" FOREIGN KEY ("tarifaId") REFERENCES "Tarifa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaEstrato" ADD CONSTRAINT "TarifaEstrato_estratoId_fkey" FOREIGN KEY ("estratoId") REFERENCES "Estrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_suscriptorId_fkey" FOREIGN KEY ("suscriptorId") REFERENCES "Suscriptor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_tarifaId_fkey" FOREIGN KEY ("tarifaId") REFERENCES "Tarifa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaConcepto" ADD CONSTRAINT "FacturaConcepto_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Permisos del módulo de Facturación y Cartera. Se asignan de entrada al rol admin;
-- los demás roles se ajustan desde la pantalla de Roles.
INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('facturacion_ver', 'Facturación', 'Ver facturas, tarifas y cartera'),
    ('facturacion_avanzado', 'Facturación (avanzado)', 'Generar facturación, editar tarifas, anular facturas y agregar conceptos'),
    ('pagos_registrar', 'Pagos (registrar)', 'Registrar pagos y abonos de facturas en oficina')
ON CONFLICT DO NOTHING;
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id FROM "Rol" r CROSS JOIN "Permiso" p
WHERE p.clave IN ('facturacion_ver', 'facturacion_avanzado', 'pagos_registrar')
  AND r.nombre = 'admin'
ON CONFLICT DO NOTHING;
