-- AlterTable
ALTER TABLE "NovedadLectura" ADD COLUMN "fotos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
