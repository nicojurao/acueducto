# Facturación: qué tiene Integrasoft BPM (ControlBlue) que Fluvi no

Investigación hecha explorando en vivo el software comercial **Integrasoft BPM / ControlBlue**
que ACBUM ya usa (`https://acbum.integrasoftsas.co:8082`), módulo `ControlBlue → Procesos` e
`Informes`, el 2026-09-02. Cada hallazgo cita la pantalla exacta donde se vio. El objetivo es
identificar funcionalidad de facturación de acueductos que Fluvi (nuestro sistema) todavía no
cubre, para priorizar sobre el módulo de Facturación existente (`Tarifa`, `Factura`,
`FacturaConcepto`, `Pago`, `Tercero`, `PeriodoFacturacion`, `FacturacionOmitida`).

## Arquitectura general de Integrasoft (mapa completo tras recorrer todo el panel)

Segunda pasada, más exhaustiva: se recorrió módulo por módulo `ControlBlue → Parámetros`
completo (13 pantallas), `Terceros`/`Usuarios` (para entender qué tan genérico es el resto del
ERP), e `Informes` (los de facturación y el generador de reportes SUI). Resumen de cómo está
armado el sistema completo, de la base hacia arriba:

**Orden de configuración inicial** (`ControlBlue → Parámetros → Interfaz ControlBlue`, un wizard
visual de 5 pasos con importación por Excel en cada uno): **Localidades/Barrios → Terceros →
Predios → Tarifas → Cartera** (saldos iniciales). Coincide con el orden que ya sigue
`npm run import` en Fluvi — buena señal de que el modelo de datos de Fluvi va en la dirección
correcta, solo que menos granular en cada paso.

**Catálogos de clasificación que Fluvi no tiene:**
- **Tipos de predios** (28 registros): actividad económica del predio (funeraria, expendio de
  carnes, consultorio odontológico, lava motos, hogar infantil...) — usada para clasificar riesgo
  ambiental/sanitario del vertimiento, no solo para reportería.
- **Tipos de productor de aseo** (4: Pequeño productor / Gran productor -1.5ton-6m³ / Gran
  productor +1.5ton-6m³ / Inmuebles o lotes desocupados) — terminología textual de la propia
  regulación CRA de aseo, confirma que la variable "gran productor vs pequeño productor" es un
  concepto regulatorio, no una ocurrencia de Integrasoft.
- **Estratos** con *dos* codificaciones paralelas por fila (Código SSPD oficial + Código IGAC),
  más "Clases uso" y "Clases uso DIAN", y 12 filas reales (no solo 1-6 residenciales: incluye
  Comercial, Oficial, "predio no estratificado", "uso no residencial"...). El comentario del
  schema de Fluvi dice "(1,2,3,4, Comercial, Oficial)" — vale la pena confirmar si el catálogo real
  de Fluvi ya tiene las 12 categorías o solo un subconjunto.
- **Asentamientos** (barrios, 28 registros) con un campo **Zona: Rural/Urbano** explícito por
  barrio — Fluvi's `Barrio` no distingue rural/urbano, aunque la CRA 825 sí trata distinto el área
  rural (aplica "independientemente del número de suscriptores").

**El motor de tarifas es mucho más granular que `Tarifa`+`TarifaEstrato` de Fluvi:**
`Parámetros → Tarifas` tiene 11 pestañas. Las dos más reveladoras:
- **Conceptos de ingreso**: **39 tipos de renglón de factura** configurables (código, nombre,
  servicio, límites de consumo, ¿tiene padre?, ¿es descuento?, y banderas como "aplica recargo",
  "aplica financiación", "multiplica por peso basura", "aplica acuerdo pago", "reactivar deuda con
  descuento"). Cubren no solo cargo fijo/consumo, sino **Suspensión y Reinstalación como conceptos
  facturables** (ACBUM cobra por suspender y por reconectar), **Cajillas** (caja del medidor),
  **Matrícula** y **Cuota Inicial Matrícula** (conexión nueva en cuotas), **Interés de
  Financiación** y **Retroactivo**, cada uno *por servicio* (acueducto/alcantarillado/aseo por
  separado). El `FacturaConcepto.tipo` de Fluvi es un enum fijo de 9 valores — mucho más limitado.
- **Subsidios o contribuciones**: **840 filas** — el % de subsidio varía por Ciclo × Servicio ×
  **Concepto de ingreso individual** (cargo fijo puede tener un % distinto al de consumo básico)
  × Estrato × Periodo (con histórico completo, no solo el valor vigente). El
  `TarifaEstrato.porcentaje` de Fluvi es un solo % por estrato aplicado uniformemente a "cargo fijo
  y consumo básico" (comentario del schema) — una simplificación real frente a lo que permite (y
  probablemente exige) la CRA 825.
- **Aumento/Decremento tarifas**: herramienta de un solo paso para subir/bajar todas las tarifas
  de un año por un % (típicamente el ajuste anual por IPC). Fluvi requiere crear a mano una fila
  `Tarifa` nueva completa cada vez.

