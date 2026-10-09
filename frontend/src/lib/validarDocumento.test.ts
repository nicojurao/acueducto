// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validarDocumento, contarPaginasPdf, MAX_PAGINAS_PDF } from "./validarDocumento";

const MB = 1024 * 1024;

function pdfConPaginas(n: number, relleno = 0): File {
  const paginas = Array.from({ length: n }, (_, i) => `${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n`).join("");
  const texto = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count ${n} >>\nendobj\n${paginas}%%EOF`;
  const partes: BlobPart[] = [texto];
  if (relleno > 0) partes.push(new Uint8Array(relleno));
  return new File(partes, "acta.pdf", { type: "application/pdf" });
}

describe("contarPaginasPdf", () => {
  it("cuenta /Type /Page sin confundirlo con /Type /Pages", () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 << /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page >>");
    expect(contarPaginasPdf(bytes)).toBe(2);
  });

  it("devuelve null si no encuentra marcadores (PDF con objetos comprimidos)", () => {
    expect(contarPaginasPdf(new TextEncoder().encode("%PDF-1.5 stream xyz endstream"))).toBeNull();
  });
});

describe("validarDocumento", () => {
  it("rechaza un archivo vacío", async () => {
    const r = await validarDocumento(new File([], "vacio.pdf", { type: "application/pdf" }));
    expect(r).toMatchObject({ ok: false });
  });

  it("rechaza tipos que no son PDF ni imagen", async () => {
    const r = await validarDocumento(new File(["x"], "programa.exe", { type: "application/x-msdownload" }));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.mensaje).toContain("no es un PDF ni una imagen");
  });

  it("rechaza el PDF de 48 MB sin necesidad de leerlo", async () => {
    const r = await validarDocumento(pdfConPaginas(57, 48 * MB));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.mensaje).toMatch(/pesa 48,\d MB y el máximo es 10 MB/);
  });

  it("rechaza un PDF liviano pero con demasiadas páginas (57)", async () => {
    const r = await validarDocumento(pdfConPaginas(57));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.mensaje).toContain("tiene 57 páginas");
  });

  it("acepta un PDF de 3 páginas y reporta el conteo", async () => {
    expect(await validarDocumento(pdfConPaginas(3))).toEqual({ ok: true, paginas: 3 });
  });

  it("acepta justo el máximo de páginas, rechaza una más", async () => {
    expect(await validarDocumento(pdfConPaginas(MAX_PAGINAS_PDF))).toMatchObject({ ok: true });
    expect(await validarDocumento(pdfConPaginas(MAX_PAGINAS_PDF + 1))).toMatchObject({ ok: false });
  });

  it("rechaza algo con extensión .pdf que no es un PDF", async () => {
    const r = await validarDocumento(new File(["esto no es un pdf"], "falso.pdf", { type: "application/pdf" }));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.mensaje).toContain("no es un PDF válido");
  });

  it("acepta un PDF sin marcadores legibles (no puede contar páginas)", async () => {
    const r = await validarDocumento(new File(["%PDF-1.5 stream xyz endstream"], "comprimido.pdf", { type: "application/pdf" }));
    expect(r).toEqual({ ok: true, paginas: null });
  });

  it("acepta una imagen normal y rechaza una de más de 10 MB", async () => {
    expect(await validarDocumento(new File([new Uint8Array(1 * MB)], "scan.jpg", { type: "image/jpeg" }))).toEqual({ ok: true, paginas: null });
    expect(await validarDocumento(new File([new Uint8Array(12 * MB)], "scan.jpg", { type: "image/jpeg" }))).toMatchObject({ ok: false });
  });
});
