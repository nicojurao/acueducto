-- CreateTable
CREATE TABLE "Empresa" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nit" TEXT NOT NULL DEFAULT '',
    "nitDv" TEXT NOT NULL DEFAULT '',
    "nombre" TEXT NOT NULL DEFAULT '',
    "nombreCorto" TEXT NOT NULL DEFAULT '',
    "direccion" TEXT NOT NULL DEFAULT '',
    "sitioWeb" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "telefonos" TEXT NOT NULL DEFAULT '',
    "colorMarca" TEXT NOT NULL DEFAULT '#00487f',
    "logoRuta" TEXT,
    "daneDepartamento" TEXT NOT NULL DEFAULT '',
    "daneMunicipio" TEXT NOT NULL DEFAULT '',
    "daneCentroPoblado" TEXT NOT NULL DEFAULT '',
    "glnGs1" TEXT NOT NULL DEFAULT '',
    "dominioOperativo" TEXT NOT NULL DEFAULT '',
    "dominioPqrs" TEXT NOT NULL DEFAULT '',
    "dominioCalidad" TEXT NOT NULL DEFAULT '',
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" INTEGER,
    "smtpUser" TEXT NOT NULL DEFAULT '',
    "smtpPass" TEXT NOT NULL DEFAULT '',
    "smtpFrom" TEXT NOT NULL DEFAULT '',
    "configuradoEn" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- Semilla: usuario admin/admin, SOLO si la tabla de usuarios está completamente vacía — así esto
-- nunca toca un despliegue que ya tiene usuarios reales, y solo dispara en una base de datos
-- nueva de verdad (cliente nuevo, docker compose up por primera vez). El hash es un bcrypt real
-- (costo 10, igual que scripts/create-admin.ts) de la contraseña literal "admin".
INSERT INTO "Usuario" ("nombre", "nombreUsuario", "passwordHash", "rolId")
SELECT 'Administrador', 'admin', '$2a$10$yU0bZ49aP0AWUPE2Er.fFu3QRovKKyyqPI0BHYyLMh0Rq6FpduBMS', r.id
FROM "Rol" r
WHERE r.nombre = 'admin'
AND NOT EXISTS (SELECT 1 FROM "Usuario");

-- A propósito NO se siembra ninguna fila en "Empresa" acá (a diferencia de un primer intento de
-- esta migración, que sí traía los datos de ACBUM hardcodeados): esta migración la hereda
-- CUALQUIER cliente nuevo que clone el repo, así que no puede traer los datos de un cliente en
-- particular — eso rompería el wizard (mostraría el sistema como "ya configurado" con datos
-- ajenos). GET /api/admin/empresa ya maneja "la fila no existe todavía" devolviendo defaults
-- (mismo patrón que PqrConfiguracion). Los datos reales de ACBUM para SU propio despliegue se
-- cargaron aparte, con un UPDATE directo contra esa base de datos — no viven en el historial de
-- git ni en ninguna migración.
