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

/** Todas las cotizaciones de la obra. Se usa al exportar. */
export async function cargarCotizacionesDeProyecto(projectId: string): Promise<Quote[]> {
  const { data: items, error: e1 } = await supabase
    .from("items").select("id").eq("project_id", projectId);
  if (e1) throw new Error(traducir(e1.message));

  const ids = (items ?? []).map((i: { id: string }) => i.id);
  if (!ids.length) return [];

  // Se pide por lotes: una lista de mil ids no cabe en la URL de la consulta.
  const LOTE = 200;
  const todas: Quote[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await supabase
      .from("quotes").select("*").in("item_id", ids.slice(i, i + LOTE));
    if (error) throw new Error(traducir(error.message));
    todas.push(...((data ?? []) as Quote[]));
  }
  return todas;
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

/* ---------------------------------------------------------------------------
   Edición de ítems

   Los campos técnicos (código, descripción, unidad, especificación…) los
   protege un trigger en la base: solo un administrador puede cambiarlos.
   --------------------------------------------------------------------------- */

export interface CamposItem {
  code: string;
  description: string;
  unit?: string | null;
  quantity?: number | null;
  category?: string | null;
  spec?: string | null;
  iva_treatment?: string | null;
  observation?: string | null;
}

export async function crearItem(
  projectId: string,
  campos: CamposItem
): Promise<Item> {
  const seq = await siguienteSeq(projectId);
  const { data, error } = await supabase
    .from("items")
    .insert({ ...campos, project_id: projectId, seq })
    .select()
    .single();
  if (error) throw new Error(traducir(error.message));
  return data as Item;
}

export async function editarItemTecnico(
  itemId: string,
  campos: Partial<CamposItem>
): Promise<Item> {
  const { data, error } = await supabase
    .from("items").update(campos).eq("id", itemId).select().single();
  if (error) throw new Error(traducir(error.message));
  return data as Item;
}

export async function borrarItem(itemId: string): Promise<void> {
  const { data, error } = await supabase
    .from("items").delete().eq("id", itemId).select("id");
  if (error) throw new Error(traducir(error.message));
  exigirFilas(data, "borrar el ítem");
}

/** Cuántas cotizaciones se perderían al borrar. Se muestra antes de confirmar. */
export async function contarCotizaciones(itemId: string): Promise<number> {
  const { count, error } = await supabase
    .from("quotes").select("id", { count: "exact", head: true }).eq("item_id", itemId);
  if (error) return 0;
  return count ?? 0;
}

/* ---------------------------------------------------------------------------
   Edición de proveedores

   Crear y corregir lo puede hacer cualquier usuario activo: quien está llamando
   es quien descubre proveedores nuevos y detecta los teléfonos equivocados.
   Borrar queda solo en manos del administrador.
   --------------------------------------------------------------------------- */

export interface CamposProveedor {
  name: string;
  city?: string | null;
  kind?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  web?: string | null;
  fast_contact?: string | null;
  contact_source?: string | null;
  notes?: string | null;
}

export async function crearProveedor(
  projectId: string,
  campos: CamposProveedor
): Promise<Supplier> {
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ ...campos, project_id: projectId })
    .select()
    .single();
  if (error) throw new Error(traducir(error.message));
  return data as Supplier;
}

export async function editarProveedor(
  supplierId: string,
  campos: Partial<CamposProveedor>
): Promise<Supplier> {
  const { data, error } = await supabase
    .from("suppliers").update(campos).eq("id", supplierId).select().single();
  if (error) throw new Error(traducir(error.message));
  return data as Supplier;
}

export async function borrarProveedor(supplierId: string): Promise<void> {
  const { data, error } = await supabase
    .from("suppliers").delete().eq("id", supplierId).select("id");
  if (error) throw new Error(traducir(error.message));
  exigirFilas(data, "borrar el proveedor");
}

/* --- Vínculos ítem ↔ proveedor -------------------------------------------- */

export async function vincularProveedor(itemId: string, supplierId: string): Promise<void> {
  const { error } = await supabase
    .from("item_suppliers").insert({ item_id: itemId, supplier_id: supplierId });
  // Si ya estaba vinculado no es un error que valga la pena mostrar.
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    throw new Error(traducir(error.message));
  }
}

export async function desvincularProveedor(itemId: string, supplierId: string): Promise<void> {
  const { data, error } = await supabase
    .from("item_suppliers").delete()
    .eq("item_id", itemId).eq("supplier_id", supplierId)
    .select("item_id");
  if (error) throw new Error(traducir(error.message));
  exigirFilas(data, "quitar el proveedor del ítem");
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

/* ---------------------------------------------------------------------------
   Gestión de obras (solo administrador — RLS lo exige en la base)
   --------------------------------------------------------------------------- */

export interface NuevaObra {
  name: string;
  contract_no?: string | null;
  contractor?: string | null;
  supervision?: string | null;
  municipality?: string | null;
  department?: string | null;
  notes?: string | null;
}

export async function crearObra(o: NuevaObra, userId: string): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...o, created_by: userId })
    .select()
    .single();
  if (error) throw new Error(traducir(error.message));
  return data as Project;
}

