import { useEffect, useRef, useState } from "react";
import { ScanLine, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { api, FacturaResumen } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { inputClass } from "../lib/ui";

const fmtPesos = (v: number | string) => `$${Number(v).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;

// El código de barras "código de factura" imprime el número plano (ver plantillas), pero el
// código GS1 lineal (el ancho, con el GLN debajo) trae el número de factura empacado dentro del
// AI (8020) junto con el GLN fijo (415) y el saldo (3900) — buscar ESE string completo contra
// número/NUID nunca iba a encontrar nada. Caso real reportado 2026-09-13, lector con prefijo AIM
// "]C1": "]C1415770950095427380203674739005250" → GLN(415)=7709500954273, referencia(8020)=36747,
// saldo(3900)=5250 → hay que buscar "36747", no el string entero.
function extraerNumeroDeEscaneo(textoCrudo: string): string {
  // El prefijo de 3 caracteres (ej. "]C1") identifica la simbología para el lector, no es dato.
  const texto = textoCrudo.replace(/^\][A-Za-z0-9]{2}/, "");
  const m = texto.match(/^415(\d{13})8020(.+)$/);
  if (!m) return textoCrudo.trim(); // no es un escaneo GS1 reconocible — se busca tal cual (número/NUID a mano)
  let referencia = m[2];
  // Entre AI de largo variable el separador real es un carácter de control (GS, 0x1D) — si el
  // lector viene configurado para transmitirlo, ahí termina la referencia. Si no (lector en modo
  // "Code128 plano", sin FNC1), se usa "3900" — el único AI que sigue — como límite de respaldo.
  const gs = referencia.indexOf("\x1d");
  if (gs !== -1) referencia = referencia.slice(0, gs);
  else {
    const i3900 = referencia.indexOf("3900");
    if (i3900 !== -1) referencia = referencia.slice(0, i3900);
  }
  return referencia || textoCrudo.trim();
}

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
  // Si la factura abierta está vencida Y el suscriptor ya tiene una más reciente pendiente, esa
  // más reciente queda acá — bloquea el cobro de la vencida y se ofrece pasar a esta en su lugar
  // (ver abrirFactura). Si está vencida pero es la más reciente (no hay ninguna después), no hay
  // a qué redirigir — es simplemente una mora normal, se puede cobrar igual.
  const [facturaVigente, setFacturaVigente] = useState<FacturaResumen | null>(null);
  const [valorPago, setValorPago] = useState("");
  const [medioPago, setMedioPago] = useState("efectivo");
  const [registrando, setRegistrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const valorRef = useRef<HTMLInputElement>(null);
  // Detecta un escaneo por la VELOCIDAD de tecleo (un lector escribe carácter por carácter en
  // pocos milisegundos, muchísimo más rápido que una persona) para buscar solo apenas termina —
  // no depende de que el lector esté configurado para mandar Enter al final, que no todos hacen.
  const ultimoTecleoEn = useRef(0);
  const pareceEscaneo = useRef(false);
  const autoBuscarTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (autoBuscarTimeout.current) clearTimeout(autoBuscarTimeout.current); }, []);

  // Vuelve a enfocar el cuadro de escaneo apenas se cierra el pago o no hay ninguna factura
  // abierta — así el cajero puede escanear la siguiente factura sin tocar el mouse ni el teclado.
  useEffect(() => {
    if (!factura) inputRef.current?.focus();
  }, [factura, resultados]);

  function limpiar() {
    if (autoBuscarTimeout.current) clearTimeout(autoBuscarTimeout.current);
    pareceEscaneo.current = false;
    setFactura(null);
    setFacturaVigente(null);
    setResultados(null);
    setCodigo("");
    setValorPago("");
    setMedioPago("efectivo");
  }

  async function abrirFactura(f: FacturaResumen) {
    if (autoBuscarTimeout.current) clearTimeout(autoBuscarTimeout.current);
    pareceEscaneo.current = false;
    setFactura(f);
    setFacturaVigente(null);
    setResultados(null);
    setValorPago(String(f.saldo));
    setCodigo("");
    setTimeout(() => valorRef.current?.focus(), 50);

    const vencida = f.estado === "pendiente" && !!f.fechaVencimiento && new Date(f.fechaVencimiento) < new Date();
    if (!vencida) return;
    try {
      // Ordenado por periodo desc (ver GET /facturas) — el primero es la pendiente más reciente
      // del suscriptor. Si es la misma factura que se acaba de abrir, no hay ninguna más nueva.
      const r = await api.facturacion.facturas.listPaginado(1, 1, { suscriptorId: f.suscriptorId, estado: "con_saldo" });
      const masReciente = r.data[0];
      if (masReciente && masReciente.id !== f.id && masReciente.periodo > f.periodo) {
        setFacturaVigente(masReciente);
      }
    } catch {
      // si esta verificación falla, no bloquea el flujo normal de cobro de "f" — solo no se
      // alcanza a avisar que hay una factura más reciente
    }
  }

  async function buscarTexto(textoCrudo: string) {
    const texto = extraerNumeroDeEscaneo(textoCrudo.trim());
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

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (autoBuscarTimeout.current) clearTimeout(autoBuscarTimeout.current);
    if (codigo.trim()) buscarTexto(codigo);
  }

  function onCambiarCodigo(valor: string) {
    const ahora = Date.now();
    const delta = ahora - ultimoTecleoEn.current;
    const crecio = valor.length - codigo.length;
    ultimoTecleoEn.current = ahora;
    if (valor.length <= 1) pareceEscaneo.current = false;
    // Dos formas de detectar un escaneo, según cómo lo entregue el lector: tecleo caracter por
    // caracter pero muchísimo más rápido que una persona (<30ms entre eventos), o el string
    // completo de una sola vez (algunos lectores/navegadores lo entregan así, como un pegado) —
    // ningún humano teclea 6+ caracteres nuevos en un solo evento.
    else if (crecio >= 6 || (crecio > 0 && delta < 30)) pareceEscaneo.current = true;
    setCodigo(valor);

    if (autoBuscarTimeout.current) clearTimeout(autoBuscarTimeout.current);
    if (pareceEscaneo.current) {
      // Pequeña pausa para dejar que el lector termine de "escribir" el resto del código antes de
      // buscar — si llega otro carácter antes de que se cumpla, este timeout se cancela y arranca
      // de nuevo (ver el clearTimeout de arriba).
      autoBuscarTimeout.current = setTimeout(() => buscarTexto(valor), 80);
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
              onChange={(e) => onCambiarCodigo(e.target.value)}
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

          {facturaVigente ? (
            // Esta factura venció Y el suscriptor ya tiene una más reciente pendiente — no se
            // cobra la vieja (el valor impreso ya no refleja lo que debe): se avisa acá mismo y
            // se pasa a la vigente, para que se le entregue esa al suscriptor.
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
              <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Esta factura está vencida
              </div>
              <p className="mb-3 text-xs text-red-700/90 dark:text-red-400/90">
                Venció el {new Date(factura.fechaVencimiento!).toLocaleDateString("es-CO")} y el suscriptor ya tiene
                la factura N° {facturaVigente.numero} (periodo {facturaVigente.periodo.slice(0, 7)}) pendiente por{" "}
                {fmtPesos(facturaVigente.saldo)}. Infórmale que está vencida y entrégale la nueva para que pague con
                ese valor.
              </p>
              <button
                onClick={() => abrirFactura(facturaVigente)}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
              >
                Ver factura vigente (N° {facturaVigente.numero})
              </button>
            </div>
          ) : puedePagar ? (
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
