-- Permiso nuevo: permite cargar lecturas masivamente desde un Excel (NUID + Lectura) para un
-- periodo elegido. Se restringe a admin y Coordinador Operativo (carga masiva de oficina, no
-- una acción de campo como la lectura individual del Fontanero).

INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('lecturas_importar', 'Lecturas (importar Excel)', 'Cargar lecturas masivamente desde un Excel (NUID + Lectura) para un periodo');

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id
FROM "Rol" r
CROSS JOIN "Permiso" p
WHERE p.clave = 'lecturas_importar'
  AND r.nombre IN ('admin', 'Coordinador Operativo')
ON CONFLICT DO NOTHING;
