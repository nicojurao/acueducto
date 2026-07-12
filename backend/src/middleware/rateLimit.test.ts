import { describe, expect, it } from "vitest";

describe("limiteApi", () => {
  it("se construye sin lanzar ERR_ERL_KEY_GEN_IPV6 (keyGenerator debe envolver req.ip con ipKeyGenerator)", async () => {
    // express-rate-limit valida el keyGenerator apenas se llama rateLimit(...) — si alguien
    // vuelve a usar req.ip crudo en vez de ipKeyGenerator(req.ip), el import de este módulo
    // revienta el proceso completo al arrancar (pasó una vez, ver commit de rate limiting).
    await expect(import("./rateLimit.js")).resolves.toHaveProperty("limiteApi");
  });
});
