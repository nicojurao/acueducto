-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "consumoAlcantarilladoM3" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Suscriptor" ADD COLUMN     "consumoPredeterminadoAlcantarilladoM3" DECIMAL(12,2) NOT NULL DEFAULT 0;

