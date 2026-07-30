-- AlterTable
ALTER TABLE "Suscriptor" ADD COLUMN     "condicionPropiedadPredioIgac" TEXT DEFAULT '000',
ADD COLUMN     "manzanaVeredaIgac" TEXT,
ADD COLUMN     "numeroCuentaContrato" TEXT,
ADD COLUMN     "numeroPredioIgac" TEXT,
ADD COLUMN     "sectorIgac" TEXT,
ADD COLUMN     "zonaIgac" TEXT;

-- AlterTable
ALTER TABLE "Tarifa" ADD COLUMN     "tasaMoraMensual" DECIMAL(6,3) NOT NULL DEFAULT 0;

