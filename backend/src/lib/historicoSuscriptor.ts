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
export async function historicoSuscriptor(suscriptorId: number) {
  const medidoresPropios = await prisma.medidor.findMany({
    where: { suscriptorId },
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
    return m.lecturas.map((l) => {
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
