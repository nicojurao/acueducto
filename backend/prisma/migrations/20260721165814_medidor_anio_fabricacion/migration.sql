-- fechaFabricacion (DateTime completa) pasa a ser anioFabricacion (solo el año, Int): a nadie
-- le importa el día/mes en que se fabricó un medidor, solo el año. Se preserva el dato existente
-- extrayendo el año antes de borrar la columna vieja.

ALTER TABLE "Medidor" ADD COLUMN "anioFabricacion" INTEGER;

UPDATE "Medidor" SET "anioFabricacion" = EXTRACT(YEAR FROM "fechaFabricacion")::int
WHERE "fechaFabricacion" IS NOT NULL;

ALTER TABLE "Medidor" DROP COLUMN "fechaFabricacion";
