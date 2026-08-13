/**
 * Lectura de archivos .xlsx en el navegador.
 *
 * ExcelJS se carga con import() diferido: pesa cerca de 1 MB y solo hace falta
 * cuando alguien realmente va a importar, no en cada arranque de la aplicación.
 */

export interface HojaLeida {
  nombre: string;
  filas: string[][]; // celdas ya convertidas a texto
}

/** Campos del sistema a los que se puede mapear una columna del archivo. */
export const CAMPOS_DESTINO = [
  { id: "code",        lbl: "Código",        obligatorio: true },
  { id: "description", lbl: "Descripción",   obligatorio: true },
  { id: "unit",        lbl: "Unidad",        obligatorio: false },
  { id: "quantity",    lbl: "Cantidad",      obligatorio: false },
  { id: "category",    lbl: "Categoría",     obligatorio: false },
  { id: "spec",        lbl: "Especificación", obligatorio: false },
] as const;

export type CampoDestino = (typeof CAMPOS_DESTINO)[number]["id"];

/** Convierte cualquier valor de celda de ExcelJS a texto limpio. */
function celdaATexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);

  const o = v as Record<string, unknown>;
  // Celda con fórmula: interesa el resultado, no la fórmula.
  if ("result" in o) return celdaATexto(o.result);
  // Texto enriquecido: se concatenan los fragmentos.
  if ("richText" in o && Array.isArray(o.richText)) {
    return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("").trim();
  }
  if ("text" in o) return celdaATexto(o.text);
  if ("hyperlink" in o) return celdaATexto(o.text ?? o.hyperlink);
  return "";
}

export async function leerLibro(archivo: File): Promise<HojaLeida[]> {
  const { default: ExcelJS } = await import("exceljs");
  const buffer = await archivo.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const hojas: HojaLeida[] = [];
  wb.eachSheet((ws) => {
    const filas: string[][] = [];
    const maxCol = ws.columnCount;
    ws.eachRow({ includeEmpty: true }, (row) => {
      const celdas: string[] = [];
      for (let c = 1; c <= maxCol; c++) celdas.push(celdaATexto(row.getCell(c).value));
      filas.push(celdas);
    });
    hojas.push({ nombre: ws.name, filas });
  });
  return hojas;
}

/**
 * Busca la fila de encabezados.
 *
 * No siempre es la primera: en el Libro1.xlsx del contrato de Simití los
 * encabezados están en la fila 13, debajo del membrete de la obra. Se busca la
 * primera fila con al menos tres celdas de texto no numérico, y se prefiere la
 * que contenga palabras típicas de un presupuesto.
 */
export function detectarFilaEncabezados(filas: string[][]): number {
  const PISTAS = ["codigo", "código", "descripcion", "descripción", "unidad", "cantidad", "item", "ítem"];
  let mejor = 0;
  let mejorPuntaje = -1;

  const limite = Math.min(filas.length, 40);
  for (let i = 0; i < limite; i++) {
    const celdas = filas[i].map((c) => c.trim()).filter(Boolean);
    if (celdas.length < 3) continue;

    const textos = celdas.filter((c) => c !== "" && Number.isNaN(Number(c)));
    if (textos.length < 3) continue;

    let puntaje = textos.length;
    const norm = celdas.map((c) => c.toLowerCase());
    for (const p of PISTAS) if (norm.some((c) => c.includes(p))) puntaje += 10;

    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = i; }
  }
  return mejor;
}

/** Propone un mapeo automático comparando los encabezados con nombres típicos. */
export function mapeoAutomatico(encabezados: string[]): Partial<Record<CampoDestino, number>> {
  const PATRONES: Record<CampoDestino, string[]> = {
    code:        ["codigo", "código", "cod", "item", "ítem", "referencia"],
    description: ["descripcion", "descripción", "detalle", "concepto", "material", "insumo"],
    unit:        ["unidad", "und", "un", "medida"],
    quantity:    ["cantidad", "cant", "qty"],
    category:    ["categoria", "categoría", "capitulo", "capítulo", "grupo", "tipo"],
    spec:        ["especificacion", "especificación", "observacion", "observación", "nota"],
  };

  const norm = encabezados.map((h) => h.toLowerCase().trim());
  const mapeo: Partial<Record<CampoDestino, number>> = {};
  const usadas = new Set<number>();

  for (const campo of Object.keys(PATRONES) as CampoDestino[]) {
    // Primero coincidencia exacta, que es más confiable que la parcial.
    let idx = norm.findIndex((h, i) => !usadas.has(i) && PATRONES[campo].includes(h));
    if (idx < 0) {
      idx = norm.findIndex((h, i) =>
        !usadas.has(i) && h !== "" && PATRONES[campo].some((p) => h.includes(p))
      );
    }
    if (idx >= 0) { mapeo[campo] = idx; usadas.add(idx); }
  }
  return mapeo;
}

export interface FilaExtraida {
  code: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  category: string | null;
  spec: string | null;
}

export interface ExtraccionResultado {
  validas: FilaExtraida[];
  descartadas: number;
  motivoDescartes: string;
}

/** Convierte un número escrito a la colombiana: 1.234,56 -> 1234.56 */
function aNumero(txt: string): number | null {
  const t = txt.replace(/[^\d,.-]/g, "").trim();
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export function extraerFilas(
  filas: string[][],
  filaEncabezados: number,
  mapeo: Partial<Record<CampoDestino, number>>
): ExtraccionResultado {
  const validas: FilaExtraida[] = [];
  let descartadas = 0;

  const col = (fila: string[], campo: CampoDestino): string => {
    const i = mapeo[campo];
    return i === undefined ? "" : (fila[i] ?? "").trim();
  };

  for (let i = filaEncabezados + 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f || f.every((c) => !c.trim())) continue; // fila vacía: no cuenta

    const code = col(f, "code");
    const description = col(f, "description");

    // Sin código o sin descripción no es un ítem: suele ser subtotal,
    // encabezado de capítulo o nota al pie.
    if (!code || !description) { descartadas++; continue; }

    validas.push({
      code,
      description,
      unit: col(f, "unit") || null,
      quantity: aNumero(col(f, "quantity")),
      category: col(f, "category") || null,
      spec: col(f, "spec") || null,
    });
  }

  return {
    validas,
    descartadas,
    motivoDescartes: "filas sin código o sin descripción (subtotales, títulos de capítulo o notas)",
  };
}
