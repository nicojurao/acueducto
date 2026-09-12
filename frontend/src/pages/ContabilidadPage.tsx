import { useEffect, useState } from "react";
import { Plus, Trash2, Calculator, Receipt, BookOpen, FileBarChart, Download } from "lucide-react";
import { api, CuentaPuc, Gasto, Tercero, ComprobanteLibroDiario, MovimientoLibro, EstadoResultados, BalanceGeneral } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { inputClass } from "../lib/ui";
import { SkeletonLista } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import BusquedaInput from "../components/BusquedaInput";

type Tab = "puc" | "gastos" | "libros" | "estados";

const fmtPesos = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

// Módulo de contabilidad: Plan Único de Cuentas, captura manual de gastos/compras (Fluvi no tenía
// ningún concepto de compras antes de esto), libros contables y estados financieros básicos — ver
// el plan de contabilidad. La pieza de facturación electrónica DIAN se agrega en una fase
// posterior sobre esta misma pantalla.
export default function ContabilidadPage() {
  const [tab, setTab] = useState<Tab>("puc");
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Calculator className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Contabilidad</h1>
      </div>
      <div className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(
          [
            ["puc", "Plan de cuentas"],
            ["gastos", "Gastos"],
            ["libros", "Libros"],
            ["estados", "Estados financieros"],
          ] as [Tab, string][]
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setTab(valor)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === valor
                ? "border-brand-600 text-brand-700 dark:border-brand-500 dark:text-brand-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>
      {tab === "puc" && <TabPuc />}
      {tab === "gastos" && <TabGastos />}
      {tab === "libros" && <TabLibros />}
      {tab === "estados" && <TabEstados />}
    </div>
  );
}

