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
] as const;

export type ClavePermiso = (typeof PERMISOS)[number]["clave"];
