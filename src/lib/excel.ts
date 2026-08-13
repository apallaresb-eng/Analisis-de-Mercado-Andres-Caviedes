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

/* ===========================================================================
   Hoja de PROVEEDORES
   =========================================================================== */

export const CAMPOS_PROVEEDOR = [
  { id: "name",         lbl: "Empresa",           obligatorio: true },
  { id: "city",         lbl: "Ciudad",            obligatorio: false },
  { id: "kind",         lbl: "Tipo",              obligatorio: false },
  { id: "phone",        lbl: "Teléfono",          obligatorio: false },
  { id: "whatsapp",     lbl: "WhatsApp",          obligatorio: false },
  { id: "email",        lbl: "Correo",            obligatorio: false },
  { id: "web",          lbl: "Web",               obligatorio: false },
  { id: "fast_contact", lbl: "Contacto rápido",   obligatorio: false },
  { id: "contact_source", lbl: "Fuente",          obligatorio: false },
  { id: "notes",        lbl: "Notas",             obligatorio: false },
] as const;

export type CampoProveedor = (typeof CAMPOS_PROVEEDOR)[number]["id"];

const PATRONES_PROVEEDOR: Record<CampoProveedor, string[]> = {
  name:         ["empresa", "proveedor", "razon social", "razón social", "nombre"],
  city:         ["ciudad", "municipio", "sede", "ubicacion", "ubicación"],
  kind:         ["tipo", "capa", "categoria", "categoría", "clase"],
  phone:        ["telefono", "teléfono", "tel", "fijo", "pbx"],
  whatsapp:     ["whatsapp", "wasap", "wpp", "celular"],
  email:        ["correo", "email", "mail", "e-mail"],
  web:          ["web", "sitio", "pagina", "página", "url"],
  fast_contact: ["contacto mas rapido", "contacto más rápido", "contacto rapido", "contacto rápido", "contacto"],
  contact_source: ["fuente", "origen", "nivel", "verificacion", "verificación"],
  notes:        ["notas", "nota", "observacion", "observación", "comentario"],
};

/* ===========================================================================
   Hoja de VÍNCULOS ítem ↔ proveedor
   =========================================================================== */

export const CAMPOS_VINCULO = [
  { id: "code",     lbl: "Código del ítem",  obligatorio: true },
  { id: "supplier", lbl: "Nombre del proveedor", obligatorio: true },
] as const;

export type CampoVinculo = (typeof CAMPOS_VINCULO)[number]["id"];

const PATRONES_VINCULO: Record<CampoVinculo, string[]> = {
  code:     ["codigo", "código", "cod", "item", "ítem", "referencia"],
  supplier: ["proveedor", "empresa", "razon social", "razón social", "suministra"],
};

/** Mapeo automático genérico: sirve para cualquiera de las tres hojas. */
function autoMapear<T extends string>(
  encabezados: string[],
  patrones: Record<T, string[]>
): Partial<Record<T, number>> {
  const norm = encabezados.map((h) => h.toLowerCase().trim());
  const mapeo: Partial<Record<T, number>> = {};
  const usadas = new Set<number>();

  for (const campo of Object.keys(patrones) as T[]) {
    let idx = norm.findIndex((h, i) => !usadas.has(i) && patrones[campo].includes(h));
    if (idx < 0) {
      idx = norm.findIndex((h, i) =>
        !usadas.has(i) && h !== "" && patrones[campo].some((p) => h.includes(p))
      );
    }
    if (idx >= 0) { mapeo[campo] = idx; usadas.add(idx); }
  }
  return mapeo;
}

export const mapeoProveedores = (h: string[]) => autoMapear(h, PATRONES_PROVEEDOR);
export const mapeoVinculos = (h: string[]) => autoMapear(h, PATRONES_VINCULO);

/**
 * Reconoce qué contiene cada hoja: primero por el nombre, y si no calza, por
 * los encabezados que tiene. Así funciona aunque las hojas se llamen distinto.
 */
export type TipoHoja = "items" | "proveedores" | "vinculos" | "ninguno";

