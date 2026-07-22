-- Clase de precisión (ej. A, B, C, R100, R160) pasa a ser propiedad del catálogo Modelo, no del
-- medidor individual: dos medidores del mismo modelo siempre comparten la misma clase.

ALTER TABLE "ModeloMedidor" ADD COLUMN     "clasePrecision" TEXT;