**Puntos de recaudo reales confirmados (5):** PSE, Banco Agrario, Banco BBVA, una cooperativa
local (COACEP), y la oficina — **esto no es teórico**: ACBUM ya cobra por varios canales externos,
lo que hace más urgente el hallazgo #9 original (Referencias de pago) de lo que se había estimado.
Además, `Informes de facturación` incluye **"Archivo de facturación Asobancaria 2001"** y
**"2011"** — el formato de archivo plano estándar que la banca colombiana usa para que un banco
sepa cuánto debe cobrar por cada referencia de pago. Si ACBUM reactiva o mantiene el recaudo por
banco, Fluvi necesitaría generar este formato exacto para que el banco lo reciba.

**Periodos con más granularidad temporal:** cada uno de los 42 periodos históricos tiene, además
de fecha inicial/final: **fecha límite de pago**, **fecha de suspensión** (propia del periodo, no
solo de la factura), y una **ventana de lectura separada** (fecha inicial/final de lectura,
distinta del mes facturado). El `PeriodoFacturacion` de Fluvi (`backend/prisma/schema.prisma:735`)
solo tiene `fechaGeneracion`/`fechaCierre` — sin fecha límite de pago ni fecha de suspensión a
nivel de periodo (hoy vive nada más en `Factura.fechaVencimiento`, sin la suspensión asociada).

**Rutas de lectura como catálogo real** (15 registros) con un flag **"Bloqueado facturación"** por
ruta — permite congelar la facturación de una sola ruta mientras el resto del periodo avanza
normalmente (útil si una cuadrilla no terminó de leer). Fluvi tiene `ruta` como texto libre en
`Suscriptor`, sin catálogo ni bloqueo parcial.

**PQR: catálogo oficial de 78 causales** (`Parámetros → PQR → Lista de reclamaciones y
peticiones`), versionado por año ("Vigencia"), cada una con código numérico (401-404, 312-316,
etc.), agrupador ("F-Facturación"...), tipo de trámite (Reclamación/Petición/Recurso de
Reposición/Recurso+Apelación/Queja), servicios sobre los que aplica, y si obliga foto o factura
anexa. Esto tiene toda la pinta del **catálogo oficial de causales que exige el SUI para reportar
PQR's** — un módulo de PQR en Fluvi que use texto libre en vez de este catálogo no serviría para
reportar al SUI correctamente. También hay un catálogo de **"Tipos de notificación"** (personal /
por edicto / N/A) que corresponde a cómo debe notificarse la respuesta según el CPACA (Ley 1437 de
2011) cuando no se puede notificar personalmente.

**Reportes SUI: catálogo con resoluciones exactas citadas en el propio software**
(`Informes → Informes al SUI → Generación archivos planos`). Por servicio, los formatos
disponibles (nombres tal cual aparecen en el software, no verificados contra el texto de cada
resolución):

- **Acueducto/Alcantarillado**: Formato Estratificación, Formato Tarifas Aplicadas, Formato
  Facturación (IGAC), Formato Facturación **Resol 20171300039945 y Resol 20174000121755**,
  Formato Refacturación (mismas resoluciones), Facturas por Estrato en PDF, Formato Facturación
  **Menor a 5000 Resol 20101300048765** (con y sin ajuste), Información Comercial (ambas
  resoluciones), Formato Estratificación **Resol SSPD 20211000852195 de 2021**, Formato Costos de
  Referencia y Tarifas Aplicadas **Resol 20211000313835**.
- **Aseo**: Formato Tarifas Aplicadas **Resol 20101300048765**, Facturación Comercial y
  Facturación del Servicio **Resol 20174000237705 de 2017**, Facturas por Estrato en PDF.
- **PQR**: un informe de archivo plano aparte, filtrable por servicio/documento/rango de fechas.

Fluvi hoy solo genera el **Formato 279** (ver `279.csv` en la raíz del repo). Esta lista sugiere
que el 279 es apenas **uno** de varios formatos que el SUI puede exigir según el tamaño y régimen
del prestador — **antes de construir más reportes SUI en Fluvi, vale la pena confirmar con quien
lleva el reporte SUI de ACBUM cuáles de estos formatos presentan realmente hoy** (posiblemente
vía Integrasoft) y cuáles son opcionales o no aplican a un prestador del tamaño de ACBUM.

**Lo que NO vale la pena copiar:** los módulos `Terceros`/`Usuarios` de Integrasoft son un CRM/ERP
genérico compartido entre todos los productos de Integrasoft (campos de "Proyectos", "Productos",
redes sociales, RH, cargo/área/subárea) — la mayoría es boilerplate irrelevante para un acueducto
comunitario. El `Tercero` de Fluvi (documento, nombre, email, teléfono, dirección) ya es
apropiadamente más simple; no hay que enriquecerlo con lo visto ahí.

## Resumen de brechas (ordenadas por impacto probable)

1. **Reportes SUI: el Formato 279 puede ser solo uno de varios exigidos** — Integrasoft tiene un
   catálogo de ~14 formatos por servicio (facturación, tarifas, estratificación, información
   comercial, costos de referencia), cada uno con su resolución SSPD/SUI citada. Confirmar con
   quien reporta al SUI cuáles aplican de verdad a ACBUM antes de asumir que el 279 basta. Ver
   "Arquitectura general".
2. **Suspensión del servicio sin sustento de debido proceso (Ley 142, Art. 140-141)** — Fluvi no
   tiene forma de probar que se avisó antes de cortar, ni distingue corte por mora de suspensión
   de mutuo acuerdo, ni guarda fecha de suspensión a nivel de periodo. Ver #13 y "Arquitectura
   general" (Periodos).
