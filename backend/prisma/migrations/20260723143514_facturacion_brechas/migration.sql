-- Preservación de datos: alcantarillado simple -> componentes (antes del DROP)
ALTER TABLE "Tarifa" ADD COLUMN "alcCma" DECIMAL(12,2);
ALTER TABLE "Tarifa" ADD COLUMN "alcCmo" DECIMAL(12,2);
ALTER TABLE "Tarifa" ADD COLUMN "alcCmi" DECIMAL(12,2);
ALTER TABLE "Tarifa" ADD COLUMN "alcCmt" DECIMAL(12,2);
UPDATE "Tarifa" SET "alcCma" = "alcantarilladoCargoFijo",
                    "alcCmo" = "alcantarilladoM3",
                    "alcCmi" = CASE WHEN "alcantarilladoM3" IS NOT NULL THEN 0 END,
                    "alcCmt" = CASE WHEN "alcantarilladoM3" IS NOT NULL THEN 0 END;
ALTER TABLE "Tarifa" DROP COLUMN "alcantarilladoCargoFijo";
ALTER TABLE "Tarifa" DROP COLUMN "alcantarilladoM3";

-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "porcentajeAplicado" DECIMAL(6,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Suscriptor" ADD COLUMN     "tieneAcueducto" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tieneAlcantarillado" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "uso" TEXT NOT NULL DEFAULT 'residencial';


-- CreateTable
CREATE TABLE "FacturacionOmitida" (
    "id" SERIAL NOT NULL,
    "periodo" TIMESTAMP(3) NOT NULL,
    "suscriptorId" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacturacionOmitida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FacturacionOmitida_periodo_idx" ON "FacturacionOmitida"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "FacturacionOmitida_suscriptorId_periodo_key" ON "FacturacionOmitida"("suscriptorId", "periodo");

-- AddForeignKey
ALTER TABLE "FacturacionOmitida" ADD CONSTRAINT "FacturacionOmitida_suscriptorId_fkey" FOREIGN KEY ("suscriptorId") REFERENCES "Suscriptor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill de "uso" desde el estrato actual (Comercial/Oficial; el resto queda residencial)
UPDATE "Suscriptor" s SET "uso" = 'comercial'
FROM "Estrato" e WHERE s."estratoId" = e.id AND e.etiqueta ILIKE '%comercial%';
UPDATE "Suscriptor" s SET "uso" = 'oficial'
FROM "Estrato" e WHERE s."estratoId" = e.id AND e.etiqueta ILIKE '%oficial%';
