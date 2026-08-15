import type { Item, ItemState, QuoteRequest, RequestStatus, Supplier } from "./types";

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
   Estados de una solicitud de cotización

   No hay un "esperando cotización" separado de "enviada": se está esperando
   desde el instante en que se manda el mensaje, así que sería un clic más sin
   información nueva. Y "requiere seguimiento" no es un estado guardado sino un
   cálculo sobre sent_at (ver `requiereSeguimiento`), para que no envejezca.
   --------------------------------------------------------------------------- */
export interface EstadoSolicitudDef {
  id: RequestStatus;
  lbl: string;
  color: string;
  linea: string;
  fondo: string;
  desc: string;
}

export const ESTADOS_SOLICITUD: EstadoSolicitudDef[] = [
  { id: "borrador",      lbl: "Borrador",      color: "var(--faint)",  linea: "var(--line)",      fondo: "var(--surface-2)", desc: "Armada, sin enviar" },
  { id: "enviada",       lbl: "Enviada",       color: "var(--warn)",   linea: "var(--warn-line)", fondo: "var(--warn-soft)", desc: "Esperando respuesta" },
  { id: "respondida",    lbl: "Respondida",    color: "var(--accent)", linea: "var(--accent-line)", fondo: "var(--accent-soft)", desc: "El proveedor contestó" },
  { id: "cerrada",       lbl: "Cerrada",       color: "var(--ok)",     linea: "var(--ok-line)",   fondo: "var(--ok-soft)",   desc: "Cotización cargada y revisada" },
  { id: "sin_respuesta", lbl: "Sin respuesta", color: "var(--crit)",   linea: "var(--crit-line)", fondo: "var(--crit-soft)", desc: "No contestó" },
  { id: "descartada",    lbl: "Descartada",    color: "var(--faint)",  linea: "var(--line)",      fondo: "var(--surface-2)", desc: "No maneja esta categoría" },
];

export const ESTADO_SOLICITUD_POR_ID: Record<RequestStatus, EstadoSolicitudDef> =
  Object.fromEntries(ESTADOS_SOLICITUD.map((e) => [e.id, e])) as Record<
    RequestStatus, EstadoSolicitudDef
  >;

/** Días transcurridos desde una fecha ISO. Null si no hay fecha. */
export function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** A partir de cuántos días sin respuesta conviene volver a insistir. */
export const DIAS_SEGUIMIENTO = 4;

/**
 * Se calcula, no se guarda: un campo "requiere seguimiento" almacenado queda
 * desactualizado en cuanto pasa un día y nadie abre la aplicación.
 *
 * Manda la fecha límite acordada cuando existe. Solo si no se fijó ninguna se
 * cae al umbral fijo, porque tratar igual una solicitud urgente y una holgada
 * hace perseguir a quien todavía está en plazo.
 */
export function requiereSeguimiento(s: QuoteRequest): boolean {
  if (s.status !== "enviada") return false;
  if (s.due_date) return new Date(s.due_date + "T23:59:59") < new Date();
  const d = diasDesde(s.sent_at);
  return d !== null && d >= DIAS_SEGUIMIENTO;
}

/** Días de atraso frente a la fecha límite, o desde el envío si no hay fecha. */
export function diasDeAtraso(s: QuoteRequest): number | null {
  if (s.due_date) {
    const d = Math.floor((Date.now() - new Date(s.due_date + "T23:59:59").getTime()) / 86_400_000);
    return d > 0 ? d : null;
  }
  return diasDesde(s.sent_at);
}

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
   Mensaje de solicitud por categoría

   El mensaje largo (cabecera institucional + diez puntos numerados) es correcto
   para un correo formal y pésimo para WhatsApp: llega como un muro de texto y
   no lo contesta nadie. Este es el corto, que es el que se envía.

   El nombre de la categoría va en el encabezado a propósito: es lo que después
   permite archivar y sustentar la respuesta ("la cotización de PVC de Durman")
   en vez de recibir un PDF con trescientos materiales revueltos.
   --------------------------------------------------------------------------- */

/**
 * Tope de ítems que caben en un enlace de wa.me.
 *
 * El texto viaja en la URL codificado, y por encima de unos 2.000 caracteres
 * WhatsApp la corta o no abre. Con descripciones de obra eso son ~25 ítems.
 */