3. **Motor de conceptos de factura demasiado simple** — Fluvi tiene 9 tipos fijos de renglón vs.
   los 39 configurables de Integrasoft (suspensión/reconexión facturables, cajillas, matrícula en
   cuotas, interés de financiación e intereses/retroactivos por servicio). Y los subsidios varían
   por concepto individual (840 filas), no por un solo % por estrato como en `TarifaEstrato`. Ver
   "Arquitectura general".
4. **Posible metodología de aseo mal aplicada** (CRA 720/2015, para >5.000 suscriptores, en vez de
   la CRA 853/2018 que aplicaría a ACBUM) — a confirmar con el área tarifaria antes de modelar
   nada, pero si es real afecta el cálculo mismo de la tarifa de aseo. Ver #14.
5. **Aseo con tarifa variable real** (tipo de productor, peso, frecuencia, multiusuario) — si
   ACBUM ya cobra así, Fluvi lo estaría facturando mal hoy. Ver #11.
6. **Catálogo oficial de causales PQR (78, versionado por año)** — un módulo de PQR con texto
   libre no bastaría para reportar al SUI; hace falta el catálogo codificado. Ver "Arquitectura
   general".
7. **Checklist de verificación por periodo** — el hallazgo más accionable entre los de bajo riesgo.
8. **Histórico de propietarios por predio** — hoy se pierde el dueño anterior al cambiar titular.
   Ver #11.
9. **Número Predial Nacional (NPN) de 30 dígitos sin campo ni validación** — riesgo de
   inconsistencias en el reporte SUI Formato 279. Ver #12.
10. **Referencias de pago y archivo Asobancaria** — ACBUM ya tiene 5 puntos de recaudo reales
    (PSE, dos bancos, una cooperativa, oficina); esto ya no es un "nice to have" especulativo. Ver
    "Arquitectura general" y #6.
11. **Cartera vencida con antigüedad de saldos (aging)**.
12. **Notas de saldo a favor y notas de descuento** por servicio.
13. **Acuerdos de pago / financiación en cuotas** de facturas o conceptos vencidos.
14. **Facturación electrónica DIAN** (ya anticipado en el schema de Fluvi como "a futuro").
15. **Refacturación con causal** ligada a una reclamación.
16. **Facturación por ciclos/rutas y bloqueo de facturación por ruta** (relevante solo si ACBUM
    crece mucho).
17. **Reporte de subsidio AAA** como proceso independiente por periodo.
18. Ver además la sección #11 completa: clasificaciones especiales de vivienda (inquilinato, hogar
    comunitario, unidades multi-residenciales), y checkboxes de excepción de facturación por
    predio (bloqueo de acuerdos, facturar sin servicios).

---

## 1. Checklist de verificación por periodo

**Dónde:** `ControlBlue → Procesos → Verificación proceso facturación`.

Una grilla por periodo con tres grupos de pasos — **Creación de periodo**, **Lecturas**,
**Facturación** — cada fila con: nombre del paso, la pantalla exacta donde se ejecuta (ej.
"Verificar tarifas y subsidios (Parámetros/Tarifas - Subsidios o Contribuciones)"), una casilla
**Verificado**, el **usuario que verificó** y la **fecha**. Ejemplo de filas vistas:

- Crear periodo facturación
- Verificar tarifas y subsidios
- Validar novedad de lecturas
- Consumo predeterminado por predio
- Tarifas promedio por estrato
- Informe predios inactivos
- Toma de lecturas / Cargue de lecturas / Precríticas / Desviación significativa / Validar lecturas
- Facturar por ciclo
- Revisar informe detallado de liquidación
- Generar PDF facturas

**Por qué importa para Fluvi:** hoy `PeriodoFacturacion.estado` solo distingue `abierto`/`cerrado`
(`backend/prisma/schema.prisma:735`), sin registro de qué pasos de control de calidad se
corrieron antes de facturar (ej. ¿alguien revisó la tarifa vigente? ¿se validaron las lecturas
atípicas?). Es plata regalada: cierra el periodo sin dejar rastro de si el proceso se hizo bien,
y si algo sale mal en un periodo es difícil auditar qué paso se saltó.

**Propuesta:** una tabla `VerificacionPeriodo` (periodoFacturacionId, paso, verificado, usuarioId,
fecha) con una lista fija de pasos configurable en código (no hace falta que sea tan genérica
como Integrasoft), mostrada como checklist en la pantalla del periodo. Opcionalmente, bloquear el
cierre del periodo si faltan pasos críticos por marcar.

## 2. Cartera vencida con antigüedad de saldos — YA IMPLEMENTADO EN FLUVI

**Dónde en Integrasoft:** `ControlBlue → Informes → Informe de cartera`, con un submenú
"Configurar edades cartera" que permite definir hasta 9 rangos de días (ej. 0-30, 31-60, 61-90...)
como "modelos" reutilizables con nombre propio.

**Corrección (2026-09-02):** al revisar el código para implementar esto, resultó que Fluvi
**ya lo tiene**: `GET /cartera/resumen` y `GET /cartera` en
`backend/src/routes/comercial/facturacion.ts:700-799` calculan saldo total, desglose por
antigüedad (0-30/31-60/61-90/90+, fijo en código en vez de configurable) y por barrio, todo en
Postgres. No hace falta ningún trabajo nuevo aquí — el hallazgo original quedó desactualizado
frente al estado real del repo (probablemente se agregó después de la primera exploración).

