/**
 * Exportación del estudio a un libro de Excel con formato real.
 *
 * No es un volcado de tabla: el archivo debe poder enviarse a interventoría tal
 * como sale. Encabezados congelados, filtros, anchos reales, moneda formateada
 * y números como número, no como texto.
 *
 * ExcelJS se carga con import() diferido, igual que en el importador.
 */
import type { Item, ItemQuoteStats, Project, Quote, Supplier } from "./types";
import type { VinculosItemProveedor } from "./datos";
import { ESTADO_POR_ID, alertaDe } from "./dominio";

export interface DatosExportacion {
  proyecto: Project;
  items: Item[];
  proveedores: Supplier[];
  vinculos: VinculosItemProveedor;
  stats: Record<string, ItemQuoteStats>;
  cotizaciones: Quote[];
}

const AZUL = "FF0B6055";   // acento petróleo del tablero
const GRIS = "FFF2F4F3";
const MONEDA = '"$"#,##0';

type Col = { h: string; w: number; k: string };

export async function exportarEstudio(d: DatosExportacion): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de compras de obra";
  wb.created = new Date();

  const hoy = new Date().toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric",
  });

  /** Crea una hoja con encabezado con estilo, filtros y panel congelado. */
  function hoja(nombre: string, cols: Col[]) {
    const ws = wb.addWorksheet(nombre, {
      views: [{ state: "frozen", ySplit: 1 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w }));

    const cab = ws.getRow(1);
    cab.height = 26;
    cab.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cab.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cab.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  }

  /** Franjas alternas y bordes: hace legible una tabla larga. */
  function rematar(ws: import("exceljs").Worksheet) {
    ws.eachRow((row, i) => {
      if (i === 1) return;
      row.alignment = { vertical: "top", wrapText: true };
      if (i % 2 === 0) {
        row.eachCell((c) => {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
        });
      }
    });
  }

  const provPorId = new Map(d.proveedores.map((p) => [p.id, p]));
  const cotsPorItem = new Map<string, Quote[]>();
  for (const q of d.cotizaciones) {
    const l = cotsPorItem.get(q.item_id) ?? [];
    l.push(q);
    cotsPorItem.set(q.item_id, l);
  }

  /* ---------------------------------------------------------------- RESUMEN */
  const ws0 = wb.addWorksheet("RESUMEN", { views: [{ showGridLines: false }] });
  ws0.columns = [{ width: 42 }, { width: 78 }];

  const titulo = ws0.addRow(["ESTUDIO DE MERCADO Y CONTROL DE COMPRAS"]);
  titulo.font = { bold: true, size: 15, color: { argb: AZUL } };
  ws0.addRow([]);

  const ficha: [string, string | number][] = [
    ["Obra", d.proyecto.name],
    ["Contrato No.", d.proyecto.contract_no ?? "—"],
    ["Contratista", d.proyecto.contractor ?? "—"],
    ["Interventoría", d.proyecto.supervision ?? "—"],
    ["Ubicación", [d.proyecto.municipality, d.proyecto.department].filter(Boolean).join(", ") || "—"],
    ["Fecha de exportación", hoy],
  ];
  for (const [k, v] of ficha) {
    const r = ws0.addRow([k, v]);
    r.getCell(1).font = { bold: true, size: 10 };
  }

  ws0.addRow([]);
  const th = ws0.addRow(["AVANCE DE LA GESTIÓN"]);
  th.font = { bold: true, size: 12, color: { argb: AZUL } };

  const porEstado = new Map<string, number>();
  for (const it of d.items) porEstado.set(it.state, (porEstado.get(it.state) ?? 0) + 1);
  for (const [id, def] of Object.entries(ESTADO_POR_ID)) {
    const r = ws0.addRow([def.lbl, porEstado.get(id) ?? 0]);
    r.getCell(1).font = { bold: true, size: 10 };
  }

  ws0.addRow([]);
  const conRef = d.items.filter((i) => i.ref_price !== null).length;
  const criticos = d.items.filter((i) => alertaDe(i).sev <= 1).length;
  for (const [k, v] of [
    ["Total de ítems", d.items.length],
    ["Con precio de referencia", conRef],
    ["Sin ningún precio", d.items.length - conRef],
    ["Críticos (requieren decisión técnica)", criticos],
    ["Proveedores en la obra", d.proveedores.length],
    ["Cotizaciones registradas", d.cotizaciones.length],
  ] as [string, number][]) {
    const r = ws0.addRow([k, v]);
    r.getCell(1).font = { bold: true, size: 10 };
  }

  ws0.addRow([]);
  const adv = ws0.addRow([
    "ADVERTENCIA",
    "Los precios de referencia son precios de producto CON IVA y SIN flete. " +
    "Para obtener el precio puesto en obra debe sumarse el transporte, que se " +
    "cotiza aparte con cada proveedor.",
  ]);
  adv.getCell(1).font = { bold: true, color: { argb: "FFA33529" } };
  adv.getCell(2).alignment = { wrapText: true };
  adv.height = 34;

  /* -------------------------------------------------------- ESTUDIO_MERCADO */
  const ws1 = hoja("ESTUDIO_MERCADO", [
    { h: "Ítem", w: 7, k: "seq" },
    { h: "Código", w: 11, k: "code" },
    { h: "Descripción", w: 48, k: "desc" },
    { h: "Unidad", w: 9, k: "unit" },
    { h: "Cantidad", w: 11, k: "qty" },
    { h: "Categoría", w: 16, k: "cat" },
    { h: "Especificación técnica", w: 52, k: "spec" },
    { h: "Estado", w: 13, k: "estado" },
    { h: "Alerta", w: 26, k: "alerta" },
    { h: "Precio referencia", w: 16, k: "ref" },
    { h: "Unidad del precio", w: 20, k: "refu" },
    { h: "Producto de referencia", w: 42, k: "refp" },
    { h: "IVA", w: 10, k: "iva" },
    { h: "Proveedores", w: 10, k: "nprov" },
    { h: "Cotizaciones", w: 12, k: "ncot" },
    { h: "Nota del equipo", w: 40, k: "nota" },
    { h: "Observación del estudio", w: 60, k: "obs" },
  ]);

  for (const it of d.items) {
    const a = alertaDe(it);
    const r = ws1.addRow({
      seq: it.seq, code: it.code, desc: it.description, unit: it.unit,
      qty: it.quantity, cat: it.category, spec: it.spec,
      estado: ESTADO_POR_ID[it.state].lbl,
      alerta: a.t,
      ref: it.ref_price, refu: it.ref_price_unit, refp: it.ref_product,
      iva: it.iva_treatment,
      nprov: (d.vinculos[it.id] ?? []).length,
      ncot: (cotsPorItem.get(it.id) ?? []).length,
      nota: it.note, obs: it.observation,
    });
    r.getCell("ref").numFmt = MONEDA;
    r.getCell("code").font = { bold: true };
    if (a.sev <= 1) {
      r.getCell("alerta").font = { bold: true, color: { argb: "FFA33529" } };
    }
  }
  rematar(ws1);

  /* ----------------------------------------------------------- COTIZACIONES */
  const ws2 = hoja("COTIZACIONES", [
    { h: "Código", w: 11, k: "code" },
    { h: "Descripción del ítem", w: 46, k: "desc" },
    { h: "Unidad", w: 9, k: "unit" },
    { h: "Proveedor", w: 38, k: "prov" },
    { h: "Ciudad", w: 20, k: "ciudad" },
    { h: "Precio sin IVA", w: 15, k: "sin" },
    { h: "IVA", w: 13, k: "iva" },
    { h: "Precio con IVA", w: 15, k: "con" },
    { h: "Flete", w: 13, k: "flete" },
    { h: "PUESTO EN OBRA", w: 17, k: "total" },
    { h: "Vigencia", w: 12, k: "vig" },
    { h: "Días entrega", w: 12, k: "dias" },
    { h: "Elegida", w: 9, k: "sel" },
    { h: "Notas", w: 40, k: "notas" },
  ]);

  const itemPorId = new Map(d.items.map((i) => [i.id, i]));
  for (const q of d.cotizaciones) {
    const it = itemPorId.get(q.item_id);
    const p = q.supplier_id ? provPorId.get(q.supplier_id) : undefined;
    const r = ws2.addRow({
      code: it?.code, desc: it?.description, unit: it?.unit,
      prov: p?.name ?? "No indicado", ciudad: p?.city,
      sin: q.price_no_iva, iva: q.iva_amount, con: q.price_with_iva,
      flete: q.freight, total: q.total_delivered,
      vig: q.valid_until, dias: q.lead_time_days,
      sel: it?.selected_quote_id === q.id ? "SÍ" : "",
      notas: q.notes,
    });
    for (const k of ["sin", "iva", "con", "flete", "total"]) r.getCell(k).numFmt = MONEDA;
    r.getCell("total").font = { bold: true };
    if (it?.selected_quote_id === q.id) {
      r.getCell("sel").font = { bold: true, color: { argb: "FF1F7A4D" } };
    }
  }
  if (d.cotizaciones.length === 0) {
    ws2.addRow({ code: "—", desc: "Todavía no hay cotizaciones registradas." });
  }
  rematar(ws2);

  /* ------------------------------------------------------ PRECIO_RECOMENDADO */
  const ws3 = hoja("PRECIO_RECOMENDADO", [
    { h: "Código", w: 11, k: "code" },
    { h: "Descripción", w: 48, k: "desc" },
    { h: "Unidad", w: 9, k: "unit" },
    { h: "Cantidad", w: 11, k: "qty" },
    { h: "N° cotizaciones", w: 14, k: "n" },
    { h: "Mínimo", w: 14, k: "min" },
    { h: "Mediana", w: 14, k: "med" },
    { h: "Promedio", w: 14, k: "avg" },
    { h: "Máximo", w: 14, k: "max" },
    { h: "Elegida", w: 16, k: "sel" },
    { h: "Proveedor elegido", w: 34, k: "prov" },
    { h: "Estado", w: 13, k: "estado" },
  ]);

  for (const it of d.items) {
    const s = d.stats[it.id];
    const elegida = d.cotizaciones.find((q) => q.id === it.selected_quote_id);
    const p = elegida?.supplier_id ? provPorId.get(elegida.supplier_id) : undefined;
    const r = ws3.addRow({
      code: it.code, desc: it.description, unit: it.unit, qty: it.quantity,
      n: s?.n_quotes ?? 0,
      min: s?.min_delivered, med: s?.median_delivered,
      avg: s?.avg_delivered, max: s?.max_delivered,
      sel: elegida?.total_delivered ?? null,
      prov: p?.name,
      estado: ESTADO_POR_ID[it.state].lbl,
    });
    for (const k of ["min", "med", "avg", "max", "sel"]) r.getCell(k).numFmt = MONEDA;
    r.getCell("code").font = { bold: true };
    r.getCell("med").font = { bold: true, color: { argb: AZUL } };
  }
  rematar(ws3);

  /* ------------------------------------------------------------ PROVEEDORES */
  const ws4 = hoja("PROVEEDORES", [
    { h: "Empresa", w: 40, k: "nom" },
    { h: "Ciudad", w: 24, k: "ciudad" },
    { h: "Tipo", w: 26, k: "tipo" },
    { h: "CONTACTO MÁS RÁPIDO", w: 38, k: "rapido" },
    { h: "Teléfono", w: 22, k: "tel" },
    { h: "WhatsApp", w: 22, k: "wa" },
    { h: "Correo", w: 30, k: "mail" },
    { h: "Web", w: 34, k: "web" },
    { h: "Ítems que puede suministrar", w: 14, k: "nitems" },
    { h: "Códigos", w: 54, k: "codigos" },
    { h: "Fuente del contacto", w: 40, k: "fuente" },
    { h: "Notas", w: 60, k: "notas" },
  ]);

  const itemsDeProv = new Map<string, string[]>();
  for (const it of d.items) {
    for (const pid of d.vinculos[it.id] ?? []) {
      const l = itemsDeProv.get(pid) ?? [];
      l.push(it.code);
      itemsDeProv.set(pid, l);
    }
  }
  for (const p of d.proveedores) {
    const codigos = itemsDeProv.get(p.id) ?? [];
    const r = ws4.addRow({
      nom: p.name, ciudad: p.city, tipo: p.kind, rapido: p.fast_contact,
      tel: p.phone, wa: p.whatsapp, mail: p.email, web: p.web,
      nitems: codigos.length, codigos: codigos.join(", "),
      fuente: p.contact_source, notas: p.notes,
    });
    r.getCell("nom").font = { bold: true };
    r.getCell("rapido").font = { bold: true, color: { argb: AZUL } };
  }
  rematar(ws4);

  /* ------------------------------------------------------------- ALERTAS */
  const ws5 = hoja("ALERTAS", [
    { h: "Código", w: 11, k: "code" },
    { h: "Descripción", w: 48, k: "desc" },
    { h: "Alerta", w: 30, k: "alerta" },
    { h: "Severidad", w: 11, k: "sev" },
    { h: "Observación", w: 100, k: "obs" },
  ]);
  const conAlerta = d.items
    .filter((i) => alertaDe(i).sev <= 3)
    .sort((a, b) => alertaDe(a).sev - alertaDe(b).sev);
  for (const it of conAlerta) {
    const a = alertaDe(it);
    const r = ws5.addRow({
      code: it.code, desc: it.description, alerta: a.t,
      sev: a.sev <= 1 ? "CRÍTICA" : "Media",
      obs: it.observation,
    });
    r.getCell("code").font = { bold: true };
    if (a.sev <= 1) r.getCell("sev").font = { bold: true, color: { argb: "FFA33529" } };
  }
  rematar(ws5);

  /* ------------------------------------------------------------- SIN_GESTION */
  const ws6 = hoja("PENDIENTES", [
    { h: "Código", w: 11, k: "code" },
    { h: "Descripción", w: 50, k: "desc" },
    { h: "Unidad", w: 9, k: "unit" },
    { h: "Proveedores", w: 12, k: "nprov" },
    { h: "A quién llamar", w: 90, k: "quien" },
  ]);
  for (const it of d.items.filter((i) => i.state === "pendiente")) {
    const nombres = (d.vinculos[it.id] ?? [])
      .map((pid) => provPorId.get(pid))
      .filter(Boolean)
      .map((p) => `${p!.name} (${p!.fast_contact ?? p!.phone ?? "sin contacto"})`);
    const r = ws6.addRow({
      code: it.code, desc: it.description, unit: it.unit,
      nprov: nombres.length, quien: nombres.join(" · "),
    });
    r.getCell("code").font = { bold: true };
  }
  rematar(ws6);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Nombre de archivo con la obra y la fecha, sin caracteres problemáticos. */
export function nombreArchivo(proyecto: Project): string {
  const limpio = proyecto.name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // quita tildes
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 45);
  const f = new Date().toISOString().slice(0, 10);
  return `Estudio_${limpio}_${f}.xlsx`;
}
