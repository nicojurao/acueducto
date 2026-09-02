# Fluvi

Sistema de gestión operativa, ambiental y de facturación del Acueducto Comunitario Barrios Unidos de Mocoa (ACBUM). Reemplaza el manejo manual en Excel de suscriptores, medidores, lecturas y cobros.

## Language

### Suscriptores y predios

**Suscriptor**:
El predio/punto de servicio (dirección, barrio, estrato, número catastral). No es la persona — los datos personales viven en `Tercero`.
_Avoid_: Cliente, usuario, predio (usar Suscriptor salvo cuando se habla explícitamente de la ubicación física)

**Tercero**:
La persona natural o jurídica titular de uno o más suscriptores; guarda documento, nombre, contacto. Un tercero con varios predios tiene varios suscriptores.
_Avoid_: Titular, cliente, propietario

**Cotitular**:
Un suscriptor adicional que comparte un mismo medidor con el suscriptor principal; el consumo medido se reparte por igual entre ambos.
_Avoid_: Copropietario, segundo titular

**Estado de facturación del suscriptor** (`Suscriptor.estadoFacturacion`):
Dónde está el predio en el ciclo de vida de facturación: `sin_medidor`, `instalado_prueba`, `facturando`, `inactivo`.
_Avoid_: "estado" a secas — hay cinco "estado" distintos en el dominio, ver abajo

**Estado del predio** (`Suscriptor.estadoPredio`):
Si el predio sigue habitado/activo (`activo`) o es un lote baldío/demolido (`inactivo`); un predio inactivo no puede tener medidor asignado.
_Avoid_: "estado" a secas

### Medidores y lecturas

**Medidor**:
El instrumento físico de medición asignado a un suscriptor, con marca/modelo/diámetro y lote de fábrica.
_Avoid_: Contador

**Ciclo de vida del medidor** (`Medidor.estado`):
Ubicación operativa del medidor: `en_bodega` (sin instalar) o `instalado`. Independiente de su condición física.
_Avoid_: "estado" a secas

**Condición del medidor** (`Medidor.condicion`):
Estado físico del medidor: `bueno` o `danado`. No indica si está instalado.
_Avoid_: Estado del medidor

**Lote**:
Rango de seriales consecutivos de medidores que llegaron en una misma caja de fábrica.
_Avoid_: Caja, remesa

**Acta de instalación**:
Documento con fotos de evidencia y firma que registra la instalación (o retiro) de un medidor en un suscriptor.
_Avoid_: Acta de calibración (término distinto, ver README)

**Lectura**:
Registro mensual de consumo de un medidor, con foto obligatoria y GPS; única por `[medidor, periodo]`.
_Avoid_: Toma, medición

**Novedad de lectura**:
Registro de la imposibilidad de tomar la lectura real de un medidor en un periodo dado; se borra automáticamente cuando se captura la lectura real.
_Avoid_: Lectura fallida

### Aforos

**Punto de aforo**:
Fuente o bocatoma donde se mide el caudal, independiente de los medidores de suscriptor.
_Avoid_: Fuente (usar Punto de aforo cuando se refiera al catálogo)

**Aforo**:
Medición de caudal en un punto de aforo, por método volumétrico (volumen/tiempo) o de flotador (velocidad × área de sección).
_Avoid_: Medición de caudal

### Inventario general

**Ítem de inventario**:
Herramienta, equipo o insumo de la operación (distinto del inventario de Medidores). Cubre tanto insumos apilables (cantidad alta, nunca se prestan) como equipos individuales prestables.
_Avoid_: Activo, artículo

**Condición del ítem** (`ItemInventario.estado`):
Estado físico del ítem: `bueno`, `regular`, `dañado`, `de_baja`.
_Avoid_: "estado" a secas

**Préstamo de inventario**:
Asignación de un ítem individual a un responsable, con fecha de devolución (null = todavía prestado).
_Avoid_: Asignación

**Movimiento de inventario**:
Entrada o salida de stock de un ítem apilable (no ligada a un préstamo).
_Avoid_: Transacción de inventario

### Facturación

**Tarifa**:
Estructura de cobro vigente desde una fecha (CMA/CMO/CMI/CMT según Resolución CRA 825 de 2017), con rangos de consumo básico/complementario/suntuario y subsidios/contribuciones por estrato.
_Avoid_: Tarifario

**Periodo de facturación**:
El mes que se factura. Empieza `abierto` (admite lecturas y generación de facturas) y pasa a `cerrado` cuando se congelan sus facturas y lecturas.
_Avoid_: Ciclo, mes facturado

**Estado del periodo** (`PeriodoFacturacion.estado`):
`abierto` o `cerrado`; un periodo cerrado no admite anular facturas ni editar/crear/borrar lecturas de ese mes. Reabrir requiere permiso avanzado y queda registrado quién lo hizo.
_Avoid_: "estado" a secas

**Factura**:
El cobro de un periodo a un suscriptor, con numeración consecutiva atómica (secuencia de Postgres) y snapshots de estrato/estado de facturación al momento de emitirla (no cambian retroactivamente).
_Avoid_: Cuenta de cobro, recibo

**Estado de la factura** (`Factura.estado`):
Ciclo de vida del cobro: `pendiente`, `pagada`, `anulada`.
_Avoid_: "estado" a secas

**Facturación omitida**:
Registro explícito de un suscriptor que quedó fuera de la generación de un periodo (predio o suscriptor inactivo, sin servicios contratados), con motivo documentado.
_Avoid_: Suscriptor excluido

**Pago**:
Abono registrado contra una factura; una factura puede tener varios pagos parciales.
_Avoid_: Recaudo

### Usuarios y seguridad

**Usuario**:
Cuenta de acceso al sistema (empleado del acueducto), con rol y permisos. No confundir con Suscriptor ni Tercero.
_Avoid_: Cliente, suscriptor

**Rol / Permiso**:
Un Rol agrupa Permisos por módulo (`_ver` lectura, `_avanzado` crear/editar/eliminar/importar). La autorización es por permiso, no por rol fijo.
_Avoid_: Perfil (para Rol)
