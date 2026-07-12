import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Camera, Eye, EyeOff } from "lucide-react";
import { api, urlFoto } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { comprimirFoto } from "../lib/comprimirImagen";
import { useConfirm, useErrorHandler } from "./ConfirmModal";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

const labelClass = "flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300";

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

// Perfil de autoservicio: a diferencia de UsuarioModal (pantalla de Usuarios, requiere el
// permiso "usuarios"), esto lo puede abrir cualquier usuario para editar sus propios datos
// básicos y contraseña — sin poder tocar su rol, nombre de usuario, cédula ni estado activo.
export default function PerfilModal({ onCerrar }: { onCerrar: () => void }) {
  const { usuario, refrescarUsuario } = useAuth();
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [celular, setCelular] = useState(usuario?.celular ?? "");
  const [fechaNacimiento, setFechaNacimiento] = useState(usuario?.fechaNacimiento?.slice(0, 10) ?? "");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [previewFoto, setPreviewFoto] = useState<string | null>(usuario?.foto ? urlFoto(usuario.foto) : null);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const { error, run } = useErrorHandler();
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();

  if (!usuario) return null;

  async function onFotoSeleccionada(file: File | null) {
    const comprimido = file ? await comprimirFoto(file) : null;
    setFoto(comprimido);
    setQuitarFoto(false);
    setPreviewFoto(comprimido ? URL.createObjectURL(comprimido) : usuario!.foto ? urlFoto(usuario!.foto) : null);
  }

  function onQuitarFoto() {
    setFoto(null);
    setQuitarFoto(true);
    setPreviewFoto(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    pedirConfirmacion("¿Deseas guardar los cambios?", guardar, { textoConfirmar: "Guardar", variante: "normal" });
  }

  async function guardar() {
    setGuardando(true);
    await run(async () => {
      await api.auth.actualizarPerfil({
        nombre: nombre.trim(),
        celular: celular.trim() || null,
        fechaNacimiento: fechaNacimiento || null,
        password: password || undefined,
        foto,
        quitarFoto,
      });
      await refrescarUsuario();
      setGuardadoOk(true);
      setTimeout(onCerrar, 1100);
    });
    setGuardando(false);
  }

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      {modalConfirmacion}
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Mi perfil</h3>
          <button onClick={onCerrar} className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
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

        <form onSubmit={onSubmit} autoComplete="off" className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              {previewFoto ? (
                <img src={previewFoto} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
                  {nombre ? iniciales(nombre) : "?"}
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
              autoComplete="off"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={inputClass}
              required
            />
          </label>

          <label className={labelClass}>
            Usuario / rol
            <input
              value={`${usuario.nombreUsuario} · ${usuario.rol.nombre}`}
              disabled
              className={`${inputClass} cursor-not-allowed opacity-60`}
              title="Solo un administrador puede cambiar tu nombre de usuario o rol"
            />
          </label>

          <label className={labelClass}>
            Celular
            <input
              placeholder="Número de celular"
              value={celular}
              onChange={(e) => setCelular(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Fecha de nacimiento
            <input
              type="date"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Nueva contraseña (opcional)
            <div className="relative">
              <input
                type={verPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Dejar en blanco para no cambiarla"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-9`}
                minLength={password ? 8 : undefined}
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

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