**Propuesta:** un endpoint/reporte que, para un corte de fecha, sume el saldo pendiente
(`Factura.total - suma de Pago.valor`) por suscriptor agrupado en rangos de días desde
`fechaVencimiento`. Los rangos pueden quedar fijos (0-30/31-60/61-90/+90) sin necesidad de la
configurabilidad de Integrasoft, salvo que se pida explícitamente.

## 3. Notas de saldo a favor y notas de descuento

**Dónde:** `ControlBlue → Procesos → Notas`, dos pestañas:

- **Notas de saldo a favor**: nota crédito con saldo a favor separado por servicio
  (`Saldo a favor acu.`, `Saldo a favor alcant.`, `Saldo a favor aseo`) contra un predio (NUID).
- **Notas de descuento**: "Tipo de descuento" (por valor o por porcentaje) aplicado también por
  servicio (`Valor acueducto`, `Valor alcantarillado`, `Valor aseo`), con botón "Aplicar
  descuento".

**Por qué importa:** Fluvi ya tiene `FacturaConcepto.tipo = "manual"` para ajustes
(`backend/prisma/schema.prisma:684-693`), pero es un renglón suelto dentro de una factura ya
generada — no hay un documento propio de "nota" con su propio consecutivo, ni un saldo a favor que
se arrastre automáticamente a la siguiente factura del predio. Si ACBUM cobra de más o hace un
descuento por reclamo, hoy no queda un rastro auditable tipo nota crédito/débito.

**Propuesta:** si el volumen de ajustes lo justifica, un modelo `Nota` (tipo crédito/débito,
consecutivo propio, suscriptorId, valores por servicio, observaciones) que se aplique como saldo a
favor en la siguiente factura generada para ese suscriptor.

## 4. Acuerdos de pago y financiación en cuotas

**Dónde:** dos módulos relacionados:

- `Procesos → Acuerdo de pago`: documento con "Cantidad de cuotas", "Valor Total", "Valor saldo",
  vinculado a un predio (NUID) y con botón "Doc. anexos del predio".
- `Procesos → Financiaciones`: "Tipo de financiación" = **Conceptos** (financia un concepto
  puntual, ej. matrícula o reconexión) o **Factura** (financia el total de una factura vencida),
  con "Consultar cargos directos".

**Por qué importa:** es una necesidad real y frecuente en acueductos comunitarios — un suscriptor
con mora alta pide pagar en cuotas para no perder el servicio. Fluvi no tiene ningún mecanismo
para esto hoy; la única vía sería anular/reemitir facturas a mano.

**Propuesta:** un modelo simple `AcuerdoPago` (suscriptorId, facturaId o conceptoId, valorTotal,
número de cuotas, cuotas generadas como conceptos `manual` en facturas futuras). No hace falta
separar "Conceptos" vs "Factura" como dos flujos distintos si el caso de uso de ACBUM es solo
financiar facturas vencidas — vale la pena confirmarlo con el usuario antes de modelarlo.

## 5. PQR's (peticiones, quejas, reclamos)

**Dónde:** `Procesos → PQR's`, con dos pestañas ("Ingresar-consultar PQR's" / "Respuesta PQR's").
El formulario captura: documento "PQR SUI", tipo de trámite, medio de recepción, servicio afectado
(acueducto/alcantarillado/aseo), tipo de causal + causal interna + definición libre, número(s) de
factura relacionados ("Agregar Factura" permite más de una), observaciones.

**Por qué importa:** en Colombia, la Ley 142 de 1994 obliga a los prestadores de servicios
públicos a responder peticiones, quejas y reclamos en plazos definidos (15 días hábiles), y el SUI
pide reportar estas PQR's periódicamente. Fluvi no tiene ningún módulo para esto — hoy si un
suscriptor reclama, no hay dónde registrarlo ni cómo probar que se respondió a tiempo.

**Propuesta:** un módulo `PQR` (suscriptorId, tipo de trámite, canal, servicio, causal,
factura(s) relacionada(s), fecha de radicado, fecha límite de respuesta calculada, respuesta,
fecha de respuesta, usuario que respondió). Este es probablemente el hallazgo con más riesgo
regulatorio si se ignora — vale la pena preguntarle a la administración de ACBUM si ya está
gestionando esto por fuera del sistema (correo, papel) y si hay urgencia real.

## 6. Referencias de pago con vencimiento y prorrateo

**Dónde:** `Procesos → Referencias de pago`. Genera una referencia (con fecha de vencimiento)
contra una factura o un conjunto de "conceptos de ingreso", con un botón **Prorratear** que
reparte automáticamente el valor a abonar entre acueducto/alcantarillado/aseo según el saldo de
cada servicio en la factura. Se anulan en bloque ("Anular Ref. pago activas") cada vez que se
vuelve a facturar un ciclo.

**Por qué importa:** esto es la pieza que conecta la factura con un canal de pago externo (banco,
PSE, corresponsal bancario) — el banco necesita un código/referencia que identifique
inequívocamente qué se está pagando y hasta cuándo es válido. Fluvi hoy registra `Pago` manual
directo contra una factura (`backend/prisma/schema.prisma:695-708`), sin ningún concepto de
referencia de pago independiente ni prorrateo automático entre servicios.

