// Placeholder de carga tipo "hueso" para tablas/listas, en vez del texto plano "Cargando..." —
// da una idea de la forma del contenido que va a aparecer y se percibe más rápido en conexiones
// lentas (justo el escenario de "sin internet" de los fontaneros en campo).
function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 dark:bg-slate-800 ${className}`} />;
}

export function SkeletonTabla({ filas = 6, columnas = 5 }: { filas?: number; columnas?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: filas }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: columnas }).map((_, j) => (
              <Bone key={j} className={`h-4 ${j === 0 ? "w-16" : "flex-1"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonLista({ filas = 6 }: { filas?: number }) {
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Bone className="h-6 w-6 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Bone className="h-3.5 w-1/3" />
            <Bone className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
