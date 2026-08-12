import { supabase } from "./supabase";
import type {
  Item, ItemQuoteStats, ItemState, ItemSupplierRow, Project, Quote, Supplier,
} from "./types";

/** Los proveedores asignados a cada ítem, en forma de mapa. */
export type VinculosItemProveedor = Record<string, string[]>;

export interface DatosProyecto {
  proyecto: Project;
  items: Item[];
  proveedores: Supplier[];
  vinculos: VinculosItemProveedor;
  stats: Record<string, ItemQuoteStats>;
}

export async function listarProyectos(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function cargarProyecto(projectId: string): Promise<DatosProyecto> {
  const [proyRes, itemsRes, provRes, statsRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("items").select("*").eq("project_id", projectId).order("seq", { ascending: true }),
    supabase.from("suppliers").select("*").eq("project_id", projectId).order("name"),
    supabase.from("item_quote_stats").select("*").eq("project_id", projectId),
  ]);

  for (const r of [proyRes, itemsRes, provRes, statsRes]) {
    if (r.error) throw new Error(traducir(r.error.message));
  }
  if (!proyRes.data) throw new Error("El proyecto no existe o no tiene permiso para verlo.");

  const items = (itemsRes.data ?? []) as Item[];

  // item_suppliers no se puede filtrar por project_id directamente:
  // se filtra por los ids de los ítems del proyecto.
  const vinculos: VinculosItemProveedor = {};
  if (items.length) {
    const ids = items.map((i) => i.id);
    const { data: vin, error: errVin } = await supabase
      .from("item_suppliers")
      .select("item_id, supplier_id")
      .in("item_id", ids);
    if (errVin) throw new Error(traducir(errVin.message));
    for (const v of (vin ?? []) as ItemSupplierRow[]) {
      (vinculos[v.item_id] ??= []).push(v.supplier_id);
    }
  }

  const stats: Record<string, ItemQuoteStats> = {};
  for (const s of (statsRes.data ?? []) as ItemQuoteStats[]) stats[s.item_id] = s;

  return {
    proyecto: proyRes.data as Project,
    items,
    proveedores: (provRes.data ?? []) as Supplier[],
    vinculos,
    stats,
  };
}

export async function cargarCotizaciones(itemId: string): Promise<Quote[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("item_id", itemId)
    .order("total_delivered", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Campos que un operario SÍ puede modificar (los demás los bloquea PostgreSQL). */
export interface CambioItem {
  state?: ItemState;
  note?: string | null;
  quantity?: number | null;
  selected_quote_id?: string | null;
}

export async function actualizarItem(itemId: string, cambio: CambioItem): Promise<Item> {
  const { data, error } = await supabase
    .from("items")
    .update(cambio)
    .eq("id", itemId)
    .select()
    .single();
  if (error) throw new Error(traducir(error.message));
  return data as Item;
}

/** Marca varios ítems a la vez (usado por la lista de llamadas). */
export async function actualizarEstadoVarios(ids: string[], state: ItemState): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from("items").update({ state }).in("id", ids);
  if (error) throw new Error(traducir(error.message));
}

export interface NuevaCotizacion {
  item_id: string;
  supplier_id: string | null;
  price_no_iva?: number | null;
  iva_amount?: number | null;
  price_with_iva?: number | null;
  freight?: number | null;
  other_costs?: number | null;
  total_delivered?: number | null;
  price_unit?: string | null;
  availability?: string | null;
  lead_time_days?: number | null;
  valid_until?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
}

export async function crearCotizacion(
  q: NuevaCotizacion,
  userId: string
): Promise<Quote> {
  const { data, error } = await supabase
    .from("quotes")
    .insert({ ...q, quoted_by: userId })
    .select()
    .single();
  if (error) throw new Error(traducir(error.message));
  return data as Quote;
}

export async function borrarCotizacion(id: string): Promise<void> {
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw new Error(traducir(error.message));
}

/**
 * Los errores de PostgREST llegan en inglés y hablan de políticas y columnas.
 * Para un operario eso no significa nada: se traduce a la causa real.
 */
function traducir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("row-level security") || m.includes("violates row-level"))
    return "No tiene permiso para esta acción. Solo un administrador puede hacerla.";
  if (m.includes("permission denied for column") || m.includes("permission denied"))
    return "Ese campo solo lo puede modificar un administrador.";
  if (m.includes("duplicate key") && m.includes("code"))
    return "Ya existe un ítem con ese código en este proyecto.";
  if (m.includes("duplicate key"))
    return "Ese registro ya existe.";
  if (m.includes("foreign key"))
    return "El registro está enlazado con otro y no se puede modificar así.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Sin conexión con el servidor. Revise su acceso a internet.";
  return msg;
}
