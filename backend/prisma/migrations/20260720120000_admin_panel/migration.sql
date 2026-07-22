-- Panel de administración (solo admin): tamaño de BD/MinIO en el tiempo + backups descargables +
-- acceso a Usuarios y Auditoría, que se mueven adentro de este panel.

CREATE TABLE "SnapshotAlmacenamiento" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tamanoBdBytes" BIGINT NOT NULL,
    "tamanoMinioBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnapshotAlmacenamiento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SnapshotAlmacenamiento_fecha_key" ON "SnapshotAlmacenamiento"("fecha");

INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('admin_panel', 'Panel de administración', 'Tamaño de la base de datos y de MinIO en el tiempo, backups descargables, y acceso a Usuarios y Auditoría');

-- Solo el rol admin (esSistema) recibe el permiso nuevo por defecto.
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id
FROM "Rol" r
CROSS JOIN "Permiso" p
WHERE p.clave = 'admin_panel' AND r."esSistema" = true
ON CONFLICT DO NOTHING;
