import { describe, expect, it } from "vitest";
import { PERMISOS } from "./permisos.js";

describe("PERMISOS", () => {
  it("no tiene claves duplicadas", () => {
    const claves = PERMISOS.map((p) => p.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("cada permiso tiene clave, nombre y descripción no vacíos", () => {
    for (const p of PERMISOS) {
      expect(p.clave.trim()).not.toBe("");
      expect(p.nombre.trim()).not.toBe("");
      expect(p.descripcion.trim()).not.toBe("");
    }
  });
});
