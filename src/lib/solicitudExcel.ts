/**
 * El archivo que se adjunta al mensaje: la solicitud de cotización.
 *
 * NO es un formulario para que el proveedor lo rellene y lo devuelva. Es la
 * lista concreta de lo que se necesita, para que él produzca SU cotización
 * formal en PDF, que es lo que sirve para sustentar ante interventoría.
 *
 * Por eso no lleva columnas de precio vacías ni instrucciones de
 * diligenciamiento: solo lo que hay que cotizar, y una línea diciendo qué se
 * espera de vuelta.
 *
 * ExcelJS se carga con import() diferido, igual que en `exportar.ts`.
 */
import type { Category, Item, Project, QuoteRequest, Supplier } from "./types";
import { dificultadDe } from "./dificultad";

const AZUL = "FF0B6055";   // el mismo acento del tablero
const GRIS = "FFF2F4F3";

export interface DatosSolicitud {
  solicitud: QuoteRequest;
  items: Item[];
  proveedor: Supplier;
  categoria: Category | null;
  proyecto: Project;
  /** Fecha límite para responder, ya formateada. */
  plazo?: string | null;
}

export async function generarSolicitudExcel(d: DatosSolicitud): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Consorcio AMG – CPI Educación Superior Simití";
  wb.created = new Date();

  const hoy = new Date().toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const ws = wb.addWorksheet("SOLICITUD", {
    views: [{ showGridLines: false }],
    // Listo para "Guardar como PDF" desde Excel en un clic, sin necesidad de
    // agregar una librería de PDF al proyecto.
    pageSetup: {
      orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });

  ws.columns = [
    { width: 5 },    // N°
    { width: 12 },   // Código
    { width: 62 },   // Descripción
    { width: 9 },    // Unidad
    { width: 11 },   // Cantidad
  ];

  /* --- Encabezado ---------------------------------------------------------- */
  const t = ws.addRow(["SOLICITUD DE COTIZACIÓN"]);
  t.font = { bold: true, size: 16, color: { argb: AZUL } };
  ws.mergeCells(t.number, 1, t.number, 5);

  const cod = ws.addRow([d.solicitud.code]);
  cod.font = { bold: true, size: 12 };
  ws.mergeCells(cod.number, 1, cod.number, 5);
  ws.addRow([]);

  const ficha: [string, string][] = [
    ["Obra", d.proyecto.name],
    ["Contrato No.", d.proyecto.contract_no ?? "—"],
    ["Contratante", d.proyecto.contractor ?? "Consorcio AMG – CPI Educación Superior Simití"],
    ["Ubicación", [d.proyecto.municipality, d.proyecto.department].filter(Boolean).join(", ") || "—"],
    ["Proveedor", d.proveedor.name],
    ["Línea solicitada", d.categoria?.name ?? "Varios"],
    ["Fecha", hoy],
  ];
  if (d.plazo) ficha.push(["Respuesta esperada", d.plazo]);

  for (const [k, v] of ficha) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true, size: 10 };
    r.getCell(2).font = { size: 10 };
    ws.mergeCells(r.number, 2, r.number, 5);
  }

  ws.addRow([]);
  const n = ws.addRow([`${d.items.length} ítem(s) a cotizar`]);
  n.font = { bold: true, size: 11, color: { argb: AZUL } };
  ws.mergeCells(n.number, 1, n.number, 5);

  /* --- Tabla --------------------------------------------------------------- */
  const cab = ws.addRow(["N°", "Código", "Descripción", "Unidad", "Cantidad"]);
  cab.height = 22;
  cab.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  cab.alignment = { vertical: "middle" };
  cab.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  });
  const filaCab = cab.number;

  d.items.forEach((it, i) => {
    // La especificación va pegada a la descripción y no en columna aparte: son
    // pocas y una columna casi vacía solo alarga la hoja.
    const desc = it.spec ? `${it.description}\n${it.spec}` : it.description;
    const r = ws.addRow([
      i + 1,
      it.code,
      desc,
      it.unit ?? "",
      it.quantity ?? "Por confirmar",
    ]);
    r.alignment = { vertical: "top", wrapText: true };
    r.getCell(1).alignment = { vertical: "top", horizontal: "center" };
    r.getCell(2).font = { size: 9, bold: true };
    r.getCell(3).font = { size: 10 };
    r.getCell(4).alignment = { vertical: "top", horizontal: "center" };
    r.getCell(5).alignment = { vertical: "top", horizontal: "right" };
    if (it.quantity === null) {
      r.getCell(5).font = { size: 9, italic: true, color: { argb: "FF8A9995" } };
    }
    if (i % 2 === 1) {
      r.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
      });
    }
  });

  // Repite el encabezado en cada página al imprimir o exportar a PDF.
  ws.pageSetup.printTitlesRow = `${filaCab}:${filaCab}`;

  /* --- Cierre -------------------------------------------------------------- */
  ws.addRow([]);
  const sinCantidad = d.items.every((it) => it.quantity === null);
  if (sinCantidad) {
    const a = ws.addRow(["Las cantidades finales se confirman al adjudicar. Agradecemos cotizar precio unitario."]);
    a.font = { size: 10, italic: true };
    ws.mergeCells(a.number, 1, a.number, 5);
  }

  const p1 = ws.addRow([
    "Agradecemos cotización formal en PDF: precio unitario, IVA, flete hasta la obra, tiempo de entrega y vigencia de la oferta.",
  ]);
  p1.font = { bold: true, size: 10 };
  p1.alignment = { wrapText: true };
  ws.mergeCells(p1.number, 1, p1.number, 5);

  const p2 = ws.addRow(["Si hay ítems que no maneja, cotice los que sí: la oferta parcial también nos sirve."]);
  p2.font = { size: 10 };
  p2.alignment = { wrapText: true };
  ws.mergeCells(p2.number, 1, p2.number, 5);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** `Solicitud_ELEC-CABLE-CENTELSA-001.xlsx` */
