/**
 * Cobertura de proveedores por categoría.
 *
 * La pregunta que resuelve este archivo no es "¿a quién ya contacté?" sino
 * "¿con qué proveedores cubro esta categoría completa mandando la menor
 * cantidad de mensajes posible?".
 *
 * Sobre la métrica: medir "cuántos productos PUEDE suministrar" no se puede,
 * porque eso no se sabe hasta preguntar. Se separan tres señales distintas:
 *
 *   - Cobertura DECLARADA  : atiende la categoría (de supplier_categories).
 *                            Sirve para arrancar cuando no hay historial.
 *   - Cobertura DEMOSTRADA : ítems de la categoría que YA cotizó.
 *                            Es la única que sirve para sustentar una decisión.
 *   - Tasa de respuesta    : respondió / le envié. Mide fiabilidad, que es lo
 *                            que de verdad cuesta cuando hay 1.000 ítems.
 */
import type { Item, Quote, QuoteRequest, Supplier } from "./types";

export interface MetricasProveedor {
  proveedor: Supplier;
  /** Total de ítems de la categoría (igual para todos los proveedores). */
  itemsCategoria: number;
  /** Ítems de la categoría con al menos una cotización de este proveedor. */
  itemsCotizados: number;
  /** itemsCotizados / itemsCategoria, entre 0 y 1. */
  coberturaDemostrada: number;
  solicitudesEnviadas: number;
  solicitudesRespondidas: number;
  /** null cuando nunca se le ha enviado nada: no es 0%, es "no se sabe". */
  tasaRespuesta: number | null;
  /** 1 ocasional · 2 habitual · 3 especialista. */
  fuerza: number;
}

/**
 * Ordena los proveedores de una categoría por utilidad real.
 *
 * Criterio: primero lo demostrado, luego la fiabilidad, y solo al final lo
 * declarado. Un proveedor que cotizó 40 ítems vale más que uno que dice
 * atender la categoría y nunca contestó.
 */
export function metricasDeCategoria(
  itemsCategoria: Item[],
  candidatos: Supplier[],
  quotes: Quote[],
  solicitudes: QuoteRequest[],
  fuerzas: Record<string, number> = {}
): MetricasProveedor[] {
  const idsCategoria = new Set(itemsCategoria.map((i) => i.id));

  const cotizadosPorProv = new Map<string, Set<string>>();
  for (const q of quotes) {
    if (!q.supplier_id || !idsCategoria.has(q.item_id)) continue;
    let s = cotizadosPorProv.get(q.supplier_id);
    if (!s) cotizadosPorProv.set(q.supplier_id, (s = new Set()));
    s.add(q.item_id);
  }

  const envio = new Map<string, { enviadas: number; respondidas: number }>();
  for (const s of solicitudes) {
    const e = envio.get(s.supplier_id) ?? { enviadas: 0, respondidas: 0 };
    if (s.sent_at) e.enviadas++;
    if (s.responded_at) e.respondidas++;
    envio.set(s.supplier_id, e);
  }

  const total = itemsCategoria.length;

  return candidatos
    .map((p) => {
      const cotizados = cotizadosPorProv.get(p.id)?.size ?? 0;
      const e = envio.get(p.id) ?? { enviadas: 0, respondidas: 0 };
      return {
        proveedor: p,
        itemsCategoria: total,
        itemsCotizados: cotizados,
        coberturaDemostrada: total ? cotizados / total : 0,
        solicitudesEnviadas: e.enviadas,
        solicitudesRespondidas: e.respondidas,
        tasaRespuesta: e.enviadas ? e.respondidas / e.enviadas : null,
        fuerza: fuerzas[p.id] ?? 2,
      };
    })
    .sort(
      (a, b) =>
        b.coberturaDemostrada - a.coberturaDemostrada ||
        (b.tasaRespuesta ?? -1) - (a.tasaRespuesta ?? -1) ||
        b.fuerza - a.fuerza ||
        a.proveedor.name.localeCompare(b.proveedor.name)
    );
}

/* ---------------------------------------------------------------------------
   Combinación mínima de proveedores
   --------------------------------------------------------------------------- */

