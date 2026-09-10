// Catálogo del reporte mensual de PQR al SUI (Superservicios) — Resolución SSPD 20151300054575
// de 2015 (Anexo A, "Formato A"), modificada por la Resolución SSPD 20188000076635 de 2018 (que
// eliminó el grupo de causal "Instalación" y lo fusionó dentro de "Prestación").
//
// El detalle de causal (código de 3 dígitos + texto) YA NO vive fijo acá: es el modelo PqrCausal
// (editable desde el panel de Parametrización, ver comercial/pqrs.ts rutas /causales), sembrado
// originalmente con los códigos donde el Anexo marca "1" en la columna Acueducto — un acueducto
// que solo presta ese servicio (no alcantarillado, aseo, energía ni gas) no necesita el resto de
// causales del Anexo (ej. "recolección puerta a puerta"); si un despliegue sí presta otros
// servicios, puede agregar sus causales desde ese mismo panel. Lo que sigue acá son las
// taxonomías fijas del Anexo que no tiene sentido volver editables (grupo, tipo de trámite, tipo
// de respuesta, tipo de notificación) — esas sí son iguales para cualquier prestador en Colombia.
//
// El código DANE (departamento-municipio-centro poblado) también lo pide el reporte, pero es fijo
// para toda la entidad y no varía por PQR — vive en lib/empresa.ts junto con el resto de datos
// propios de la entidad que opera este despliegue (ver EMPRESA.dane).

export type GrupoCausal = "F" | "P";

// "Grupo Causal" tal cual quedó tras la Resolución 76635 de 2018 (ya sin "Instalación").
export const GRUPOS_CAUSAL: Record<GrupoCausal, string> = {
  F: "Facturación",
  P: "Prestación",
};

// Único texto "amigable" que se le muestra al ciudadano en el primer paso del formulario público
// (antes de que, si quiere, baje al detalle exacto) — el resto de las etiquetas son las oficiales
// del Anexo, que ya son razonablemente claras.
export const GRUPOS_CAUSAL_CIUDADANO: Record<GrupoCausal, string> = {
  F: "Problema con mi factura o cobro",
  P: "Problema con el servicio de agua",
};

export const TIPOS_TRAMITE: Record<number, string> = {
  1: "Reclamación",
  2: "Queja",
  3: "Denuncia",
  4: "Recurso de Reposición",
  5: "Recurso de Reposición y Subsidiario de Apelación",
  6: "Solicitud de información o de copias de documentos",
};

export const TIPOS_RESPUESTA: Record<number, string> = {
  1: "Accede",
  2: "Accede parcialmente",
  3: "No accede",
  4: "Confirma",
  5: "Modifica",
  6: "Revoca",
  7: "Rechaza",
  8: "Traslada por competencia",
  9: "Pendiente de respuesta",
  10: "Sin respuesta",
  11: "Archiva",
};

export const TIPOS_NOTIFICACION: Record<number, string> = {
  1: "Notificación personal",
  2: "Notificación por edicto",
  3: "No aplica",
  4: "Notificación por aviso",
  5: "Notificación por conducta concluyente",
};
