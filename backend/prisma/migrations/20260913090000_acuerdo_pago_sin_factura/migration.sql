-- AlterTable: AcuerdoPago.facturaId pasa a ser opcional — un acuerdo puede financiar un CARGO
-- NUEVO (ej. matrícula/conexión en cuotas) que nunca existió como factura, no solo una factura
-- vencida ya generada. La foreign key existente sigue funcionando igual para los valores no nulos.
ALTER TABLE "AcuerdoPago" ALTER COLUMN "facturaId" DROP NOT NULL;