**Propuesta:** relevante solo si ACBUM planea integrar un canal de pago externo (PSE, corresponsal,
botón de pagos). Si los pagos siguen siendo 100% en efectivo/manual registrados por un operador,
este módulo no aporta tanto y se puede posponer.

## 7. Facturación electrónica (DIAN)

**Dónde:** `Procesos → Documentos electrónicos`, con pestañas "Emitir facturas", "Emitir notas",
"Documentos emitidos", "Cargar documentos electrónicos", "Parámetros". Muestra folios/documentos
electrónicos disponibles, vigencia del certificado digital, y un botón "Transmitir" (envío a la
DIAN).

**Por qué importa:** el propio schema de Fluvi ya anticipa esto — el comentario de `Tercero`
dice explícitamente "los datos personales para la facturación (y a futuro la facturación
electrónica DIAN) viven acá" (`backend/prisma/schema.prisma:710-712`). Es una integración grande
(certificado digital, numeración autorizada por la DIAN, transmisión), no algo para implementar
de una sola vez, pero confirma que el modelo de datos de Fluvi ya iba en esa dirección.

**Propuesta:** no es urgente salvo que la DIAN empiece a exigir facturación electrónica a ACBUM
por su tamaño/régimen — vale la pena preguntar si ya hay una fecha límite regulatoria.

## 8. Refacturación con causal ligada a una reclamación

**Dónde:** `Procesos → Facturas por predios`. Permite reemitir la factura de un predio puntual
con "Causal refacturación", "Tipo de causal" (ej. "Queja por daños en la vía"), "Causal interna" y
"No. Reclamación", además de fecha límite y fecha de suspensión propias de esa factura.

**Por qué importa:** hoy en Fluvi, corregir una factura individual pasaría por anularla
(`Factura.estado = "anulada"`) y no hay dónde dejar registrado *por qué* se corrigió ni el número
de reclamación asociado. Se solapa con el hallazgo de PQR's (#5) — si se implementa PQR primero,
la refacturación podría simplemente referenciar el PQR en vez de duplicar el campo de causal.

## 9. Facturación por ciclos/rutas

**Dónde:** `Procesos → Facturas por ciclos y otros`, pestaña "Facturas por ciclo": genera la
facturación de un periodo filtrando por **ciclo** y **ruta** de lectura (no todo el periodo de una
sola vez), con reimpresión también filtrable por ruta.

**Por qué importa:** con ~4.300 suscriptores Fluvi probablemente no necesita este nivel de
segmentación todavía — es una funcionalidad pensada para operadores mucho más grandes que dividen
la facturación en tandas por ruta de lectura. Se incluye aquí solo para que quede documentado por
si ACBUM crece.

## 10. Reporte de subsidio AAA como proceso independiente

**Dónde:** `Procesos → Facturas por ciclos y otros`, pestaña "Facturar subsidio AAA": genera un
reporte/proceso aparte por periodo, separado de la generación de facturas.

**Por qué importa:** Fluvi ya calcula subsidio/contribución por estrato dentro de la factura
(`Factura.porcentajeAplicado`, `Factura.ajusteEstrato`,
`backend/prisma/schema.prisma:665-668`), así que el cálculo ya existe — lo que falta, si acaso, es
un reporte que lo resuma por periodo para reportar al SUI o a la entidad que reconoce el subsidio.
Antes de construir algo nuevo, vale la pena revisar si el "Formato 279" que ya genera Fluvi
(ver `279.csv` en la raíz del repo y el comentario en `Suscriptor.numeroCuentaContrato`,
`backend/prisma/schema.prisma:51-53`) ya cubre esta necesidad.

---

## 11. Módulo Predio: mucho más rico que Suscriptor

**Dónde:** `ControlBlue → Procesos → Predios`, pestaña "Predio" (más 4 pestañas de operaciones
masivas: "Modifica NUID", "Modificar código alterno predios", "Cargue de peso basura", "Predios
cambio de rutas"). Explorado cargando un predio real (NUID 195) para ver el formulario con datos
y las opciones habilitadas — sin copiar aquí ningún dato personal identificable.

**Deuda en vivo:** el encabezado del formulario muestra "Deuda Actual: <valor>" calculada al
vuelo para el predio cargado, antes de entrar a facturas. Fluvi no tiene ningún resumen de deuda
visible en la ficha del suscriptor hoy — hay que abrir/sumar sus facturas pendientes a mano.

**Menú de acciones rápidas ("Más opciones") sobre el predio cargado:**
Histórico del predio, Documentos del predio, Lecturas del predio, **Histórico de propietarios**,
Medidores del predio, Histórico de lecturas, Crear Ref.Pago, Crear financiación, Consultar
documentos, Crear PQR's, Crear facturas. Es decir: desde la ficha de UN predio se puede lanzar
directamente cualquier operación de facturación sobre ese predio, sin ir a buscarlo de nuevo en
otro módulo.

**Histórico de propietarios (confirmado en vivo):** pantalla "Propietarios por Predio" con una
fila por cada persona que ha sido titular del predio — documento, nombre, teléfono, tipo de
identificación, fecha de modificación, y un estado Activo/Inactivo (no se borra al cambiar de
dueño). **Esta es una brecha real de modelo de datos en Fluvi**: `Suscriptor.terceroId`
(`backend/prisma/schema.prisma:71-72`) es una sola FK al tercero *actual* — si el predio cambia de
dueño, se pierde el vínculo con el dueño anterior. Si ACBUM factura o cobra retroactivamente a un
dueño anterior (algo común cuando se vende un predio con deuda), Fluvi no tiene cómo probarlo hoy.

**Campos de Predio que Fluvi no tiene y que sí importan para facturación:**

- **Por servicio (acueducto, alcantarillado, aseo cada uno con su propio set), independiente de
  si está contratado**: *Servicio en uso*, *Servicio contratado*, *Desocupado*, *Novedad*,
  *Actualiza consumo*, y sobre todo **Servicio suspendido?** con dos motivos distintos: "Servicio
  suspendido" (corte por mora) vs. "Suspensión por mutuo acuerdo" (el suscriptor pide pausar el
  servicio, ej. predio deshabitado temporalmente). Fluvi solo tiene `estadoFacturacion` con un
  valor global `inactivo`/`facturando`/etc — no un estado de suspensión por servicio ni la
  distinción entre corte forzoso y pausa voluntaria, que tienen implicaciones legales distintas
  (un corte por mora exige un proceso de notificación previo; una suspensión de mutuo acuerdo no).
