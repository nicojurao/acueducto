-- AlterTable
ALTER TABLE "Pqr" ADD COLUMN     "causal" TEXT,
ADD COLUMN     "detalleCausal" INTEGER,
ADD COLUMN     "fechaTrasladoSspd" TIMESTAMP(3),
ADD COLUMN     "respondidaEn" TIMESTAMP(3),
ADD COLUMN     "tipoNotificacion" INTEGER,
ADD COLUMN     "tipoRespuesta" INTEGER,
ADD COLUMN     "tipoTramite" INTEGER;