export const MAX_ITEMS_WHATSAPP = 25;

/**
 * Ajuste del mensaje según con quién se está hablando.
 *
 * El más importante es el del fabricante: muchos no venden directo, y sin
 * preguntarlo de entrada se pierde una semana esperando una cotización que
 * nunca iba a llegar.
 */
function cierrePorTipo(kind: string | null): string {
  const k = (kind ?? "").toLowerCase();
  if (/fabricante|productor/.test(k))
    return "¿Cotizan directo o nos indica su distribuidor autorizado para Santander?";
  if (/integrador|ingenier/.test(k))
    return "¿Nos pueden cotizar suministro, y si aplica, el alcance de instalación?";
  if (/organismo|laboratorio/.test(k))
    return "¿Nos confirman alcance, vigencia del dictamen y valor del servicio?";
  if (/alquiler/.test(k))
    return "¿Nos confirman tarifa, tiempo mínimo de alquiler y transporte hasta la obra?";
  return "¿Nos confirma si la puede enviar?";
}

/**
 * El abridor. NO lleva la lista de ítems: esa va en el Excel adjunto.
 *
 * Un WhatsApp con 98 líneas se lee como spam y no lo contesta nadie. Uno de
 * cinco líneas con un archivo adjunto se lee como trabajo real de una obra
 * real. Y como no crece con la cantidad de ítems, nunca desborda el enlace.
 *
 * Las dos palancas son ciertas y por eso se usan: el tamaño de la obra —que le
 * interesa a cualquier proveedor— y una fecha concreta, que obliga a un sí o un
 * no. Un "no alcanzo" también sirve: libera el cupo para otro.
 */
export function mensajeSolicitud(
  items: Item[],
  p: CtxProyecto,
  categoria: string | null,
  opciones: {
    codigo?: string;
    tipoProveedor?: string | null;
    plazo?: string | null;
    totalObra?: number;
  } = {}
): string {
  const lugar = p.municipio ? `, obra en ${p.municipio} (Bolívar)` : "";
  const deQue = categoria ? ` de ${categoria}` : "";
  const ref = opciones.codigo ? `Solicitud ${opciones.codigo}: ` : "";
  const volumen = opciones.totalObra
    ? `, parte de un presupuesto de ${opciones.totalObra.toLocaleString("es-CO")} ítems para la obra completa`
    : "";

  let s = `Buen día. Consorcio AMG – CPI${lugar}.\n\n`;
  s += `${ref}${items.length} ítem(s)${deQue}${volumen}.\n`;
  s += `Adjunto el listado. Si hay ítems que no maneja, cotice los que sí.\n\n`;
  s += opciones.plazo
    ? `Agradecemos cotización formal en PDF antes del ${opciones.plazo}.\n`
    : `Agradecemos cotización formal en PDF.\n`;
  s += cierrePorTipo(opciones.tipoProveedor ?? null);
  return s;
}

/**
 * Mensaje para los ítems críticos, que van por fuera de la solicitud masiva.
 *
 * Aquí no se pide precio de catálogo: se pregunta si lo maneja y se abre la
 * puerta al equivalente. En la mayoría de estos casos el ítem exacto no existe
 * en el mercado local, y lo que destraba la compra es la alternativa técnica,
 * no insistir con la referencia original.
 */
export function mensajeCritico(
  items: Item[],
  p: CtxProyecto,
  opciones: { codigo?: string; plazo?: string | null } = {}
): string {
  const lugar = p.municipio ? `, obra en ${p.municipio} (Bolívar)` : "";
  const ref = opciones.codigo ? ` (${opciones.codigo})` : "";

  let s = `Buen día. Consorcio AMG – CPI${lugar}.\n\n`;
  s += `Necesitamos ${items.length} ítem(s) especializados de su línea${ref}:\n\n`;
  for (const it of items.slice(0, 8)) s += `· ${it.description.slice(0, 90)}\n`;
  if (items.length > 8) s += `· …y ${items.length - 8} más en el adjunto\n`;
  s += `\n¿Los maneja directamente o nos indica su representante en Santander?\n`;
  s += `Si tiene un equivalente homologado, agradecemos proponerlo con ficha técnica.`;
  if (opciones.plazo) s += `\n\nNecesitamos respuesta antes del ${opciones.plazo}.`;
  return s;
}

