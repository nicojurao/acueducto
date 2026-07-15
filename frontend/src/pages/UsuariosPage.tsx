import { useEffect, useMemo, useState } from "react";
import { UserCog, Plus, Pencil, Trash2, Search, Eye, EyeOff, X, Camera } from "lucide-react";
import { api, urlFoto, Usuario, Rol } from "../api/client";
import { comprimirFoto } from "../lib/comprimirImagen";
import { useConfirm, useErrorHandler } from "../components/ConfirmModal";
import { useAuth } from "../contexts/AuthContext";
import { useCierreAnimado } from "../lib/useCierreAnimado";
import BusquedaInput from "../components/BusquedaInput";
import EmptyState from "../components/EmptyState";
import ListCard from "../components/ListCard";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

const labelClass = "flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300";

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

type FormState = {
  nombre: string;
  nombreUsuario: string;
  password: string;
  rolId: string;
  cedula: string;
  celular: string;
  fechaNacimiento: string;
  activo: boolean;
};

function formVacio(roles: Rol[]): FormState {
  return {
    nombre: "",
    nombreUsuario: "",
    password: "",
    rolId: roles[0] ? String(roles[0].id) : "",
    cedula: "",
    celular: "",
    fechaNacimiento: "",
    activo: true,
  };
}

