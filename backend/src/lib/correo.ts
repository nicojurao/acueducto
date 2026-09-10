import nodemailer from "nodemailer";
import { logger } from "./logger.js";
import { prisma } from "./prisma.js";
import { obtenerEmpresa } from "./empresaCache.js";

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// El transportador se arma en cada envío (no una sola vez al importar el módulo, como antes) —
// ahora el SMTP sale de Empresa (ver lib/empresaCache.ts), que puede cambiar en caliente desde el
// wizard o el panel de administración, sin reiniciar el backend. nodemailer.createTransport() es
// barato, no hay necesidad de cachear el objeto en sí.
async function enviar(
  destinatario: string,
  asunto: string,
  textoPlano: string,
  html: string,
  adjuntos?: { filename: string; content: Buffer }[]
) {
  const empresa = await obtenerEmpresa();
  if (!empresa.smtpHost || !empresa.smtpUser || !empresa.smtpPass) {
    logger.warn(`Correo SMTP no configurado (falta host/usuario/clave en Empresa) — no se envió "${asunto}" a ${destinatario}`);
    return;
  }
  const transportador = nodemailer.createTransport({
    host: empresa.smtpHost,
    port: empresa.smtpPort || 465,
    // 587 es STARTTLS (empieza sin cifrar y sube a TLS); cualquier otro puerto (465 típico de
    // cPanel/Zimbra) es TLS implícito desde la conexión.
    secure: empresa.smtpPort !== 587,
    auth: { user: empresa.smtpUser, pass: empresa.smtpPass },
  });
  await transportador.sendMail({
    from: empresa.smtpFrom || empresa.smtpUser,
    to: destinatario,
    subject: asunto,
    text: textoPlano,
    html,
    attachments: adjuntos,
  });
}

// Encabezados editables (panel de Parametrización, ver comercial/pqrs.ts), uno por cada momento
// en que el ciudadano recibe un correo — radicación, respuesta/aclaración del funcionario, y
// cierre (la respuesta final que cuenta para el reporte SUI) — así el staff les puede dar un tono
// institucional consistente sin que cada funcionario lo escriba a mano, y sin desplegar código
// para ajustarlo.
type TipoEncabezado = "encabezadoRadicacion" | "encabezadoRespuesta" | "encabezadoCierre";
async function obtenerEncabezado(tipo: TipoEncabezado): Promise<string> {
  const config = await prisma.pqrConfiguracion.findUnique({ where: { id: 1 } });
  return config?.[tipo]?.trim() ?? "";
}

interface PqrParaCorreo {
  numeroRadicado: string | null;
  email: string;
  nombre: string;
}

// "constanciaPdf" es opcional (el generarla puede fallar sin motivo para tumbar el correo) — si
// viene, se adjunta la misma constancia que se puede descargar desde /consultar, para que la
// persona ya tenga el radicado en PDF desde el primer correo sin tener que volver al sitio.
export async function enviarCorreoPqrCreada(pqr: PqrParaCorreo, constanciaPdf?: Buffer): Promise<void> {
  const empresa = await obtenerEmpresa();
  const radicado = pqr.numeroRadicado ?? "";
  const link = `https://${empresa.dominioPqrs}/consultar?q=${encodeURIComponent(radicado)}`;
  const nombre = escaparHtml(pqr.nombre);
  const encabezado = await obtenerEncabezado("encabezadoRadicacion");
  await enviar(
    pqr.email,
    `Tu PQR ${radicado} fue radicada`,
    `Hola ${pqr.nombre},\n\n` +
      `Tu petición, queja, reclamo o sugerencia quedó radicada con el número ${radicado}.\n\n` +
      (encabezado ? `${encabezado}\n\n` : "") +
      (constanciaPdf ? `Adjunto encontrarás la constancia de radicación en PDF.\n\n` : "") +
      `Puedes ver el estado de tu caso en cualquier momento desde este enlace:\n${link}\n\n` +
      `${empresa.nombre}`,
    `<p>Hola ${nombre},</p>` +
      `<p>Tu petición, queja, reclamo o sugerencia quedó radicada con el número <strong>${radicado}</strong>.</p>` +
      (encabezado ? `<p>${escaparHtml(encabezado).replace(/\n/g, "<br>")}</p>` : "") +
      (constanciaPdf ? `<p>Adjunto encontrarás la constancia de radicación en PDF.</p>` : "") +
      `<p>Puedes ver el estado de tu caso en cualquier momento desde este enlace:</p>` +
      `<p><a href="${link}">${link}</a></p>` +
      `<p>${escaparHtml(empresa.nombre)}</p>`,
    constanciaPdf ? [{ filename: `${radicado || "constancia"}.pdf`, content: constanciaPdf }] : undefined
  );
}

