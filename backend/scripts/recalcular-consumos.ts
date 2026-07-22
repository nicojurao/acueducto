// Reparación puntual: recalcula el consumo de TODAS las lecturas de todos los medidores en
// orden cronológico real (valorLectura del periodo - valorLectura del periodo anterior, o
// lecturaInicial si es la primera lectura del medidor). Corrige lecturas que quedaron con
// consumo = valorLectura por captura en orden inverso (más reciente primero) o por huecos en
// la importación histórica que perdieron la referencia del mes anterior.
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const medidores = await prisma.medidor.findMany({
    include: { lecturas: { orderBy: { periodo: "asc" } } },
  });

  let corregidas = 0;
  for (const medidor of medidores) {
    let anterior = Number(medidor.lecturaInicial ?? 0);
    for (const lectura of medidor.lecturas) {
      const valor = Number(lectura.valorLectura);
      const consumoCorrecto = valor - anterior;
      if (Number(lectura.consumo) !== consumoCorrecto) {
        await prisma.lectura.update({ where: { id: lectura.id }, data: { consumo: consumoCorrecto } });
        console.log(
          `Medidor ${medidor.id} periodo ${lectura.periodo.toISOString().slice(0, 7)}: consumo ${lectura.consumo} -> ${consumoCorrecto}`
        );
        corregidas++;
      }
      anterior = valor;
    }
  }

  console.log(`\nListo: ${corregidas} lecturas corregidas.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
