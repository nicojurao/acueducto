-- CreateTable
CREATE TABLE "PlantillaFactura" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "imagenGuiaUrl" TEXT,
    "anchoPt" DOUBLE PRECISION NOT NULL DEFAULT 612,
    "altoPt" DOUBLE PRECISION NOT NULL DEFAULT 792,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantillaFactura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarcadorPlantilla" (
    "id" SERIAL NOT NULL,
    "plantillaId" INTEGER NOT NULL,
    "campo" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "fontSize" DOUBLE PRECISION NOT NULL DEFAULT 9,
    "align" TEXT NOT NULL DEFAULT 'left',
    "bold" BOOLEAN NOT NULL DEFAULT false,
    "anchoCaja" DOUBLE PRECISION,

    CONSTRAINT "MarcadorPlantilla_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarcadorPlantilla_plantillaId_idx" ON "MarcadorPlantilla"("plantillaId");

-- AddForeignKey
ALTER TABLE "MarcadorPlantilla" ADD CONSTRAINT "MarcadorPlantilla_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "PlantillaFactura"("id") ON DELETE CASCADE ON UPDATE CASCADE;
