-- CreateTable
CREATE TABLE "Estrato" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Estrato_codigo_key" ON "Estrato"("codigo");

-- Seed: catálogo inicial de estratos colombianos (antes vivía hardcodeado en el código;
-- ya venía incompleto, sin el 5 y el 6).
INSERT INTO "Estrato" ("codigo", "etiqueta") VALUES
    ('1', 'Bajo - Bajo'),
    ('2', 'Bajo'),
    ('3', 'Medio - Bajo'),
    ('4', 'Medio'),
    ('5', 'Medio - Alto'),
    ('6', 'Alto'),
    ('Comercial', 'Comercial'),
    ('Oficial', 'Oficial');
