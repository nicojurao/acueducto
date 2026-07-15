-- CreateTable
CREATE TABLE "EventoSeguridad" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoSeguridad_pkey" PRIMARY KEY ("id")
);

-- Registra la rotación de JWT_SECRET que se hizo a mano justo antes de esta migración: todo
-- login anterior a este momento quedó inválido de una, sin importar que su fecha esté dentro
-- de la ventana de "1 día" que usa Auditoría para marcar sesiones como activas.
INSERT INTO "EventoSeguridad" ("tipo") VALUES ('rotacion_secreto');