/** Recordatorio corto para la solicitud que ya venció su plazo. */
export function mensajeSeguimiento(
  s: QuoteRequest,
  categoria: string | null,
  dias: number
): string {
  const de = categoria ? ` (${categoria})` : "";
  return (
    `Buen día. Retomo la solicitud ${s.code}${de} que le enviamos hace ${dias} días. ` +
    `¿Alcanzó a revisarla? Si no la puede atender nos avisa y seguimos con otro proveedor. Gracias.`
  );
}

/** Fecha límite en el formato que se usa dentro del mensaje. */
export function formatearPlazo(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });
}

/**
 * Lista completa con códigos, para pegar como segundo mensaje o mandar por
 * correo. Aquí sí van los códigos: son los que permiten casar la respuesta del
 * proveedor con los ítems del estudio.
 */
export function listaCompletaSolicitud(items: Item[], categoria: string | null): string {
  let s = categoria ? `Lista completa — ${categoria} (${items.length} ítems)\n\n`
                    : `Lista completa (${items.length} ítems)\n\n`;
  for (const [i, it] of items.entries()) {
    const cant = it.quantity !== null ? ` — ${it.quantity} ${it.unit ?? ""}`.trimEnd() : "";
    s += `${i + 1}) [${it.code}] ${it.description}${cant}\n`;
    if (it.spec) s += `    ${it.spec}\n`;
  }
  return s;
}

/** Asunto para el correo de una solicitud. */
export function asuntoSolicitud(codigo: string, categoria: string | null): string {
  return `Solicitud de cotización ${codigo}${categoria ? ` — ${categoria}` : ""} · Consorcio AMG – CPI`;
}

/* ---------------------------------------------------------------------------
   Utilidades
   --------------------------------------------------------------------------- */
export function contactoRapido(s: Supplier): string {
  return s.fast_contact || s.phone || s.email || s.web || "No registrado";
}

/* ---------------------------------------------------------------------------
   WhatsApp
   --------------------------------------------------------------------------- */

/**
 * Extrae un número de WhatsApp usable de los campos del proveedor.
 *
 * Los datos vienen escritos como los publica cada empresa: "322 850 4507",
 * "+57 311 476 0547", o incluso varios en una misma celda separados por
 * especialidad ("315 820 9120 general · 322 850 4507 Construcción"). Se toma
 * el primero que parezca un celular colombiano.
 */
/**
 * Celular colombiano: 10 dígitos que empiezan en 3, escritos con o sin
 * separadores y con indicativo 57 opcional.
 *
 * Los límites (?<!\d) y (?!\d) son esenciales: sin ellos, un campo con varios
 * fijos como "(605) 385 9144 · (605) 386 1097" produce un número inventado al
 * unir dígitos de teléfonos distintos.
 */
const RE_CELULAR = /(?<!\d)(?:\+?57[\s.-]?)?(3\d{2})[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/;

export function numeroWhatsApp(s: Supplier): string | null {
  for (const campo of [s.whatsapp, s.fast_contact, s.phone]) {
    if (!campo) continue;
    if (/no (verificado|publicado|encontrado)/i.test(campo)) continue;

    const m = campo.match(RE_CELULAR);
    if (m) return "57" + m[1] + m[2] + m[3];
  }
  return null;
}

/**
 * Enlace que abre WhatsApp con el mensaje ya escrito.
 *
 * No recorta el mensaje: recortar por la mitad produciría una solicitud
 * incompleta enviada sin que nadie se entere. Quien arma el mensaje es
 * responsable de su longitud (ver MAX_ITEMS_WHATSAPP), y la interfaz avisa con
 * `enlaceDemasiadoLargo` antes de dejar enviar.
 */
export function enlaceWhatsApp(s: Supplier, mensaje: string): string | null {
  const num = numeroWhatsApp(s);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}

/** Longitud a partir de la cual WhatsApp empieza a cortar o no abre el enlace. */
const LIMITE_URL = 2000;

export function enlaceDemasiadoLargo(mensaje: string): boolean {
  return encodeURIComponent(mensaje).length > LIMITE_URL;
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
