import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Plus, Pencil, Trash2, X, Lock } from "lucide-react";
import { api, Rol, Permiso } from "../api/client";
import { useConfirm, useErrorHandler } from "../components/ConfirmModal";
import { useCierreAnimado } from "../lib/useCierreAnimado";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

const labelClass = "flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300";

function RolModal({
  rol,
  permisosDisponibles,
  onCerrar,
  onGuardado,
}: {
  rol: Rol | null;
  permisosDisponibles: Permiso[];
  onCerrar: () => void;
  onGuardado: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState(rol?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? "");
  const [permisos, setPermisos] = useState<string[]>(rol?.permisos ?? []);
  const { error, run } = useErrorHandler();
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();
  const { saliendo, cerrar } = useCierreAnimado(onCerrar);

  function togglePermiso(clave: string) {
    setPermisos((prev) => (prev.includes(clave) ? prev.filter((p) => p !== clave) : [...prev, clave]));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre) return;
    pedirConfirmacion("¿Deseas guardar los cambios?", guardar, { textoConfirmar: "Guardar", variante: "normal" });
  }

  async function guardar() {
    setGuardando(true);
    await run(async () => {
      if (rol) {
        await api.roles.update(rol.id, { nombre, descripcion, permisos });
      } else {
        await api.roles.create({ nombre, descripcion, permisos });
      }
      await onGuardado();
      setGuardadoOk(true);
      setTimeout(cerrar, 1100);
    });
    setGuardando(false);
  }

  return (
    <div className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}>
      {modalConfirmacion}
      <div className={`w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {rol ? "Editar rol" : "Nuevo rol"}
          </h3>
          <button onClick={cerrar} className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        )}
        {guardadoOk && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
            ✓ Cambios guardados correctamente
          </div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className={labelClass}>
            Nombre del rol
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Supervisor"
              className={inputClass}
              required
              disabled={rol?.esSistema}
              title={rol?.esSistema ? "El nombre de un rol del sistema no se puede cambiar" : undefined}
            />
          </label>
          <label className={labelClass}>
            Descripción (opcional)
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Para qué es este rol"
              className={inputClass}
            />
          </label>

          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">Permisos por módulo</div>
            <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-2">
              {permisosDisponibles.map((p) => (
                <label
                  key={p.clave}
                  className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <input
                    type="checkbox"
                    checked={permisos.includes(p.clave)}
                    onChange={() => togglePermiso(p.clave)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{p.nombre}</div>
                    <div className="text-xs text-slate-600">{p.descripcion}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={cerrar}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : rol ? "Guardar cambios" : "Crear rol"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [permisosDisponibles, setPermisosDisponibles] = useState<Permiso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoRol, setEditandoRol] = useState<Rol | null>(null);
  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal } = useConfirm();

  async function cargar() {
    setCargando(true);
    const [rolesData, permisosData] = await Promise.all([api.roles.list(), api.roles.permisos()]);
    setRoles(rolesData);
    setPermisosDisponibles(permisosData);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const permisosPorClave = useMemo(
    () => Object.fromEntries(permisosDisponibles.map((p) => [p.clave, p.nombre])),
    [permisosDisponibles]
  );

  function abrirCreacion() {
    setEditandoRol(null);
    setModalAbierto(true);
  }

  function abrirEdicion(r: Rol) {
    setEditandoRol(r);
    setModalAbierto(true);
  }

  function eliminar(r: Rol) {
    pedirConfirmacion(`¿Eliminar el rol "${r.nombre}"?`, () =>
      run(async () => {
        await api.roles.remove(r.id);
        await cargar();
      })
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="h-6 w-6 text-brand-500" />
          Roles y permisos
        </h1>
        <button
          onClick={abrirCreacion}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          <Plus className="h-4 w-4" />
          Nuevo rol
        </button>
      </div>

      {modal}
      {modalAbierto && (
        <RolModal
          rol={editandoRol}
          permisosDisponibles={permisosDisponibles}
          onCerrar={() => setModalAbierto(false)}
          onGuardado={cargar}
        />
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {cargando ? (
        <p className="text-slate-700 dark:text-slate-400">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => (
            <div
              key={r.id}
              className="flex flex-col rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                    {r.nombre}
                    {r.esSistema && <Lock className="h-3.5 w-3.5 text-slate-600" />}
                  </div>
                  {r.descripcion && <div className="text-xs text-slate-600">{r.descripcion}</div>}
                </div>
                <div className="flex gap-2 text-slate-600">
                  <button onClick={() => abrirEdicion(r)} title="Editar permisos" className="hover:text-brand-600">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!r.esSistema && (
                    <button onClick={() => eliminar(r)} title="Eliminar rol" className="hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-3 text-xs text-slate-600">
                {r.usuarios} {r.usuarios === 1 ? "usuario" : "usuarios"}
              </div>

              <div className="mt-auto flex flex-wrap gap-1.5">
                {r.permisos.length === 0 && <span className="text-xs text-slate-600">Sin permisos asignados</span>}
                {r.permisos.map((clave) => (
                  <span
                    key={clave}
                    className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                  >
                    {permisosPorClave[clave] ?? clave}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
