-- El login deja de ser por correo: ahora es por cédula (usuarios normales) o por nombre de
-- usuario (el admin usa su usuario "admin"). Se conserva el valor de "email" existente como
-- "nombreUsuario" para que nadie quede sin poder iniciar sesión; se puede editar después desde
-- la pantalla de Usuarios.
ALTER TABLE "Usuario" RENAME COLUMN "email" TO "nombreUsuario";
ALTER INDEX "Usuario_email_key" RENAME TO "Usuario_nombreUsuario_key";
