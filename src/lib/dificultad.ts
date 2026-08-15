/**
 * Dificultad de abastecimiento de un ítem.
 *
 * El problema que resuelve: si en una subcategoría de 50 ítems se le pide
 * cotización a 5 proveedores y todos responden, igual pueden quedar ítems que
 * NINGUNO tenía. Esos son los que frenan la obra, y se descubren tarde —
 * cuando ya pasaron dos semanas esperando respuestas.
 *
 * Aquí se predicen ANTES de enviar, leyendo la descripción. Un ítem con número
 * de parte de fabricante o que dice "según especificación técnica" no lo va a
 * tener un mayorista: hay que ir al fabricante o a su representante, y pedirle
 * un equivalente homologado.
 *
 * Se calcula sobre el texto, sin tocar la base, igual que `clasificador.ts`.
 * Nunca decide sola: `razones` explica el porqué para que la persona pueda
 * discrepar y sacar el ítem de la lista.
 */
import type { Item } from "./types";
import { normalizar } from "./clasificador";

export type Dificultad = "commodity" | "especializado" | "critico";

export interface Evaluacion {
  nivel: Dificultad;
  /** Puntaje interno. Se expone para poder ordenar la lista. */
  puntaje: number;
  /** Motivos legibles, para mostrarlos junto al ítem. */
  razones: string[];
}

interface Senal {
  razon: string;
  re: RegExp;
  puntos: number;
  /** Basta esta señal para marcarlo como crítico, sin sumar nada más. */
  decisiva?: boolean;
}

/**
 * Las señales salieron de medir los 1.071 ítems reales de Libro1, no de
 * suponer. Entre paréntesis, cuántos ítems dispara cada una.
 */
const SENALES: Senal[] = [
  {
    // (11) "WS-C2960X-24PD-L", "AIR-AP1852I-A-K9": referencia exacta de un
    // fabricante. O se consigue esa, o se consigue un equivalente homologado.
    razon: "Número de parte de fabricante",
    re: /\bWS-C\d|\bAIR-[A-Z]{2}\d|\b[A-Z]{2,}-[A-Z]{1,3}\d{3,}\b|\b[A-Z]{2,4}\d{4,}[A-Z]?-[A-Z]\b/,
    puntos: 5,
    decisiva: true,
  },
  {
    // (15) La descripción remite a un documento que el proveedor no tiene.
    // Sin adjuntar la especificación, nadie puede cotizarlo.
    razon: "Remite a especificación técnica que no viene en la lista",
    re: /SEG[UÚ]N ESPECIFICAC|SEGUN LA ESPECIFICAC|VER ESPECIFICAC/,
    puntos: 5,
    decisiva: true,
  },
  {
    // (71) Un tablero de distribución o un grupo electrógeno no es material de
    // bodega: se arma sobre pedido y lo cotiza un fabricante.
    razon: "Equipo o sistema completo, no material de bodega",
    re: /GRUPO ELECTROGENO|PLANTA ELECTRICA|TRANSFORMADOR|CELDA|TALANQUERA|TORNIQUETE|PANEL DE (DETECCION|INTRUSION)|CONTROLADOR|\bUPS\b|SUBESTACION|ASCENSOR|EQUIPO DE AIRE|MINISPLIT|TOTEM|SISTEMA DE/,
    puntos: 2,
  },
  {
    // (35) Una descripción de 150 caracteres suele ser un ensamble con muchas
    // condiciones, no un producto de catálogo.
    razon: "Descripción muy detallada: probable fabricación especial",
    re: /^.{150,}$/,
    puntos: 1,
  },
  {
    razon: "Marca específica en la descripción",
    re: /\b(CISCO|PANDUIT|HILTI|SCHNEIDER|SIEMENS|LEGRAND|ZETAL|KORAZA|SIKAFLOOR|SIKAFILL|RAWELT|COPPERWELD)\b/,
    puntos: 1,
  },
  {
    razon: "Requiere certificación o puesta en marcha de fábrica",
    re: /RETIE|RETILAP|ONAC|CERTIFICAC|PUESTA EN MARCHA|STARTUP|CONFIGURACION/,
    puntos: 2,
  },
  {
    // Señal NEGATIVA: "o similar" es permiso explícito para ofrecer otra marca,
    // que es justo lo que destraba una compra difícil.
    razon: "Admite equivalente (dice «o similar»)",
    re: /O SIMILAR|O EQUIVALENTE/,
    puntos: -2,
  },
];

const UMBRAL_CRITICO = 3;
const UMBRAL_ESPECIALIZADO = 1;

export function dificultadDe(item: Pick<Item, "description" | "spec">): Evaluacion {
  const texto = normalizar(`${item.description} ${item.spec ?? ""}`);

  let puntaje = 0;
  let decisiva = false;
  const razones: string[] = [];

  for (const s of SENALES) {
    if (!s.re.test(texto)) continue;
    puntaje += s.puntos;
    razones.push(s.razon);
    if (s.decisiva) decisiva = true;
  }

  // Una señal decisiva marca el ítem como crítico aunque el "o similar" le
  // haya restado: un número de parte sigue necesitando ir al fabricante.
  const nivel: Dificultad = decisiva || puntaje >= UMBRAL_CRITICO
    ? "critico"
    : puntaje >= UMBRAL_ESPECIALIZADO
      ? "especializado"
      : "commodity";

  return { nivel, puntaje, razones };
}

export interface DificultadDef {
  id: Dificultad;
  lbl: string;
  color: string;
  linea: string;
  fondo: string;
  desc: string;
}

export const DIFICULTADES: DificultadDef[] = [
  {
    id: "critico", lbl: "Crítico",
    color: "var(--crit)", linea: "var(--crit-line)", fondo: "var(--crit-soft)",
    desc: "Ningún mayorista lo va a tener. Va directo al fabricante o su representante.",
  },
  {
    id: "especializado", lbl: "Especializado",
    color: "var(--warn)", linea: "var(--warn-line)", fondo: "var(--warn-soft)",
    desc: "Lo maneja un proveedor de la línea, no cualquiera de la categoría.",
  },
  {
    id: "commodity", lbl: "Comercial",
    color: "var(--muted)", linea: "var(--line)", fondo: "var(--surface-2)",
    desc: "Material de catálogo. Cualquier proveedor grande de la categoría lo tiene.",
  },
];

export const DIFICULTAD_POR_ID: Record<Dificultad, DificultadDef> =
  Object.fromEntries(DIFICULTADES.map((d) => [d.id, d])) as Record<Dificultad, DificultadDef>;

/**
 * Ítems que deben salir de la solicitud masiva y tratarse aparte.
 *
 * Meter un grupo electrógeno de 300 kVA en una lista de 98 ítems de tablería es
 * la forma más segura de que no lo coticen: el vendedor mira la lista, ve que
 * no es lo suyo, y no responde nada.
 */
export function esCritico(item: Pick<Item, "description" | "spec">): boolean {
  return dificultadDe(item).nivel === "critico";
}

/**
 * Separa una lista en lo que va por la solicitud normal y lo que va por la
 * ruta especial.
 */
export function separarPorDificultad<T extends Pick<Item, "description" | "spec">>(
  items: T[]
): { normales: T[]; criticos: T[] } {
  const normales: T[] = [];
  const criticos: T[] = [];
  for (const it of items) (esCritico(it) ? criticos : normales).push(it);
  return { normales, criticos };
}
