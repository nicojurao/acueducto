-- AlterTable
ALTER TABLE "InicioSesion" ADD COLUMN     "jti" TEXT,
ADD COLUMN     "revocada" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "InicioSesion_jti_key" ON "InicioSesion"("jti");
