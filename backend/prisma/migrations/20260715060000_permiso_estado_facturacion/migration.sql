-- Permiso nuevo (no reemplaza ninguno viejo): permite cambiar SOLO el estado de facturación de
-- un suscriptor sin el resto de "suscriptores_avanzado". Pensado para el rol Asistente
-- Coordinador Operativo, que puede mover el estado de facturación en su día a día pero no debe
-- poder editar los demás datos del suscriptor.

INSERT INTO "Permiso" ("clave", "nombre", "descripcion") VALUES
    ('suscriptores_estado_facturacion', 'Suscriptores (estado de facturación)', 'Cambiar el estado de facturación de un suscriptor, sin poder editar el resto de sus datos');
