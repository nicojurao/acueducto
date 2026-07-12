import { prisma } from "../src/lib/prisma.js";

const PALABRAS_ENTIDAD = [
  "LTDA",
  "S.A",
  "SA ",
  "INSTITUTO",
  "HOSPITAL",
  "CORPORACION",
  "CORPOAMAZONIA",
  "FUNDACION",
  "ACUEDUCTO",
  "COLEGIO",
  "IGLESIA",
  "JUNTA",
  "ALCALDIA",
  "EMPRESA",
  "COOPERATIVA",
  "ASOCIACION",
  "COMUNIDAD",
  "CENTRO",
  "ESTACION",
  "ANTENA",
  "ACNUR",
  "POLICIA",
  "EJERCITO",
  "NOTARIA",
  "NACIONAL",
  "DEPARTAMENTAL",
  "MUNICIPAL",
];

function esEntidad(nombre: string): boolean {
  const n = nombre.toUpperCase();
  return PALABRAS_ENTIDAD.some((p) => n.includes(p));
}

function limpiar(nombre: string): string {
  return nombre
    .replace(/\([^)]*\)/g, " ") // quita sufijos entre paréntesis: "(Piso 2)", "(cotitular 2)"
    .replace(/-\s*[A-ZÁÉÍÓÚÑ\s]+$/i, " ") // quita sufijos tipo "-TERCER PISO"
    .replace(/\s+/g, " ")
    .trim();
}

function separar(nombreLimpio: string): [string, string, string, string] | null {
  const tokens = nombreLimpio.split(" ").filter(Boolean);
  if (tokens.length === 4) return [tokens[0], tokens[1], tokens[2], tokens[3]];
  if (tokens.length === 3) return [tokens[0], "", tokens[1], tokens[2]];
  if (tokens.length === 2) return [tokens[0], "", tokens[1], ""];
  return null;
}

async function main() {
  const suscriptores = await prisma.suscriptor.findMany({ where: { primerNombre: null } });

  let separados = 0;
  let omitidos = 0;

  for (const s of suscriptores) {
    if (esEntidad(s.nombre)) {
      omitidos++;
      continue;
    }

    const limpio = limpiar(s.nombre);
    const partes = separar(limpio);
    if (!partes) {
      omitidos++;
      continue;
    }

    const [primerNombre, segundoNombre, primerApellido, segundoApellido] = partes;
    await prisma.suscriptor.update({
      where: { id: s.id },
      data: {
        primerNombre: primerNombre || null,
        segundoNombre: segundoNombre || null,
        primerApellido: primerApellido || null,
        segundoApellido: segundoApellido || null,
      },
    });
    separados++;
  }

  console.log(`Nombres separados: ${separados}. Omitidos (entidades o ambiguos): ${omitidos}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