export async function actualizarObra(id: string, cambio: Partial<NuevaObra>): Promise<Project> {
  const { data, error } = await supabase
    .from("projects").update(cambio).eq("id", id).select().single();
  if (error) throw new Error(traducir(error.message));
  return data as Project;
}

export async function archivarObra(id: string, archivar: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("projects")
    .update({ archived_at: archivar ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(traducir(error.message));
  exigirFilas(data, "archivar la obra");
}

/** Borra la obra y, en cascada, sus ítems, proveedores y cotizaciones. */
export async function borrarObra(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("projects").delete().eq("id", id).select("id");
  if (error) throw new Error(traducir(error.message));
  exigirFilas(data, "borrar la obra");
}

/**
 * Supabase NO devuelve error cuando Row Level Security filtra todas las filas:
 * la operación "tiene éxito" afectando cero filas. Sin esta comprobación, una
 * falta de permisos se ve exactamente igual que un cambio aplicado, y el
 * usuario cree que guardó cuando no guardó nada.
 */
function exigirFilas(filas: unknown[] | null, accion: string): void {
  if (!filas || filas.length === 0) {
    throw new Error(
      `No se pudo ${accion}: no se modificó ningún registro. ` +
      `Es posible que no tenga permisos para esta acción.`
    );
  }
}

/* ---------------------------------------------------------------------------
   Importación de ítems
   --------------------------------------------------------------------------- */

export interface ItemImportado {
  code: string;
  description: string;
  unit?: string | null;
  quantity?: number | null;
  category?: string | null;
  spec?: string | null;
}

export interface ResultadoImportacion {
  insertados: number;
  duplicados: number;
  codigosDuplicados: string[];
}

/**
 * Inserta por lotes. Los códigos que ya existen en la obra NO se tocan: el
 * índice único (project_id, code) los rechaza y se reportan como duplicados,
 * en vez de sobrescribir trabajo ya hecho.
 */
export async function importarItems(
  projectId: string,
  filas: ItemImportado[],
  seqInicial = 1
): Promise<ResultadoImportacion> {
  const { data: existentes, error: errEx } = await supabase
    .from("items").select("code").eq("project_id", projectId);
  if (errEx) throw new Error(traducir(errEx.message));

  const yaEstan = new Set((existentes ?? []).map((r: { code: string }) => r.code));
  const duplicados: string[] = [];
  const nuevos: ItemImportado[] = [];

  for (const f of filas) {
    if (yaEstan.has(f.code)) { duplicados.push(f.code); continue; }
    yaEstan.add(f.code);           // evita duplicados dentro del mismo archivo
    nuevos.push(f);
  }

  const LOTE = 500;
  let insertados = 0;
  for (let i = 0; i < nuevos.length; i += LOTE) {
    const lote = nuevos.slice(i, i + LOTE).map((f, j) => ({
      project_id: projectId,
      seq: seqInicial + i + j,
      code: f.code,
      description: f.description,
      unit: f.unit ?? null,
      quantity: f.quantity ?? null,
      category: f.category ?? null,
      spec: f.spec ?? null,
    }));
    const { error } = await supabase.from("items").insert(lote);
    if (error) throw new Error(traducir(error.message));
    insertados += lote.length;
  }

  return { insertados, duplicados: duplicados.length, codigosDuplicados: duplicados.slice(0, 20) };
}

/* ---------------------------------------------------------------------------
   Importación masiva de proveedores y vínculos
   --------------------------------------------------------------------------- */

export interface ResultadoProveedores {
  creados: number;
  actualizados: number;
}

/**
 * Inserta o actualiza proveedores comparando por nombre normalizado.
 *
 * Si el proveedor ya existe se ACTUALIZA en vez de duplicarse: al reimportar un
 * estudio corregido, lo que se quiere es que los contactos malos se arreglen,
 * no terminar con dos fichas de la misma empresa.
 */
export async function importarProveedores(
  projectId: string,
  filas: CamposProveedor[],
  normalizar: (s: string) => string
): Promise<ResultadoProveedores> {
  const { data: existentes, error } = await supabase
    .from("suppliers").select("id, name").eq("project_id", projectId);
  if (error) throw new Error(traducir(error.message));

  const porNombre = new Map<string, string>();
  for (const e of (existentes ?? []) as { id: string; name: string }[]) {
    porNombre.set(normalizar(e.name), e.id);
  }

  const nuevos: (CamposProveedor & { project_id: string })[] = [];
  const cambios: { id: string; campos: CamposProveedor }[] = [];

  for (const f of filas) {
    const id = porNombre.get(normalizar(f.name));
    if (id) cambios.push({ id, campos: f });
    else nuevos.push({ ...f, project_id: projectId });
  }

  const LOTE = 500;
  for (let i = 0; i < nuevos.length; i += LOTE) {
    const { error: e } = await supabase.from("suppliers").insert(nuevos.slice(i, i + LOTE));
    if (e) throw new Error(traducir(e.message));
  }
  // Las actualizaciones van una a una: PostgREST no permite un update masivo
  // con valores distintos por fila.
  for (const c of cambios) {
    const { error: e } = await supabase.from("suppliers").update(c.campos).eq("id", c.id);
    if (e) throw new Error(traducir(e.message));
  }

  return { creados: nuevos.length, actualizados: cambios.length };
}

export interface ResultadoVinculos {
  creados: number;
  yaExistian: number;
  sinItem: string[];
  sinProveedor: string[];
}

/** Crea los vínculos ítem ↔ proveedor resolviendo por código y nombre. */
export async function importarVinculos(
  projectId: string,
  pares: { code: string; supplierId: string }[]
): Promise<ResultadoVinculos> {
  const { data: items, error: e1 } = await supabase
    .from("items").select("id, code").eq("project_id", projectId);
  if (e1) throw new Error(traducir(e1.message));

  const porCodigo = new Map<string, string>();
  for (const i of (items ?? []) as { id: string; code: string }[]) {
    porCodigo.set(i.code.trim().toUpperCase(), i.id);
  }

  const ids = (items ?? []).map((i: { id: string }) => i.id);
  const yaHay = new Set<string>();
  const LOTE_Q = 200;
  for (let i = 0; i < ids.length; i += LOTE_Q) {
    const { data, error } = await supabase
      .from("item_suppliers").select("item_id, supplier_id").in("item_id", ids.slice(i, i + LOTE_Q));
    if (error) throw new Error(traducir(error.message));
    for (const v of (data ?? []) as ItemSupplierRow[]) yaHay.add(`${v.item_id}|${v.supplier_id}`);
  }

  const nuevos: ItemSupplierRow[] = [];
  const sinItem: string[] = [];
  let yaExistian = 0;

  for (const p of pares) {
    const itemId = porCodigo.get(p.code.trim().toUpperCase());
    if (!itemId) { if (!sinItem.includes(p.code)) sinItem.push(p.code); continue; }
    const clave = `${itemId}|${p.supplierId}`;
    if (yaHay.has(clave)) { yaExistian++; continue; }
    yaHay.add(clave);
    nuevos.push({ item_id: itemId, supplier_id: p.supplierId });
  }

  const LOTE = 500;
  for (let i = 0; i < nuevos.length; i += LOTE) {
    const { error } = await supabase.from("item_suppliers").insert(nuevos.slice(i, i + LOTE));
    if (error) throw new Error(traducir(error.message));
  }

  return { creados: nuevos.length, yaExistian, sinItem: sinItem.slice(0, 20), sinProveedor: [] };
}

/** Proveedores de la obra, para resolver nombres al vincular. */
export async function listarProveedoresBasico(
  projectId: string
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("suppliers").select("id, name").eq("project_id", projectId);
  if (error) throw new Error(traducir(error.message));
  return (data ?? []) as { id: string; name: string }[];
}

export async function registrarImportacion(reg: {
  project_id: string;
  filename: string;
  sheet_name: string;
  header_row: number;
  rows_read: number;
  rows_imported: number;
  rows_skipped: number;
  mapping: Record<string, string>;
  created_by: string;
}): Promise<void> {
  // El registro es informativo: si falla, la importación ya ocurrió y no
  // conviene hacerla fracasar por no poder dejar la bitácora.
  const { error } = await supabase.from("imports").insert(reg);
  if (error) console.warn("No se pudo registrar la importación:", error.message);
}

export async function siguienteSeq(projectId: string): Promise<number> {
  const { data, error } = await supabase
    .from("items").select("seq").eq("project_id", projectId)
    .order("seq", { ascending: false }).limit(1);
  if (error) return 1;
  const max = (data?.[0] as { seq: number | null } | undefined)?.seq;
  return (max ?? 0) + 1;
}

/**
 * Los errores de PostgREST llegan en inglés y hablan de políticas y columnas.
 * Para un operario eso no significa nada: se traduce a la causa real.
 */
function traducir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("ficha técnica"))
    return "Solo un administrador puede modificar la ficha técnica del ítem (código, descripción, unidad o especificación).";
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
