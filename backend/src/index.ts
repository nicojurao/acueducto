// Debe importarse antes que cualquier router: parchea Express para que un error/rechazo dentro
// de un handler async llegue al middleware de errores de abajo en vez de quedar como una
// "unhandled promise rejection" que tumba TODO el proceso de Node (le pasó una vez a un endpoint
// de inventario: un error de Prisma sin capturar bajó el backend completo para todos los
// usuarios hasta el próximo restart manual). Sin esto, cada handler tendría que envolver su
// propio código en try/catch para no arriesgar la caída del servidor entero.
import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { suscriptoresRouter } from "./routes/suscriptores.js";
import { medidoresRouter } from "./routes/medidores.js";
import { lecturasRouter } from "./routes/lecturas.js";
import { reportesRouter } from "./routes/reportes.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { marcasRouter, modelosRouter, diametrosRouter, lotesRouter } from "./routes/catalogos.js";
import { actasRouter } from "./routes/actas.js";
import { authRouter } from "./routes/auth.js";
import { usuariosRouter } from "./routes/usuarios.js";
import { rolesRouter } from "./routes/roles.js";
import { barriosRouter } from "./routes/barrios.js";
import { estratosRouter } from "./routes/estratos.js";
import { puntosAforoRouter, aforosRouter } from "./routes/aforos.js";
import {
  itemsInventarioRouter,
  prestamosInventarioRouter,
  movimientosInventarioRouter,
  inventarioKpisRouter,
} from "./routes/inventario.js";
import {
  categoriasInventarioRouter,
  ubicacionesInventarioRouter,
  proveedoresInventarioRouter,
} from "./routes/catalogosInventario.js";
import { historialRouter } from "./routes/historial.js";
import { requireAuth, requireAuthQuery, requirePermiso } from "./middleware/auth.js";
import { leerArchivo } from "./lib/storage.js";

// Dominios desde los que se permite llamar a la API por CORS. Las llamadas normales de la app
// (navegador -> mismo origen -> Vite hace de proxy hacia este backend) no pasan por aquí, así
// que esto es solo una capa extra de defensa por si un token se filtrara y se intentara usar
// desde otro sitio. Configurable por env var para no tener que tocar código si cambia el dominio.
const origenesPermitidos = (
  process.env.CORS_ORIGINS ?? "https://operativo.acbum.com.co,http://localhost:5173"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const app = express();
// Detrás de cloudflared el request real llega vía proxy local: sin esto, express-rate-limit
// (y cualquier otra cosa que mire req.ip) vería siempre la IP del proxy en vez de la del
// cliente real, y terminaría limitando a todos los usuarios como si fueran uno solo.
app.set("trust proxy", 1);
// contentSecurityPolicy apagado a propósito: este servidor solo devuelve JSON/archivos, no
// páginas HTML (esas las sirve el frontend por separado) — un CSP acá no protege nada y solo
// puede romper la carga de imágenes/fuentes si algún día se ajusta mal.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: (origen, callback) => {
      // Sin header Origin (curl, apps móviles, requests server-a-server) o en la whitelist: ok.
      if (!origen || origenesPermitidos.includes(origen)) return callback(null, true);
      callback(new Error("Origen no permitido por CORS"));
    },
  })
);
app.use(express.json());
app.use(
  pinoHttp({
    logger,
    // El token de sesión no debe quedar en texto plano en los logs (se filtra al log
    // igual que a cualquier otro almacenamiento, y a diferencia de la contraseña ya sí
    // circula en cada request autenticado).
    redact: ["req.headers.authorization", "req.headers.cookie"],
    autoLogging: { ignore: (req) => req.url === "/api/health" },
  })
);