export type ModoCobertura = "demostrada" | "declarada";

export interface PasoCobertura {
  proveedor: Supplier;
  /** Ítems que aporta este proveedor y que ninguno de los anteriores cubría. */
  nuevos: number;
  /** Ítems cubiertos sumando este proveedor y todos los anteriores. */
  acumulado: number;
  /** acumulado / ítems de la categoría, entre 0 y 1. */
  porcentaje: number;
}

export interface Combinacion {
  /**
   * "demostrada" cuando hay cotizaciones sobre las que calcular.
   * "declarada" cuando todavía no se le ha comprado nada a nadie: entonces el
   * orden sale de la especialidad declarada, no de evidencia.
   */
  modo: ModoCobertura;
  pasos: PasoCobertura[];
  cubiertos: number;
  total: number;
}

/**
 * Conjunto mínimo de proveedores que cubre la mayor parte de la categoría.
 *
 * Es un voraz clásico de recubrimiento: en cada paso se elige al proveedor que
 * aporta más ítems que todavía no cubre nadie. No garantiza el óptimo (el
 * problema es NP-difícil), pero para 10-30 proveedores da la respuesta correcta
 * en la práctica y se calcula al instante en el navegador.
 *
 * Sirve para lo que el usuario pidió: "no quiero mandar 500 mensajes".
 */
export function combinacionRecomendada(
  itemsCategoria: Item[],
  candidatos: Supplier[],
  quotes: Quote[],
  fuerzas: Record<string, number> = {},
  maxPasos = 5
): Combinacion {
  const total = itemsCategoria.length;
  const idsCategoria = new Set(itemsCategoria.map((i) => i.id));

  const cubrePor = new Map<string, Set<string>>();
  for (const q of quotes) {
    if (!q.supplier_id || !idsCategoria.has(q.item_id)) continue;
    let s = cubrePor.get(q.supplier_id);
    if (!s) cubrePor.set(q.supplier_id, (s = new Set()));
    s.add(q.item_id);
  }

  // Sin una sola cotización no hay nada que recubrir. Devolver una lista vacía
  // sería técnicamente cierto e inútil: se cae a la especialidad declarada para
  // que la pantalla igual pueda decir por dónde empezar.
  if (cubrePor.size === 0) {
    const pasos = [...candidatos]
      .sort(
        (a, b) =>
          (fuerzas[b.id] ?? 2) - (fuerzas[a.id] ?? 2) ||
          a.name.localeCompare(b.name)
      )
      .slice(0, maxPasos)
      .map((proveedor) => ({ proveedor, nuevos: 0, acumulado: 0, porcentaje: 0 }));
    return { modo: "declarada", pasos, cubiertos: 0, total };
  }

  const pendientes = new Set<string>();
  for (const s of cubrePor.values()) for (const id of s) pendientes.add(id);

  const pasos: PasoCobertura[] = [];
  let acumulado = 0;

  while (pendientes.size > 0 && pasos.length < maxPasos) {
    let mejor: Supplier | null = null;
    let mejorAporte = 0;

    for (const p of candidatos) {
      const cubre = cubrePor.get(p.id);
      if (!cubre) continue;
      let n = 0;
      for (const id of cubre) if (pendientes.has(id)) n++;
      if (n > mejorAporte) { mejorAporte = n; mejor = p; }
    }
    if (!mejor) break;

    for (const id of cubrePor.get(mejor.id)!) pendientes.delete(id);
    acumulado += mejorAporte;
    pasos.push({
      proveedor: mejor,
      nuevos: mejorAporte,
      acumulado,
      porcentaje: total ? acumulado / total : 0,
    });
  }

  return { modo: "demostrada", pasos, cubiertos: acumulado, total };
}

/** Ítems de la categoría sin una sola cotización: los huecos reales. */
export function itemsSinCotizar(itemsCategoria: Item[], quotes: Quote[]): Item[] {
  const conPrecio = new Set(quotes.map((q) => q.item_id));
  return itemsCategoria.filter((i) => !conPrecio.has(i.id));
}

/** Porcentaje formateado para pantalla. */
export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
