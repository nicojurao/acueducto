import { describe, expect, it } from "vitest";
import { camposMedidor, camposSuscriptor } from "./historial.js";

describe("camposMedidor", () => {
  it("resuelve nombres de catálogo en vez de dejar los IDs crudos", () => {
    const campos = camposMedidor({
      serial: "12345",
      marcaCat: { nombre: "Elster" },
      modeloCat: { nombre: "V200" },
      diametroCat: { valor: '1/2"' },
      lote: { serialInicial: "100", serialFinal: "200" },
      fechaInstalacion: null,
      fechaFabricacion: null,
      fechaCertificacion: null,
      clase: null,
      certificado: null,
      lecturaInicial: null,
      activo: true,
      condicion: "bueno",
      estado: "instalado",
    });

    expect(campos.Marca).toBe("Elster");
    expect(campos.Lote).toBe("100-200");
    expect(campos["Condición"]).toBe("Bueno");
    expect(campos.Estado).toBe("Instalado");
  });

  it("deja null los catálogos no asignados en vez de reventar", () => {
    const campos = camposMedidor({
      serial: null,
      marcaCat: null,
      modeloCat: null,
      diametroCat: null,
      lote: null,
      fechaInstalacion: null,
      fechaFabricacion: null,
      fechaCertificacion: null,
      clase: null,
      certificado: null,
      lecturaInicial: null,
      activo: false,
      condicion: "danado",
      estado: "en_bodega",
    });

    expect(campos.Marca).toBeNull();
    expect(campos.Lote).toBeNull();
    expect(campos["Condición"]).toBe("Dañado");
    expect(campos.Estado).toBe("En bodega");
  });
});

describe("camposSuscriptor", () => {
  it("combina código y etiqueta del estrato en un solo texto legible", () => {
    const campos = camposSuscriptor({
      nombre: "Juan Pérez",
      codigo: "123",
      ruta: null,
      identificacion: null,
      barrioCat: { nombre: "Centro" },
      direccion: null,
      direccionComercial: null,
      estratoCat: { codigo: "2", etiqueta: "Bajo" },
      estadoFacturacion: "facturando",
      estadoPredio: "activo",
    });

    expect(campos.Estrato).toBe("2 — Bajo");
    expect(campos.Barrio).toBe("Centro");
    expect(campos["Estado de facturación"]).toBe("Facturando por medición");
  });
});
