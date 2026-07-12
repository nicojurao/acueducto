-- Método flotador: se toman varias corridas de tiempo (se promedian) y, por sección
-- (alta/baja), un ancho fijo + 5 medidas de profundidad (se promedian). areaAltaM2/areaBajaM2
-- pasan de ser ingresadas directo a ser calculadas (ancho x profundidad promedio).
ALTER TABLE "Aforo" ADD COLUMN "tiempos" DOUBLE PRECISION[] NOT NULL DEFAULT '{}';
ALTER TABLE "Aforo" ADD COLUMN "anchoAltaM" DECIMAL(10,3);
ALTER TABLE "Aforo" ADD COLUMN "profundidadesAltaM" DOUBLE PRECISION[] NOT NULL DEFAULT '{}';
ALTER TABLE "Aforo" ADD COLUMN "anchoBajaM" DECIMAL(10,3);
ALTER TABLE "Aforo" ADD COLUMN "profundidadesBajaM" DOUBLE PRECISION[] NOT NULL DEFAULT '{}';
