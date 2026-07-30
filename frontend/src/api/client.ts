// El objeto `api` (y todos sus tipos) vivían en este único archivo de ~1400 líneas — se partió
// en frontend/src/api/core.ts (los primitivos de fetch: request/requestMultipart/descargarArchivo/
// token/urlFoto) y frontend/src/api/domains/*.ts (uno por dominio: auth, comercial, inventario,
// administración). Este archivo queda como fachada: re-exporta todo tal cual estaba antes, así que
// ningún componente que hace `import { api, Suscriptor, ... } from "../api/client"` tiene que
// cambiar una sola línea.
export * from "./core.js";
export * from "./domains/auth.js";
export * from "./domains/administracion.js";
export * from "./domains/comercial.js";
export * from "./domains/facturacion.js";
export * from "./domains/inventario.js";

import { authApi } from "./domains/auth.js";
import { usuariosApi, rolesApi, historialApi, auditoriaApi, adminApi } from "./domains/administracion.js";
import {
  tercerosApi,
  suscriptoresApi,
  barriosApi,
  estratosApi,
  medidoresApi,
  lotesApi,
  marcasApi,
  modelosApi,
  variantesApi,
  diametrosApi,
  actasApi,
  puntosAforoApi,
  aforosApi,
  lecturasApi,
  reportesApi,
  dashboardApi,
} from "./domains/comercial.js";
import { inventarioApi } from "./domains/inventario.js";
import { facturacionApi } from "./domains/facturacion.js";

export const api = {
  auth: authApi,
  usuarios: usuariosApi,
  roles: rolesApi,
  suscriptores: suscriptoresApi,
  barrios: barriosApi,
  estratos: estratosApi,
  medidores: medidoresApi,
  lotes: lotesApi,
  marcas: marcasApi,
  modelos: modelosApi,
  variantes: variantesApi,
  diametros: diametrosApi,
  actas: actasApi,
  historial: historialApi,
  auditoria: auditoriaApi,
  puntosAforo: puntosAforoApi,
  aforos: aforosApi,
  inventario: inventarioApi,
  lecturas: lecturasApi,
  reportes: reportesApi,
  admin: adminApi,
  dashboard: dashboardApi,
  facturacion: facturacionApi,
  terceros: tercerosApi,
};
