-- CreateTable
CREATE TABLE "_DiametroMedidorToModeloMedidor" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_DiametroMedidorToModeloMedidor_AB_unique" ON "_DiametroMedidorToModeloMedidor"("A", "B");

-- CreateIndex
CREATE INDEX "_DiametroMedidorToModeloMedidor_B_index" ON "_DiametroMedidorToModeloMedidor"("B");

-- AddForeignKey
ALTER TABLE "_DiametroMedidorToModeloMedidor" ADD CONSTRAINT "_DiametroMedidorToModeloMedidor_A_fkey" FOREIGN KEY ("A") REFERENCES "DiametroMedidor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DiametroMedidorToModeloMedidor" ADD CONSTRAINT "_DiametroMedidorToModeloMedidor_B_fkey" FOREIGN KEY ("B") REFERENCES "ModeloMedidor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

