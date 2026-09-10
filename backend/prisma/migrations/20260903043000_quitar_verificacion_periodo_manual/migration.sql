-- El checklist de verificación de periodo pasó de marcado manual (esta tabla) a calculado en
-- vivo contra el estado real de la BD (ver backend/src/lib/verificacionPeriodo.ts) — un checkbox
-- que cualquiera puede marcar sin que sea cierto no aportaba nada.
DROP TABLE "VerificacionPeriodo";
