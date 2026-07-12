-- CreateTable
CREATE TABLE "Barrio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Barrio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Barrio_nombre_key" ON "Barrio"("nombre");

-- Seed: registra como catálogo los barrios que ya vienen en la data importada de suscriptores.
INSERT INTO "Barrio" ("nombre")
SELECT DISTINCT "barrio" FROM "Suscriptor" WHERE "barrio" IS NOT NULL AND "barrio" != '';
