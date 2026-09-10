-- CreateIndex: la pantalla de Auditoría filtra/ordena HistorialCambio por fecha y por usuario,
-- y esa tabla crece rápido (un renglón por CADA campo cambiado en cada edición) — sin estos
-- índices, esos filtros terminan en secuencial scan a medida que crece.
CREATE INDEX "HistorialCambio_fecha_idx" ON "HistorialCambio"("fecha");

-- CreateIndex
CREATE INDEX "HistorialCambio_usuarioId_fecha_idx" ON "HistorialCambio"("usuarioId", "fecha");
