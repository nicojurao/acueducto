-- Separa el permiso todo-o-nada "actas" en "actas_ver" y "actas_avanzado" (mismo patrón que
-- medidores/aforos/inventario, ver 20260704123409_permisos_ver_avanzado). Motivo: el Asistente
-- Coordinador Operativo necesitaba poder VER el historial de actas (hoy no podía verlas en
-- absoluto) sin poder crear/editar/borrar actas, algo que el permiso único no permitía separar.

INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('actas_ver', 'Actas de instalación', 'Ver el historial de actas de instalación'),
    ('actas_avanzado', 'Actas de instalación (avanzado)', 'Crear, editar, generar PDF y borrar actas de instalación');

-- Cada rol que tenía el permiso viejo "actas" recibe AMBOS permisos nuevos, así ningún rol
-- existente pierde acceso (admin y Coordinador Operativo seguían pudiendo crear/editar/borrar).
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT rp."rolId", p.id
FROM "RolPermiso" rp
JOIN "Permiso" viejo ON viejo.id = rp."permisoId" AND viejo.clave = 'actas'
CROSS JOIN "Permiso" p WHERE p.clave IN ('actas_ver', 'actas_avanzado')
ON CONFLICT DO NOTHING;

-- El ON DELETE CASCADE de RolPermiso.permisoId limpia las filas viejas de RolPermiso.
DELETE FROM "Permiso" WHERE clave = 'actas';
