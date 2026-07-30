// Motor de liquidación de una factura según la metodología CRA 825 de 2017. Acueducto y
// alcantarillado usan la MISMA fórmula con componentes independientes: cargo fijo (CMA) +
// valor m³ (CMO+CMI+CMT) partido en rangos básico/complementario/suntuario. El ajuste por
// estrato es un % único: subsidio (negativo) solo sobre los cargos fijos + consumo básico de
// los servicios activos; contribución (positiva) sobre todo el servicio. Función pura (sin
// Prisma) para poderla probar y reusar.

export interface TarifaCalculo {
  cma: number;
  cmo: number;
  cmi: number;
  cmt: number;
  rangoBasicoHastaM3: number;
  rangoComplementarioHastaM3: number;
  // Alcantarillado: misma estructura; todos null = la vigencia no cobra alcantarillado.
  alcCma: number | null;
  alcCmo: number | null;
  alcCmi: number | null;
  alcCmt: number | null;
  aseoCargoFijo: number | null;
}

export interface ServiciosSuscriptor {
  tieneAcueducto: boolean;
  tieneAlcantarillado: boolean;
}

export interface ConceptoCalculado {
  tipo: string;
  descripcion: string;
  cantidad: number | null;
  valorUnitario: number | null;
  valor: number;
}

export interface ResultadoLiquidacion {
  conceptos: ConceptoCalculado[];
  subtotal: number;
  ajusteEstrato: number;
  total: number;
}

// Los pesos colombianos se facturan en enteros — cada concepto se redondea por separado
// (no solo el total), para que el desglose impreso siempre sume exacto.
const redondear = (v: number) => Math.round(v);

function rangosDeConsumo(consumoM3: number, basicoHasta: number, complementarioHasta: number) {
  return {
    basico: Math.min(consumoM3, basicoHasta),
    complementario: Math.min(Math.max(consumoM3 - basicoHasta, 0), complementarioHasta - basicoHasta),
    suntuario: Math.max(consumoM3 - complementarioHasta, 0),
  };
}

// Conceptos de UN servicio (acueducto o alcantarillado): cargo fijo + consumo por rangos.
function conceptosDeServicio(
  prefijo: "" | "alcantarillado_",
  etiqueta: string,
  consumoM3: number,
  cargoFijo: number,
  valorM3: number,
  basicoHasta: number,
  complementarioHasta: number
): ConceptoCalculado[] {
  const conceptos: ConceptoCalculado[] = [
    {
      tipo: `${prefijo}cargo_fijo`,
      descripcion: `Cargo fijo ${etiqueta} (CMA)`,
      cantidad: null,
      valorUnitario: null,
      valor: redondear(cargoFijo),
    },
  ];
  const r = rangosDeConsumo(consumoM3, basicoHasta, complementarioHasta);
  if (r.basico > 0) {
    conceptos.push({
      tipo: `${prefijo}consumo_basico`,
      descripcion: `Consumo básico ${etiqueta} (0-${basicoHasta} m³)`,
      cantidad: r.basico,
      valorUnitario: valorM3,
      valor: redondear(r.basico * valorM3),
    });
  }
  if (r.complementario > 0) {
    conceptos.push({
      tipo: `${prefijo}consumo_complementario`,
      descripcion: `Consumo complementario ${etiqueta} (${basicoHasta}-${complementarioHasta} m³)`,
      cantidad: r.complementario,
      valorUnitario: valorM3,
      valor: redondear(r.complementario * valorM3),
    });
  }
  if (r.suntuario > 0) {
    conceptos.push({
      tipo: `${prefijo}consumo_suntuario`,
      descripcion: `Consumo suntuario ${etiqueta} (>${complementarioHasta} m³)`,
      cantidad: r.suntuario,
      valorUnitario: valorM3,
      valor: redondear(r.suntuario * valorM3),
    });
  }
  return conceptos;
}

