-- Campos aditivos para reportería regulatoria (SUI/CRA), sin tocar el flujo de facturación
-- existente: todos opcionales o con default, no requieren backfill.

-- Barrio: zona rural/urbano (la CRA 825 de 2017 trata distinto el área rural).
ALTER TABLE "Barrio" ADD COLUMN     "zona" TEXT NOT NULL DEFAULT 'urbano';

-- Estrato: código catastral IGAC, separado del código SSPD que ya vive en "codigo".
ALTER TABLE "Estrato" ADD COLUMN     "codigoIgac" TEXT;

-- PeriodoFacturacion: fecha límite de pago y fecha de suspensión propias del periodo (antes solo
-- vivía Factura.fechaVencimiento, sin fecha de suspensión en ningún lado).
ALTER TABLE "PeriodoFacturacion" ADD COLUMN     "fechaLimite" TIMESTAMP(3),
ADD COLUMN     "fechaSuspension" TIMESTAMP(3);

-- Suscriptor: Número Predial Nacional (NPN) del IGAC, 30 dígitos, vigente desde 2014.
ALTER TABLE "Suscriptor" ADD COLUMN     "numeroPredialNacional" TEXT;
