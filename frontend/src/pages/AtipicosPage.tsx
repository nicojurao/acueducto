import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { api } from "../api/client";
import SuscriptorDetailModal from "../components/SuscriptorDetailModal";

// Las lecturas del mes no empiezan a capturarse hasta el día 20, así que antes de esa fecha se
// muestra el mes anterior (que sí tiene datos) en vez del mes actual vacío. Mismo criterio que
// frontend/src/pages/InicioPage.tsx y ReportesPage.tsx.
function periodoActual(): string {
  const now = new Date();
  let anio = now.getFullYear();
  let mes = now.getMonth() + 1;
  if (now.getDate() < 20) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
  }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function fmt(n: number | null | undefined, decimales = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return n.toLocaleString("es-CO", { maximumFractionDigits: decimales });
}

type Atipico = Awaited<ReturnType<typeof api.dashboard.atipicos>>[number];
type Columna = "codigo" | "nombre" | "consumoActual" | "promedioHistorico" | "desviacionPct";

function EncabezadoOrdenable({
  label,
  columna,
  ordenColumna,
  ordenDireccion,
  onClick,
}: {
  label: string;
  columna: Columna;
  ordenColumna: Columna;
  ordenDireccion: "asc" | "desc";
  onClick: (columna: Columna) => void;
}) {
  const activa = ordenColumna === columna;
  const Icono = activa ? (ordenDireccion === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        onClick={() => onClick(columna)}
        className={`flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 ${
          activa ? "text-slate-700 dark:text-slate-200" : ""
        }`}
      >
        {label}
        <Icono className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}

export default function AtipicosPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState(searchParams.get("periodo") || periodoActual());
  const [atipicos, setAtipicos] = useState<Atipico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [detalleId, setDetalleId] = useState<number | null>(null);

  const [ordenColumna, setOrdenColumna] = useState<Columna>("desviacionPct");
  const [ordenDireccion, setOrdenDireccion] = useState<"asc" | "desc">("desc");

  async function cargar() {
    setAtipicos(await api.dashboard.atipicos(periodo));
    setCargando(false);
  }

  useEffect(() => {
    setCargando(true);
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  function ordenarPor(columna: Columna) {
    if (columna === ordenColumna) {
      setOrdenDireccion((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrdenColumna(columna);
      setOrdenDireccion("desc");
    }
  }

  const atipicosOrdenados = useMemo(() => {
    const factor = ordenDireccion === "asc" ? 1 : -1;
    return [...atipicos].sort((a, b) => {
      const va = a[ordenColumna];
      const vb = b[ordenColumna];
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * factor;
      return (Number(va) - Number(vb)) * factor;
    });
  }, [atipicos, ordenColumna, ordenDireccion]);

  return (
    <div>
      <button
        onClick={() => navigate("/")}
        className="mb-4 flex items-center gap-1.5 text-sm text-slate-700 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al dashboard
      </button>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          Consumos atípicos
        </h1>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          Periodo
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      <p className="mb-4 text-sm text-slate-700 dark:text-slate-400">
        Medidores cuyo consumo del periodo es el doble (o más) de su propio promedio de los últimos 6 meses. Haz
        clic en un encabezado para ordenar, o en una fila para ver el detalle del suscriptor.
      </p>

      {!cargando && (
        <p className="mb-3 text-xs text-slate-600">
          Mostrando periodo <strong>{periodo}</strong> — {atipicos.length} resultado(s)
        </p>
      )}

      {cargando ? (
        <p className="text-slate-700 dark:text-slate-400">Cargando...</p>
      ) : atipicos.length === 0 ? (
        <p className="text-slate-700 dark:text-slate-400">No hay consumos atípicos en este periodo.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white shadow-sm animate-content-in dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <EncabezadoOrdenable
                  label="NUID"
                  columna="codigo"
                  ordenColumna={ordenColumna}
                  ordenDireccion={ordenDireccion}
                  onClick={ordenarPor}
                />
                <EncabezadoOrdenable
                  label="Suscriptor"
                  columna="nombre"
                  ordenColumna={ordenColumna}
                  ordenDireccion={ordenDireccion}
                  onClick={ordenarPor}
                />
                <EncabezadoOrdenable
                  label="Consumo actual"
                  columna="consumoActual"
                  ordenColumna={ordenColumna}
                  ordenDireccion={ordenDireccion}
                  onClick={ordenarPor}
                />
                <EncabezadoOrdenable
                  label="Promedio histórico"
                  columna="promedioHistorico"
                  ordenColumna={ordenColumna}
                  ordenDireccion={ordenDireccion}
                  onClick={ordenarPor}
                />
                <EncabezadoOrdenable
                  label="Desviación"
                  columna="desviacionPct"
                  ordenColumna={ordenColumna}
                  ordenDireccion={ordenDireccion}
                  onClick={ordenarPor}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {atipicosOrdenados.map((a) => (
                <tr
                  key={a.medidorId}
                  onClick={() => setDetalleId(a.suscriptorId)}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-4 py-2.5">{a.codigo}</td>
                  <td className="px-4 py-2.5">{a.nombre}</td>
                  <td className="px-4 py-2.5">{fmt(a.consumoActual)}</td>
                  <td className="px-4 py-2.5">{fmt(a.promedioHistorico)}</td>
                  <td
                    className={`px-4 py-2.5 font-semibold ${
                      a.desviacionPct > 200 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {fmt(a.desviacionPct)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalleId !== null && (
        <SuscriptorDetailModal
          suscriptorId={detalleId}
          onClose={() => {
            setDetalleId(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