- **Alcantarillado: caracterización de vertimiento** — clasificación del tipo de vertimiento de
  aguas residuales del predio, con un consumo predeterminado propio para ese concepto. Es un
  requisito ambiental (CAR/normativa de vertimientos), no solo de facturación. Fluvi no modela
  nada de esto — encaja con el trabajo ambiental que ya existe en Aforos, pero para
  alcantarillado/vertimientos no hay nada.
- **Aseo con tarifa variable real**, no solo el cargo fijo plano que tiene `Tarifa.aseoCargoFijo`
  (`backend/prisma/schema.prisma:612`): tipo de productor del servicio (residencial/comercial/
  industrial, afecta la fórmula), peso de basura en kg (con **carga masiva por archivo .txt**,
  `Procesos → Cargue de peso basura`), frecuencia de recolección y de barrido, "multiusuario"
  (edificio con varias unidades por un solo predio/medidor), y un "código factor de producción".
  Si ACBUM cobra aseo distinto según estos factores (no solo por estrato), Fluvi hoy lo estaría
  subfacturando o sobrefacturando de forma pareja para todos.
- **Clasificaciones especiales de vivienda**: *Inquilinato* (predio subdividido en habitaciones
  arrendadas — tarifa distinta en la norma colombiana), *Hogar comunitario* (hogares ICBF, tarifa
  especial), *Tipo unidad residencial* + *Unidades multi-residenciales* (edificio con un medidor
  compartido por varias viviendas — afecta cómo se reparte el consumo, similar en espíritu al
  `Cotitular` de Fluvi pero pensado para *unidades*, no solo *personas cotitulares*), *Tipo de
  estrato/estratificación* separado del `Estrato` mismo, y *Vivienda interés* (ya existe como
  dropdown "Predio sin condiciones especiales" — clasificación tipo VIS/VIP que afecta subsidios).
- **Códigos catastrales IGAC estructurados**: Fluvi guarda `zonaIgac`, `sectorIgac`,
  `manzanaVeredaIgac`, `numeroPredioIgac` como texto libre opcional
  (`backend/prisma/schema.prisma:54-58`). Integrasoft los pide como selects en cascada
  (Departamento → Municipio → Centro poblado) más campos adicionales que Fluvi no tiene: *Ficha
  catastral*, *NPN* (número predial nacional), *NUPRE*, *Mat. inmobiliaria* (matrícula
  inmobiliaria — identificador legal de registro, distinto del catastral), y *No. personas*
  (habitantes del predio, insumo típico para prorrateos de aseo). Estructurarlos como catálogo
  reduciría errores de captura del reporte SUI Formato 279, que Fluvi ya genera.
- **Checkboxes de excepción de facturación**: *Bloqueo abonos y acuerdo de pago* (impide que ese
  predio reciba pagos parciales o entre a un acuerdo — control anti-fraude/cobranza), *Facturar
  sin servicios* (genera factura aunque no tenga acueducto/alcantarillado contratado, ej. solo
  aseo), *No Liquida Ajustes* (excluye el predio de ajustes automáticos de un proceso masivo).
  Fluvi no tiene ningún mecanismo de excepción por predio hoy — cualquier regla nueva de
  facturación aplicaría a todos los suscriptores por igual.
- **Datos de facturación electrónica embebidos en el predio** (CC/NIT, tipo de persona, nombre
  completo, dirección, correo) — distintos de los del `Tercero` general, sugiriendo que para la
  factura electrónica DIAN se puede usar un tercero de facturación distinto al propietario/titular
  del servicio (ej. la empresa que paga aunque el predio esté a nombre de otra persona).

**Operaciones masivas sobre predios** (las 4 pestañas junto a "Predio"): renombrar el NUID sin
perder historial, modificar código alterno en bloque, cargar peso de basura por archivo, y
reasignar predios a otra ruta de lectura por archivo con plantilla descargable. Fluvi ya tiene
importación/exportación Excel de suscriptores (ver README), pero no estas operaciones puntuales de
mantenimiento masivo.

