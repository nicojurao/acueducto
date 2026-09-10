-- AlterTable
ALTER TABLE "PqrConfiguracion" ADD COLUMN "encabezadoRadicacion" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PqrConfiguracion" ADD COLUMN "encabezadoRespuesta" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PqrConfiguracion" ADD COLUMN "encabezadoCierre" TEXT NOT NULL DEFAULT '';

-- Backfill: el encabezado único que existía hasta ahora se usaba tanto para las aclaraciones del
-- funcionario como para la respuesta final — se copia a ambos como punto de partida, y radicación
-- (que no tenía encabezado propio todavía) recibe un texto nuevo razonable.
UPDATE "PqrConfiguracion" SET
  "encabezadoRespuesta" = "encabezadoCorreo",
  "encabezadoCierre" = "encabezadoCorreo",
  "encabezadoRadicacion" = 'Gracias por comunicarte con el Acueducto Comunitario Barrios Unidos de Mocoa (ACBUM). En los próximos días estaremos revisando tu caso.'
WHERE id = 1;

ALTER TABLE "PqrConfiguracion" DROP COLUMN "encabezadoCorreo";
