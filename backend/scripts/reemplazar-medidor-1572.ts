// Reparación puntual (caso suscriptor 1572): el medidor físico se cambió en octubre 2025 pero
// nunca se procesó como reemplazo en el sistema — se siguió capturando lecturas bajo el mismo
// Medidor.id, así que el consumo de octubre se calculaba contra la última lectura del medidor
// VIEJO y daba negativo. Esto lo corrige de raíz: crea el registro del medidor nuevo (mismo
// patrón que "+ Reemplazar medidor" en la ficha del suscriptor), retira el viejo, y mueve las
// lecturas de oct-2025 en adelante al medidor nuevo, recalculando su consumo encadenado desde 0.
import { prisma } from "../src/lib/prisma.js";

const MEDIDOR_VIEJO_ID = 4427;
const DESDE_PERIODO = new Date("2025-10-01T00:00:00.000Z");

async function main() {
  const viejo = await prisma.medidor.findUnique({ where: { id: MEDIDOR_VIEJO_ID } });
  if (!viejo) throw new Error(`Medidor ${MEDIDOR_VIEJO_ID} no encontrado`);
  if (!viejo.suscriptorId) throw new Error(`Medidor ${MEDIDOR_VIEJO_ID} no tiene suscriptor asignado`);

  const lecturasAMover = await prisma.lectura.findMany({
    where: { medidorId: MEDIDOR_VIEJO_ID, periodo: { gte: DESDE_PERIODO } },
    orderBy: { periodo: "asc" },
  });
  if (lecturasAMover.length === 0) throw new Error("No hay lecturas desde esa fecha para mover");

  console.log(`Moviendo ${lecturasAMover.length} lecturas (desde ${lecturasAMover[0].periodo.toISOString().slice(0, 7)}) a un medidor nuevo.`);

  await prisma.$transaction(async (tx) => {
    // Medidor nuevo: mismos datos de catálogo (marca/modelo/diámetro/tipo) porque no cambió el
    // MODELO de medidor, solo la unidad física — el serial se deja vacío, se completa a mano
    // cuando se tenga (único y no lo conocemos en este arreglo de datos).
    const nuevo = await tx.medidor.create({
      data: {
        suscriptorId: viejo.suscriptorId,
        estado: "instalado",
        activo: true,
        condicion: "bueno",
        tipo: viejo.tipo,
        marcaId: viejo.marcaId,
        modeloId: viejo.modeloId,
        diametroId: viejo.diametroId,
        fechaInstalacion: DESDE_PERIODO,
        lecturaInicial: 0,
      },
    });

    // El viejo queda retirado con el MISMO criterio que usa el endpoint real de actas.ts al
    // reemplazar un medidor: solo activo=false (el campo "estado" no tiene un valor "reemplazado"
    // en este sistema — la UI ya deriva la etiqueta "Reemplazado" de activo=false). Conserva su
    // historial de lecturas hasta septiembre-2025 intacto.
    await tx.medidor.update({
      where: { id: MEDIDOR_VIEJO_ID },
      data: { activo: false },
    });

    // Re-encadena las lecturas movidas: la primera arranca desde lecturaInicial=0 del medidor
    // nuevo (igual que cualquier medidor recién instalado), las siguientes se recalculan contra
    // la anterior YA movida — mismo criterio que recalcularConsumoSiguiente en lecturas.ts.
    let base = 0;
    for (const l of lecturasAMover) {
      const valor = Number(l.valorLectura);
      const consumo = valor - base;
      await tx.lectura.update({
        where: { id: l.id },
        data: { medidorId: nuevo.id, consumo },
      });
      console.log(`  ${l.periodo.toISOString().slice(0, 7)}: valor ${valor}, consumo ${l.consumo} -> ${consumo}`);
      base = valor;
    }

    console.log(`\nMedidor nuevo creado: id ${nuevo.id} (reemplaza a ${MEDIDOR_VIEJO_ID} desde ${DESDE_PERIODO.toISOString().slice(0, 7)}).`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
