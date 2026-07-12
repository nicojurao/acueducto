-- CreateTable
CREATE TABLE "CategoriaInventario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoriaInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UbicacionInventario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UbicacionInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProveedorInventario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "telefono" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProveedorInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "motivo" TEXT,
    "observaciones" TEXT,
    "usuarioId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaInventario_nombre_key" ON "CategoriaInventario"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "UbicacionInventario_nombre_key" ON "UbicacionInventario"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ProveedorInventario_nombre_key" ON "ProveedorInventario"("nombre");

-- AlterTable: agregar columnas nuevas (las de texto libre siguen existiendo por ahora)
ALTER TABLE "ItemInventario"
  ADD COLUMN "categoriaId" INTEGER,
  ADD COLUMN "ubicacionId" INTEGER,
  ADD COLUMN "proveedorId" INTEGER,
  ADD COLUMN "fechaIngreso" TIMESTAMP(3),
  ADD COLUMN "ingresadoPorId" INTEGER;

-- AddForeignKey
ALTER TABLE "ItemInventario" ADD CONSTRAINT "ItemInventario_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaInventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ItemInventario" ADD CONSTRAINT "ItemInventario_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "UbicacionInventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ItemInventario" ADD CONSTRAINT "ItemInventario_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "ProveedorInventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ItemInventario" ADD CONSTRAINT "ItemInventario_ingresadoPorId_fkey" FOREIGN KEY ("ingresadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration: pasar los valores de texto libre existentes a los catálogos nuevos
INSERT INTO "CategoriaInventario" ("nombre")
SELECT DISTINCT "categoria" FROM "ItemInventario" WHERE "categoria" IS NOT NULL AND "categoria" <> ''
ON CONFLICT ("nombre") DO NOTHING;

UPDATE "ItemInventario" i
SET "categoriaId" = c.id
FROM "CategoriaInventario" c
WHERE c."nombre" = i."categoria";

INSERT INTO "UbicacionInventario" ("nombre")
SELECT DISTINCT "ubicacion" FROM "ItemInventario" WHERE "ubicacion" IS NOT NULL AND "ubicacion" <> ''
ON CONFLICT ("nombre") DO NOTHING;

UPDATE "ItemInventario" i
SET "ubicacionId" = u.id
FROM "UbicacionInventario" u
WHERE u."nombre" = i."ubicacion";

-- Ahora sí se eliminan las columnas de texto libre, ya migradas a FK
ALTER TABLE "ItemInventario" DROP COLUMN "categoria";
ALTER TABLE "ItemInventario" DROP COLUMN "ubicacion";