export async function enviarCorreoPqrRespondida(pqr: PqrParaCorreo & { respuesta: string | null }): Promise<void> {
  const empresa = await obtenerEmpresa();
  const radicado = pqr.numeroRadicado ?? "";
  const link = `https://${empresa.dominioPqrs}/consultar?q=${encodeURIComponent(radicado)}`;
  const nombre = escaparHtml(pqr.nombre);
  const respuesta = pqr.respuesta ?? "";
  const encabezado = await obtenerEncabezado("encabezadoCierre");
  await enviar(
    pqr.email,
    `Tu PQR ${radicado} fue respondida`,
    `Hola ${pqr.nombre},\n\n` +
      `Tu caso ${radicado} ya tiene una respuesta.\n\n` +
      (encabezado ? `${encabezado}\n\n` : "") +
      `${respuesta}\n\n` +
      `También puedes verla en cualquier momento desde este enlace:\n${link}\n\n` +
      `${empresa.nombre}`,
    `<p>Hola ${nombre},</p>` +
      `<p>Tu caso <strong>${radicado}</strong> ya tiene una respuesta.</p>` +
      (encabezado ? `<p>${escaparHtml(encabezado).replace(/\n/g, "<br>")}</p>` : "") +
      `<blockquote>${escaparHtml(respuesta).replace(/\n/g, "<br>")}</blockquote>` +
      `<p>También puedes verla en cualquier momento desde este enlace:</p>` +
      `<p><a href="${link}">${link}</a></p>` +
      `<p>${escaparHtml(empresa.nombre)}</p>`
  );
}

// Cuando el funcionario deja un mensaje que NO es la respuesta final (ej. pide una aclaración) —
// distinto del correo de "ya fue respondida", porque el caso sigue abierto y lo que se espera es
// que el ciudadano vuelva a escribir, no que dé por cerrado su caso.
export async function enviarCorreoPqrMensaje(pqr: PqrParaCorreo & { mensaje: string }): Promise<void> {
  const empresa = await obtenerEmpresa();
  const radicado = pqr.numeroRadicado ?? "";
  const link = `https://${empresa.dominioPqrs}/consultar?q=${encodeURIComponent(radicado)}`;
  const nombre = escaparHtml(pqr.nombre);
  const encabezado = await obtenerEncabezado("encabezadoRespuesta");
  await enviar(
    pqr.email,
    `Tienes una actualización en tu PQR ${radicado}`,
    `Hola ${pqr.nombre},\n\n` +
      `El acueducto te dejó un mensaje sobre tu caso ${radicado}.\n\n` +
      (encabezado ? `${encabezado}\n\n` : "") +
      `${pqr.mensaje}\n\n` +
      `Puedes verlo y responder desde este enlace:\n${link}\n\n` +
      `${empresa.nombre}`,
    `<p>Hola ${nombre},</p>` +
      `<p>El acueducto te dejó un mensaje sobre tu caso <strong>${radicado}</strong>.</p>` +
      (encabezado ? `<p>${escaparHtml(encabezado).replace(/\n/g, "<br>")}</p>` : "") +
      `<blockquote>${escaparHtml(pqr.mensaje).replace(/\n/g, "<br>")}</blockquote>` +
      `<p>Puedes verlo y responder desde este enlace:</p>` +
      `<p><a href="${link}">${link}</a></p>` +
      `<p>${escaparHtml(empresa.nombre)}</p>`
  );
}

// Aviso interno (a la misma cuenta que envía los correos) cuando el ciudadano responde algo — no
// hay lista de distribución de "personal" configurada, así que este es el único canal disponible
// hoy para que el equipo se entere sin tener que estar revisando el panel a cada rato.
export async function enviarCorreoPqrMensajeCiudadano(pqr: PqrParaCorreo & { mensaje: string }): Promise<void> {
  const empresa = await obtenerEmpresa();
  if (!empresa.smtpUser) return;
  const radicado = pqr.numeroRadicado ?? "";
  await enviar(
    empresa.smtpUser,
    `${pqr.nombre} respondió en la PQR ${radicado}`,
    `${pqr.nombre} (${pqr.email}) dejó un mensaje nuevo en la PQR ${radicado}:\n\n${pqr.mensaje}\n\n` +
      `Revísalo desde el panel de PQRS en Fluvi.`,
    `<p><strong>${escaparHtml(pqr.nombre)}</strong> (${escaparHtml(pqr.email)}) dejó un mensaje nuevo en la PQR <strong>${radicado}</strong>:</p>` +
      `<blockquote>${escaparHtml(pqr.mensaje).replace(/\n/g, "<br>")}</blockquote>` +
      `<p>Revísalo desde el panel de PQRS en Fluvi.</p>`
  );
}
