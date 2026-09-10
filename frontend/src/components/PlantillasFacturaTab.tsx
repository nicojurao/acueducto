import { useEffect, useState } from "react";
import { Plus, Trash2, LayoutTemplate } from "lucide-react";
import { api, PlantillaFacturaResumen } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useConfirm, useErrorHandler } from "./ConfirmModal";
import { SkeletonLista } from "./Skeleton";
import EmptyState from "./EmptyState";
import { inputClass } from "../lib/ui";
import PlantillaFacturaEditor from "./PlantillaFacturaEditor";

// Editor visual de "sobreimpresión" de facturas: las facturas físicas vienen pre-impresas de la
// imprenta con su propio diseño, y acá se define en qué coordenadas va cada dato variable sobre
// esa hoja (ver PlantillaFacturaEditor.tsx). Puede haber varias plantillas guardadas.
export default function PlantillasFacturaTab() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.permisos?.includes("facturacion_avanzado") ?? false;
  const [plantillas, setPlantillas] = useState<PlantillaFacturaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const { pedirConfirmacion, modal } = useConfirm();
  const { error, run } = useErrorHandler();

  function cargar() {
    setCargando(true);
    api.facturacion.plantillas.list().then((data) => {
      setPlantillas(data);
      setCargando(false);
    });
  }
  useEffect(cargar, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoNombre.trim()) return;
    setCreando(true);
    await run(async () => {
      const p = await api.facturacion.plantillas.create(nuevoNombre.trim());
      setNuevoNombre("");
      cargar();
      setEditandoId(p.id);
    });
    setCreando(false);
  }

  function eliminar(p: PlantillaFacturaResumen) {
    pedirConfirmacion(`¿Eliminar la plantilla "${p.nombre}"? Esta acción no se puede deshacer.`, async () => {
      await run(() => api.facturacion.plantillas.remove(p.id));
      cargar();
    });
  }

  if (editandoId !== null) {
    return (
      <PlantillaFacturaEditor
        id={editandoId}
        soloLectura={!puedeEditar}
        onVolver={() => {
          setEditandoId(null);
          cargar();
        }}
      />
    );
  }

  return (
    <div>
      {modal}
      <p className="mb-4 text-sm text-slate-700 dark:text-slate-400">
        Cada plantilla define en qué posición de la hoja va cada dato (nombre, consumo, total, etc.), para
        imprimir directamente sobre facturas ya pre-impresas de la imprenta. Al descargar el PDF de una
        factura o de un lote, puedes elegir con cuál plantilla imprimir.
      </p>

      {puedeEditar && (
        <form onSubmit={crear} className="mb-4 flex items-center gap-2">
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre de la nueva plantilla (ej. Formato imprenta 2026)"
            className={`${inputClass} max-w-sm`}
          />
          <button
            type="submit"
            disabled={creando || !nuevoNombre.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Nueva plantilla
          </button>
        </form>
      )}

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      {cargando ? (
        <SkeletonLista />
      ) : plantillas.length === 0 ? (
        <EmptyState mensaje="Sin plantillas todavía." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plantillas.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <LayoutTemplate className="h-4 w-4 shrink-0 text-brand-500" />
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{p.nombre}</h3>
                </div>
                {puedeEditar && (
                  <button onClick={() => eliminar(p)} className="shrink-0 text-red-500 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mb-3 text-xs text-slate-600 dark:text-slate-500">
                {p.marcadores} marcador{p.marcadores === 1 ? "" : "es"} · {p.anchoPt}×{p.altoPt} pt
              </p>
              <button
                onClick={() => setEditandoId(p.id)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {puedeEditar ? "Editar diseño" : "Ver diseño"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
