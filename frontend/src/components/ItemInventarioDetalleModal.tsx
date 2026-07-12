import { X, Pencil, Image as ImageIcon } from "lucide-react";
import { ItemInventario, urlFoto } from "../api/client";
import { UNIDAD_ABREVIADA, UNIDADES } from "./ItemInventarioModal";

const ESTADO_LABELS: Record<string, string> = { bueno: "Bueno", regular: "Regular", dañado: "Dañado", de_baja: "De baja" };
const ESTADO_COLORS: Record<string, string> = {
  bueno: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  regular: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  dañado: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  de_baja: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

function fmtMoneda(n: number): string {
  return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

function fmtFecha(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-CO") : "-";
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{etiqueta}</div>
      <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{valor}</div>
    </div>
  );
}

export default function ItemInventarioDetalleModal({
  item,
  puedeEditar,
  onClose,
  onEditar,
}: {
  item: ItemInventario;
  puedeEditar: boolean;
  onClose: () => void;
  onEditar: () => void;
}) {
  const unidadLabel = UNIDADES.find((u) => u.value === item.unidadMedida)?.label ?? item.unidadMedida;
  const abreviada = UNIDAD_ABREVIADA[item.unidadMedida] ?? item.unidadMedida;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{item.nombre}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {item.fotoUrl ? (
          <img
            src={urlFoto(item.fotoUrl)}
            alt={item.nombre}
            className="mb-4 h-56 w-full rounded-lg object-cover"
          />
        ) : (
          <div className="mb-4 flex h-40 w-full items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}

        <div className="mb-3 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_COLORS[item.estado]}`}>
            {ESTADO_LABELS[item.estado] ?? item.estado}
          </span>
          {item.codigo && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {item.codigo}
            </span>
          )}
        </div>

        {item.descripcion && (
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{item.descripcion}</p>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <Campo etiqueta="Categoría" valor={item.categoriaCat?.nombre ?? "-"} />
          <Campo etiqueta="Ubicación" valor={item.ubicacionCat?.nombre ?? "-"} />
          <Campo etiqueta="Cantidad" valor={`${item.cantidad} ${abreviada}`} />
          <Campo etiqueta="Disponible" valor={`${item.disponible} ${abreviada}`} />
          <Campo etiqueta="Unidad de medida" valor={unidadLabel} />
          <Campo etiqueta="Proveedor" valor={item.proveedor?.nombre ?? "-"} />
          <Campo etiqueta="Fecha de compra" valor={fmtFecha(item.fechaCompra)} />
          <Campo etiqueta="Fecha de ingreso" valor={fmtFecha(item.fechaIngreso)} />
          <Campo etiqueta="Valor unitario" valor={item.valor ? fmtMoneda(Number(item.valor)) : "-"} />
          <Campo etiqueta="Ingresado por" valor={item.ingresadoPor?.nombre ?? "-"} />
        </div>

        {puedeEditar && (
          <div className="mt-5 flex justify-end">
            <button
              onClick={onEditar}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
