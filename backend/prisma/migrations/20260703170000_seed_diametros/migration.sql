-- Precarga los diámetros de medidor más comunes del mercado, para no tener que crearlos
-- uno por uno la primera vez que se usa el catálogo. Si alguno ya existe (por import previo
-- o carga manual) se deja tal cual, gracias al ON CONFLICT.
INSERT INTO "DiametroMedidor" ("valor") VALUES
    ('1/2"'),
    ('3/4"'),
    ('1"'),
    ('1 1/2"'),
    ('2"'),
    ('3"'),
    ('4"'),
    ('6"')
ON CONFLICT ("valor") DO NOTHING;
