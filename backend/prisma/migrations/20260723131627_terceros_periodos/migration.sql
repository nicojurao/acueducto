-- AlterTable
ALTER TABLE "Suscriptor" ADD COLUMN     "terceroId" INTEGER;

-- CreateTable
CREATE TABLE "Tercero" (
    "id" SERIAL NOT NULL,
    "tipoDocumento" TEXT NOT NULL DEFAULT 'CC',
    "numeroDocumento" TEXT,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tercero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodoFacturacion" (
    "id" SERIAL NOT NULL,
    "periodo" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierto',
    "fechaGeneracion" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "cerradoPorId" INTEGER,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodoFacturacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tercero_numeroDocumento_key" ON "Tercero"("numeroDocumento");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodoFacturacion_periodo_key" ON "PeriodoFacturacion"("periodo");

-- AddForeignKey
ALTER TABLE "Suscriptor" ADD CONSTRAINT "Suscriptor_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodoFacturacion" ADD CONSTRAINT "PeriodoFacturacion_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===== Backfill de Terceros a partir de los suscriptores existentes =====
-- 1) Un tercero por cada identificación distinta (los suscriptores repetidos de una misma
--    persona quedan agrupados bajo el mismo tercero).
INSERT INTO "Tercero" ("tipoDocumento", "numeroDocumento", "nombre", "updatedAt")
SELECT 'CC', btrim(s."identificacion"), MIN(s."nombre"), NOW()
FROM "Suscriptor" s
WHERE s."identificacion" IS NOT NULL AND btrim(s."identificacion") <> ''
GROUP BY btrim(s."identificacion");

UPDATE "Suscriptor" s
SET "terceroId" = t.id
FROM "Tercero" t
WHERE s."identificacion" IS NOT NULL
  AND btrim(s."identificacion") <> ''
  AND t."numeroDocumento" = btrim(s."identificacion");

-- 2) Suscriptores SIN identificación: un tercero individual con documento marcador
--    "PEND-<suscriptorId>" (pendiente de completar los datos reales).
INSERT INTO "Tercero" ("tipoDocumento", "numeroDocumento", "nombre", "updatedAt")
SELECT 'CC', 'PEND-' || s.id, s."nombre", NOW()
FROM "Suscriptor" s
WHERE s."terceroId" IS NULL;

UPDATE "Suscriptor" s
SET "terceroId" = t.id
FROM "Tercero" t
WHERE s."terceroId" IS NULL
  AND t."numeroDocumento" = 'PEND-' || s.id;
