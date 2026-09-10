import { prisma } from "./prisma.js";

export interface PasoVerificacion {
  paso: string;
  etiqueta: string;
  ok: boolean;
  detalle: string;
}

// La captura de lecturas arranca el día 20 de cada mes: un medidor instalado el 21 o después ya
// no alcanza a tener lectura ese mes y pasa derecho al periodo siguiente — mismo corte que ya
// usan dashboard.ts (KPI "lecturas pendientes") y lecturas.ts (pantalla de captura), para que
// este checklist cuente exactamente lo mismo que esas pantallas.
function corteInstalacion(fechaPeriodo: Date): Date {
  return new Date(Date.UTC(fechaPeriodo.getUTCFullYear(), fechaPeriodo.getUTCMonth(), 21));
}

// Checklist REAL antes de facturar: cada paso se calcula contra el estado actual de la base de
// datos, no se marca a mano. No hay "quién lo verificó" porque no lo verifica una persona — lo
// verifica el sistema cada vez que se consulta.
export async function calcularVerificacionPeriodo(fechaPeriodo: Date): Promise<PasoVerificacion[]> {
  const tarifa = await prisma.tarifa.findFirst({
    where: { vigenciaDesde: { lte: fechaPeriodo } },
    orderBy: { vigenciaDesde: "desc" },
  });

  // Mismo universo de medidores que cuenta "lecturas pendientes" en el dashboard, pero acá un
  // medidor con NOVEDAD registrada para el periodo también cuenta como resuelto (no solo lectura
  // real) — es justo la distinción que separa este checklist de ese KPI.
  const whereBase = {
    activo: true,
    suscriptorId: { not: null },
    OR: [{ fechaInstalacion: null }, { fechaInstalacion: { lt: corteInstalacion(fechaPeriodo) } }],
    suscriptor: { estadoFacturacion: { not: "inactivo" as const } },
  };
  const [totalMedidores, sinResolver] = await Promise.all([
    prisma.medidor.count({ where: whereBase }),
    prisma.medidor.count({
      where: {
        ...whereBase,
        lecturas: { none: { periodo: fechaPeriodo } },
        novedadesLectura: { none: { periodo: fechaPeriodo } },
      },
    }),
  ]);

  return [
    {
      paso: "tarifa_vigente",
      etiqueta: "Tarifa vigente para este periodo",
      ok: !!tarifa,
      detalle: tarifa
        ? `Vigente desde ${tarifa.vigenciaDesde.toISOString().slice(0, 7)}`
        : "No hay ninguna tarifa con vigencia anterior o igual a este periodo",
    },
    {
      paso: "lecturas_completas",
      etiqueta: "Lecturas del periodo completas (o con novedad registrada)",
      ok: sinResolver === 0,
      detalle:
        sinResolver === 0
          ? `${totalMedidores} medidores, todos con lectura o novedad`
          : `${sinResolver} de ${totalMedidores} medidores sin lectura ni novedad`,
    },
  ];
}

export async function periodoListoParaFacturar(fechaPeriodo: Date): Promise<boolean> {
  const pasos = await calcularVerificacionPeriodo(fechaPeriodo);
  return pasos.every((p) => p.ok);
}

export const MENSAJE_VERIFICACION_INCOMPLETA =
  "Antes de facturar hay que resolver el checklist del periodo (tarifa vigente y lecturas completas).";
