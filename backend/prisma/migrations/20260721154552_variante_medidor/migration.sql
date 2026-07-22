-- Catálogo de sub-variantes del tipo de medición: para "velocidad" son CU (Chorro Único) / CM
-- (Chorro Múltiple); para "volumetrico" son PR (Pistón Rotativo) / DN (Disco Nutante). Se
-- semillan las 4 estándar del mercado; el catálogo queda editable desde Medidores → Catálogo.

-- CreateTable
CREATE TABLE "VarianteMedidor" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,

    CONSTRAINT "VarianteMedidor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VarianteMedidor_codigo_key" ON "VarianteMedidor"("codigo");

INSERT INTO "VarianteMedidor" ("codigo", "etiqueta", "tipo") VALUES
    ('CU', 'Chorro Único', 'velocidad'),
    ('CM', 'Chorro Múltiple', 'velocidad'),
    ('PR', 'Pistón Rotativo', 'volumetrico'),
    ('DN', 'Disco Nutante', 'volumetrico');

-- AlterTable
ALTER TABLE "ModeloMedidor" ADD COLUMN     "varianteId" INTEGER;

-- AddForeignKey
ALTER TABLE "ModeloMedidor" ADD CONSTRAINT "ModeloMedidor_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "VarianteMedidor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
