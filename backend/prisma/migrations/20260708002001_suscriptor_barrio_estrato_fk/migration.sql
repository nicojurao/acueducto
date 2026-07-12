-- 1. Agregar columnas nuevas (nullable) sin tocar las de texto todavia
ALTER TABLE "Suscriptor" ADD COLUMN     "barrioId" INTEGER,
ADD COLUMN     "estratoId" INTEGER;

-- 2. Backfill: matchear el texto libre existente contra el catalogo por nombre/codigo
UPDATE "Suscriptor" s
SET "barrioId" = b.id
FROM "Barrio" b
WHERE s.barrio IS NOT NULL AND b.nombre = s.barrio;

UPDATE "Suscriptor" s
SET "estratoId" = e.id
FROM "Estrato" e
WHERE s.estrato IS NOT NULL AND e.codigo = s.estrato;

-- 3. Ahora si, quitar las columnas de texto
ALTER TABLE "Suscriptor" DROP COLUMN "barrio",
DROP COLUMN "estrato";

-- 4. Foreign keys
ALTER TABLE "Suscriptor" ADD CONSTRAINT "Suscriptor_barrioId_fkey" FOREIGN KEY ("barrioId") REFERENCES "Barrio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Suscriptor" ADD CONSTRAINT "Suscriptor_estratoId_fkey" FOREIGN KEY ("estratoId") REFERENCES "Estrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
