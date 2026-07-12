import { useState } from "react";
import { X, Camera } from "lucide-react";
import { api, CategoriaInventario, ItemInventario, ProveedorInventario, UbicacionInventario, urlFoto } from "../api/client";
import { useConfirm, useErrorHandler } from "./ConfirmModal";
import { comprimirFoto } from "../lib/comprimirImagen";
import CatalogoCombobox from "./CatalogoCombobox";
import CamaraModal from "./CamaraModal";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

const ESTADOS = [
  { value: "bueno", label: "Bueno" },
  { value: "regular", label: "Regular" },
  { value: "dañado", label: "Dañado" },
  { value: "de_baja", label: "De baja" },
];

export const UNIDADES = [
  { value: "unidad", label: "Unidad" },
  { value: "metro", label: "Metro" },
  { value: "kilogramo", label: "Kilogramo" },
  { value: "litro", label: "Litro" },
  { value: "galon", label: "Galón" },
  { value: "rollo", label: "Rollo" },
  { value: "caja", label: "Caja" },
  { value: "par", label: "Par" },
];
export const UNIDAD_ABREVIADA: Record<string, string> = {
  unidad: "und",
  metro: "m",
  kilogramo: "kg",
  litro: "L",
  galon: "gal",
  rollo: "rollo",
  caja: "caja",
  par: "par",
};

export default function ItemInventarioModal({
  item,
  categorias,
  ubicaciones,
  proveedores,
  onClose,
  onCambio,
}: {
  item: ItemInventario | null;
  categorias: CategoriaInventario[];
  ubicaciones: UbicacionInventario[];
  proveedores: ProveedorInventario[];
  onClose: () => void;
  onCambio: () => void;
}) {
  const [nombre, setNombre] = useState(item?.nombre ?? "");
  const [categoriaId, setCategoriaId] = useState(item?.categoriaId ? String(item.categoriaId) : "");
  const [codigo, setCodigo] = useState(item?.codigo ?? "");
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? "");
  const [cantidad, setCantidad] = useState(String(item?.cantidad ?? 1));
  const [unidadMedida, setUnidadMedida] = useState<string>(item?.unidadMedida ?? "unidad");
  const [estado, setEstado] = useState<string>(item?.estado ?? "bueno");
  const [ubicacionId, setUbicacionId] = useState(item?.ubicacionId ? String(item.ubicacionId) : "");
  const [proveedorId, setProveedorId] = useState(item?.proveedorId ? String(item.proveedorId) : "");
  const [fechaCompra, setFechaCompra] = useState(item?.fechaCompra?.slice(0, 10) ?? "");
  const [fechaIngreso, setFechaIngreso] = useState(item?.fechaIngreso?.slice(0, 10) ?? "");
  const [valor, setValor] = useState(item?.valor ?? "");
  const [foto, setFoto] = useState<File | null>(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();

  const valorTotal = valor !== "" && cantidad ? Number(valor) * (Number(cantidad) || 0) : null;

  async function guardar() {
    if (!nombre.trim()) return;
    await run(async () => {
      setGuardando(true);
      try {
        const data = {
          nombre: nombre.trim(),
          categoriaId: categoriaId ? Number(categoriaId) : undefined,
          codigo: codigo.trim() || undefined,
          descripcion: descripcion.trim() || undefined,
          cantidad: Number(cantidad) || 1,
          unidadMedida,
          estado,
          ubicacionId: ubicacionId ? Number(ubicacionId) : undefined,
          proveedorId: proveedorId ? Number(proveedorId) : undefined,
          fechaCompra: fechaCompra || undefined,
          fechaIngreso: fechaIngreso || undefined,
          valor: valor !== "" ? Number(valor) : undefined,
          foto,
        };
        if (item) {
          await api.inventario.update(item.id, {
            ...data,
            categoriaId: categoriaId ? Number(categoriaId) : null,
            ubicacionId: ubicacionId ? Number(ubicacionId) : null,
            proveedorId: proveedorId ? Number(proveedorId) : null,
            fechaCompra: fechaCompra || null,
            fechaIngreso: fechaIngreso || null,
            valor: valor !== "" ? Number(valor) : null,
            quitarFoto,
          });
        } else {
          await api.inventario.create(data);
        }
        onCambio();
        onClose();
      } finally {
        setGuardando(false);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
      {modalConfirmacion}
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{item ? "Editar ítem" : "Nuevo ítem de inventario"}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={`${inputClass} w-full`} autoFocus />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Categoría</span>
              <CatalogoCombobox
                opciones={categorias}
                value={categoriaId}
                onChange={setCategoriaId}
                placeholder="Busca una categoría..."
                vacio="Sin categorías. Créalas en la pestaña Categorías."
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Código / placa</span>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className={`${inputClass} w-full`} />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Descripción</span>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              className={`${inputClass} w-full`}
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Cantidad</span>
              <input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className={`${inputClass} w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Unidad</span>
              <select value={unidadMedida} onChange={(e) => setUnidadMedida(e.target.value)} className={`${inputClass} w-full`}>
                {UNIDADES.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Estado</span>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className={`${inputClass} w-full`}>
                {ESTADOS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Ubicación</span>
              <CatalogoCombobox
                opciones={ubicaciones}
                value={ubicacionId}
                onChange={setUbicacionId}
                placeholder="Busca una ubicación..."
                vacio="Sin ubicaciones. Créalas en la pestaña Ubicaciones."
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Proveedor</span>
              <CatalogoCombobox
                opciones={proveedores}
                value={proveedorId}
                onChange={setProveedorId}
                placeholder="Busca un proveedor..."
                vacio="Sin proveedores. Créalos en la pestaña Proveedores."
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Fecha de compra</span>
              <input
                type="date"
                value={fechaCompra}
                onChange={(e) => setFechaCompra(e.target.value)}
                className={`${inputClass} w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Fecha de ingreso a bodega</span>
              <input
                type="date"
                value={fechaIngreso}
                onChange={(e) => setFechaIngreso(e.target.value)}
                className={`${inputClass} w-full`}
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Valor unitario (opcional)</span>
            <input
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className={`${inputClass} w-full`}
            />
            {valorTotal !== null && (
              <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">
                Valor total: {valorTotal.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}
              </span>
            )}
          </label>

          <div>
            <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">Foto (opcional)</span>
            {item?.fotoUrl && !quitarFoto && !foto && (
              <div className="mb-2 flex items-center gap-2">
                <img src={urlFoto(item.fotoUrl)} alt="" className="h-16 w-16 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setQuitarFoto(true)}
                  className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Quitar foto
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCamaraAbierta(true)}
                className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10"
              >
                <Camera className="h-3.5 w-3.5" />
                {foto ? foto.name : "Tomar foto"}
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                Subir un archivo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const archivo = e.target.files?.[0];
                    setFoto(archivo ? await comprimirFoto(archivo) : null);
                    setQuitarFoto(false);
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={() => pedirConfirmacion("¿Deseas guardar los cambios?", guardar, { textoConfirmar: "Guardar", variante: "normal" })}
            disabled={guardando || !nombre.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      {camaraAbierta && (
        <CamaraModal
          onCapturar={(file) => {
            setFoto(file);
            setQuitarFoto(false);
            setCamaraAbierta(false);
          }}
          onCancelar={() => setCamaraAbierta(false)}
        />
      )}
    </div>
  );
}
