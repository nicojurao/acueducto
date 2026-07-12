import { beforeEach, describe, expect, it } from "vitest";
import { getToken, setToken, urlFoto } from "./client";

describe("token de sesión", () => {
  beforeEach(() => setToken(null));

  it("empieza en null y persiste en localStorage al guardarlo", () => {
    expect(getToken()).toBeNull();
    setToken("abc123");
    expect(getToken()).toBe("abc123");
    expect(localStorage.getItem("medidores_token")).toBe("abc123");
  });

  it("setToken(null) lo borra", () => {
    setToken("abc123");
    setToken(null);
    expect(getToken()).toBeNull();
  });
});

describe("urlFoto", () => {
  beforeEach(() => setToken(null));

  it("devuelve cadena vacía si no hay ruta", () => {
    expect(urlFoto(null)).toBe("");
    expect(urlFoto(undefined)).toBe("");
  });

  it("agrega el token de sesión como query param cuando existe", () => {
    setToken("mi-token");
    expect(urlFoto("/uploads/foto.jpg")).toBe("/uploads/foto.jpg?token=mi-token");
  });

  it("sin token de sesión devuelve la ruta tal cual", () => {
    expect(urlFoto("/uploads/foto.jpg")).toBe("/uploads/foto.jpg");
  });
});
