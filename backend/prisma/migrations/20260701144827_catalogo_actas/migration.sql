-- DropForeignKey
ALTER TABLE "Medidor" DROP CONSTRAINT "Medidor_suscriptorId_fkey";

-- AlterTable
ALTER TABLE "Medidor" ADD COLUMN     "diametroId" INTEGER,
ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'instalado',
ADD COLUMN     "marcaId" INTEGER,
ADD COLUMN     "modeloId" INTEGER,
ADD COLUMN     "serial" TEXT,
ALTER COLUMN "suscriptorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MarcaMedidor" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "MarcaMedidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeloMedidor" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "marcaId" INTEGER NOT NULL,

    CONSTRAINT "ModeloMedidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiametroMedidor" (
    "id" SERIAL NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "DiametroMedidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActaInstalacion" (
    "id" SERIAL NOT NULL,
    "medidorId" INTEGER NOT NULL,
    "suscriptorId" INTEGER NOT NULL,
    "serial" TEXT NOT NULL,
    "fechaInstalacion" TIMESTAMP(3) NOT NULL,
    "instaladoPor" TEXT NOT NULL,
    "observaciones" TEXT,
    "fotos" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActaInstalacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarcaMedidor_nombre_key" ON "MarcaMedidor"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ModeloMedidor_marcaId_nombre_key" ON "ModeloMedidor"("marcaId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "DiametroMedidor_valor_key" ON "DiametroMedidor"("valor");

-- CreateIndex
CREATE UNIQUE INDEX "Medidor_serial_key" ON "Medidor"("serial");

-- AddForeignKey
ALTER TABLE "ModeloMedidor" ADD CONSTRAINT "ModeloMedidor_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "MarcaMedidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medidor" ADD CONSTRAINT "Medidor_suscriptorId_fkey" FOREIGN KEY ("suscriptorId") REFERENCES "Suscriptor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medidor" ADD CONSTRAINT "Medidor_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "MarcaMedidor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medidor" ADD CONSTRAINT "Medidor_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "ModeloMedidor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medidor" ADD CONSTRAINT "Medidor_diametroId_fkey" FOREIGN KEY ("diametroId") REFERENCES "DiametroMedidor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActaInstalacion" ADD CONSTRAINT "ActaInstalacion_medidorId_fkey" FOREIGN KEY ("medidorId") REFERENCES "Medidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActaInstalacion" ADD CONSTRAINT "ActaInstalacion_suscriptorId_fkey" FOREIGN KEY ("suscriptorId") REFERENCES "Suscriptor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