**Por qué importa más que los hallazgos anteriores:** a diferencia de las notas, PQR's o acuerdos
de pago (que son procesos *nuevos* que se pueden posponer), varios de estos campos —sobre todo
suspensión por servicio con motivo, aseo variable y estratificación estructurada— tocan **cómo se
calcula la factura hoy**, no solo qué procesos administrativos existen alrededor de ella. Vale la
pena confirmar con el usuario cuáles de estos ACBUM factura realmente distinto (aseo variable,
inquilinatos, hogares comunitarios) antes de asumir que el modelo actual de Fluvi ya cubre esos
casos correctamente.

## 12. Códigos catastrales: NPN de 30 dígitos vs. ficha catastral más corta

**Dónde:** `Predios → Códigos IGAC`, cargando un predio real e inspeccionando los campos por
DOM (sin exponer datos personales): `NPN` contenía un valor de **exactamente 30 dígitos**
(`maxlength=60` en el input, pero el dato real ocupa 30), y `Ficha catastral` contenía un valor de
**18 dígitos** (`maxlength=19`).

**Contraste con la normativa (IGAC):** el Número Predial Nacional (NPN) es el identificador
catastral único y obligatorio en Colombia desde que el IGAC lo adoptó el 1 de enero de 2014,
compuesto por **30 dígitos** que codifican departamento, municipio, tipo de avalúo, sector,
localidad/circuito, manzana o vereda, predio (u origen en propiedad horizontal), condición de
propiedad y número de construcción — reemplazó al código catastral anterior, que en la mayoría de
municipios tenía **20 dígitos**. La "Ficha catastral" de 18-19 dígitos que usa Integrasoft para
este predio es, entonces, un código catastral local/histórico anterior a la unificación del NPN,
no el número de 20 dígitos "clásico" en sí — cada municipio tuvo su propia variante antes de 2014.

**Por qué importa para Fluvi:** el schema actual (`backend/prisma/schema.prisma:54-58`) guarda
`zonaIgac`, `sectorIgac`, `manzanaVeredaIgac`, `numeroPredioIgac` como texto libre corto, **sin un
campo para el NPN completo de 30 dígitos** ni validación de longitud/formato. El reporte SUI
Formato 279 (que Fluvi ya genera, ver `279.csv`) pide justamente estos códigos catastrales, y un
NPN mal capturado (longitud incorrecta, dígitos mezclados) es un motivo común de rechazo o
inconsistencia en reportes SUI. Vale la pena:

1. Agregar un campo `numeroPredialNacional` (NPN) de 30 dígitos con validación de longitud exacta.
2. Decidir si conservar los campos catastrales fragmentados actuales como *derivados* del NPN
   (zona/sector/manzana/predio ya están codificados dentro de sus posiciones) o mantenerlos aparte
   para compatibilidad con el histórico ya importado.

