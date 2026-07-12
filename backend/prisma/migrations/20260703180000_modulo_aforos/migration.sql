-- CreateTable
CREATE TABLE "PuntoAforo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuntoAforo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aforo" (
    "id" SERIAL NOT NULL,
    "puntoAforoId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "metodo" TEXT NOT NULL,
    "volumenLitros" DECIMAL(10,2),
    "tiempoSegundos" DECIMAL(10,2),
    "distanciaMetros" DECIMAL(10,2),
    "areaM2" DECIMAL(10,3),
    "caudalLps" DECIMAL(10,3) NOT NULL,
    "observaciones" TEXT,
    "fotoUrl" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "capturadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aforo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Aforo" ADD CONSTRAINT "Aforo_puntoAforoId_fkey" FOREIGN KEY ("puntoAforoId") REFERENCES "PuntoAforo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aforo" ADD CONSTRAINT "Aforo_capturadoPorId_fkey" FOREIGN KEY ("capturadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: nuevo permiso del módulo de Aforos, otorgado a admin (mismo criterio que módulos
-- previos: admin recibe todos los permisos; fontanero no, se asigna a mano si aplica).
INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('aforos', 'Aforos', 'Puntos de aforo y registro de caudal en fuentes/bocatomas');

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id FROM "Rol" r, "Permiso" p WHERE r.nombre = 'admin' AND p.clave = 'aforos';