function UsuarioModal({
  usuario,
  roles,
  esUnoMismo,
  onCerrar,
  onGuardado,
}: {
  usuario: Usuario | null;
  roles: Rol[];
  esUnoMismo: boolean;
  onCerrar: () => void;
  onGuardado: () => Promise<void>;
}) {
  const editando = !!usuario;
  const [form, setForm] = useState<FormState>(
    usuario
      ? {
          nombre: usuario.nombre,
          nombreUsuario: usuario.nombreUsuario,
          password: "",
          rolId: String(usuario.rol.id),
          cedula: usuario.cedula ?? "",
          celular: usuario.celular ?? "",
          fechaNacimiento: usuario.fechaNacimiento ? usuario.fechaNacimiento.slice(0, 10) : "",
          activo: usuario.activo,
        }
      : formVacio(roles)
  );
  const [foto, setFoto] = useState<File | null>(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [previewFoto, setPreviewFoto] = useState<string | null>(usuario?.foto ? urlFoto(usuario.foto) : null);
  const [verPassword, setVerPassword] = useState(false);
  const { error, run } = useErrorHandler();
  const [guardando, setGuardando] = useState(false);
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();
  const { saliendo, cerrar } = useCierreAnimado(onCerrar);

  async function onFotoSeleccionada(file: File | null) {
    const comprimido = file ? await comprimirFoto(file) : null;
    setFoto(comprimido);
    setQuitarFoto(false);
    setPreviewFoto(comprimido ? URL.createObjectURL(comprimido) : usuario?.foto ? urlFoto(usuario.foto) : null);
  }

  function onQuitarFoto() {
    setFoto(null);
    setQuitarFoto(true);
    setPreviewFoto(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre || !form.nombreUsuario || !form.rolId || (!editando && !form.password)) return;
    pedirConfirmacion("¿Deseas guardar los cambios?", guardar, { textoConfirmar: "Guardar", variante: "normal" });
  }

  async function guardar() {
    setGuardando(true);
    await run(async () => {
      if (editando) {
        await api.usuarios.update(usuario.id, {
          nombre: form.nombre,
          rolId: Number(form.rolId),
          activo: form.activo,
          password: form.password || undefined,
          cedula: form.cedula || null,
          celular: form.celular || null,
          fechaNacimiento: form.fechaNacimiento || null,
          foto,
          quitarFoto,
        });
      } else {
        await api.usuarios.create({
          nombre: form.nombre,
          nombreUsuario: form.nombreUsuario,
          password: form.password,
          rolId: Number(form.rolId),
          cedula: form.cedula || undefined,
          celular: form.celular || undefined,
          fechaNacimiento: form.fechaNacimiento || undefined,
          activo: form.activo,
          foto,
        });
      }
      await onGuardado();
      cerrar();
    });
    setGuardando(false);
  }

  return (
    <div className={`fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}>
      {modalConfirmacion}
      <div className={`w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {editando ? "Editar usuario" : "Nuevo usuario"}
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
        {/* autoComplete="off" + name no genérico evita que el navegador rellene esto con las
            credenciales de la sesión activa, ya que "parece" un formulario de login */}
        <form onSubmit={onSubmit} autoComplete="off" className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              {previewFoto ? (
                <img src={previewFoto} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
                  {form.nombre ? iniciales(form.nombre) : "?"}
                </div>
              )}
              <label className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-500">
                <Camera className="h-3.5 w-3.5" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onFotoSeleccionada(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {previewFoto && (
              <button type="button" onClick={onQuitarFoto} className="text-xs text-slate-600 hover:text-red-600">
                Quitar foto
              </button>
            )}
          </div>

          <label className={labelClass}>
            Nombre
            <input
              name="nombre_usuario_nuevo"
              autoComplete="off"
              placeholder="Nombre completo"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className={inputClass}
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Nombre de usuario
              <input
                name="usuario_nuevo"
                type="text"
                autoComplete="off"
                placeholder={editando ? undefined : 'Ej. "admin" o el nombre con el que entrará'}
                value={form.nombreUsuario}
                onChange={(e) => setForm({ ...form, nombreUsuario: e.target.value })}
                className={inputClass}
                required
                disabled={editando}
                title={editando ? "El nombre de usuario no se puede cambiar" : undefined}
              />
            </label>
            <label className={labelClass}>
              Rol
              <select
                value={form.rolId}
                onChange={(e) => setForm({ ...form, rolId: e.target.value })}
                className={inputClass}
                required
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Cédula
              <input
                placeholder="Necesaria para que inicie sesión"
                value={form.cedula}
                onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Celular
              <input
                placeholder="Número de celular"
                value={form.celular}
                onChange={(e) => setForm({ ...form, celular: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>

          <label className={labelClass}>
            Fecha de nacimiento
            <input
              type="date"
              value={form.fechaNacimiento}
              onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            {editando ? "Nueva contraseña (opcional)" : "Contraseña"}
            <div className="relative">
              <input
                name="clave_usuario_nueva"
                type={verPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder={editando ? "Dejar en blanco para no cambiarla" : "••••••••"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={`${inputClass} pr-9`}
                required={!editando}
                minLength={form.password ? 8 : undefined}
                title="Mínimo 8 caracteres"
              />
              <button
                type="button"
                onClick={() => setVerPassword((v) => !v)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-600 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {verPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <label className={labelClass}>
            Estado
            <select
              value={form.activo ? "activo" : "inactivo"}
              onChange={(e) => setForm({ ...form, activo: e.target.value === "activo" })}
              className={inputClass}
              disabled={esUnoMismo}
              title={esUnoMismo ? "No puedes desactivar tu propia cuenta" : undefined}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo (no podrá iniciar sesión)</option>
            </select>
          </label>

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
              {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const { usuario: yo } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoUsuario, setEditandoUsuario] = useState<Usuario | null>(null);
  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal } = useConfirm();

  async function cargar() {
    setCargando(true);
    const [usuariosData, rolesData] = await Promise.all([api.usuarios.list(), api.roles.list()]);
    setUsuarios(usuariosData);
    setRoles(rolesData);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(
      (u) =>
        u.nombre.toLowerCase().includes(q) ||
        u.nombreUsuario.toLowerCase().includes(q) ||
        u.cedula?.includes(q)
    );
  }, [usuarios, busqueda]);

  const totales = useMemo(
    () => ({
      total: usuarios.length,
      roles: new Set(usuarios.map((u) => u.rol.id)).size,
      activos: usuarios.filter((u) => u.activo).length,
    }),
    [usuarios]
  );

  function abrirCreacion() {
    setEditandoUsuario(null);
    setModalAbierto(true);
  }

  function abrirEdicion(u: Usuario) {
    setEditandoUsuario(u);
    setModalAbierto(true);
  }

  function eliminar(u: Usuario) {
    pedirConfirmacion(`¿Eliminar el usuario "${u.nombre}"? Sus lecturas capturadas se conservan.`, () =>
      run(async () => {
        await api.usuarios.remove(u.id);
        await cargar();
      })
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <UserCog className="h-6 w-6 text-brand-500" />
          Usuarios
        </h1>
        <button
          onClick={abrirCreacion}
          disabled={roles.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </button>
      </div>

      {modal}
      {modalAbierto && (
        <UsuarioModal
          usuario={editandoUsuario}
          roles={roles}
          esUnoMismo={!!editandoUsuario && yo?.id === editandoUsuario.id}
          onCerrar={() => setModalAbierto(false)}
          onGuardado={cargar}
        />
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-700 dark:text-slate-400">Total usuarios</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totales.total}</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-700 dark:text-slate-400">Roles en uso</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totales.roles}</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-700 dark:text-slate-400">Activos</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totales.activos}</div>
        </div>
      </div>

      <BusquedaInput
        placeholder="Buscar por nombre o correo..."
        value={busqueda}
        onChange={setBusqueda}
        className="mb-4 max-w-sm"
      />

      {cargando ? (
        <p className="text-slate-700 dark:text-slate-400">Cargando...</p>
      ) : (
        <>
        <div className="hidden md:block overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtrados.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      {u.foto ? (
                        <img src={urlFoto(u.foto)} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
                          {iniciales(u.nombre)}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-slate-800 dark:text-slate-100">
                          {u.nombre}
                          {yo?.id === u.id && (
                            <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-700 dark:bg-slate-800 dark:text-slate-400">
                              Tú
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600">@{u.nombreUsuario}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-400">
                    {u.cedula && <div>CC {u.cedula}</div>}
                    {u.celular && <div>{u.celular}</div>}
                    {!u.cedula && !u.celular && <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">
                      {u.rol.nombre}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.activo
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-3 text-slate-600">
                      <button onClick={() => abrirEdicion(u)} className="hover:text-brand-600">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => eliminar(u)}
                        disabled={yo?.id === u.id}
                        className="hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6">
                    <EmptyState
                      mensaje={usuarios.length === 0 ? "Aún no hay usuarios." : "Ningún usuario coincide con la búsqueda."}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 md:hidden">
          {filtrados.map((u) => (
            <ListCard key={u.id}>
              <div className="flex items-start gap-3">
                {u.foto ? (
                  <img src={urlFoto(u.foto)} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
                    {iniciales(u.nombre)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800 dark:text-slate-100">
                    {u.nombre}
                    {yo?.id === u.id && (
                      <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        Tú
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600">@{u.nombreUsuario}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">
                      {u.rol.nombre}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.activo
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-start gap-3 text-slate-600">
                  <button onClick={() => abrirEdicion(u)} className="hover:text-brand-600">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => eliminar(u)}
                    disabled={yo?.id === u.id}
                    className="hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </ListCard>
          ))}
          {filtrados.length === 0 && (
            <EmptyState
              mensaje={usuarios.length === 0 ? "Aún no hay usuarios." : "Ningún usuario coincide con la búsqueda."}
            />
          )}
        </div>
        </>
      )}
    </div>
  );
}
