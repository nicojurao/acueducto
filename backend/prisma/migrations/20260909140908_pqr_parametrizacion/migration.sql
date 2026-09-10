-- CreateTable
CREATE TABLE "PqrCausal" (
    "id" SERIAL NOT NULL,
    "codigo" INTEGER NOT NULL,
    "grupo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrCausal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PqrCausal_codigo_key" ON "PqrCausal"("codigo");

-- CreateTable
CREATE TABLE "PqrConfiguracion" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "encabezadoCorreo" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PqrConfiguracion_pkey" PRIMARY KEY ("id")
);

-- Seed: catálogo de causales tal cual vivía en código (backend/src/lib/suiCausales.ts) antes de
-- volverse editable desde el panel de Parametrización.
INSERT INTO "PqrCausal" ("codigo", "grupo", "detalle") VALUES
(101, 'F', 'Inconformidad con el aforo'),
(102, 'F', 'Inconformidad con la medición del consumo facturado'),
(103, 'F', 'Cobros inoportunos'),
(105, 'F', 'Cobro por servicios no prestados'),
(106, 'F', 'Datos generales incorrectos en la factura'),
(107, 'F', 'Cobro múltiple y/o acumulado'),
(108, 'F', 'Entrega inoportuna o no entrega de la factura'),
(109, 'F', 'Cobros por conexión, reconexión o reinstalación'),
(110, 'F', 'Inconformidad con el cambio o el cobro del medidor'),
(111, 'F', 'Cobro de intereses de mora, refinanciación, cartera o acuerdos de pago'),
(112, 'F', 'Subsidios y contribuciones'),
(113, 'F', 'Cobro de otros bienes o servicios no autorizados en la factura'),
(115, 'F', 'Incumplimiento o negación del acuerdo de suspensión del servicio'),
(117, 'F', 'Estrato incorrecto'),
(118, 'F', 'Clase de uso incorrecta (industrial, comercial, oficial, otros)'),
(119, 'F', 'Tarifa incorrecta'),
(120, 'F', 'Cobros por promedio'),
(121, 'F', 'Cobro de consumo registrado por medidor de otro predio'),
(122, 'F', 'Pago efectuado pero no aplicado por la empresa en la facturación'),
(123, 'F', 'Solicitud de rompimiento de solidaridad'),
(124, 'F', 'Cobro de revisiones'),
(127, 'F', 'Inconformidad por desviación significativa del consumo'),
(129, 'F', 'Cobro por recuperación de consumos'),
(131, 'F', 'Inconformidad por la normalización del servicio'),
(133, 'F', 'Cobro por reconexión no autorizada por la empresa'),
(301, 'F', 'Negación de la solicitud de suspensión'),
(303, 'P', 'Interrupciones en la prestación del servicio'),
(304, 'P', 'Variaciones en las características del suministro (presión, calidad, etc.)'),
(306, 'P', 'No atención de condiciones de seguridad o riesgo'),
(308, 'P', 'Terminación del contrato'),
(309, 'P', 'Suspensión o corte del servicio sin previo aviso o sin causa aparente'),
(312, 'P', 'Servicio sin Contrato de Condiciones Uniformes formalizado'),
(314, 'P', 'Afectación ambiental'),
(315, 'P', 'Quejas administrativas (atención, trámites, gestión)'),
(316, 'P', 'Estado de la infraestructura (redes, tanques, etc.)'),
(401, 'P', 'Fallas en la conexión del servicio'),
(402, 'P', 'No conexión del servicio');

-- Seed: fila única de configuración, con un encabezado institucional razonable como punto de
-- partida — el staff lo puede reescribir desde Parametrización sin necesitar un despliegue.
INSERT INTO "PqrConfiguracion" ("id", "encabezadoCorreo", "updatedAt") VALUES
(1, 'En atención a tu Petición, Queja, Reclamo o Sugerencia radicada ante el Acueducto Comunitario Barrios Unidos de Mocoa (ACBUM), nos permitimos informarte lo siguiente:', CURRENT_TIMESTAMP);
