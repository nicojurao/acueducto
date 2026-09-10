// Dígito de verificación del NIT — algoritmo oficial de la DIAN (módulo 11), el mismo que usan
// las Cámaras de Comercio y la propia DIAN para validar/calcular el DV. Se usa en el wizard para
// sugerir el DV apenas se escribe el NIT — sigue siendo editable por si el que ya tiene el
// cliente en su RUT no coincide (poco común, pero pasa).
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function calcularDvNit(nit: string): string {
  const digitos = nit.replace(/\D/g, "");
  if (!digitos) return "";
  let suma = 0;
  for (let i = 0; i < digitos.length && i < PESOS.length; i++) {
    const digito = Number(digitos[digitos.length - 1 - i]);
    suma += digito * PESOS[i];
  }
  const residuo = suma % 11;
  const dv = residuo <= 1 ? residuo : 11 - residuo;
  return String(dv);
}
