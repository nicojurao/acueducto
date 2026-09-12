-- AlterTable: Gasto todavía no tenía ninguna fila (el módulo de captura de gastos se agrega en
-- esta misma tanda de trabajo), así que agregar columnas NOT NULL sin default es seguro acá.
ALTER TABLE "Gasto" ADD COLUMN "cuentaGastoId" INTEGER NOT NULL;
ALTER TABLE "Gasto" ADD COLUMN "pagado" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_cuentaGastoId_fkey" FOREIGN KEY ("cuentaGastoId") REFERENCES "CuentaPuc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