export function nombreSolicitudArchivo(s: QuoteRequest): string {
  return `Solicitud_${s.code}.xlsx`;
}

/**
 * Archivo aparte para los ítems críticos.
 *
 * Van con su motivo a la vista porque lo que se le pide al proveedor no es un
 * precio de catálogo, sino que confirme si lo maneja o proponga un equivalente
 * homologado. Sin el motivo, el vendedor no entiende por qué esos tres ítems
 * llegaron sueltos en vez de dentro de la lista grande.
 */
export async function generarSolicitudCriticaExcel(d: DatosSolicitud): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Consorcio AMG – CPI Educación Superior Simití";
  wb.created = new Date();

  const ws = wb.addWorksheet("ITEMS ESPECIALES", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 5 }, { width: 12 }, { width: 58 }, { width: 9 }, { width: 34 },
  ];

  const t = ws.addRow(["SOLICITUD DE COTIZACIÓN — ÍTEMS ESPECIALIZADOS"]);
  t.font = { bold: true, size: 15, color: { argb: AZUL } };
  ws.mergeCells(t.number, 1, t.number, 5);

  const cod = ws.addRow([d.solicitud.code]);
  cod.font = { bold: true, size: 12 };
  ws.addRow([]);

  for (const [k, v] of [
    ["Obra", d.proyecto.name],
    ["Contrato No.", d.proyecto.contract_no ?? "—"],
    ["Proveedor", d.proveedor.name],
    ["Fecha", new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })],
  ] as [string, string][]) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true, size: 10 };
    ws.mergeCells(r.number, 2, r.number, 5);
  }

  ws.addRow([]);
  const cab = ws.addRow(["N°", "Código", "Descripción", "Unidad", "Por qué se pide aparte"]);
  cab.height = 22;
  cab.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  cab.alignment = { vertical: "middle", wrapText: true };
  cab.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  });

  d.items.forEach((it, i) => {
    const ev = dificultadDe(it);
    const r = ws.addRow([
      i + 1,
      it.code,
      it.spec ? `${it.description}\n${it.spec}` : it.description,
      it.unit ?? "",
      ev.razones.join(" · ") || "Requiere confirmación técnica",
    ]);
    r.alignment = { vertical: "top", wrapText: true };
    r.getCell(2).font = { size: 9, bold: true };
    r.getCell(5).font = { size: 9, italic: true, color: { argb: "FF5F706C" } };
    if (i % 2 === 1) {
      r.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
      });
    }
  });

  ws.addRow([]);
  for (const texto of [
    "¿Maneja estos ítems directamente, o nos indica su representante autorizado?",
    "Si tiene un equivalente homologado, agradecemos proponerlo con su ficha técnica.",
  ]) {
    const r = ws.addRow([texto]);
    r.font = { bold: true, size: 10 };
    r.alignment = { wrapText: true };
    ws.mergeCells(r.number, 1, r.number, 5);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Dispara la descarga en el navegador. */
export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
