-- El área de la sección transversal del método flotador se mide en dos puntos del tramo
-- (alta/baja) y se promedia; "areaM2" pasa a ser ese promedio, calculado por el backend.
ALTER TABLE "Aforo" ADD COLUMN "areaAltaM2" DECIMAL(10,3);
ALTER TABLE "Aforo" ADD COLUMN "areaBajaM2" DECIMAL(10,3);
