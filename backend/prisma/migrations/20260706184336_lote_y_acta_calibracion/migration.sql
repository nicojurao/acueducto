-- CreateTable
CREATE TABLE "Lote" (
    "id" SERIAL NOT NULL,
    "serialInicial" TEXT NOT NULL,
    "serialFinal" TEXT NOT NULL,
    "fechaCompra" TIMESTAMP(3),
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lote_serialInicial_serialFinal_key" ON "Lote"("serialInicial", "serialFinal");

-- AlterTable: agrega columnas nuevas sin tocar "lote" todavía (se necesita para el backfill)
ALTER TABLE "Medidor" ADD COLUMN     "actaCalibracionUrl" TEXT,
ADD COLUMN     "loteId" INTEGER;

-- Backfill: cada valor distinto de "lote" (texto libre, ej. "23003101-23003120") se convierte
-- en una fila de Lote (split en serialInicial/serialFinal por el primer "-"; si no tiene "-",
-- serialInicial = serialFinal = el valor completo), y se enlaza cada Medidor a su Lote.
INSERT INTO "Lote" ("serialInicial", "serialFinal", "createdAt")
SELECT DISTINCT
  split_part(lote, '-', 1) AS "serialInicial",
  CASE WHEN lote LIKE '%-%' THEN split_part(lote, '-', 2) ELSE lote END AS "serialFinal",
  CURRENT_TIMESTAMP
FROM "Medidor"
WHERE lote IS NOT NULL AND lote <> '';

UPDATE "Medidor" m
SET "loteId" = l.id
FROM "Lote" l
WHERE m.lote IS NOT NULL AND m.lote <> ''
  AND l."serialInicial" = split_part(m.lote, '-', 1)
  AND l."serialFinal" = CASE WHEN m.lote LIKE '%-%' THEN split_part(m.lote, '-', 2) ELSE m.lote END;

-- Ya con los datos migrados, se puede dropear la columna de texto libre.
ALTER TABLE "Medidor" DROP COLUMN "lote";

-- AddForeignKey
ALTER TABLE "Medidor" ADD CONSTRAINT "Medidor_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