export function liquidarFactura(
  consumoM3: number,
  tarifa: TarifaCalculo,
  porcentajeEstrato: number, // negativo = subsidio, positivo = contribución, 0 = pleno
  servicios: ServiciosSuscriptor = { tieneAcueducto: true, tieneAlcantarillado: true },
  // Consumo de alcantarillado, si difiere del de acueducto (caso "sin lectura real": cada
  // servicio puede tener su propio consumo predeterminado, ej. si alcantarillado lo presta
  // otra empresa con otro promedio). Si no se pasa, usa el mismo consumoM3 — el caso normal
  // con lectura real, donde ambos servicios miden la misma agua.
  consumoAlcantarilladoM3: number = consumoM3
): ResultadoLiquidacion {
  const conceptos: ConceptoCalculado[] = [];

  if (servicios.tieneAcueducto) {
    conceptos.push(
      ...conceptosDeServicio(
        "",
        "acueducto",
        consumoM3,
        tarifa.cma,
        tarifa.cmo + tarifa.cmi + tarifa.cmt,
        tarifa.rangoBasicoHastaM3,
        tarifa.rangoComplementarioHastaM3
      )
    );
  }

  const cobraAlcantarillado =
    servicios.tieneAlcantarillado && (tarifa.alcCma != null || tarifa.alcCmo != null || tarifa.alcCmi != null || tarifa.alcCmt != null);
  if (cobraAlcantarillado) {
    conceptos.push(
      ...conceptosDeServicio(
        "alcantarillado_",
        "alcantarillado",
        consumoAlcantarilladoM3,
        tarifa.alcCma ?? 0,
        (tarifa.alcCmo ?? 0) + (tarifa.alcCmi ?? 0) + (tarifa.alcCmt ?? 0),
        tarifa.rangoBasicoHastaM3,
        tarifa.rangoComplementarioHastaM3
      )
    );
  }

  if (tarifa.aseoCargoFijo != null) {
    conceptos.push({
      tipo: "aseo",
      descripcion: "Aseo",
      cantidad: null,
      valorUnitario: null,
      valor: redondear(tarifa.aseoCargoFijo),
    });
  }

  const subtotal = conceptos.reduce((acc, c) => acc + c.valor, 0);

  // Subsidio: solo sobre cargos fijos + consumo básico (de acueducto Y alcantarillado, según la
  // norma — el consumo complementario/suntuario que empieza en rangoBasicoHastaM3, hoy 16 m³,
  // NUNCA se subsidia). Contribución: sobre el total.
  const TIPOS_SUBSIDIABLES = new Set(["cargo_fijo", "consumo_basico", "alcantarillado_cargo_fijo", "alcantarillado_consumo_basico"]);
  let ajusteEstrato = 0;

  if (porcentajeEstrato < 0) {
    // Itemizado en vez de una sola línea al final: cada concepto subsidiable (cargo fijo y
    // consumo básico, de cada servicio por separado) muestra SU PROPIO subsidio justo debajo,
    // para que se vea cuánto de la tarifa plena de ESE concepto puntual quedó cubierto.
    const conConSubsidio: ConceptoCalculado[] = [];
    for (const c of conceptos) {
      conConSubsidio.push(c);
      if (TIPOS_SUBSIDIABLES.has(c.tipo)) {
        const monto = redondear((c.valor * porcentajeEstrato) / 100);
        if (monto !== 0) {
          ajusteEstrato += monto;
          conConSubsidio.push({
            tipo: `subsidio_${c.tipo}`,
            descripcion: `Subsidio estrato (${porcentajeEstrato}%)`,
            cantidad: null,
            valorUnitario: null,
            valor: monto,
          });
        }
      }
    }
    conceptos.length = 0;
    conceptos.push(...conConSubsidio);
  } else if (porcentajeEstrato > 0) {
    ajusteEstrato = redondear((subtotal * porcentajeEstrato) / 100);
    if (ajusteEstrato !== 0) {
      conceptos.push({
        tipo: "ajuste_estrato",
        descripcion: `Contribución (${porcentajeEstrato}%)`,
        cantidad: null,
        valorUnitario: null,
        valor: ajusteEstrato,
      });
    }
  }

  return { conceptos, subtotal, ajusteEstrato, total: subtotal + ajusteEstrato };
}
