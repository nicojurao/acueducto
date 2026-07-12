import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

const [nombreUsuario, password, nombre] = process.argv.slice(2);
if (!nombreUsuario || !password || !nombre) {
  console.error('Uso: npm run create-admin -- usuario "clave" "Nombre Apellido"');
  process.exit(1);
}

async function main() {
  const rolAdmin = await prisma.rol.findUnique({ where: { nombre: "admin" } });
  if (!rolAdmin) throw new Error('No existe el rol "admin" (¿corriste las migraciones?)');

  const passwordHash = await bcrypt.hash(password, 10);
  const usuario = await prisma.usuario.upsert({
    where: { nombreUsuario },
    create: { nombre, nombreUsuario, passwordHash, rolId: rolAdmin.id },
    update: { nombre, passwordHash, rolId: rolAdmin.id, activo: true },
  });
  console.log(`Admin listo: ${usuario.nombreUsuario} (id ${usuario.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
