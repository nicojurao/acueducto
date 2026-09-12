// Catálogo fijo de permisos por módulo. Cada rol tiene acceso completo o nulo a cada uno
// (sin granularidad por acción). Si se agrega un módulo nuevo a la app, se agrega aquí y
// se corre una migración que lo inserte en la tabla Permiso.
export const PERMISOS = [
  { clave: "suscriptores_ver", nombre: "Suscriptores", descripcion: "Ver el listado y la ficha de suscriptores" },
  {
    clave: "suscriptores_avanzado",
    nombre: "Suscriptores (avanzado)",
    descripcion: "Editar, importar, exportar y eliminar suscriptores",
  },
  {
    clave: "suscriptores_estado_facturacion",
    nombre: "Suscriptores (estado de facturación)",
    descripcion: "Cambiar el estado de facturación de un suscriptor, sin poder editar el resto de sus datos",
  },
  { clave: "medidores_ver", nombre: "Medidores", descripcion: "Ver el inventario y catálogo de medidores" },
  {
    clave: "medidores_avanzado",
    nombre: "Medidores (avanzado)",
    descripcion: "Crear, editar, eliminar e importar/exportar medidores",
  },
  { clave: "lecturas", nombre: "Lecturas", descripcion: "Captura y edición de lecturas mensuales" },
  {
    clave: "lecturas_importar",
    nombre: "Lecturas (importar Excel)",
    descripcion: "Cargar lecturas masivamente desde un Excel (NUID + Lectura) para un periodo",
  },
  {
    clave: "lecturas_sin_foto",
    nombre: "Lecturas (guardar sin foto)",
    descripcion: "Guardar una lectura sin foto del medidor, siempre que se escriba una observación",
  },
  { clave: "actas_ver", nombre: "Actas de instalación", descripcion: "Ver el historial de actas de instalación" },
  {
    clave: "actas_avanzado",
    nombre: "Actas de instalación (avanzado)",
    descripcion: "Crear, editar, generar PDF y borrar actas de instalación",
  },
  {
    clave: "aforos_ver",
    nombre: "Aforos",
    descripcion: "Ver puntos de aforo y el historial de registros de caudal",
  },
  {
    clave: "aforos_avanzado",
    nombre: "Aforos (avanzado)",
    descripcion: "Crear, editar y eliminar puntos de aforo y registros de caudal",
  },
  {
    clave: "inventario_ver",
    nombre: "Inventario general",
    descripcion: "Ver ítems, préstamos, movimientos y catálogos del inventario general",
  },
  {
    clave: "inventario_avanzado",
    nombre: "Inventario general (avanzado)",
    descripcion: "Crear, editar y eliminar ítems, préstamos, movimientos y catálogos del inventario general",
  },
  { clave: "facturacion_ver", nombre: "Facturación", descripcion: "Ver facturas, tarifas y cartera" },
  {
    clave: "facturacion_avanzado",
    nombre: "Facturación (avanzado)",
    descripcion: "Generar facturación, editar tarifas, anular facturas y agregar conceptos",
  },
  {
    clave: "pagos_registrar",
    nombre: "Pagos (registrar)",
    descripcion: "Registrar pagos y abonos de facturas en oficina",
  },
  { clave: "pqrs_ver", nombre: "PQRS", descripcion: "Ver las PQR radicadas por el público y su detalle" },
  {
    clave: "pqrs_avanzado",
    nombre: "PQRS (avanzado)",
    descripcion: "Cambiar el estado de una PQR y registrar una respuesta",
  },
  { clave: "catalogos", nombre: "Catálogos", descripcion: "Marcas, modelos y diámetros de medidores" },
  { clave: "dashboard", nombre: "Dashboard", descripcion: "KPIs, gráficas y consumos atípicos" },
  { clave: "reportes", nombre: "Reportes", descripcion: "Reportes de consumo y facturación" },
  { clave: "mapa", nombre: "Mapa", descripcion: "Ubicación de predios en el mapa" },
  { clave: "usuarios", nombre: "Usuarios", descripcion: "Crear, editar y eliminar usuarios" },
  { clave: "roles", nombre: "Roles y permisos", descripcion: "Crear roles y asignarles permisos" },
  {
    clave: "historial",
    nombre: "Historial de cambios",
    descripcion: "Ver el historial de cambios de medidores y suscriptores",
  },
  {
    clave: "auditoria",
    nombre: "Auditoría de sesiones",
    descripcion: "Ver los inicios de sesión (IP, ubicación, dispositivo) y los cambios hechos en cada una",
  },
  {
    clave: "admin_panel",
    nombre: "Panel de administración",
    descripcion: "Tamaño de la base de datos y de MinIO en el tiempo, backups descargables, y acceso a Usuarios y Auditoría",
  },
  {
    clave: "documentos_sgc_ver",
    nombre: "Documentos SGC",
    descripcion: "Ver el catálogo de documentos del SGC y el historial de versiones de cada uno",
  },
  {
    clave: "documentos_sgc_avanzado",
    nombre: "Documentos SGC (avanzado)",
    descripcion: "Crear documentos, subir nuevas versiones y cambiar su estado (vigente/obsoleto/en revisión)",
  },
  {
    clave: "contabilidad_ver",
    nombre: "Contabilidad",
    descripcion: "Ver el PUC, comprobantes, libros y estados financieros",
  },
  {
    clave: "contabilidad_avanzado",
    nombre: "Contabilidad (avanzado)",
    descripcion: "Editar el PUC, registrar gastos, anular comprobantes y emitir facturación electrónica DIAN",
  },
  {
    clave: "suspensiones_ver",
    nombre: "Suspensión del servicio",
    descripcion: "Ver los avisos y suspensiones del servicio por mora o mutuo acuerdo",
  },
  {
    clave: "suspensiones_avanzado",
    nombre: "Suspensión del servicio (avanzado)",
    descripcion: "Crear avisos, aprobar/ejecutar/reactivar suspensiones del servicio",
  },
] as const;

export type ClavePermiso = (typeof PERMISOS)[number]["clave"];