Fuentes: [El Nuevo Siglo — En vigor número predial nacional](https://www.elnuevosiglo.com.co/en-vigor-numero-predial-nacional),
[La Patria — "Número de 30 dígitos para identificar predios", IGAC](https://archivo.lapatria.com/manizales/numero-de-30-digitos-para-identificar-predios-dice-director-del-igac-en-caldas-53293),
[IGAC — organización documental de expedientes de ficha predial](https://www.igac.gov.co/sites/default/files/listadomaestro/p20900-03_17_v1_organdocumexpedfichapred_0.pdf).

## 13. Suspensión del servicio: parámetros de mora vs. debido proceso de la Ley 142

**Dónde:** `Parámetros → Parámetros generales → Otros datos`. Integrasoft parametriza todo el
proceso de corte por mora a nivel de empresa: `Cant. inicial meses corte servicio` = 2,
`Cant. fin meses corte servicio` = 2, `Cant. meses corte por acuerdo pago` = 0, `Valor mínimo para
corte` = 10,00, y una **marca de agua en la factura** ("AVISO DE SUSPENSIÓN", color configurable)
que actúa como aviso previo impreso en la propia factura. Además, `Procesos → Órdenes de trabajo`
genera la orden de corte física con una `Causal` y una `Fecha de corte` explícitas, y
`Procesos → PQR's` permite objetar antes de que se ejecute.

**Contraste con la Ley 142 de 1994:**

- **Art. 140** — la suspensión por mora solo procede tras **dos periodos de facturación cuando es
  bimestral, o tres cuando es mensual**, y exige el pleno respeto del debido proceso: el prestador
  debe expedir un acto administrativo o aviso previo que informe (i) la causal, (ii) qué recursos
  proceden, (iii) el plazo para interponerlos y (iv) ante qué autoridad. No puede suspenderse sin
  ese aviso previo.
- **Art. 141** — el **corte** definitivo (taponamiento/retiro de la acometida) y la terminación del
  contrato proceden solo tras incumplimientos **reincidentes** por varios periodos, un paso más
  allá de la simple suspensión temporal.

Como Fluvi lee lecturas y factura **mensualmente** (`Lectura.periodo`, único por mes), el mínimo
legal para poder suspender por primera vez es de **tres periodos de mora**, no dos — vale la pena
confirmar con ACBUM si el parámetro de "2" que tiene configurado Integrasoft ya incorpora algún
criterio adicional (p. ej. cuenta desde la segunda factura vencida en vez de la primera) antes de
asumir que ese número es el que hay que replicar tal cual en Fluvi.

**Por qué importa para Fluvi:** hoy Fluvi no tiene ningún campo de `Suscriptor` ni de
`PeriodoFacturacion` que module cuándo un predio puede pasar a estado "suspendido", ni un mecanismo
de aviso previo en la factura, ni una orden de trabajo con causal para dejar constancia del
debido proceso. Si ACBUM alguna vez corta el servicio de un suscriptor y este reclama ante la
Superservicios, la evidencia de que se cumplió el Art. 140 (aviso previo con los 4 elementos)
tendría que existir por fuera de Fluvi hoy.

Fuentes: [Ámbito Jurídico — Suspensión del servicio público domiciliario por incumplimiento o mora en el pago no opera de manera inmediata](https://www.ambitojuridico.com/noticias/general/suspension-del-servicio-publico-domiciliario-por-incumplimiento-o-mora-en-el-pago),
[Función Pública — Ley 142 de 1994, texto consolidado](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=2752).

## 14. CRA 825/2017 ya está bien reflejada; CRA 720/2015 en Integrasoft parece no encajar con el tamaño de ACBUM

**CRA 825 de 2017 (acueducto/alcantarillado) — confirmado, Fluvi ya lo modela bien.** Es la
metodología tarifaria para prestadores de **hasta 5.000 suscriptores urbanos** (y cualquier
prestador rural, sin importar el número) — el caso de ACBUM. Los componentes de costo (CMA/CMO/
CMI/CMT), los rangos de consumo básico/complementario/suntuario definidos según la altitud sobre
el nivel del mar, y los subsidios/contribuciones por estrato aprobados externamente ya están
correctamente reflejados en `Tarifa` y `TarifaEstrato` (`backend/prisma/schema.prisma:591-640`), y
el comentario del propio schema ya cita la resolución correcta. No hay brecha aquí.

**CRA 720 de 2015 (aseo) — posible desajuste a verificar.** Esta resolución aplica solo a
prestadores de aseo que atienden **municipios de MÁS de 5.000 suscriptores**. Los prestadores de
municipios de **hasta 5.000 suscriptores** (y "esquemas de prestación regional"/"zonas de difícil
acceso") deben usar la **Resolución CRA 853 de 2018** (modificada/aclarada por las resoluciones CRA
883, 892 y 901 de 2019, compiladas luego en la CRA 943 de 2021) — un marco distinto, con
segmentación propia por tamaño de mercado.

En `Parámetros → Parámetros generales → Datos generales` de Integrasoft, el campo **"Metodología
aplicada" (aseo) está configurado como "Resolución CRA 720 de 2015"**. El README de Fluvi reporta
~4.308 suscriptores totales — por debajo del umbral de 5.000. Si el número de suscriptores de
**aseo** específicamente (puede no ser idéntico al de acueducto si no todos tienen aseo contratado)
también está por debajo de 5.000, la metodología correcta para ACBUM sería la CRA 853/2018, no la
720/2015 que tiene configurada Integrasoft.

**Esto no es necesariamente un error** — puede que ACBUM esté clasificado bajo un esquema distinto
ante el SUI, o que el campo en Integrasoft no se haya actualizado tras un cambio de metodología.
Pero es una discrepancia concreta y verificable que vale la pena confirmar con quien lleva la
parte tarifaria de ACBUM **antes** de decidir qué metodología de aseo modelar en Fluvi — construir
sobre la 720/2015 sin confirmar podría heredar un error de configuración en vez de corregirlo.

Fuentes: [CRA — ¿Cuáles son las resoluciones que contienen las metodologías tarifarias para el servicio público de aseo?](https://www.cra.gov.co/atencion-servicios-ciudadania/preguntas-frecuentes/cuales-son-las-resoluciones-contienen-las-metodologias-tarifarias-servicio-publico-aseo),
[CRA — Metodología tarifaria aplicable a prestadores con más de 5.000 suscriptores (Resolución CRA 720 de 2015)](https://normas.cra.gov.co/gestor/aseo_cto_metodologia_tarifaria_aplicable_a_prestadores_mas_5000_suscriptores_resolucion_cra_720_2015.html),
[CRA — Guía metodología tarifaria de aseo en municipios de hasta 5.000 suscriptores, Resolución CRA 853 de 2018](https://www.cra.gov.co/guia-aplicacion-metodologia-tarifaria-del-servicio-publico-aseo-municipios-hasta-5000-suscriptores-2),
[CRA — Metodología tarifaria para prestadores hasta con 5.000 suscriptores, acueducto/alcantarillado (Resolución CRA 825 de 2017)](https://normas.cra.gov.co/gestor/acue_cto_metodologia_tarifaria_para_prestadores_hasta_5000_suscriptores_area_urbana_area_rural_resolucion_cra_825_2017.html).

## Siguiente paso sugerido

Los hallazgos #1 (checklist de verificación) y #2 (cartera vencida) son los de menor esfuerzo y
mayor beneficio inmediato — ninguno requiere un modelo de datos nuevo grande ni cambia el flujo
de facturación existente. #3, #4 y #5 (notas, acuerdos de pago, PQR's) sí requieren tablas nuevas
y decisiones de producto (¿se necesita todo el detalle que tiene Integrasoft, o una versión más
simple basta?) — buenos candidatos para pasar por `/grill-with-docs` antes de tocar código.
