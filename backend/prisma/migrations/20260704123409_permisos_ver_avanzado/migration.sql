-- Separa los permisos todo-o-nada de Medidores, Aforos e Inventario general en "ver" y
-- "avanzado" (mismo patrón que ya existe para Suscriptores), para poder dar acceso de solo
-- consulta sin permitir editar/eliminar. Cada rol que tenía el permiso viejo recibe AMBOS
-- permisos nuevos, así ningún rol existente pierde acceso.

INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('medidores_ver', 'Medidores', 'Ver el inventario y catálogo de medidores'),
    ('medidores_avanzado', 'Medidores (avanzado)', 'Crear, editar, eliminar e importar/exportar medidores'),
    ('aforos_ver', 'Aforos', 'Ver puntos de aforo y el historial de registros de caudal'),
    ('aforos_avanzado', 'Aforos (avanzado)', 'Crear, editar y eliminar puntos de aforo y registros de caudal'),
    ('inventario_ver', 'Inventario general', 'Ver ítems, préstamos, movimientos y catálogos del inventario general'),
    ('inventario_avanzado', 'Inventario general (avanzado)', 'Crear, editar y eliminar ítems, préstamos, movimientos y catálogos del inventario general');

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT rp."rolId", p.id
FROM "RolPermiso" rp
JOIN "Permiso" viejo ON viejo.id = rp."permisoId" AND viejo.clave = 'medidores'
CROSS JOIN "Permiso" p WHERE p.clave IN ('medidores_ver', 'medidores_avanzado')
ON CONFLICT DO NOTHING;

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT rp."rolId", p.id
FROM "RolPermiso" rp
JOIN "Permiso" viejo ON viejo.id = rp."permisoId" AND viejo.clave = 'aforos'
CROSS JOIN "Permiso" p WHERE p.clave IN ('aforos_ver', 'aforos_avanzado')
ON CONFLICT DO NOTHING;

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT rp."rolId", p.id
FROM "RolPermiso" rp
JOIN "Permiso" viejo ON viejo.id = rp."permisoId" AND viejo.clave = 'inventario'
CROSS JOIN "Permiso" p WHERE p.clave IN ('inventario_ver', 'inventario_avanzado')
ON CONFLICT DO NOTHING;

-- El ON DELETE CASCADE de RolPermiso.permisoId limpia las filas viejas de RolPermiso.
DELETE FROM "Permiso" WHERE clave IN ('medidores', 'aforos', 'inventario');
