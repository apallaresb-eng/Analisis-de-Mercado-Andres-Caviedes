import type { Item, ItemState, Supplier } from "./types";

/* ---------------------------------------------------------------------------
   Estados de gestión
   --------------------------------------------------------------------------- */
export interface EstadoDef {
  id: ItemState;
  lbl: string;
  color: string;
  desc: string;
}

export const ESTADOS: EstadoDef[] = [
  { id: "pendiente",  lbl: "Pendiente",  color: "var(--faint)",  desc: "Sin gestionar" },
  { id: "contactado", lbl: "Contactado", color: "var(--warn)",   desc: "Solicitud enviada" },
  { id: "cotizado",   lbl: "Cotizado",   color: "var(--accent)", desc: "Respuesta recibida" },
  { id: "cerrado",    lbl: "Cerrado",    color: "var(--ok)",     desc: "Precio aprobado" },
  { id: "replantear", lbl: "Replantear", color: "var(--crit)",   desc: "Requiere decisión técnica" },
];

export const ESTADO_POR_ID: Record<ItemState, EstadoDef> = Object.fromEntries(
  ESTADOS.map((e) => [e.id, e])
) as Record<ItemState, EstadoDef>;

/* ---------------------------------------------------------------------------
   Alertas del estudio de mercado
   --------------------------------------------------------------------------- */
export interface AlertaDef {
  t: string;
  c: string;
  b: string;
  l: string;
  sev: number;
}

export const ALERTAS: Record<string, AlertaDef> = {
  VERDE:         { t: "Verificado",                 c: "var(--ok)",   b: "var(--ok-soft)",   l: "var(--ok-line)",   sev: 4 },
  NARANJA_EQUIV: { t: "Equivalencia sin confirmar", c: "var(--warn)", b: "var(--warn-soft)", l: "var(--warn-line)", sev: 3 },
  NARANJA_COT:   { t: "Sin precio publicado",       c: "var(--warn)", b: "var(--warn-soft)", l: "var(--warn-line)", sev: 2 },
  NARANJA_FLETE: { t: "Flete determinante",         c: "var(--warn)", b: "var(--warn-soft)", l: "var(--warn-line)", sev: 2 },
  ROJO_AMBIGUO:  { t: "Especificación ambigua",     c: "var(--crit)", b: "var(--crit-soft)", l: "var(--crit-line)", sev: 0 },
  ROJO_SIN_PROV: { t: "Sin proveedor viable",       c: "var(--crit)", b: "var(--crit-soft)", l: "var(--crit-line)", sev: 1 },
};

export const ALERTA_POR_DEFECTO: AlertaDef = ALERTAS.NARANJA_COT;

export function alertaDe(item: Pick<Item, "alert">): AlertaDef {
  return (item.alert && ALERTAS[item.alert]) || ALERTA_POR_DEFECTO;
}

/**
 * Triaje: primero lo que necesita una decisión técnica, luego lo que no tiene
 * precio, luego lo dudoso. Ordenar por número de ítem no sirve para trabajar.
 */
export function prioridad(item: Item): number {
  const a = alertaDe(item);
  if (a.sev <= 1) return 1;
  if (item.ref_price === null) return 2;
  if (item.alert === "NARANJA_EQUIV") return 3;
  return 4;
}

/* ---------------------------------------------------------------------------
   Formato
   --------------------------------------------------------------------------- */
export function cop(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "$" + Math.round(n).toLocaleString("es-CO");
}

export function fecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

/* ---------------------------------------------------------------------------
   Mensajes de cotización
   --------------------------------------------------------------------------- */
const CABECERA = (proyecto: string, contrato: string | null, municipio: string | null) =>
  `Buen día. Somos el CONSORCIO AMG – CPI EDUCACIÓN SUPERIOR SIMITÍ` +
  (contrato ? `, contrato de obra No. ${contrato}` : "") +
  `. Estamos actualizando el estudio de mercado de materiales para la obra "${proyecto}"` +
  (municipio ? `, ubicada en ${municipio.toUpperCase()}, BOLÍVAR` : "") + `.`;

const PIE =
  `Por favor indicar para cada ítem:
1. Precio unitario ANTES de IVA
2. IVA discriminado (o si el producto es excluido/exento)
3. Precio unitario CON IVA
4. Costo del flete hasta el sitio de la obra
5. PRECIO TOTAL PUESTO EN OBRA
6. Disponibilidad y existencias
7. Tiempo de entrega en obra
8. Vigencia de la oferta
9. Forma de pago y plazo de crédito
10. Ficha técnica del producto ofertado

Agradecemos cotización formal en PDF con NIT, condiciones comerciales y datos del asesor.
Cordialmente, Área de Compras – Consorcio AMG · CPI Educación Superior Simití.`;

interface CtxProyecto {
  nombre: string;
  contrato: string | null;
  municipio: string | null;
}

export function mensajeItem(item: Item, p: CtxProyecto): string {
  let s =
    CABECERA(p.nombre, p.contrato, p.municipio) +
    `\n\nAgradecemos cotizar:\n` +
    `• Producto: ${item.description}\n` +
    (item.spec ? `• Especificación: ${item.spec}\n` : "") +
    (item.unit ? `• Unidad del presupuesto: ${item.unit}\n` : "") +
    `• Cantidad: ${
      item.quantity !== null
        ? `${item.quantity} ${item.unit ?? ""}`.trim()
        : "por confirmar (indicar cantidad mínima de despacho y escalas por volumen)"
    }\n\n` +
    PIE;

  if (item.alert === "NARANJA_EQUIV")
    s += `\n\nNOTA TÉCNICA: si su producto no corresponde exactamente a la especificación, indíquelo y adjunte ficha técnica del equivalente.`;
  if (item.alert === "ROJO_AMBIGUO")
    s += `\n\nNOTA: la especificación requiere aclaración de nuestra parte. Indíquenos qué alternativas maneja y sus fichas técnicas.`;
  return s;
}

/** Un solo mensaje que cubre todos los ítems pendientes de ese proveedor. */
export function mensajeProveedor(items: Item[], p: CtxProyecto): string {
  let s = CABECERA(p.nombre, p.contrato, p.municipio) +
    `\n\nAgradecemos cotizar los siguientes ${items.length} ítem(s):\n\n`;
  items.forEach((it, i) => {
    s += `${i + 1}) ${it.description}\n`;
    if (it.spec) s += `   Especificación: ${it.spec}\n`;
    s += `   Unidad: ${it.unit ?? "—"} · Cantidad: ${
      it.quantity !== null ? it.quantity : "por confirmar"
    }\n\n`;
  });
  return s + PIE;
}

/* ---------------------------------------------------------------------------
   Utilidades
   --------------------------------------------------------------------------- */
export function contactoRapido(s: Supplier): string {
  return s.fast_contact || s.phone || s.email || s.web || "No registrado";
}

export async function copiar(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* cae al método alterno */
  }
  try {
    const a = document.createElement("textarea");
    a.value = texto;
    a.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(a);
    a.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(a);
    return ok;
  } catch {
    return false;
  }
}