// Las fotos (actas, lecturas, novedades, perfil de usuario) viven en MinIO, no en disco.
// Requieren sesión igual que el resto de la app — como <img src>/<a href> no pueden mandar
// el header Authorization, requireAuthQuery también acepta el token por ?token= (ver
// frontend/src/api/client.ts, función urlFoto, que es la única forma correcta de armar estas URLs).
app.get("/uploads/*", requireAuthQuery, async (req, res) => {
  try {
    const { stream, size, contentType } = await leerArchivo(req.path);
    res.setHeader("Content-Type", contentType ?? "application/octet-stream");
    res.setHeader("Content-Length", String(size));
    // Sin esto, Cloudflare (delante de la app vía cloudflared) cachea la respuesta en su borde
    // por extensión de archivo (.jpg, .png) sin importar la autenticación, y la sirve tal cual
    // a cualquiera que tenga el link mientras dure la caché — exactamente lo que se quería
    // evitar al exigir el token. "private" además evita que un proxy intermedio la guarde.
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    stream.on("error", () => res.status(404).end());
    stream.pipe(res);
  } catch {
    res.status(404).json({ error: "Archivo no encontrado" });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);

// Todo lo demás requiere sesión. El acceso a cada módulo depende de los permisos
// del rol del usuario (ver backend/src/lib/permisos.ts y la pantalla de Roles).
app.use(requireAuth);

app.use("/api/suscriptores", suscriptoresRouter);
app.use("/api/barrios", requirePermiso("suscriptores_ver", "suscriptores_avanzado"), barriosRouter);
app.use("/api/estratos", requirePermiso("suscriptores_ver", "suscriptores_avanzado"), estratosRouter);
app.use("/api/medidores", requirePermiso("medidores_ver", "medidores_avanzado"), medidoresRouter);
app.use("/api/lecturas", requirePermiso("lecturas"), lecturasRouter);
app.use("/api/reportes", requirePermiso("reportes"), reportesRouter);
app.use("/api/dashboard", requirePermiso("dashboard"), dashboardRouter);
app.use("/api/marcas", requirePermiso("catalogos"), marcasRouter);
app.use("/api/modelos", requirePermiso("catalogos"), modelosRouter);
app.use("/api/diametros", requirePermiso("catalogos"), diametrosRouter);
app.use("/api/lotes", requirePermiso("catalogos"), lotesRouter);
app.use("/api/actas", requirePermiso("actas"), actasRouter);
app.use("/api/puntos-aforo", requirePermiso("aforos_ver", "aforos_avanzado"), puntosAforoRouter);
app.use("/api/aforos", requirePermiso("aforos_ver", "aforos_avanzado"), aforosRouter);
app.use("/api/inventario/items", requirePermiso("inventario_ver", "inventario_avanzado"), itemsInventarioRouter);
app.use("/api/inventario/prestamos", requirePermiso("inventario_ver", "inventario_avanzado"), prestamosInventarioRouter);
app.use("/api/inventario/movimientos", requirePermiso("inventario_ver", "inventario_avanzado"), movimientosInventarioRouter);
app.use("/api/inventario/kpis", requirePermiso("inventario_ver", "inventario_avanzado"), inventarioKpisRouter);
app.use("/api/inventario/categorias", requirePermiso("inventario_ver", "inventario_avanzado"), categoriasInventarioRouter);
app.use("/api/inventario/ubicaciones", requirePermiso("inventario_ver", "inventario_avanzado"), ubicacionesInventarioRouter);
app.use("/api/inventario/proveedores", requirePermiso("inventario_ver", "inventario_avanzado"), proveedoresInventarioRouter);
app.use("/api/usuarios", requirePermiso("usuarios"), usuariosRouter);
app.use("/api/roles", requirePermiso("roles"), rolesRouter);
app.use("/api/historial", requirePermiso("historial"), historialRouter);

// Red de seguridad final: cualquier error que llegue hasta acá (gracias a "express-async-errors")
// se responde como 500 en vez de dejar caer el proceso completo. Debe ir después de todas las
// rutas — Express identifica el middleware de errores por tener 4 argumentos.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  (req.log ?? logger).error({ err }, "Error no capturado en un handler de ruta");
  if (res.headersSent) return;
  res.status(500).json({ error: "Error interno del servidor" });
});

// Respaldo adicional para lo que quede fuera del ciclo de request de Express (ej. una promesa
// suelta en un setInterval/callback). Solo loguea — no intenta seguir "como si nada" porque el
// estado del proceso podría haber quedado inconsistente, pero al menos no lo tumba en caliente.
process.on("unhandledRejection", (err) => logger.error({ err }, "unhandledRejection"));
process.on("uncaughtException", (err) => logger.error({ err }, "uncaughtException"));

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
  logger.info(`Backend escuchando en puerto ${port}`);
});
