-- CreateTable
CREATE TABLE "ItemInventario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT,
    "codigo" TEXT,
    "descripcion" TEXT,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "estado" TEXT NOT NULL DEFAULT 'bueno',
    "ubicacion" TEXT,
    "fechaCompra" TIMESTAMP(3),
    "valor" DECIMAL(12,2),
    "fotoUrl" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrestamoInventario" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "fechaEntrega" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaDevolucion" TIMESTAMP(3),
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrestamoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemInventario_codigo_key" ON "ItemInventario"("codigo");

-- AddForeignKey
ALTER TABLE "PrestamoInventario" ADD CONSTRAINT "PrestamoInventario_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrestamoInventario" ADD CONSTRAINT "PrestamoInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: nuevo permiso del módulo Inventario, otorgado a admin (mismo criterio que módulos previos).
INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('inventario', 'Inventario general', 'Herramientas, equipos e insumos del acueducto (distinto del inventario de medidores)');

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id FROM "Rol" r, "Permiso" p WHERE r.nombre = 'admin' AND p.clave = 'inventario';
