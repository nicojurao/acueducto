-- Foto mensual de los KPIs del dashboard que dependen del estado ACTUAL del suscriptor
-- (cobertura con medidor, facturados por medición), para que el dashboard de un periodo ya
-- cerrado no cambie según el estado de hoy. Se toma el día 19 de cada mes, justo antes de que
-- arranque la captura del periodo siguiente.

CREATE TABLE "SnapshotPeriodo" (
    "id" SERIAL NOT NULL,
    "periodo" TEXT NOT NULL,
    "suscriptoresActivos" INTEGER NOT NULL,
    "medidoresActivos" INTEGER NOT NULL,
    "sinMedidor" INTEGER NOT NULL,
    "instaladoPrueba" INTEGER NOT NULL,
    "facturando" INTEGER NOT NULL,
    "inactivo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnapshotPeriodo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SnapshotPeriodo_periodo_key" ON "SnapshotPeriodo"("periodo");
