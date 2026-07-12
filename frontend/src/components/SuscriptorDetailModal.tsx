import { useEffect, useRef, useState } from "react";
import { X, Gauge, Users, MapPin, ChevronDown, ChevronUp, FileText, Download, Pencil, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import {
  api,
  urlFoto,
  ESTADO_FACTURACION_LABELS,
  ESTADO_FACTURACION_HEX,
  ESTADO_PREDIO_LABELS,
  ESTADO_PREDIO_HEX,
  Suscriptor,
  Medidor,
  ActaInstalacion,
  MarcaMedidor,
  ModeloMedidor,
  Estrato,
  Lote,
  LecturaPendiente,
} from "../api/client";
import MapaPredios from "./MapaPredios";
import MedidorCombobox from "./MedidorCombobox";
import LecturaDetalleModal from "./LecturaDetalleModal";
import LecturaModal from "./LecturaModal";
import { useConfirm } from "./ConfirmModal";
import { comprimirFotos } from "../lib/comprimirImagen";
import { HistorialSeccion } from "./HistorialTimeline";
import { useAuth } from "../contexts/AuthContext";
import { useCierreAnimado } from "../lib/useCierreAnimado";

const GRID_STROKE = "#475569";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500";

const TIPO_LABELS: Record<string, string> = { volumetrico: "Volumétrico", velocidad: "Velocidad" };
function tipoLabel(tipo: string | null): string {
  if (!tipo) return "-";
  return TIPO_LABELS[tipo] ?? tipo;
}

function fmtFecha(fecha: string | null): string {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
}

export default function SuscriptorDetailModal({
  suscriptorId,
  onClose,
}: {
  suscriptorId: number;
  onClose: () => void;
}) {
  const [suscriptor, setSuscriptor] = useState<Suscriptor | null>(null);
  const [historico, setHistorico] = useState<
    {
      periodo: string;
      consumo: number;
      sinLectura: boolean;
      motivo?: string;
      novedadId?: number;
      fotos?: string[];
      medidorId?: number;
      lecturaId?: number;
      fotoUrl?: string | null;
      latitud?: number | null;
      longitud?: number | null;
      fechaRegistro?: string;
      capturadoPor?: string | null;
    }[]
  >([]);
  const [lecturaDetalle, setLecturaDetalle] = useState<(typeof historico)[number] | null>(null);
  const [barraHover, setBarraHover] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [editandoUbicacion, setEditandoUbicacion] = useState(false);
  const [guardandoUbicacion, setGuardandoUbicacion] = useState(false);
  const [mapaAbierto, setMapaAbierto] = useState(false);

  const [asignando, setAsignando] = useState(false);
  const [editandoActaId, setEditandoActaId] = useState<number | null>(null);
  const [medidoresBodega, setMedidoresBodega] = useState<Medidor[]>([]);
  const [actaPorMedidor, setActaPorMedidor] = useState<Record<number, ActaInstalacion>>({});
  const [actasRetiradas, setActasRetiradas] = useState<ActaInstalacion[]>([]);
  const [guardandoActa, setGuardandoActa] = useState(false);
  const [editandoEsRetirado, setEditandoEsRetirado] = useState(false);
  const [editandoActaCalibracionUrl, setEditandoActaCalibracionUrl] = useState<string | null>(null);
  // Diámetro real del medidor que se está editando, aunque no esté vinculado al modelo elegido en
  // el catálogo (Modelo → Diámetros) — sin esto el <select> queda "vacío" porque el value no
  // matchea ninguna <option> de la lista filtrada por modelo.
  const [editandoDiametroActual, setEditandoDiametroActual] = useState<{ id: number; valor: string } | null>(null);
  const [formActa, setFormActa] = useState({
    medidorId: "",
    fechaInstalacion: "",
    instaladoPor: "",
    observaciones: "",
    fechaRetiro: "",
  });
  const [fotos, setFotos] = useState<File[]>([]);
  const [fotosExistentes, setFotosExistentes] = useState<string[]>([]);
  const [fotosARemover, setFotosARemover] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pedirConfirmacion, modal: modalConfirmacion } = useConfirm();
  const { saliendo, cerrar } = useCierreAnimado(onClose);
  const [instaladores, setInstaladores] = useState<{ id: number; nombre: string }[]>([]);
  const { usuario } = useAuth();

  const [medidorCotitularAbierto, setMedidorCotitularAbierto] = useState<number | null>(null);
  const [nuevoCotitularNuid, setNuevoCotitularNuid] = useState("");
  const [guardandoCotitular, setGuardandoCotitular] = useState(false);
  const [errorCotitular, setErrorCotitular] = useState<string | null>(null);

  const [editandoMedidorId, setEditandoMedidorId] = useState<number | null>(null);
  const [marcas, setMarcas] = useState<MarcaMedidor[]>([]);
  const [modelos, setModelos] = useState<ModeloMedidor[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [formMedidor, setFormMedidor] = useState({
    serial: "",
    marcaId: "",
    modeloId: "",
    diametroId: "",
    loteId: "",
    fechaFabricacion: "",
    fechaCertificacion: "",
    certificado: "",
  });
  const [actaCalibracionArchivo, setActaCalibracionArchivo] = useState<File | null>(null);
  const [subiendoActaCalibracion, setSubiendoActaCalibracion] = useState(false);
  const [actaFirmadaArchivo, setActaFirmadaArchivo] = useState<File | null>(null);
  const [subiendoActaFirmada, setSubiendoActaFirmada] = useState(false);
  const [guardandoEstado, setGuardandoEstado] = useState(false);
  const [gapAbierto, setGapAbierto] = useState<(typeof historico)[number] | null>(null);

  const [editandoInfo, setEditandoInfo] = useState(false);
  const [guardandoInfo, setGuardandoInfo] = useState(false);
  const [barriosCatalogo, setBarriosCatalogo] = useState<{ id: number; nombre: string }[]>([]);
  const [estratosCatalogo, setEstratosCatalogo] = useState<Estrato[]>([]);
  const [formInfo, setFormInfo] = useState({
    nombre: "",
    identificacion: "",
    ruta: "",
    barrioId: "",
    estratoId: "",
    direccion: "",
    direccionComercial: "",
  });

  function abrirEdicionInfo() {
    if (!suscriptor) return;
    setFormInfo({
      nombre: suscriptor.nombre ?? "",
      identificacion: suscriptor.identificacion ?? "",
      ruta: suscriptor.ruta ?? "",
      barrioId: suscriptor.barrioCat ? String(suscriptor.barrioCat.id) : "",
      estratoId: suscriptor.estratoCat ? String(suscriptor.estratoCat.id) : "",
      direccion: suscriptor.direccion ?? "",
      direccionComercial: suscriptor.direccionComercial ?? "",
    });
    api.suscriptores.barrios().then(setBarriosCatalogo);
    api.estratos.list().then(setEstratosCatalogo);
    setEditandoInfo(true);
  }

  function onSubmitInfo(e: React.FormEvent) {
    e.preventDefault();
    pedirConfirmacion("¿Deseas guardar los cambios?", guardarInfo, { textoConfirmar: "Guardar", variante: "normal" });
  }

  async function guardarInfo() {
    setGuardandoInfo(true);
    try {
      await api.suscriptores.update(suscriptorId, {
        nombre: formInfo.nombre,
        identificacion: formInfo.identificacion || null,
        ruta: formInfo.ruta || null,
        barrioId: formInfo.barrioId ? Number(formInfo.barrioId) : null,
        estratoId: formInfo.estratoId ? Number(formInfo.estratoId) : null,
        direccion: formInfo.direccion || null,
        direccionComercial: formInfo.direccionComercial || null,
      });
      setEditandoInfo(false);
      cargarDetalle();
    } finally {
      setGuardandoInfo(false);
    }
  }

  function cargarDetalle() {
    setCargando(true);
    Promise.all([
      api.suscriptores.get(suscriptorId),
      api.reportes.consumoSuscriptor(suscriptorId),
      api.actas.listBySuscriptor(suscriptorId),
    ]).then(([s, h, actas]) => {
      setSuscriptor(s);
      setHistorico(h);
      const mapa: Record<number, ActaInstalacion> = {};
      for (const a of actas) mapa[a.medidorId] = a;
      setActaPorMedidor(mapa);
      setActasRetiradas(actas.filter((a) => a.fechaRetiro));
      setCargando(false);
    });
  }

  useEffect(cargarDetalle, [suscriptorId]);
  useEffect(() => {
    api.actas.instaladores().then(setInstaladores);
  }, []);

  function abrirAsignacion() {
    setAsignando(true);
    setEditandoActaId(null);
    setEditandoMedidorId(null);
    setEditandoEsRetirado(false);
    setEditandoActaCalibracionUrl(null);
    setEditandoDiametroActual(null);
    setFormActa({ medidorId: "", fechaInstalacion: "", instaladoPor: "", observaciones: "", fechaRetiro: "" });
    setFotos([]);
    setFotosExistentes([]);
    setFotosARemover([]);
    api.medidores.list({ estado: "en_bodega" }).then(setMedidoresBodega);
  }

  // Edita un medidor instalado (activo o "reemplazado"): siempre se puede editar sus datos de
  // catálogo, tenga o no un acta asociada. La mayoría de medidores cargados masivamente NO tienen
  // acta (vienen de la carga inicial de datos), así que la fecha de instalación se precarga del
  // propio Medidor.fechaInstalacion cuando no hay acta — ya existe ese dato, solo no está ligado
  // a ningún acta todavía. "Instalado por" sí queda vacío porque no hay ese dato en ningún lado.
  function abrirEdicion(medidor: Medidor) {
    const acta = actaPorMedidor[medidor.id];
    setAsignando(true);
    setEditandoActaId(acta?.id ?? null);
    setEditandoMedidorId(medidor.id);
    setEditandoEsRetirado(false);
    setEditandoActaCalibracionUrl(medidor.actaCalibracionUrl ?? null);
    setEditandoDiametroActual(medidor.diametroCat ? { id: medidor.diametroCat.id, valor: medidor.diametroCat.valor } : null);
    setFormActa({
      medidorId: String(medidor.id),
      fechaInstalacion: acta
        ? acta.fechaInstalacion.slice(0, 10)
        : medidor.fechaInstalacion
        ? medidor.fechaInstalacion.slice(0, 10)
        : "",
      instaladoPor: acta?.instaladoPor ?? "",
      observaciones: acta?.observaciones ?? "",
      fechaRetiro: "",
    });
    setFormMedidor({
      serial: medidor.serial ?? "",
      marcaId: medidor.marcaCat ? String(medidor.marcaCat.id) : "",
      modeloId: medidor.modeloCat ? String(medidor.modeloCat.id) : "",
      diametroId: medidor.diametroCat ? String(medidor.diametroCat.id) : "",
      loteId: medidor.loteId ? String(medidor.loteId) : "",
      fechaFabricacion: medidor.fechaFabricacion ? medidor.fechaFabricacion.slice(0, 10) : "",
      fechaCertificacion: medidor.fechaCertificacion ? medidor.fechaCertificacion.slice(0, 10) : "",
      certificado: medidor.certificado ?? "",
    });
    setActaCalibracionArchivo(null);
    setActaFirmadaArchivo(null);
    setFotos([]);
    setFotosExistentes(acta?.fotos ?? []);
    setFotosARemover([]);
    Promise.all([api.marcas.list(), api.modelos.list(), api.lotes.list()]).then(([ma, mo, lo]) => {
      setMarcas(ma);
      setModelos(mo);
      setLotes(lo);
    });
  }

  // Edita una entrada del historial de medidores retirados: el medidor ya no aparece en
  // suscriptor.medidores (se le quitó el suscriptorId al retirarlo), así que sus datos se sacan
  // del acta (acta.medidor), no de la lista de medidores del suscriptor.
  function abrirEdicionRetirado(acta: ActaInstalacion) {
    const medidor = acta.medidor;
    if (!medidor) return;
    setAsignando(true);
    setEditandoActaId(acta.id);
    setEditandoMedidorId(medidor.id);
    setEditandoEsRetirado(true);
    setEditandoActaCalibracionUrl(medidor.actaCalibracionUrl ?? null);
    setEditandoDiametroActual(medidor.diametroCat ? { id: medidor.diametroCat.id, valor: medidor.diametroCat.valor } : null);
    setFormActa({
      medidorId: String(medidor.id),
      fechaInstalacion: acta.fechaInstalacion.slice(0, 10),
      instaladoPor: acta.instaladoPor,
      observaciones: acta.observaciones ?? "",
      fechaRetiro: acta.fechaRetiro ? acta.fechaRetiro.slice(0, 10) : "",
    });
    setFormMedidor({
      serial: medidor.serial ?? "",
      marcaId: medidor.marcaCat ? String(medidor.marcaCat.id) : "",
      modeloId: medidor.modeloCat ? String(medidor.modeloCat.id) : "",
      diametroId: medidor.diametroCat ? String(medidor.diametroCat.id) : "",
      loteId: medidor.loteId ? String(medidor.loteId) : "",
      fechaFabricacion: medidor.fechaFabricacion ? medidor.fechaFabricacion.slice(0, 10) : "",
      fechaCertificacion: medidor.fechaCertificacion ? medidor.fechaCertificacion.slice(0, 10) : "",
      certificado: medidor.certificado ?? "",
    });
    setActaCalibracionArchivo(null);
    setActaFirmadaArchivo(null);
    setFotos([]);
    setFotosExistentes(acta.fotos);
    setFotosARemover([]);
    Promise.all([api.marcas.list(), api.modelos.list(), api.lotes.list()]).then(([ma, mo, lo]) => {
      setMarcas(ma);
      setModelos(mo);
      setLotes(lo);
    });
  }

  function cerrarFormulario() {
    setAsignando(false);
    setEditandoActaId(null);
    setEditandoMedidorId(null);
    setEditandoEsRetirado(false);
    setEditandoActaCalibracionUrl(null);
    setEditandoDiametroActual(null);
    setFormActa({ medidorId: "", fechaInstalacion: "", instaladoPor: "", observaciones: "", fechaRetiro: "" });
    setFormMedidor({
      serial: "",
      marcaId: "",
      modeloId: "",
      diametroId: "",
      loteId: "",
      fechaFabricacion: "",
      fechaCertificacion: "",
      certificado: "",
    });
    setActaCalibracionArchivo(null);
    setActaFirmadaArchivo(null);
    setFotos([]);
    setFotosExistentes([]);
    setFotosARemover([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function quitarFotoExistente(foto: string) {
    setFotosExistentes((prev) => prev.filter((f) => f !== foto));
    setFotosARemover((prev) => [...prev, foto]);
  }

  async function agregarCotitular(medidorId: number, e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoCotitularNuid.trim()) return;
    setGuardandoCotitular(true);
    setErrorCotitular(null);
    try {
      await api.medidores.agregarCotitular(medidorId, nuevoCotitularNuid.trim());
      setNuevoCotitularNuid("");
      await cargarDetalle();
    } catch (err) {
      setErrorCotitular(err instanceof Error ? err.message.replace(/^Error \d+: /, "") : "Error inesperado");
    } finally {
      setGuardandoCotitular(false);
    }
  }

  function quitarCotitular(medidorId: number, cotitularSuscriptorId: number, nombre: string) {
    pedirConfirmacion(`¿Quitar a "${nombre}" como cotitular de este medidor?`, async () => {
      await api.medidores.quitarCotitular(medidorId, cotitularSuscriptorId);
      cargarDetalle();
    });
  }

  function eliminarAsignacion(medidor: Medidor) {
    const acta = actaPorMedidor[medidor.id];
    if (!acta) return;
    pedirConfirmacion(`¿Quitar el medidor "${medidor.serial ?? medidor.id}" de este suscriptor?`, async () => {
      await api.actas.remove(acta.id);
      cargarDetalle();
    });
  }

  function onSubmitAsignacion(e: React.FormEvent) {
    e.preventDefault();
    pedirConfirmacion("¿Deseas guardar los cambios?", registrarAsignacion, { textoConfirmar: "Guardar", variante: "normal" });
  }

  async function registrarAsignacion() {
    const usuarioIdInstalador = instaladores.find((u) => u.nombre === formActa.instaladoPor)?.id;
    setGuardandoActa(true);
    try {
      if (editandoMedidorId) {
        // Editando un medidor ya existente (instalado, reemplazado o retirado): sus datos de
        // catálogo siempre se pueden editar, tenga o no un acta asociada.
        await api.medidores.update(editandoMedidorId, {
          serial: formMedidor.serial || null,
          marcaId: formMedidor.marcaId ? Number(formMedidor.marcaId) : null,
          modeloId: formMedidor.modeloId ? Number(formMedidor.modeloId) : null,
          diametroId: formMedidor.diametroId ? Number(formMedidor.diametroId) : null,
          loteId: formMedidor.loteId ? Number(formMedidor.loteId) : null,
          fechaFabricacion: formMedidor.fechaFabricacion || null,
          fechaCertificacion: formMedidor.fechaCertificacion || null,
          certificado: formMedidor.certificado || null,
        });
        if (actaCalibracionArchivo) {
          await api.medidores.subirActaCalibracion(editandoMedidorId, actaCalibracionArchivo);
        }
        if (editandoActaId) {
          if (!formActa.fechaInstalacion || !formActa.instaladoPor) return;
          await api.actas.update(editandoActaId, {
            fechaInstalacion: formActa.fechaInstalacion,
            instaladoPor: formActa.instaladoPor,
            usuarioId: usuarioIdInstalador,
            observaciones: formActa.observaciones || undefined,
            fotosNuevas: fotos,
            fotosARemover,
            fechaRetiro: editandoEsRetirado ? formActa.fechaRetiro || undefined : undefined,
          });
          if (actaFirmadaArchivo) {
            await api.actas.subirFirmada(editandoActaId, actaFirmadaArchivo);
          }
        } else if (formActa.fechaInstalacion && formActa.instaladoPor) {
          // El medidor no tenía acta: si se completó fecha e instalador, se genera ahora
          // (documenta retroactivamente una instalación que ya estaba hecha), y de una vez se le
          // puede adjuntar el escaneo firmado si el suscriptor ya lo tenía en papel.
          const actaCreada = await api.actas.create({
            suscriptorId,
            medidorId: editandoMedidorId,
            fechaInstalacion: formActa.fechaInstalacion,
            instaladoPor: formActa.instaladoPor,
            usuarioId: usuarioIdInstalador,
            observaciones: formActa.observaciones || undefined,
            fotos,
          });
          if (actaFirmadaArchivo) {
            await api.actas.subirFirmada(actaCreada.id, actaFirmadaArchivo);
          }
        }
      } else {
        if (!formActa.medidorId || !formActa.fechaInstalacion || !formActa.instaladoPor) return;
        await api.actas.create({
          suscriptorId,
          medidorId: Number(formActa.medidorId),
          fechaInstalacion: formActa.fechaInstalacion,
          instaladoPor: formActa.instaladoPor,
          usuarioId: usuarioIdInstalador,
          observaciones: formActa.observaciones || undefined,
          fotos,
        });
      }
      cerrarFormulario();
      cargarDetalle();
    } finally {
      setGuardandoActa(false);
    }
  }

  const [errorEstado, setErrorEstado] = useState<string | null>(null);
  async function cambiarEstadoFacturacion(nuevo: string) {
    setGuardandoEstado(true);
    setErrorEstado(null);
    try {
      await api.suscriptores.update(suscriptorId, { estadoFacturacion: nuevo as Suscriptor["estadoFacturacion"] });
      await cargarDetalle();
    } catch (err) {
      setErrorEstado(err instanceof Error ? err.message.replace(/^Error \d+: /, "") : "Error inesperado");
    } finally {
      setGuardandoEstado(false);
    }
  }

  const [guardandoPredio, setGuardandoPredio] = useState(false);
  const [errorPredio, setErrorPredio] = useState<string | null>(null);
  async function cambiarEstadoPredio(nuevo: string) {
    setGuardandoPredio(true);
    setErrorPredio(null);
    try {
      await api.suscriptores.update(suscriptorId, { estadoPredio: nuevo as Suscriptor["estadoPredio"] });
      await cargarDetalle();
    } catch (err) {
      setErrorPredio(err instanceof Error ? err.message.replace(/^Error \d+: /, "") : "Error inesperado");
    } finally {
      setGuardandoPredio(false);
    }
  }

  async function guardarUbicacion(lat: number, lng: number) {
    setGuardandoUbicacion(true);
    await api.suscriptores.update(suscriptorId, { latitud: lat, longitud: lng });
    setGuardandoUbicacion(false);
    setEditandoUbicacion(false);
    cargarDetalle();
  }

  return (
    <div
      className={`fixed inset-0 z-[2000] flex h-dvh items-center justify-center bg-black/50 p-4 ${saliendo ? "animate-fade-out" : "animate-fade-in"}`}
      onClick={cerrar}
    >
      <div
        className={`flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900 ${saliendo ? "animate-scale-out" : "animate-scale-in"}`}
        style={{ marginTop: "env(safe-area-inset-top)", marginBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {modalConfirmacion}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-bold">{cargando ? "Cargando..." : suscriptor?.nombre}</h2>
          <button onClick={cerrar} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!cargando && suscriptor && (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <div className="flex flex-wrap gap-4">
              <div>
                <div className="text-xs uppercase text-slate-700 dark:text-slate-400">Estado de facturación</div>
                <select
                  value={suscriptor.estadoFacturacion}
                  disabled={guardandoEstado}
                  onChange={(e) => cambiarEstadoFacturacion(e.target.value)}
                  className="mt-1 rounded-full border-0 px-2.5 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: ESTADO_FACTURACION_HEX[suscriptor.estadoFacturacion].bg,
                    color: ESTADO_FACTURACION_HEX[suscriptor.estadoFacturacion].text,
                  }}
                >
                  {Object.entries(ESTADO_FACTURACION_LABELS).map(([valor, label]) => (
                    <option
                      key={valor}
                      value={valor}
                      style={{ backgroundColor: ESTADO_FACTURACION_HEX[valor].bg, color: ESTADO_FACTURACION_HEX[valor].text }}
                    >
                      {label}
                    </option>
                  ))}
                </select>
                {errorEstado && <p className="mt-1 max-w-xs text-xs text-red-600 dark:text-red-400">{errorEstado}</p>}
              </div>
              <div>
                <div className="text-xs uppercase text-slate-700 dark:text-slate-400">Estado del predio</div>
                <select
                  value={suscriptor.estadoPredio}
                  disabled={guardandoPredio}
                  onChange={(e) => cambiarEstadoPredio(e.target.value)}
                  className="mt-1 rounded-full border-0 px-2.5 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: ESTADO_PREDIO_HEX[suscriptor.estadoPredio].bg,
                    color: ESTADO_PREDIO_HEX[suscriptor.estadoPredio].text,
                  }}
                >
                  {Object.entries(ESTADO_PREDIO_LABELS).map(([valor, label]) => (
                    <option
                      key={valor}
                      value={valor}
                      style={{ backgroundColor: ESTADO_PREDIO_HEX[valor].bg, color: ESTADO_PREDIO_HEX[valor].text }}
                    >
                      {label}
                    </option>
                  ))}
                </select>
                {errorPredio && <p className="mt-1 max-w-xs text-xs text-red-600 dark:text-red-400">{errorPredio}</p>}
              </div>
            </div>

            {editandoInfo ? (
              <form onSubmit={onSubmitInfo} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-700 sm:col-span-3">
                    Nombre
                    <input
                      value={formInfo.nombre}
                      onChange={(e) => setFormInfo({ ...formInfo, nombre: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    Identificación
                    <input
                      value={formInfo.identificacion}
                      onChange={(e) => setFormInfo({ ...formInfo, identificacion: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    Ruta
                    <input
                      value={formInfo.ruta}
                      onChange={(e) => setFormInfo({ ...formInfo, ruta: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    Barrio
                    <select
                      value={formInfo.barrioId}
                      onChange={(e) => setFormInfo({ ...formInfo, barrioId: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">Sin barrio</option>
                      {barriosCatalogo.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    Estrato
                    <select
                      value={formInfo.estratoId}
                      onChange={(e) => setFormInfo({ ...formInfo, estratoId: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">Sin estrato</option>
                      {estratosCatalogo.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.codigo} — {e.etiqueta}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-700 sm:col-span-3">
                    Dirección
                    <input
                      value={formInfo.direccion}
                      onChange={(e) => setFormInfo({ ...formInfo, direccion: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-700 sm:col-span-3">
                    Dirección comercial
                    <input
                      value={formInfo.direccionComercial}
                      onChange={(e) => setFormInfo({ ...formInfo, direccionComercial: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditandoInfo(false)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardandoInfo}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
                  >
                    {guardandoInfo ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="mb-2 flex justify-end">
                  <button
                    onClick={abrirEdicionInfo}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar información
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase text-slate-700 dark:text-slate-400">NUID</div>
                    <div className="font-medium">{suscriptor.codigo}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-slate-700 dark:text-slate-400">Ruta</div>
                    <div className="font-medium">{suscriptor.ruta ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-slate-700 dark:text-slate-400">Identificación</div>
                    <div className="font-medium">{suscriptor.identificacion ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-slate-700 dark:text-slate-400">Estrato</div>
                    <div className="font-medium">
                      {suscriptor.estratoCat ? `${suscriptor.estratoCat.codigo} — ${suscriptor.estratoCat.etiqueta}` : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-slate-700 dark:text-slate-400">Barrio</div>
                    <div className="font-medium">{suscriptor.barrioCat?.nombre ?? "-"}</div>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <div className="text-xs uppercase text-slate-700 dark:text-slate-400">Dirección</div>
                    <div className="font-medium">{suscriptor.direccion ?? "-"}</div>
                  </div>
                  {suscriptor.direccionComercial && (
                    <div className="col-span-2 sm:col-span-3">
                      <div className="text-xs uppercase text-slate-700 dark:text-slate-400">Dirección comercial</div>
                      <div className="font-medium">{suscriptor.direccionComercial}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setMapaAbierto((v) => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
                >
                  <MapPin className="h-4 w-4 text-brand-500" />
                  Ubicación
                  {mapaAbierto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {!mapaAbierto && (
                    <span className="text-xs font-normal text-slate-600 dark:text-slate-500">
                      ({suscriptor.latitud != null ? "ya tiene punto marcado" : "sin marcar"})
                    </span>
                  )}
                </button>
                {mapaAbierto && !editandoUbicacion && (
                  <button
                    onClick={() => setEditandoUbicacion(true)}
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {suscriptor.latitud != null ? "Cambiar ubicación" : "Fijar ubicación"}
                  </button>
                )}
              </div>

              {mapaAbierto &&
                (editandoUbicacion ? (
                  <div className="mt-2">
                    <p className="mb-2 text-xs text-slate-700 dark:text-slate-400">
                      {guardandoUbicacion ? "Guardando..." : "Haz clic en el mapa para marcar el predio."}
                    </p>
                    <MapaPredios
                      editable
                      onPick={guardarUbicacion}
                      puntoSeleccionado={
                        suscriptor.latitud != null && suscriptor.longitud != null
                          ? [suscriptor.latitud, suscriptor.longitud]
                          : null
                      }
                      centro={
                        suscriptor.latitud != null && suscriptor.longitud != null
                          ? [suscriptor.latitud, suscriptor.longitud]
                          : undefined
                      }
                      className="h-64"
                    />
                  </div>
                ) : suscriptor.latitud != null && suscriptor.longitud != null ? (
                  <div className="mt-2">
                    <MapaPredios
                      suscriptores={[suscriptor]}
                      centro={[suscriptor.latitud, suscriptor.longitud]}
                      zoom={16}
                      className="h-64"
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-400">
                    Este suscriptor aún no tiene ubicación.
                  </p>
                ))}
            </div>

            {suscriptor.cotitularDe && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700/50 dark:bg-amber-900/20">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-300">
                    Medidor compartido (acometida multiusuario)
                  </p>
                  <p className="text-amber-700 dark:text-amber-400">
                    Este suscriptor comparte el medidor de{" "}
                    <strong>{suscriptor.cotitularDe.medidor.suscriptor.nombre}</strong> junto con{" "}
                    {suscriptor.cotitularDe.medidor.cotitulares.length} cotitular(es) más. El consumo mostrado abajo
                    ya está dividido en {1 + suscriptor.cotitularDe.medidor.cotitulares.length} partes iguales.
                  </p>
                </div>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <Gauge className="h-4 w-4 text-brand-500" />
                  Medidores
                </h3>
                {!asignando && suscriptor.estadoPredio !== "inactivo" && (
                  <button
                    onClick={abrirAsignacion}
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {(suscriptor.medidores ?? []).some((m) => m.activo)
                      ? "+ Reemplazar medidor"
                      : "+ Asignar medidor"}
                  </button>
                )}
                {!asignando && suscriptor.estadoPredio === "inactivo" && (
                  <span className="text-xs text-slate-600">Predio inactivo: no puede tener medidor</span>
                )}
              </div>

              {asignando && (
                <form
                  className="mb-3 flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                  onSubmit={onSubmitAsignacion}
                >
                  {editandoMedidorId ? (
                    <>
                      <p className="text-xs font-medium text-slate-700">
                        {editandoEsRetirado ? "Editando medidor retirado (historial)" : "Editando el medidor instalado"}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <input
                          placeholder="Serial"
                          value={formMedidor.serial}
                          onChange={(e) => setFormMedidor({ ...formMedidor, serial: e.target.value })}
                          className={inputClass}
                        />
                        <select
                          value={formMedidor.marcaId}
                          onChange={(e) =>
                            setFormMedidor({ ...formMedidor, marcaId: e.target.value, modeloId: "", diametroId: "" })
                          }
                          className={inputClass}
                        >
                          <option value="">Marca...</option>
                          {marcas.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre}
                            </option>
                          ))}
                        </select>
                        <select
                          value={formMedidor.modeloId}
                          onChange={(e) => setFormMedidor({ ...formMedidor, modeloId: e.target.value, diametroId: "" })}
                          className={inputClass}
                          disabled={!formMedidor.marcaId}
                        >
                          <option value="">Modelo...</option>
                          {modelos
                            .filter((mo) => String(mo.marcaId) === formMedidor.marcaId)
                            .map((mo) => (
                              <option key={mo.id} value={mo.id}>
                                {mo.nombre}
                              </option>
                            ))}
                        </select>
                        <select
                          value={formMedidor.diametroId}
                          onChange={(e) => setFormMedidor({ ...formMedidor, diametroId: e.target.value })}
                          className={inputClass}
                          disabled={!formMedidor.modeloId}
                        >
                          <option value="">Diámetro...</option>
                          {(modelos.find((mo) => String(mo.id) === formMedidor.modeloId)?.diametros ?? []).map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.valor}
                            </option>
                          ))}
                          {editandoDiametroActual &&
                            String(editandoDiametroActual.id) === formMedidor.diametroId &&
                            !(modelos.find((mo) => String(mo.id) === formMedidor.modeloId)?.diametros ?? []).some(
                              (d) => d.id === editandoDiametroActual.id
                            ) && (
                              <option value={editandoDiametroActual.id}>
                                {editandoDiametroActual.valor} (no vinculado a este modelo en el catálogo)
                              </option>
                            )}
                        </select>
                        <select
                          value={formMedidor.loteId}
                          onChange={(e) => setFormMedidor({ ...formMedidor, loteId: e.target.value })}
                          className={inputClass}
                        >
                          <option value="">Lote...</option>
                          {lotes.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.serialInicial}-{l.serialFinal}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                          Fecha fabricación
                          <input
                            type="date"
                            value={formMedidor.fechaFabricacion}
                            onChange={(e) => setFormMedidor({ ...formMedidor, fechaFabricacion: e.target.value })}
                            className={inputClass}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                          Fecha certificación
                          <input
                            type="date"
                            value={formMedidor.fechaCertificacion}
                            onChange={(e) => setFormMedidor({ ...formMedidor, fechaCertificacion: e.target.value })}
                            className={inputClass}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                          N° certificado
                          <input
                            value={formMedidor.certificado}
                            onChange={(e) => setFormMedidor({ ...formMedidor, certificado: e.target.value })}
                            className={inputClass}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="text-xs font-medium text-slate-700">Medidor en bodega</label>
                      <MedidorCombobox
                        medidores={medidoresBodega}
                        value={formActa.medidorId}
                        onChange={(id) => setFormActa({ ...formActa, medidorId: id })}
                      />
                    </>
                  )}
                  {editandoMedidorId && !editandoActaId && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Este medidor no tiene acta de instalación. Completa fecha e instalador si
                      quieres generarla ahora (opcional, pero obligatorio si vas a adjuntar fotos o
                      el escaneo firmado más abajo).
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          type="date"
                          value={formActa.fechaInstalacion}
                          onChange={(e) => setFormActa({ ...formActa, fechaInstalacion: e.target.value })}
                          className={inputClass}
                          required={!editandoMedidorId || !!editandoActaId || !!actaFirmadaArchivo || fotos.length > 0}
                        />
                        <select
                          value={formActa.instaladoPor}
                          onChange={(e) => setFormActa({ ...formActa, instaladoPor: e.target.value })}
                          className={inputClass}
                          required={!editandoMedidorId || !!editandoActaId || !!actaFirmadaArchivo || fotos.length > 0}
                        >
                          <option value="">Instalado por...</option>
                          {instaladores.map((u) => (
                            <option key={u.id} value={u.nombre}>
                              {u.nombre}
                            </option>
                          ))}
                          {formActa.instaladoPor && !instaladores.some((u) => u.nombre === formActa.instaladoPor) && (
                            <option value={formActa.instaladoPor}>{formActa.instaladoPor} (usuario inactivo/eliminado)</option>
                          )}
                        </select>
                      </div>
                      {editandoEsRetirado && (
                        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                          Fecha de retiro
                          <input
                            type="date"
                            value={formActa.fechaRetiro}
                            onChange={(e) => setFormActa({ ...formActa, fechaRetiro: e.target.value })}
                            className={inputClass}
                            required
                          />
                        </label>
                      )}
                      <textarea
                        placeholder="Observaciones (opcional)"
                        value={formActa.observaciones}
                        onChange={(e) => setFormActa({ ...formActa, observaciones: e.target.value })}
                        className={`${inputClass} min-h-[60px]`}
                      />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {editandoMedidorId && (
                        <div className="min-w-0">
                          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Acta de calibración (escaneada)
                          </label>
                          {editandoActaCalibracionUrl && !actaCalibracionArchivo && (
                            <div className="mb-1 flex items-center gap-2">
                              <a
                                href={urlFoto(editandoActaCalibracionUrl)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                              >
                                Ver acta actual
                              </a>
                              <button
                                type="button"
                                disabled={subiendoActaCalibracion}
                                onClick={async () => {
                                  if (!editandoMedidorId) return;
                                  setSubiendoActaCalibracion(true);
                                  try {
                                    await api.medidores.quitarActaCalibracion(editandoMedidorId);
                                    setEditandoActaCalibracionUrl(null);
                                    cargarDetalle();
                                  } finally {
                                    setSubiendoActaCalibracion(false);
                                  }
                                }}
                                className="text-xs font-medium text-red-500 hover:underline"
                              >
                                Quitar
                              </button>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => setActaCalibracionArchivo(e.target.files?.[0] ?? null)}
                            className={`${inputClass} w-full`}
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        {fotosExistentes.length > 0 && (
                          <>
                            <label className="mb-1 block text-xs font-medium text-slate-700">Fotos actuales</label>
                            <div className="mb-2 flex flex-wrap gap-2">
                              {fotosExistentes.map((foto) => (
                                <div key={foto} className="group relative">
                                  <img
                                    src={urlFoto(foto)}
                                    alt="Foto de instalación"
                                    className="h-14 w-14 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => quitarFotoExistente(foto)}
                                    title="Quitar foto"
                                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow hover:bg-red-500"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        <label className="mb-1 block text-xs font-medium text-slate-700">
                          {editandoActaId ? "Agregar más fotos" : "Fotos"}
                        </label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={async (e) => setFotos(await comprimirFotos(Array.from(e.target.files ?? [])))}
                          className={`${inputClass} w-full`}
                        />
                        {fotos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {fotos.map((f, i) => (
                              <img
                                key={i}
                                src={URL.createObjectURL(f)}
                                alt={f.name}
                                className="h-14 w-14 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                              />
                            ))}
                          </div>
                        )}
                  </div>
                  </div>
                  {editandoMedidorId && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Acta de instalación firmada (escaneada en PDF)
                      </label>
                      <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                        El PDF de "Ver/imprimir acta" es solo la plantilla para imprimir y firmar a
                        mano; sube aquí el escaneo ya firmado.
                        {!editandoActaId && " Como este medidor no tiene acta, hay que completar fecha e instalador arriba para poder guardar el escaneo."}
                      </p>
                      {editandoMedidorId && actaPorMedidor[editandoMedidorId]?.actaFirmadaUrl && !actaFirmadaArchivo && (
                        <div className="mb-1 flex items-center gap-2">
                          <a
                            href={urlFoto(actaPorMedidor[editandoMedidorId].actaFirmadaUrl!)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                          >
                            Ver acta firmada
                          </a>
                          <button
                            type="button"
                            disabled={subiendoActaFirmada}
                            onClick={async () => {
                              if (!editandoActaId) return;
                              setSubiendoActaFirmada(true);
                              try {
                                await api.actas.quitarFirmada(editandoActaId);
                                cargarDetalle();
                              } finally {
                                setSubiendoActaFirmada(false);
                              }
                            }}
                            className="text-xs font-medium text-red-500 hover:underline"
                          >
                            Quitar
                          </button>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setActaFirmadaArchivo(e.target.files?.[0] ?? null)}
                        className={`${inputClass} w-full`}
                      />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={guardandoActa}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {guardandoActa ? "Guardando..." : editandoMedidorId ? "Guardar cambios" : "Registrar instalación"}
                    </button>
                    <button
                      type="button"
                      onClick={cerrarFormulario}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                {[...(suscriptor.medidores ?? [])]
                  .sort((a, b) => Number(b.activo) - Number(a.activo))
                  .map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-3 text-sm ${
                      m.activo
                        ? "border-slate-200 dark:border-slate-800"
                        : "border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-800/30"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.activo
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                        }`}
                      >
                        {m.activo ? "Instalado actualmente" : "Reemplazado"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <div className="text-xs text-slate-700 dark:text-slate-400">Tipo</div>
                        <div>{tipoLabel(m.tipo)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-700 dark:text-slate-400">Marca</div>
                        <div>{m.marcaCat?.nombre ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-700 dark:text-slate-400">Modelo</div>
                        <div>{m.modeloCat?.nombre ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-700 dark:text-slate-400">Diámetro</div>
                        <div>{m.diametroCat?.valor ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-700 dark:text-slate-400">Serial</div>
                        <div>{m.serial ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-700 dark:text-slate-400">Fecha de instalación</div>
                        <div>{fmtFecha(m.fechaInstalacion)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-700 dark:text-slate-400">Fecha de fabricación</div>
                        <div>{fmtFecha(m.fechaFabricacion)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-700 dark:text-slate-400">Fecha de certificación</div>
                        <div>{fmtFecha(m.fechaCertificacion)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-700 dark:text-slate-400">N° certificado</div>
                        <div>{m.certificado ?? "-"}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {actaPorMedidor[m.id] && (
                        <button
                          type="button"
                          onClick={() => api.actas.verPdf(actaPorMedidor[m.id].id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Descargar acta
                        </button>
                      )}
                      <button
                        onClick={() => abrirEdicion(m)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-brand-600 dark:text-slate-400"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      {actaPorMedidor[m.id] && (
                        <button
                          onClick={() => eliminarAsignacion(m)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-red-600 dark:text-slate-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Quitar
                        </button>
                      )}
                    </div>
                    {m.activo && m.suscriptorId === suscriptor.id && (
                      <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-800">
                        <div className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                          Vivienda multiusuario (varios NUID, un solo medidor)
                        </div>
                        {(m.cotitulares ?? []).length > 0 && (
                          <ul className="mb-2 space-y-1">
                            {m.cotitulares!.map((c) => (
                              <li key={c.suscriptor.id} className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-400">
                                <span>
                                  {c.suscriptor.nombre} (NUID {c.suscriptor.codigo})
                                </span>
                                <button
                                  onClick={() => quitarCotitular(m.id, c.suscriptor.id, c.suscriptor.nombre)}
                                  className="text-slate-500 hover:text-red-600"
                                  title="Quitar cotitular"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {medidorCotitularAbierto === m.id ? (
                          <form onSubmit={(e) => agregarCotitular(m.id, e)} className="flex items-center gap-2">
                            <input
                              autoFocus
                              placeholder="NUID del apartamento/cotitular"
                              value={nuevoCotitularNuid}
                              onChange={(e) => setNuevoCotitularNuid(e.target.value)}
                              className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                            />
                            <button
                              type="submit"
                              disabled={guardandoCotitular}
                              className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
                            >
                              Agregar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMedidorCotitularAbierto(null);
                                setErrorCotitular(null);
                              }}
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                            >
                              Cancelar
                            </button>
                          </form>
                        ) : (
                          <button
                            onClick={() => setMedidorCotitularAbierto(m.id)}
                            className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                          >
                            + Agregar cotitular por NUID
                          </button>
                        )}
                        {errorCotitular && medidorCotitularAbierto === m.id && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errorCotitular}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {(suscriptor.medidores ?? []).length === 0 && (
                  <p className="text-sm text-slate-700 dark:text-slate-400">Este suscriptor no tiene medidores.</p>
                )}
              </div>

              {actasRetiradas.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Historial de medidores retirados
                  </h3>
                  <div className="space-y-2">
                    {actasRetiradas.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/30"
                      >
                        <div>
                          Serial <strong>{a.serial}</strong> — instalado el {fmtFecha(a.fechaInstalacion)}, retirado
                          el {fmtFecha(a.fechaRetiro)}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">Instalado por: {a.instaladoPor}</div>
                        {a.medidor && (
                          <button
                            type="button"
                            onClick={() => abrirEdicionRetirado(a)}
                            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-brand-600 dark:text-slate-400"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Historial de consumo mensual (m³){suscriptor.cotitularDe && " — ya dividido"}
                </h3>
                {historico.some((h) => !h.sinLectura) && (
                  <span className="text-xs text-slate-700 dark:text-slate-400">
                    Promedio:{" "}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {(
                        historico.filter((h) => !h.sinLectura).reduce((acc, h) => acc + h.consumo, 0) /
                        historico.filter((h) => !h.sinLectura).length
                      ).toLocaleString("es-CO", { maximumFractionDigits: 1 })}{" "}
                      m³
                    </strong>
                  </span>
                )}
              </div>
              {historico.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={historico}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} opacity={0.3} />
                      <XAxis dataKey="periodo" stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis stroke={GRID_STROKE} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                      <Tooltip
                        cursor={false}
                        contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                        labelStyle={{ color: "#94a3b8" }}
                        itemStyle={{ color: "#e2e8f0" }}
                        formatter={(v: number, _n, p) =>
                          p.payload.sinLectura
                            ? [p.payload.motivo ? `Sin lectura — ${p.payload.motivo}` : "Sin lectura registrada", ""]
                            : [v, "Consumo"]
                        }
                      />
                      {historico.some((h) => !h.sinLectura) && (
                        <ReferenceLine
                          y={
                            historico.filter((h) => !h.sinLectura).reduce((acc, h) => acc + h.consumo, 0) /
                            historico.filter((h) => !h.sinLectura).length
                          }
                          stroke="#fb923c"
                          strokeDasharray="4 4"
                          label={{ value: "Promedio", position: "insideTopRight", fill: "#fb923c", fontSize: 11 }}
                        />
                      )}
                      <Bar dataKey="consumo" radius={[4, 4, 0, 0]} minPointSize={6}>
                        {historico.map((h) => (
                          <Cell
                            key={h.periodo}
                            fill={h.sinLectura ? "#f87171" : "#00487f"}
                            fillOpacity={barraHover && barraHover !== h.periodo ? 0.55 : 1}
                            stroke={barraHover === h.periodo ? "#fff" : "none"}
                            strokeWidth={2}
                            cursor={!h.sinLectura && h.lecturaId ? "pointer" : "default"}
                            onMouseEnter={() => setBarraHover(h.periodo)}
                            onMouseLeave={() => setBarraHover(null)}
                            onClick={() => !h.sinLectura && h.lecturaId && setLecturaDetalle(h)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {historico.some((h) => h.sinLectura) && (
                    <div className="mt-2 space-y-1 rounded-lg border border-red-200 bg-red-50 p-2 dark:border-red-500/30 dark:bg-red-500/10">
                      {historico
                        .filter((h) => h.sinLectura)
                        .map((h) => (
                          <button
                            key={h.periodo}
                            onClick={() => setGapAbierto(h)}
                            className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-500/20"
                          >
                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-red-400" />
                            <strong>{h.periodo}</strong> — sin lectura{h.motivo ? `: ${h.motivo}` : " (sin motivo registrado)"}
                          </button>
                        ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-700 dark:text-slate-400">Sin lecturas registradas todavía.</p>
              )}
            </div>

            {usuario?.permisos?.includes("historial") && (
              <HistorialSeccion entidad="suscriptor" entidadId={suscriptor.id} />
            )}
          </div>
        )}
      </div>

      {gapAbierto && suscriptor && gapAbierto.medidorId && (
        <LecturaModal
          fila={{
            medidorId: gapAbierto.medidorId,
            suscriptor,
            lecturaAnteriorValor: null,
            lectura: null,
            novedad: gapAbierto.novedadId
              ? { id: gapAbierto.novedadId, motivo: gapAbierto.motivo ?? "", fotos: gapAbierto.fotos ?? [] }
              : null,
          } as LecturaPendiente}
          periodo={gapAbierto.periodo}
          onClose={() => setGapAbierto(null)}
          onCambio={cargarDetalle}
        />
      )}

      {lecturaDetalle && (
        <LecturaDetalleModal
          periodo={lecturaDetalle.periodo}
          consumo={lecturaDetalle.consumo}
          fotoUrl={lecturaDetalle.fotoUrl ?? null}
          latitud={lecturaDetalle.latitud ?? null}
          longitud={lecturaDetalle.longitud ?? null}
          fechaRegistro={lecturaDetalle.fechaRegistro ?? null}
          capturadoPor={lecturaDetalle.capturadoPor ?? null}
          onClose={() => setLecturaDetalle(null)}
        />
      )}
    </div>
  );
}
