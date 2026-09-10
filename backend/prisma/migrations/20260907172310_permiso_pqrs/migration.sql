-- Panel interno de PQRS (mismo patrón ver/avanzado que Medidores/Aforos/Inventario): "ver" deja
-- consultar el listado y el detalle de cada PQR radicada desde pqrs.acbum.com.co; "avanzado" deja
-- además cambiar el estado y guardar una respuesta.
INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('pqrs_ver', 'PQRS', 'Ver las PQR radicadas por el público y su detalle'),
    ('pqrs_avanzado', 'PQRS (avanzado)', 'Cambiar el estado de una PQR y registrar una respuesta');

-- Solo el rol admin (esSistema) recibe los permisos nuevos por defecto.
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id
FROM "Rol" r
CROSS JOIN "Permiso" p
WHERE p.clave IN ('pqrs_ver', 'pqrs_avanzado') AND r."esSistema" = true
ON CONFLICT DO NOTHING;
