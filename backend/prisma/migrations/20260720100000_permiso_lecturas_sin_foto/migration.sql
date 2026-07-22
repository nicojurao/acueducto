-- Permiso nuevo: permite guardar una lectura sin la foto obligatoria del medidor, siempre que
-- se escriba una observación en su lugar. Pensado para admin, Coordinador Operativo y Asistente
-- Coordinador Operativo (roles de oficina que a veces registran una lectura reportada sin poder
-- ir a fotografiar el medidor); Fontanero (quien sí va al predio) sigue necesitando la foto.

INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('lecturas_sin_foto', 'Lecturas (guardar sin foto)', 'Guardar una lectura sin foto del medidor, siempre que se escriba una observación');

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id
FROM "Rol" r
CROSS JOIN "Permiso" p
WHERE p.clave = 'lecturas_sin_foto'
  AND r.nombre IN ('admin', 'Coordinador Operativo', 'Asistente Coordinador Operativo')
ON CONFLICT DO NOTHING;
