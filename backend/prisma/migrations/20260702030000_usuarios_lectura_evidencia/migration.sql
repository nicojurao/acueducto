-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- AlterTable
ALTER TABLE "Lectura" ADD COLUMN "fotoUrl" TEXT,
ADD COLUMN "latitud" DOUBLE PRECISION,
ADD COLUMN "longitud" DOUBLE PRECISION,
ADD COLUMN "capturadoPorId" INTEGER;

-- AddForeignKey
ALTER TABLE "Lectura" ADD CONSTRAINT "Lectura_capturadoPorId_fkey" FOREIGN KEY ("capturadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
