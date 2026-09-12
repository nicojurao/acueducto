-- CreateTable
CREATE TABLE "CuentaPuc" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "naturaleza" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "padreId" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CuentaPuc_pkey" PRIMARY KEY ("id")
);

-- CreateSequence: mismo patrón que factura_numero_seq (ver 20260801110207_factura_numero_secuencia)
-- — numeración atómica de Postgres en vez de MAX(numero)+1 calculado en memoria. Tabla nueva, sin
-- datos previos que reconciliar, así que arranca en 1 sin necesidad de setval().
CREATE SEQUENCE IF NOT EXISTS comprobante_numero_seq;

-- CreateTable
CREATE TABLE "ComprobanteContable" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "numero" INTEGER NOT NULL DEFAULT nextval('comprobante_numero_seq')::integer,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concepto" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "origenTabla" TEXT,
    "origenId" INTEGER,
    "estado" TEXT NOT NULL DEFAULT 'contabilizado',
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComprobanteContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoContable" (
    "id" SERIAL NOT NULL,
    "comprobanteId" INTEGER NOT NULL,
    "cuentaPucId" INTEGER NOT NULL,
    "terceroId" INTEGER,
    "debito" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credito" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "descripcion" TEXT,

    CONSTRAINT "MovimientoContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" SERIAL NOT NULL,
    "terceroId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concepto" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "ivaValor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "numeroFactura" TEXT,
    "registradoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPuc_codigo_key" ON "CuentaPuc"("codigo");

-- CreateIndex
CREATE INDEX "CuentaPuc_padreId_idx" ON "CuentaPuc"("padreId");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteContable_numero_key" ON "ComprobanteContable"("numero");

-- CreateIndex
CREATE INDEX "ComprobanteContable_origenTabla_origenId_idx" ON "ComprobanteContable"("origenTabla", "origenId");

-- CreateIndex
CREATE INDEX "ComprobanteContable_fecha_idx" ON "ComprobanteContable"("fecha");

-- CreateIndex
CREATE INDEX "MovimientoContable_comprobanteId_idx" ON "MovimientoContable"("comprobanteId");

-- CreateIndex
CREATE INDEX "MovimientoContable_cuentaPucId_idx" ON "MovimientoContable"("cuentaPucId");

-- CreateIndex
CREATE INDEX "Gasto_terceroId_idx" ON "Gasto"("terceroId");

-- CreateIndex
CREATE INDEX "Gasto_fecha_idx" ON "Gasto"("fecha");

-- AddForeignKey
ALTER TABLE "CuentaPuc" ADD CONSTRAINT "CuentaPuc_padreId_fkey" FOREIGN KEY ("padreId") REFERENCES "CuentaPuc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteContable" ADD CONSTRAINT "ComprobanteContable_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoContable" ADD CONSTRAINT "MovimientoContable_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "ComprobanteContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoContable" ADD CONSTRAINT "MovimientoContable_cuentaPucId_fkey" FOREIGN KEY ("cuentaPucId") REFERENCES "CuentaPuc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoContable" ADD CONSTRAINT "MovimientoContable_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catálogo de permisos: contabilidad_ver (consultar PUC/comprobantes/libros/estados) y
-- contabilidad_avanzado (editar PUC, registrar gastos, anular comprobantes, emitir DIAN) — mismo
-- patrón ver/avanzado que el resto de módulos (ver backend/src/lib/permisos.ts).
INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('contabilidad_ver', 'Contabilidad', 'Ver el PUC, comprobantes, libros y estados financieros'),
    ('contabilidad_avanzado', 'Contabilidad (avanzado)', 'Editar el PUC, registrar gastos, anular comprobantes y emitir facturación electrónica DIAN');

-- Solo el rol admin (esSistema) recibe los permisos nuevos por defecto.
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id
FROM "Rol" r
CROSS JOIN "Permiso" p
WHERE p.clave IN ('contabilidad_ver', 'contabilidad_avanzado') AND r."esSistema" = true
ON CONFLICT DO NOTHING;