function TabPuc() {
  const { usuario } = useAuth();
  const { mostrar, mostrarError } = useToast();
  const puedeEditar = Boolean(usuario?.permisos?.includes("contabilidad_avanzado"));

  const [cuentas, setCuentas] = useState<CuentaPuc[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [naturaleza, setNaturaleza] = useState<"debito" | "credito">("debito");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    setCargando(true);
    api.contabilidad
      .listarPuc()
      .then(setCuentas)
      .catch((err) => mostrarError(err, "cargar el catálogo de cuentas"))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!codigo.trim() || !nombre.trim()) return;
    setGuardando(true);
    try {
      await api.contabilidad.crearCuentaPuc(codigo.trim(), nombre.trim(), naturaleza);
      mostrar("Cuenta creada");
      setCodigo("");
      setNombre("");
      setNaturaleza("debito");
      setMostrarForm(false);
      cargar();
    } catch (err) {
      mostrarError(err, "crear la cuenta");
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActiva(cuenta: CuentaPuc) {
    try {
      await api.contabilidad.actualizarCuentaPuc(cuenta.id, { activa: !cuenta.activa });
      cargar();
    } catch (err) {
      mostrarError(err, "actualizar la cuenta");
    }
  }

  async function eliminar(cuenta: CuentaPuc) {
    if (!confirm(`¿Eliminar la cuenta ${cuenta.codigo} — ${cuenta.nombre}?`)) return;
    try {
      await api.contabilidad.eliminarCuentaPuc(cuenta.id);
      mostrar("Cuenta eliminada");
      cargar();
    } catch (err) {
      mostrarError(err, "eliminar la cuenta");
    }
  }

  return (
    <div>
      {puedeEditar && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            Nueva cuenta
          </button>
        </div>
      )}

      {mostrarForm && (
        <form
          onSubmit={crear}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-brand-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Código
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="110505" required className={`${inputClass} w-32`} />
          </label>
          <label className="flex flex-1 min-w-[200px] flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Caja general" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Naturaleza
            <select value={naturaleza} onChange={(e) => setNaturaleza(e.target.value as "debito" | "credito")} className={inputClass}>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Crear"}
          </button>
        </form>
      )}

      {cargando ? (
        <SkeletonLista />
      ) : !cuentas || cuentas.length === 0 ? (
        <EmptyState mensaje="Todavía no hay cuentas en el plan de cuentas. Crea la primera." icon={Calculator} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Naturaleza</th>
                <th className="px-3 py-2">Estado</th>
                {puedeEditar && <th className="px-3 py-2 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{c.codigo}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100" style={{ paddingLeft: `${(c.nivel - 1) * 14 + 12}px` }}>
                    {c.nombre}
                  </td>
                  <td className="px-3 py-2 capitalize text-slate-600 dark:text-slate-400">{c.naturaleza}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.activa
                          ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500"
                      }`}
                    >
                      {c.activa ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  {puedeEditar && (
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => alternarActiva(c)} className="mr-3 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                        {c.activa ? "Desactivar" : "Activar"}
                      </button>
                      <button onClick={() => eliminar(c)} className="text-red-600 hover:text-red-500 dark:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Cuentas de la clase 5 (GASTOS) — únicas que tiene sentido ofrecer para clasificar un gasto.
function esCuentaDeGasto(c: CuentaPuc) {
  return c.codigo.startsWith("5") && c.nivel >= 3;
}

function TabGastos() {
  const { usuario } = useAuth();
  const { mostrar, mostrarError } = useToast();
  const puedeRegistrar = Boolean(usuario?.permisos?.includes("contabilidad_avanzado"));

  const [gastos, setGastos] = useState<Gasto[] | null>(null);
  const [cuentasGasto, setCuentasGasto] = useState<CuentaPuc[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [busquedaTercero, setBusquedaTercero] = useState("");
  const [resultadosTercero, setResultadosTercero] = useState<Tercero[]>([]);
  const [terceroElegido, setTerceroElegido] = useState<Tercero | null>(null);
  const [cuentaGastoId, setCuentaGastoId] = useState("");
  const [concepto, setConcepto] = useState("");
  const [valor, setValor] = useState("");
  const [ivaValor, setIvaValor] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [pagado, setPagado] = useState(true);
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    setCargando(true);
    api.contabilidad
      .listarGastos()
      .then((r) => setGastos(r.data))
      .catch((err) => mostrarError(err, "cargar los gastos"))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);
  useEffect(() => {
    api.contabilidad.listarPuc(true).then((cuentas) => setCuentasGasto(cuentas.filter(esCuentaDeGasto)));
  }, []);

  useEffect(() => {
    if (!busquedaTercero.trim() || terceroElegido) {
      setResultadosTercero([]);
      return;
    }
    const t = setTimeout(() => {
      api.terceros.listPaginado(1, 5, { q: busquedaTercero }).then((r) => setResultadosTercero(r.data));
    }, 250);
    return () => clearTimeout(t);
  }, [busquedaTercero, terceroElegido]);

  function limpiarForm() {
    setBusquedaTercero("");
    setTerceroElegido(null);
    setCuentaGastoId("");
    setConcepto("");
    setValor("");
    setIvaValor("");
    setNumeroFactura("");
    setPagado(true);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!terceroElegido || !cuentaGastoId || !concepto.trim() || !valor) return;
    setGuardando(true);
    try {
      await api.contabilidad.crearGasto({
        terceroId: terceroElegido.id,
        cuentaGastoId: Number(cuentaGastoId),
        concepto: concepto.trim(),
        valor: Number(valor),
        ivaValor: ivaValor ? Number(ivaValor) : undefined,
        numeroFactura: numeroFactura.trim() || undefined,
        pagado,
      });
      mostrar("Gasto registrado");
      limpiarForm();
      setMostrarForm(false);
      cargar();
    } catch (err) {
      mostrarError(err, "registrar el gasto");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      {puedeRegistrar && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            Nuevo gasto
          </button>
        </div>
      )}

      {mostrarForm && (
        <form onSubmit={crear} className="mb-4 space-y-3 rounded-xl border border-brand-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Proveedor
              {terceroElegido ? (
                <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <span className="text-slate-900 dark:text-slate-100">{terceroElegido.nombre}</span>
                  <button type="button" onClick={() => setTerceroElegido(null)} className="text-xs text-brand-600 hover:underline dark:text-brand-400">
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <BusquedaInput value={busquedaTercero} onChange={setBusquedaTercero} placeholder="Buscar por nombre o documento..." />
                  {resultadosTercero.length > 0 && (
                    <div className="absolute top-full z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {resultadosTercero.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTerceroElegido(t);
                            setResultadosTercero([]);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          {t.nombre} {t.numeroDocumento && <span className="text-xs text-slate-400">· {t.numeroDocumento}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Cuenta de gasto
              <select value={cuentaGastoId} onChange={(e) => setCuentaGastoId(e.target.value)} required className={inputClass}>
                <option value="">Selecciona una cuenta...</option>
                {cuentasGasto.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} — {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Concepto
            <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Reparación de bomba" required className={inputClass} />
          </label>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Valor
              <input type="number" min="1" value={valor} onChange={(e) => setValor(e.target.value)} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              IVA (opcional)
              <input type="number" min="0" value={ivaValor} onChange={(e) => setIvaValor(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              N.º factura
              <input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} className={inputClass} />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} />
              Ya se pagó
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={guardando || !terceroElegido}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
            >
              {guardando ? "Guardando..." : "Registrar gasto"}
            </button>
          </div>
        </form>
      )}

      {cargando ? (
        <SkeletonLista />
      ) : !gastos || gastos.length === 0 ? (
        <EmptyState mensaje="Todavía no hay gastos registrados." icon={Receipt} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">Concepto</th>
                <th className="px-3 py-2">Cuenta</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{new Date(g.fecha).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{g.tercero.nombre}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{g.concepto}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {g.cuentaGasto.codigo} — {g.cuentaGasto.nombre}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">
                    {(Number(g.valor) + Number(g.ivaValor)).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        g.pagado
                          ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                      }`}
                    >
                      {g.pagado ? "Pagado" : "A deber"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabLibros() {
  const { mostrarError } = useToast();
  const [vista, setVista] = useState<"diario" | "mayor">("diario");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cuentas, setCuentas] = useState<CuentaPuc[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [comprobantes, setComprobantes] = useState<ComprobanteLibroDiario[] | null>(null);
  const [movimientosMayor, setMovimientosMayor] = useState<MovimientoLibro[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    api.contabilidad.listarPuc(true).then(setCuentas);
  }, []);

  function consultar() {
    setCargando(true);
    if (vista === "diario") {
      api.contabilidad
        .libroDiario(desde || undefined, hasta || undefined)
        .then(setComprobantes)
        .catch((err) => mostrarError(err, "consultar el libro diario"))
        .finally(() => setCargando(false));
    } else {
      api.contabilidad
        .libroMayor(desde || undefined, hasta || undefined, cuentaId ? Number(cuentaId) : undefined)
        .then((r) => setMovimientosMayor(r.movimientos))
        .catch((err) => mostrarError(err, "consultar el libro mayor"))
        .finally(() => setCargando(false));
    }
  }

  useEffect(consultar, [vista]);

  async function descargar() {
    setDescargando(true);
    try {
      if (vista === "diario") await api.contabilidad.descargarLibroDiario(desde || undefined, hasta || undefined);
      else await api.contabilidad.descargarLibroMayor(desde || undefined, hasta || undefined, cuentaId ? Number(cuentaId) : undefined);
    } catch (err) {
      mostrarError(err, "descargar el Excel");
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
          Libro
          <select value={vista} onChange={(e) => setVista(e.target.value as "diario" | "mayor")} className={inputClass}>
            <option value="diario">Diario</option>
            <option value="mayor">Mayor</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputClass} />
        </label>
        {vista === "mayor" && (
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Cuenta (opcional)
            <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={inputClass}>
              <option value="">Todas</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <button onClick={consultar} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">
          Consultar
        </button>
        <button
          onClick={descargar}
          disabled={descargando}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          Excel
        </button>
      </div>

      {cargando ? (
        <SkeletonLista />
      ) : vista === "diario" ? (
        !comprobantes || comprobantes.length === 0 ? (
          <EmptyState mensaje="No hay comprobantes en ese rango." icon={BookOpen} />
        ) : (
          <div className="space-y-3">
            {comprobantes.map((c) => (
              <div key={c.id} className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {c.tipo} #{c.numero} — {c.concepto}
                  </span>
                  <span>{new Date(c.fecha).toLocaleDateString()}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {c.movimientos.map((m) => (
                      <tr key={m.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/40">
                        <td className="px-3 py-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">{m.cuentaPuc.codigo}</td>
                        <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{m.cuentaPuc.nombre}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-400">{m.tercero?.nombre ?? ""}</td>
                        <td className="px-3 py-1.5 text-right text-slate-900 dark:text-slate-100">{Number(m.debito) ? fmtPesos(Number(m.debito)) : ""}</td>
                        <td className="px-3 py-1.5 text-right text-slate-900 dark:text-slate-100">{Number(m.credito) ? fmtPesos(Number(m.credito)) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )
      ) : !movimientosMayor || movimientosMayor.length === 0 ? (
        <EmptyState mensaje="No hay movimientos en ese rango." icon={BookOpen} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Cuenta</th>
                <th className="px-3 py-2">Tercero</th>
                <th className="px-3 py-2 text-right">Débito</th>
                <th className="px-3 py-2 text-right">Crédito</th>
              </tr>
            </thead>
            <tbody>
              {movimientosMayor.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{new Date(m.comprobante.fecha).toLocaleDateString()}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {m.cuentaPuc.codigo} — {m.cuentaPuc.nombre}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">{m.tercero?.nombre ?? ""}</td>
                  <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">{Number(m.debito) ? fmtPesos(Number(m.debito)) : ""}</td>
                  <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">{Number(m.credito) ? fmtPesos(Number(m.credito)) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaSaldo({ codigo, nombre, saldo }: { codigo: string; nombre: string; saldo: number }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-50 px-3 py-1.5 text-sm last:border-0 dark:border-slate-800/40">
      <span className="text-slate-600 dark:text-slate-400">
        <span className="mr-2 font-mono text-xs text-slate-400">{codigo}</span>
        {nombre}
      </span>
      <span className="text-slate-900 dark:text-slate-100">{fmtPesos(saldo)}</span>
    </div>
  );
}

function TabEstados() {
  const { mostrarError } = useToast();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [corte, setCorte] = useState("");
  const [resultados, setResultados] = useState<EstadoResultados | null>(null);
  const [balance, setBalance] = useState<BalanceGeneral | null>(null);
  const [cargando, setCargando] = useState(true);

  function consultar() {
    setCargando(true);
    Promise.all([
      api.contabilidad.estadoResultados(desde || undefined, hasta || undefined),
      api.contabilidad.balanceGeneral(corte || undefined),
    ])
      .then(([r, b]) => {
        setResultados(r);
        setBalance(b);
      })
      .catch((err) => mostrarError(err, "consultar los estados financieros"))
      .finally(() => setCargando(false));
  }

  useEffect(consultar, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
          Resultados desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
          hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
          Balance con corte al
          <input type="date" value={corte} onChange={(e) => setCorte(e.target.value)} className={inputClass} />
        </label>
        <button onClick={consultar} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">
          Consultar
        </button>
      </div>

      {cargando ? (
        <SkeletonLista />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <FileBarChart className="h-4 w-4" />
                Estado de resultados
              </div>
              <button
                onClick={() => api.contabilidad.descargarEstadoResultados(desde || undefined, hasta || undefined).catch((e) => mostrarError(e, "descargar"))}
                className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Excel
              </button>
            </div>
            {resultados && (
              <div className="p-2">
                <p className="px-2 pb-1 text-xs font-semibold uppercase text-slate-400">Ingresos</p>
                {resultados.ingresos.length === 0 && <p className="px-3 py-1.5 text-sm text-slate-400">Sin movimientos</p>}
                {resultados.ingresos.map((s) => (
                  <FilaSaldo key={s.cuentaId} codigo={s.codigo} nombre={s.nombre} saldo={s.saldo} />
                ))}
                <p className="mt-2 px-2 pb-1 text-xs font-semibold uppercase text-slate-400">Gastos y costos</p>
                {[...resultados.gastos, ...resultados.costos].length === 0 && <p className="px-3 py-1.5 text-sm text-slate-400">Sin movimientos</p>}
                {[...resultados.gastos, ...resultados.costos].map((s) => (
                  <FilaSaldo key={s.cuentaId} codigo={s.codigo} nombre={s.nombre} saldo={-s.saldo} />
                ))}
                <div className="mt-2 flex items-center justify-between border-t border-slate-200 px-3 py-2 text-sm font-bold dark:border-slate-700">
                  <span className="text-slate-900 dark:text-slate-100">Utilidad / pérdida</span>
                  <span className={resultados.utilidad >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                    {fmtPesos(resultados.utilidad)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <FileBarChart className="h-4 w-4" />
                Balance general
              </div>
              <button
                onClick={() => api.contabilidad.descargarBalanceGeneral(corte || undefined).catch((e) => mostrarError(e, "descargar"))}
                className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Excel
              </button>
            </div>
            {balance && (
              <div className="p-2">
                <p className="px-2 pb-1 text-xs font-semibold uppercase text-slate-400">Activo</p>
                {balance.activo.length === 0 && <p className="px-3 py-1.5 text-sm text-slate-400">Sin movimientos</p>}
                {balance.activo.map((s) => (
                  <FilaSaldo key={s.cuentaId} codigo={s.codigo} nombre={s.nombre} saldo={s.saldo} />
                ))}
                <p className="mt-2 px-2 pb-1 text-xs font-semibold uppercase text-slate-400">Pasivo</p>
                {balance.pasivo.length === 0 && <p className="px-3 py-1.5 text-sm text-slate-400">Sin movimientos</p>}
                {balance.pasivo.map((s) => (
                  <FilaSaldo key={s.cuentaId} codigo={s.codigo} nombre={s.nombre} saldo={s.saldo} />
                ))}
                <p className="mt-2 px-2 pb-1 text-xs font-semibold uppercase text-slate-400">Patrimonio</p>
                {balance.patrimonio.map((s) => (
                  <FilaSaldo key={s.cuentaId} codigo={s.codigo} nombre={s.nombre} saldo={s.saldo} />
                ))}
                <FilaSaldo codigo="" nombre="Resultado del ejercicio (no cerrado)" saldo={balance.resultadoEjercicio} />
                <div className="mt-2 flex items-center justify-between border-t border-slate-200 px-3 py-2 text-sm font-bold dark:border-slate-700">
                  <span className="text-slate-900 dark:text-slate-100">Activo = Pasivo + Patrimonio</span>
                  <span className={balance.cuadra ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                    {balance.cuadra ? "Cuadra ✓" : "No cuadra ✗"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
