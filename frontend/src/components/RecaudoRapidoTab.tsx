import { useEffect, useRef, useState } from "react";
import { ScanLine, X, CheckCircle2 } from "lucide-react";
import { api, FacturaResumen } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { inputClass } from "../lib/ui";

const fmtPesos = (v: number | string) => `$${Number(v).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;

// Recaudo rápido: para no tener que buscar la factura a mano en la lista y abrir su detalle solo
// para registrar un pago (lento cuando hay fila de gente esperando), acá hay un solo cuadro
// siempre enfocado donde se escanea el código de barras de la factura impresa (ver la pestaña
// Plantillas — el lector de barras "escribe" el número y manda Enter, igual que si se tecleara a
// mano) o se busca por NUID/número escribiendo directo — mismo cuadro sirve para ambas cosas.
export default function RecaudoRapidoTab() {
  const { usuario } = useAuth();
  const puedePagar =
    (usuario?.permisos?.includes("pagos_registrar") || usuario?.permisos?.includes("facturacion_avanzado")) ?? false;
  const { mostrar, mostrarError } = useToast();

  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<FacturaResumen[] | null>(null);
  const [factura, setFactura] = useState<FacturaResumen | null>(null);
  const [valorPago, setValorPago] = useState("");
  const [medioPago, setMedioPago] = useState("efectivo");
  const [registrando, setRegistrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const valorRef = useRef<HTMLInputElement>(null);

  // Vuelve a enfocar el cuadro de escaneo apenas se cierra el pago o no hay ninguna factura
  // abierta — así el cajero puede escanear la siguiente factura sin tocar el mouse ni el teclado.
  useEffect(() => {
    if (!factura) inputRef.current?.focus();
  }, [factura, resultados]);

  function limpiar() {
    setFactura(null);
    setResultados(null);
    setCodigo("");
    setValorPago("");
    setMedioPago("efectivo");
  }

  function abrirFactura(f: FacturaResumen) {
    setFactura(f);
    setResultados(null);
    setValorPago(String(f.saldo));
    setCodigo("");
    setTimeout(() => valorRef.current?.focus(), 50);
  }

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const texto = codigo.trim();
    if (!texto) return;
    setBuscando(true);
    try {
      const r = await api.facturacion.facturas.listPaginado(1, 20, { q: texto, estado: "con_saldo" });
      if (r.data.length === 1) abrirFactura(r.data[0]);
      else setResultados(r.data);
    } catch (err) {
      mostrarError(err, "no se pudo buscar la factura");
    } finally {
      setBuscando(false);
    }
  }

  async function registrarPago(e: React.FormEvent) {
    e.preventDefault();
    if (!factura || !valorPago || Number(valorPago) <= 0) return;
    setRegistrando(true);
    try {
      await api.facturacion.pagos.crear({ facturaId: factura.id, valor: Number(valorPago), medio: medioPago });
      mostrar(`Pago registrado — factura N° ${factura.numero} (${fmtPesos(valorPago)}).`, "exito");
      limpiar();
    } catch (err) {
      mostrarError(err, "no se pudo registrar el pago");
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      {!factura && (
        <form onSubmit={buscar} className="mb-4">
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
            <ScanLine className="h-4 w-4 text-brand-500" />
            Escanear o escribir N° de factura / NUID
          </label>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Esperando escaneo..."
              className={`${inputClass} flex-1 text-lg`}
            />
            <button
              type="submit"
              disabled={buscando || !codigo.trim()}
              className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
            >
              {buscando ? "Buscando..." : "Buscar"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
            Solo muestra facturas con saldo pendiente. El cuadro queda enfocado siempre para escanear seguido.
          </p>
        </form>
      )}

      {resultados !== null && !factura && (
        <div>
          {resultados.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
              No se encontró ninguna factura pendiente con ese número o NUID.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-brand-200 dark:border-slate-800">
              <p className="border-b border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                Varias facturas coinciden — elige cuál cobrar
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {resultados.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => abrirFactura(f)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <span>
                      N° {f.numero} · {f.suscriptor.nombre} · {f.periodo.slice(0, 7)}
                    </span>
                    <span className="font-medium">{fmtPesos(f.saldo)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {factura && (
        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Factura N° {factura.numero}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {factura.suscriptor.codigo} · {factura.suscriptor.nombre}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-500">
                Periodo {factura.periodo.slice(0, 7)} · {factura.suscriptor.barrioCat?.nombre ?? "Sin barrio"}
              </div>
            </div>
            <button onClick={limpiar} className="shrink-0 rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total</div>
              <div className="font-semibold">{fmtPesos(factura.total)}</div>
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
              <div className="text-xs text-amber-700 dark:text-amber-400">Saldo pendiente</div>
              <div className="font-semibold text-amber-700 dark:text-amber-400">{fmtPesos(factura.saldo)}</div>
            </div>
          </div>

          {puedePagar ? (
            <form onSubmit={registrarPago} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Valor a recibir
                <input
                  ref={valorRef}
                  type="number"
                  min={1}
                  max={factura.saldo}
                  value={valorPago}
                  onChange={(e) => setValorPago(e.target.value)}
                  className={`${inputClass} w-36`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Medio
                <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)} className={inputClass}>
                  <option value="efectivo">Efectivo</option>
                  <option value="consignacion">Consignación</option>
                  <option value="otro">Otro</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={registrando || !valorPago || Number(valorPago) <= 0}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {registrando ? "Registrando..." : "Registrar pago"}
              </button>
            </form>
          ) : (
            <p className="text-xs text-slate-600 dark:text-slate-400">No tienes permiso para registrar pagos.</p>
          )}
        </div>
      )}
    </div>
  );
}
