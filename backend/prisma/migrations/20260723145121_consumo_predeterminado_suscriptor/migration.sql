-- Preservar dato: usar el valor de la tarifa mas reciente (si existe) como consumo
-- predeterminado inicial de TODOS los suscriptores, antes de dropear la columna de Tarifa.
ALTER TABLE "Suscriptor" ADD COLUMN "consumoPredeterminadoM3" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "Suscriptor" SET "consumoPredeterminadoM3" = COALESCE(
  (SELECT "consumoSinMedidorM3" FROM "Tarifa" ORDER BY "vigenciaDesde" DESC LIMIT 1),
  0
);

ALTER TABLE "Tarifa" DROP COLUMN "consumoSinMedidorM3";
