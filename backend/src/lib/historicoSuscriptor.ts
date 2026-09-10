import { prisma } from "./prisma.js";
import { repartirEntero } from "./cotitularSplit.js";
import { periodoFacturableActual } from "./periodo.js";

// Histórico de consumo de un suscriptor (para gráfico de tendencia).
// Si el suscriptor es titular de un medidor, se cuenta el consumo completo.
// Si es cotitular de un medidor compartido (acometida multiusuario), se reparte
// el consumo en partes iguales entre el titular y todos sus cotitulares.
// Los meses entre la primera lectura y el periodo actual que no tengan lectura se
// marcan con sinLectura=true (y el motivo de la novedad, si se registró uno).
// Vive en lib/ (no en reportes.ts) porque la reusan 2 endpoints (JSON y PDF del informe de
// suscriptor) — moverla acá evita que alguno de los dos quede con una copia desactualizada.
// "YYYY-MM" del periodo, para comparar contra ventanas de instalación sin líos de huso horario.
function mesDe(fecha: Date): string {
  return fecha.toISOString().slice(0, 7);
}

export async function historicoSuscriptor(suscriptorId: number) {
  // Los medidores "propios" de este suscriptor a lo largo del tiempo son los que tienen un acta
  // de instalación a su nombre (aunque ya hayan vuelto a bodega y perdido el suscriptorId actual)
  // más el que esté vinculado hoy mismo (por si acaso falta el acta, ej. cargas históricas
  // antiguas). Usar solo Medidor.suscriptorId perdería las lecturas de medidores reemplazados,
  // que al reemplazarse se desvinculan del suscriptor para no seguir apareciendo como instalados.
  //
  // Un mismo medidor físico puede haber pasado por VARIOS suscriptores con el tiempo (se le quita
  // a uno y se instala en otro predio) — no basta con "este medidor tuvo un acta con este
  // suscriptor alguna vez", hay que acotar cada lectura a la ventana [fechaInstalacion,
  // fechaRetiro] de esa acta puntual, si no las lecturas tomadas en el OTRO predio se colarían acá.
  const actasSuscriptor = await prisma.actaInstalacion.findMany({
    where: { suscriptorId },
    select: { medidorId: true },
  });
  const medidorVinculadoHoy = await prisma.medidor.findMany({
    where: { suscriptorId },
    select: { id: true, fechaInstalacion: true },
  });
  const medidorIdsPropios = [...new Set([...actasSuscriptor.map((a) => a.medidorId), ...medidorVinculadoHoy.map((m) => m.id)])];

  // Dueño real de cada mes de lecturas de estos medidores: se arma con TODAS las actas de esos
  // medidores (de cualquier suscriptor, no solo el actual), porque un mismo medidor físico puede
  // haber pasado por varios predios con el tiempo. Un mes que no cae en ninguna ventana de acta
  // (frecuente en la carga histórica: hay lecturas de antes de que se registrara formalmente el
  // acta) se atribuye al primer suscriptor que tuvo ese medidor, no se descarta.
  const todasLasActas = medidorIdsPropios.length
    ? await prisma.actaInstalacion.findMany({
        where: { medidorId: { in: medidorIdsPropios } },
        select: { medidorId: true, suscriptorId: true, fechaInstalacion: true, fechaRetiro: true },
        orderBy: { fechaInstalacion: "asc" },
      })
    : [];
  const ventanasGlobalesPorMedidor = new Map<number, { suscriptorId: number; desde: string; hasta: string | null }[]>();
  for (const a of todasLasActas) {
    if (!ventanasGlobalesPorMedidor.has(a.medidorId)) ventanasGlobalesPorMedidor.set(a.medidorId, []);
    ventanasGlobalesPorMedidor.get(a.medidorId)!.push({
      suscriptorId: a.suscriptorId,
      desde: mesDe(a.fechaInstalacion),
      hasta: a.fechaRetiro ? mesDe(a.fechaRetiro) : null,
    });
  }
  for (const m of medidorVinculadoHoy) {
    // Vinculado hoy sin ninguna acta que lo respalde (dato histórico cargado sin pasar por el
    // flujo de actas): ventana abierta a nombre de este suscriptor desde su fechaInstalacion.
    if (!ventanasGlobalesPorMedidor.has(m.id)) {
      ventanasGlobalesPorMedidor.set(m.id, [
        { suscriptorId, desde: m.fechaInstalacion ? mesDe(m.fechaInstalacion) : "0000-00", hasta: null },
      ]);
    }
  }
  const duenoDePeriodo = (medidorId: number, periodo: string): number | null => {
    const ventanas = ventanasGlobalesPorMedidor.get(medidorId);
    if (!ventanas || ventanas.length === 0) return null;
    const exacta = ventanas.find((v) => periodo >= v.desde && (v.hasta === null || periodo <= v.hasta));
    if (exacta) return exacta.suscriptorId;
    // Fuera de toda ventana registrada: si es anterior a la primera instalación conocida, es una
    // lectura inicial de ese mismo primer suscriptor; si es posterior a todas, no se atribuye a
    // nadie (medidor de vuelta en bodega, sin lecturas reales esperables ahí).
    const primera = ventanas[0];
    return periodo < primera.desde ? primera.suscriptorId : null;
  };
  const dentroDeVentana = (medidorId: number, periodo: string): boolean => duenoDePeriodo(medidorId, periodo) === suscriptorId;

  const medidoresPropios = await prisma.medidor.findMany({
    where: { id: { in: medidorIdsPropios } },
    include: {
      lecturas: { orderBy: { periodo: "asc" }, include: { capturadoPor: { select: { nombre: true } } } },
      cotitulares: true,
    },
  });

  // Si el medidor propio tiene cotitulares, al titular le toca el total menos lo que ya se le dio
  // en partes enteras a cada cotitular (mismo criterio que el informe de lecturas: el titular
  // absorbe el resto de la división, no cada cotitular).
  const historico = medidoresPropios.flatMap((m) => {
    const nIntegrantes = 1 + m.cotitulares.length;
    return m.lecturas
      .filter((l) => dentroDeVentana(m.id, mesDe(l.periodo)))
      .map((l) => {
      const valorLecturaTotal = Number(l.valorLectura);
      const consumoTotal = Number(l.consumo);
      return {
        periodo: l.periodo.toISOString().slice(0, 7),
        valorLectura: repartirEntero(valorLecturaTotal, nIntegrantes, false),
        consumo: repartirEntero(consumoTotal, nIntegrantes, false),
        medidorId: m.id,
        lecturaId: l.id,
        fotoUrl: l.fotoUrl,
        latitud: l.latitud,
        longitud: l.longitud,
        fechaRegistro: l.fechaRegistro.toISOString(),
        capturadoPor: l.capturadoPor?.nombre ?? null,
        observaciones: l.observaciones,
        // Valor real del medidor, sin repartir entre cotitulares — para quien necesite el dato
        // físico tal cual se capturó (auditoría, detectar fugas), no solo la parte facturable.
        consumoTotalMedidor: nIntegrantes > 1 ? consumoTotal : null,
        nIntegrantes: nIntegrantes > 1 ? nIntegrantes : null,
      };
    });
  });

  const medidorIds = medidoresPropios.map((m) => m.id);
  // Medidor a usar para los meses sin lectura (huecos): el activo actual, si hay uno.
  let medidorActivoId = medidoresPropios.find((m) => m.activo)?.id ?? medidoresPropios[0]?.id;

  const cotitularDe = await prisma.cotitular.findUnique({
    where: { suscriptorId },
    include: {
      medidor: {
        include: { lecturas: { include: { capturadoPor: { select: { nombre: true } } } }, cotitulares: true },
      },
    },
  });

  if (cotitularDe) {
    medidorIds.push(cotitularDe.medidor.id);
    medidorActivoId = medidorActivoId ?? cotitularDe.medidor.id;
    // Entero, no decimal: mismo criterio del informe de lecturas — cada cotitular recibe la
    // parte entera (floor); lo que sobra se lo queda el titular, no se ve reflejado acá.
    const nIntegrantes = 1 + cotitularDe.medidor.cotitulares.length;
    for (const l of cotitularDe.medidor.lecturas) {
      historico.push({
        periodo: l.periodo.toISOString().slice(0, 7),
        valorLectura: repartirEntero(Number(l.valorLectura), nIntegrantes, true),
        consumo: repartirEntero(Number(l.consumo), nIntegrantes, true),
        medidorId: cotitularDe.medidor.id,
        lecturaId: l.id,
        fotoUrl: l.fotoUrl,
        latitud: l.latitud,
        longitud: l.longitud,
        fechaRegistro: l.fechaRegistro.toISOString(),
        capturadoPor: l.capturadoPor?.nombre ?? null,
        observaciones: l.observaciones,
        consumoTotalMedidor: Number(l.consumo),
        nIntegrantes,
      });
    }
  }

  if (historico.length === 0) return [];

  historico.sort((a, b) => a.periodo.localeCompare(b.periodo));

  const novedades = medidorIds.length
    ? await prisma.novedadLectura.findMany({ where: { medidorId: { in: medidorIds } } })
    : [];
  const novedadPorPeriodo = new Map(
    novedades.map((n) => [n.periodo.toISOString().slice(0, 7), { id: n.id, motivo: n.motivo, fotos: n.fotos }])
  );
  const existentePorPeriodo = new Map(historico.map((h) => [h.periodo, h]));

  const completo: {
    periodo: string;
    valorLectura: number | null;
    consumo: number;
    sinLectura: boolean;
    motivo?: string;
    novedadId?: number;
    fotos?: string[];
    medidorId?: number;
    lecturaId?: number;
    fechaRegistro?: string;
    capturadoPor?: string | null;
  }[] = [];

  // El rango llega hasta el mes calendario actual (o hasta el último periodo con novedad,
  // si por algún motivo es más reciente), para que una novedad recién marcada sea visible ya.
  const ultimaNovedad = novedades.reduce<string | null>((max, n) => {
    const p = n.periodo.toISOString().slice(0, 7);
    return !max || p > max ? p : max;
  }, null);
  const finRango = [periodoFacturableActual(), ultimaNovedad ?? ""].sort().at(-1)!;

  let [y, m] = historico[0].periodo.split("-").map(Number);
  const [yFin, mFin] = finRango.split("-").map(Number);
  while (y < yFin || (y === yFin && m <= mFin)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const existente = existentePorPeriodo.get(key);
    if (existente) {
      completo.push({ ...existente, sinLectura: false });
    } else {
      const novedad = novedadPorPeriodo.get(key);
      completo.push({
        periodo: key,
        valorLectura: null,
        consumo: 0,
        sinLectura: true,
        motivo: novedad?.motivo,
        novedadId: novedad?.id,
        fotos: novedad?.fotos,
        medidorId: medidorActivoId,
      });
    }
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return completo;
}
