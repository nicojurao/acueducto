-- CreateTable
CREATE TABLE "Suscriptor" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "ruta" TEXT,
    "ordenInstalacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suscriptor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medidor" (
    "id" SERIAL NOT NULL,
    "suscriptorId" INTEGER NOT NULL,
    "fechaInstalacion" TIMESTAMP(3),
    "tipo" TEXT,
    "fechaFabricacion" TIMESTAMP(3),
    "fechaCertificacion" TIMESTAMP(3),
    "clase" TEXT,
    "diametro" TEXT,
    "certificado" TEXT,
    "lecturaInicial" DECIMAL(12,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lectura" (
    "id" SERIAL NOT NULL,
    "medidorId" INTEGER NOT NULL,
    "periodo" TIMESTAMP(3) NOT NULL,
    "valorLectura" DECIMAL(12,2) NOT NULL,
    "consumo" DECIMAL(12,2) NOT NULL,
    "observaciones" TEXT,
    "fechaRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lectura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Suscriptor_codigo_key" ON "Suscriptor"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Lectura_medidorId_periodo_key" ON "Lectura"("medidorId", "periodo");

-- AddForeignKey
ALTER TABLE "Medidor" ADD CONSTRAINT "Medidor_suscriptorId_fkey" FOREIGN KEY ("suscriptorId") REFERENCES "Suscriptor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lectura" ADD CONSTRAINT "Lectura_medidorId_fkey" FOREIGN KEY ("medidorId") REFERENCES "Medidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
