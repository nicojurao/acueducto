-- Índices en columnas muy filtradas/ordenadas que solo tenían PK o unique constraints
-- indirectos. Con el volumen actual (miles de filas) el impacto es marginal, pero evita que
-- las consultas se degraden a medida que crecen lecturas/aforos/préstamos mes a mes.

-- CreateIndex
CREATE INDEX "ActaInstalacion_suscriptorId_idx" ON "ActaInstalacion"("suscriptorId");

-- CreateIndex
CREATE INDEX "ActaInstalacion_medidorId_idx" ON "ActaInstalacion"("medidorId");

-- CreateIndex
CREATE INDEX "Aforo_puntoAforoId_idx" ON "Aforo"("puntoAforoId");

-- CreateIndex
CREATE INDEX "Aforo_fecha_idx" ON "Aforo"("fecha");

-- CreateIndex
CREATE INDEX "Lectura_periodo_idx" ON "Lectura"("periodo");

-- CreateIndex
CREATE INDEX "Medidor_suscriptorId_idx" ON "Medidor"("suscriptorId");

-- CreateIndex
CREATE INDEX "Medidor_estado_idx" ON "Medidor"("estado");

-- CreateIndex
CREATE INDEX "MovimientoInventario_itemId_idx" ON "MovimientoInventario"("itemId");

-- CreateIndex
CREATE INDEX "PrestamoInventario_itemId_fechaDevolucion_idx" ON "PrestamoInventario"("itemId", "fechaDevolucion");

-- CreateIndex
CREATE INDEX "Suscriptor_barrioId_idx" ON "Suscriptor"("barrioId");

-- CreateIndex
CREATE INDEX "Suscriptor_estratoId_idx" ON "Suscriptor"("estratoId");
