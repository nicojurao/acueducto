-- "fontanero" deja de ser un rol de sistema: se puede renombrar y eliminar como cualquier
-- rol creado a mano. "admin" sigue protegido porque scripts/create-admin.ts lo busca por
-- ese nombre exacto para poder restablecer el acceso administrativo si hace falta.
UPDATE "Rol" SET "esSistema" = false WHERE "nombre" = 'fontanero';