export function detectarTipoHoja(hoja: HojaLeida): TipoHoja {
  const n = hoja.nombre.toLowerCase();
  if (/v[ií]nculo|vinculo|asignaci|item.*prov|prov.*item|estudio.?mercado/.test(n)) return "vinculos";
  if (/proveedor|supplier|contacto/.test(n)) return "proveedores";
  if (/[ií]tem|item|insumo|material|presupuesto/.test(n)) return "items";

  // Por contenido: se mira la fila de encabezados detectada.
  const fila = detectarFilaEncabezados(hoja.filas);
  const enc = (hoja.filas[fila] ?? []).map((c) => c.toLowerCase());
  const tiene = (...ps: string[]) => ps.some((p) => enc.some((e) => e.includes(p)));

  const hayProveedor = tiene("proveedor", "empresa");
  const hayCodigo = tiene("codigo", "código");
  const hayDescripcion = tiene("descripcion", "descripción");

  // Vínculos: tiene código Y proveedor, pero no descripción — solo dos columnas útiles.
  if (hayCodigo && hayProveedor && !hayDescripcion) return "vinculos";
  if (hayProveedor && tiene("telefono", "teléfono", "correo", "whatsapp")) return "proveedores";
  if (hayCodigo && hayDescripcion) return "items";
  return "ninguno";
}

/* ---------------------------------------------------------------------------
   Emparejamiento aproximado de nombres de proveedor

   Sin esto, una tilde o un "&" de diferencia deja cientos de vínculos sin
   crear y el usuario no entiende por qué.
   --------------------------------------------------------------------------- */

