import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Cubre todo lo que no sea /api/auth/login (que ya tiene su propio límite más estricto en
// auth.ts). Va después de requireAuth, así que req.usuario siempre está presente — se limita
// por usuario, no por IP: en una oficina o red compartida, varios fontaneros detrás de la misma
// IP no deben competir por el mismo cupo, y limitar por usuario además frena mejor un token
// filtrado que se usa desde un script en loop.
//
// La ventana es generosa a propósito: la cola offline sincroniza cada 30s por usuario, y
// pantallas como Inicio/Dashboard disparan varias peticiones GET en paralelo al cargar. El
// objetivo es frenar un loop descontrolado o un scraping masivo, no el uso normal de la app.
export const limiteApi = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.usuario ? `usuario:${req.usuario.id}` : ipKeyGenerator(req.ip!)),
  message: { error: "Demasiadas solicitudes. Espera un momento e intenta de nuevo." },
});
