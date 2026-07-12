-- AlterTable
ALTER TABLE "ActaInstalacion" ADD COLUMN     "usuarioId" INTEGER;

-- AddForeignKey
ALTER TABLE "ActaInstalacion" ADD CONSTRAINT "ActaInstalacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