/** Normaliza para comparar: sin tildes, sin puntuación, sin sufijos jurídicos. */
export function normalizarNombre(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(s\.?a\.?s\.?|s\.?a\.?|ltda\.?|e\.?u\.?|s\.? en c\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distancia de Levenshtein, para sugerir el nombre más parecido. */
function distancia(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

export interface Sugerencia {
  nombreEnArchivo: string;
  nombreExistente: string;
  parecido: number;
}

/**
 * Busca el proveedor existente más parecido. Devuelve null si ninguno alcanza
 * el umbral: es preferible pedirle al usuario que decida a vincular mal.
 */
export function buscarParecido(
  nombre: string,
  existentes: { id: string; name: string }[]
): { id: string; name: string; parecido: number } | null {
  const objetivo = normalizarNombre(nombre);
  if (!objetivo) return null;

  let mejor: { id: string; name: string; parecido: number } | null = null;
  for (const e of existentes) {
    const cand = normalizarNombre(e.name);
    if (!cand) continue;

    let p: number;
    if (cand === objetivo) p = 1;
    else if (cand.includes(objetivo) || objetivo.includes(cand)) p = 0.9;
    else {
      const d = distancia(objetivo, cand);
      p = 1 - d / Math.max(objetivo.length, cand.length);
    }
    if (!mejor || p > mejor.parecido) mejor = { id: e.id, name: e.name, parecido: p };
  }
  return mejor && mejor.parecido >= 0.72 ? mejor : null;
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

/* ---------------------------------------------------------------------------
   Extracción de proveedores y vínculos
   --------------------------------------------------------------------------- */

export interface ProveedorExtraido {
  name: string;
  city: string | null;
  kind: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  web: string | null;
  fast_contact: string | null;
  contact_source: string | null;
  notes: string | null;
}

export function extraerProveedores(
  filas: string[][],
  filaEncabezados: number,
  mapeo: Partial<Record<CampoProveedor, number>>
): { validos: ProveedorExtraido[]; descartadas: number } {
  const validos: ProveedorExtraido[] = [];
  const yaVistos = new Set<string>();
  let descartadas = 0;

  const col = (f: string[], c: CampoProveedor) => {
    const i = mapeo[c];
    return i === undefined ? "" : (f[i] ?? "").trim();
  };

  for (let i = filaEncabezados + 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f || f.every((c) => !c.trim())) continue;

    const name = col(f, "name");
    if (!name) { descartadas++; continue; }

    // Dentro del mismo archivo, el primero gana: repetir la empresa en varias
    // filas es normal cuando el Excel viene de una tabla ítem × proveedor.
    const clave = normalizarNombre(name);
    if (yaVistos.has(clave)) continue;
    yaVistos.add(clave);

    validos.push({
      name,
      city: col(f, "city") || null,
      kind: col(f, "kind") || null,
      phone: col(f, "phone") || null,
      whatsapp: col(f, "whatsapp") || null,
      email: col(f, "email") || null,
      web: col(f, "web") || null,
      fast_contact: col(f, "fast_contact") || null,
      contact_source: col(f, "contact_source") || null,
      notes: col(f, "notes") || null,
    });
  }
  return { validos, descartadas };
}

export interface VinculoExtraido {
  code: string;
  supplier: string;
}

export function extraerVinculos(
  filas: string[][],
  filaEncabezados: number,
  mapeo: Partial<Record<CampoVinculo, number>>
): { validos: VinculoExtraido[]; descartadas: number } {
  const validos: VinculoExtraido[] = [];
  const yaVistos = new Set<string>();
  let descartadas = 0;

  const col = (f: string[], c: CampoVinculo) => {
    const i = mapeo[c];
    return i === undefined ? "" : (f[i] ?? "").trim();
  };

  for (let i = filaEncabezados + 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f || f.every((c) => !c.trim())) continue;

    const code = col(f, "code");
    const supplier = col(f, "supplier");
    if (!code || !supplier) { descartadas++; continue; }

    const clave = `${code}||${normalizarNombre(supplier)}`;
    if (yaVistos.has(clave)) continue;
    yaVistos.add(clave);

    validos.push({ code, supplier });
  }
  return { validos, descartadas };
}

/* ---------------------------------------------------------------------------
   Plantilla descargable

   Una plantilla bien hecha evita la mitad de los errores: la gente llena un
   formato mucho mejor de lo que adivina uno.
   --------------------------------------------------------------------------- */

export async function generarPlantilla(): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de compras de obra";

  const AZUL = "FF0B6055";
  const armar = (nombre: string, cols: string[], ejemplo: string[], ayuda: string) => {
    const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 2 }] });
    ws.mergeCells(1, 1, 1, cols.length);
    const t = ws.getCell(1, 1);
    t.value = ayuda;
    t.font = { italic: true, size: 10, color: { argb: "FF5F706C" } };
    t.alignment = { wrapText: true, vertical: "middle" };
    ws.getRow(1).height = 30;

    ws.getRow(2).values = cols;
    const cab = ws.getRow(2);
    cab.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cab.height = 22;
    cab.alignment = { vertical: "middle" };
    for (let i = 1; i <= cols.length; i++) {
      cab.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
      ws.getColumn(i).width = Math.max(16, Math.min(46, cols[i - 1].length + 8));
    }
    const ej = ws.addRow(ejemplo);
    ej.font = { italic: true, color: { argb: "FF8A9995" } };
    return ws;
  };

  armar("ITEMS",
    ["Código", "Descripción", "Unidad", "Cantidad", "Categoría", "Especificación"],
    ["M-0202", "Ejemplo: borre esta fila antes de importar", "un", "10", "ELECTRICO", "Detalle técnico"],
    "HOJA 1 — ÍTEMS. Obligatorios: Código y Descripción. Puede agregar más columnas: en el asistente usted decide cuál es cuál.");

  armar("PROVEEDORES",
    ["Empresa", "Ciudad", "Tipo", "Teléfono", "WhatsApp", "Correo", "Web", "Contacto rápido", "Fuente", "Notas"],
    ["Ejemplo S.A.S.", "Bucaramanga", "Distribuidor", "607 000 0000", "300 000 0000",
     "ventas@ejemplo.com", "https://ejemplo.com", "WhatsApp 300 000 0000", "Sitio oficial", "Borre esta fila"],
    "HOJA 2 — PROVEEDORES. Obligatorio: Empresa. Si el proveedor ya existe en la obra, se ACTUALIZA en vez de duplicarse.");

  armar("VINCULOS",
    ["Código del ítem", "Nombre del proveedor"],
    ["M-0202", "Ejemplo S.A.S."],
    "HOJA 3 — VÍNCULOS. Una fila por cada pareja ítem–proveedor. El nombre debe coincidir con la hoja PROVEEDORES o con un proveedor ya cargado; si difiere un poco, el asistente le sugiere el parecido.");

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
