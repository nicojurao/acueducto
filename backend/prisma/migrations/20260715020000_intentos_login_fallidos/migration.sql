-- CreateTable
CREATE TABLE "IntentoLoginFallido" (
    "id" SERIAL NOT NULL,
    "identificador" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "dispositivo" TEXT,
    "motivo" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoLoginFallido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntentoLoginFallido_fecha_idx" ON "IntentoLoginFallido"("fecha");

-- CreateIndex
CREATE INDEX "IntentoLoginFallido_identificador_fecha_idx" ON "IntentoLoginFallido"("identificador", "fecha");
