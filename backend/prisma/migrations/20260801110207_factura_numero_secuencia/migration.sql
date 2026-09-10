-- CreateSequence: numeración de factura pasa de calcularse en memoria (MAX(numero)+1, con
-- riesgo de choque si dos generaciones corren a la vez) a una secuencia nativa de Postgres,
-- que asigna números de forma atómica sin importar cuántos procesos la usen a la vez.
CREATE SEQUENCE IF NOT EXISTS factura_numero_seq;

-- La secuencia arranca justo después del número más alto ya usado, para no chocar con facturas
-- existentes (setval(seq, N) hace que el PRÓXIMO nextval() devuelva N+1). Si todavía no hay
-- ninguna factura, no se toca: una secuencia recién creada ya empieza en 1 por su cuenta, y
-- setval no admite 0 como valor.
DO $$
DECLARE
  max_numero integer;
BEGIN
  SELECT MAX(numero) INTO max_numero FROM "Factura";
  IF max_numero IS NOT NULL THEN
    PERFORM setval('factura_numero_seq', max_numero);
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Factura" ALTER COLUMN "numero" SET DEFAULT nextval('factura_numero_seq')::integer;
