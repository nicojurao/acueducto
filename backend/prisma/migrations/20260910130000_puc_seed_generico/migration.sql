-- Semilla PROVISIONAL del Plan Único de Cuentas: PUC comercial genérico (Decreto 2650/1993),
-- clases 1-6, nivel clase/grupo/cuenta (sin auxiliares). NO es el plan de cuentas específico que
-- la SSPD exige a los prestadores de servicios públicos domiciliarios (Resolución SSPD
-- 20051300033635 de 2005) — ese catálogo tiene su propia numeración y todavía no se consiguió el
-- que ACBUM ya usa en Integrasoft. Esto es solo para poder avanzar con comprobantes/libros
-- mientras se consigue el catálogo real; se puede reemplazar cuenta por cuenta desde la pantalla
-- de Contabilidad sin tocar código, o repoblar esta tabla entera si hace falta.
--
-- Condicional (WHERE NOT EXISTS): solo siembra en una base de datos SIN ninguna cuenta todavía
-- (cliente nuevo o esta migración corriendo por primera vez) — nunca sobreescribe un PUC real que
-- ya se haya cargado a mano o desde otra fuente.
INSERT INTO "CuentaPuc" ("codigo", "nombre", "naturaleza", "nivel")
SELECT v.codigo, v.nombre, v.naturaleza, v.nivel
FROM (VALUES
  -- CLASE 1: ACTIVO
  ('1', 'ACTIVO', 'debito', 1),
  ('11', 'Disponible', 'debito', 2),
  ('1105', 'Caja', 'debito', 3),
  ('110505', 'Caja general', 'debito', 4),
  ('1110', 'Bancos', 'debito', 3),
  ('111005', 'Moneda nacional', 'debito', 4),
  ('13', 'Deudores', 'debito', 2),
  ('1305', 'Clientes', 'debito', 3),
  ('130501', 'Cartera de suscriptores (acueducto/alcantarillado)', 'debito', 4),
  ('1355', 'Anticipos y avances', 'debito', 3),
  ('1380', 'Deudores varios', 'debito', 3),
  ('14', 'Inventarios', 'debito', 2),
  ('1435', 'Materiales, repuestos y accesorios', 'debito', 3),
  ('15', 'Propiedades, planta y equipo', 'debito', 2),
  ('1520', 'Maquinaria y equipo', 'debito', 3),
  ('1524', 'Equipo de oficina', 'debito', 3),
  ('1528', 'Equipo de computación y comunicación', 'debito', 3),
  ('1592', 'Depreciación acumulada (CR)', 'credito', 3),

  -- CLASE 2: PASIVO
  ('2', 'PASIVO', 'credito', 1),
  ('21', 'Obligaciones financieras', 'credito', 2),
  ('2105', 'Bancos nacionales', 'credito', 3),
  ('22', 'Proveedores', 'credito', 2),
  ('2205', 'Nacionales', 'credito', 3),
  ('23', 'Cuentas por pagar', 'credito', 2),
  ('2335', 'Costos y gastos por pagar', 'credito', 3),
  ('2365', 'Retención en la fuente', 'credito', 3),
  ('2367', 'Impuesto a las ventas retenido (ReteIVA)', 'credito', 3),
  ('2368', 'Retención de industria y comercio (ReteICA)', 'credito', 3),
  ('24', 'Impuestos, gravámenes y tasas', 'credito', 2),
  ('2408', 'Impuesto sobre las ventas por pagar (IVA)', 'credito', 3),
  ('25', 'Obligaciones laborales', 'credito', 2),
  ('2505', 'Salarios por pagar', 'credito', 3),
  ('2510', 'Cesantías consolidadas', 'credito', 3),
  ('2520', 'Prima de servicios', 'credito', 3),
  ('2525', 'Vacaciones consolidadas', 'credito', 3),
  ('28', 'Otros pasivos', 'credito', 2),
  ('2805', 'Anticipos y avances recibidos', 'credito', 3),

  -- CLASE 3: PATRIMONIO
  ('3', 'PATRIMONIO', 'credito', 1),
  ('31', 'Capital social', 'credito', 2),
  ('3115', 'Aportes sociales', 'credito', 3),
  ('36', 'Resultados del ejercicio', 'credito', 2),
  ('3605', 'Utilidad del ejercicio', 'credito', 3),
  ('3610', 'Pérdida del ejercicio', 'debito', 3),
  ('37', 'Resultados de ejercicios anteriores', 'credito', 2),
  ('3705', 'Utilidades acumuladas', 'credito', 3),

  -- CLASE 4: INGRESOS
  ('4', 'INGRESOS', 'credito', 1),
  ('41', 'Operacionales', 'credito', 2),
  ('4145', 'Servicios', 'credito', 3),
  ('414540', 'Acueducto', 'credito', 4),
  ('414541', 'Alcantarillado', 'credito', 4),
  ('414542', 'Aseo', 'credito', 4),
  ('414595', 'Otros servicios (reconexión, matrícula, mora)', 'credito', 4),
  ('42', 'No operacionales', 'credito', 2),
  ('4210', 'Financieros', 'credito', 3),
  ('4295', 'Diversos', 'credito', 3),

  -- CLASE 5: GASTOS
  ('5', 'GASTOS', 'debito', 1),
  ('51', 'Operacionales de administración', 'debito', 2),
  ('5105', 'Gastos de personal', 'debito', 3),
  ('5110', 'Honorarios', 'debito', 3),
  ('5115', 'Impuestos', 'debito', 3),
  ('5120', 'Arrendamientos', 'debito', 3),
  ('5135', 'Servicios', 'debito', 3),
  ('513525', 'Acueducto y alcantarillado (consumo propio)', 'debito', 4),
  ('5140', 'Gastos legales', 'debito', 3),
  ('5145', 'Mantenimiento y reparaciones', 'debito', 3),
  ('5195', 'Diversos', 'debito', 3),
  ('5199', 'Provisiones, depreciaciones y amortizaciones', 'debito', 3),
  ('53', 'No operacionales', 'debito', 2),
  ('5305', 'Financieros', 'debito', 3),
  ('5395', 'Gastos diversos', 'debito', 3),

  -- CLASE 6: COSTOS DE VENTAS
  ('6', 'COSTOS DE VENTAS', 'debito', 1),
  ('61', 'Costo de ventas y de prestación de servicios', 'debito', 2),
  ('6135', 'Costo de servicios', 'debito', 3)
) AS v(codigo, nombre, naturaleza, nivel)
WHERE NOT EXISTS (SELECT 1 FROM "CuentaPuc");

-- Jerarquía: cada cuenta apunta a la cuenta existente cuyo código es el prefijo más largo del
-- suyo (mismo criterio que padrePorPrefijo() en backend/src/routes/comercial/contabilidad.ts).
UPDATE "CuentaPuc" c
SET "padreId" = calculado.padre_id
FROM (
  SELECT c1.id, (
    SELECT c2.id FROM "CuentaPuc" c2
    WHERE c2.codigo <> c1.codigo AND c1.codigo LIKE c2.codigo || '%'
    ORDER BY length(c2.codigo) DESC
    LIMIT 1
  ) AS padre_id
  FROM "CuentaPuc" c1
) calculado
WHERE c.id = calculado.id AND calculado.padre_id IS NOT NULL;
