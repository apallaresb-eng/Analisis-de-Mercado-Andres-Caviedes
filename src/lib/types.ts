export type UserRole = "admin" | "operario";

export type ItemState =
  | "pendiente"
  | "contactado"
  | "cotizado"
  | "cerrado"
  | "replantear";

/**
 * Estado de una SOLICITUD de cotización, independiente del estado del ítem.
 *
 * Pedirle PVC a Durman no puede cambiar en nada lo que falte pedirle a Pavco,
 * y por eso el estado vive aquí y no en el ítem.
 *
 * No existe un estado "esperando cotización" aparte de "enviada": se está
 * esperando desde el momento en que se envía. Y "requiere seguimiento" tampoco
 * se guarda — se calcula con sent_at, así nunca queda desactualizado.
 */
export type RequestStatus =
  | "borrador"
  | "enviada"
  | "respondida"
  | "cerrada"
  | "sin_respuesta"
  | "descartada";

export type RequestScope = "categoria" | "subcategoria" | "manual";

export type RequestChannel = "whatsapp" | "correo" | "llamada" | "presencial";

/** Qué tan confiable es el contacto publicado del proveedor. */
export type ContactConfidence = "alta" | "media" | "baja";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  active: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  contract_no: string | null;
  contractor: string | null;
  supervision: string | null;
  municipality: string | null;
  department: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
}

export interface Supplier {
  id: string;
  project_id: string;
  ext_id: string | null;
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
  /** Confianza del contacto publicado. La verificación real la hace el equipo. */
  contact_confidence: ContactConfidence | null;
  /** Cuándo se logró contacto real por primera vez. Lo escribe el equipo. */
  contact_verified_at: string | null;
  /** Proveedor de cobertura nacional (vs. regional del Magdalena Medio). */
  national: boolean;
  created_at: string;
}

/**
 * Categoría del estudio. Dos niveles: parent_id nulo es una categoría raíz.
 *
 * Es la pieza que une ítems con proveedores: en vez de vincular a mano cada
 * ítem con sus 8-10 candidatos (~9.000 decisiones), se declara una vez qué
 * categorías atiende cada proveedor y el ítem hereda las suyas.
 */
export interface Category {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort: number;
  created_at: string;
}

export interface SupplierCategory {
  supplier_id: string;
  category_id: string;
  /** 1 ocasional · 2 habitual · 3 especialista. */
  strength: number;
  created_at: string;
}

export interface QuoteRequest {
  id: string;
  project_id: string;
  supplier_id: string;
  category_id: string | null;
  scope: RequestScope;
  /** Código legible y estable: PVC-DURMAN-001. */
  code: string;
  status: RequestStatus;
  channel: RequestChannel | null;
  message_text: string | null;
  whatsapp_url: string | null;
  sent_at: string | null;
  responded_at: string | null;
  last_interaction_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteRequestItem {
  request_id: string;
  item_id: string;
  /** Cantidad tal como se pidió, aunque después cambie en el ítem. */
  quantity_snapshot: number | null;
}

export interface Item {
  id: string;
  project_id: string;
  seq: number | null;
  code: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  /** Texto libre heredado. Se conserva poblado en paralelo con category_id. */
  category: string | null;
  category_id: string | null;
  spec: string | null;
  iva_treatment: string | null;
  alert: string | null;
  observation: string | null;
  ref_price: number | null;
  ref_price_unit: string | null;
  ref_product: string | null;
  ref_source: string | null;
  state: ItemState;
  selected_quote_id: string | null;
  note: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export interface Quote {
  id: string;
  item_id: string;
  /** Lo llena un trigger a partir del ítem: no hay que mandarlo al insertar. */
  project_id: string | null;
  /** De qué solicitud salió esta respuesta. Null si se cargó suelta. */
  request_id: string | null;
  supplier_id: string | null;
  price_no_iva: number | null;
  iva_amount: number | null;
  price_with_iva: number | null;
  freight: number | null;
  other_costs: number | null;
  total_delivered: number | null;
  price_unit: string | null;
  availability: string | null;
  lead_time_days: number | null;
  valid_until: string | null;
  payment_terms: string | null;
  source: string;
  notes: string | null;
  quoted_at: string;
  quoted_by: string | null;
  created_at: string;
}

export interface ActivityRow {
  id: number;
  project_id: string | null;
  item_id: string | null;
  user_id: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface ItemQuoteStats {
  item_id: string;
  project_id: string;
  n_quotes: number;
  min_delivered: number | null;
  max_delivered: number | null;
  avg_delivered: number | null;
  median_delivered: number | null;
}

export interface ImportRow {
  id: string;
  project_id: string;
  filename: string | null;
  sheet_name: string | null;
  header_row: number | null;
  rows_read: number | null;
  rows_imported: number | null;
  rows_skipped: number | null;
  mapping: Record<string, string> | null;
  created_by: string | null;
  created_at: string;
}

export interface ItemSupplierRow {
  item_id: string;
  supplier_id: string;
}

/** Fila de la vista category_supplier_coverage. */
export interface CategorySupplierCoverage {
  category_id: string;
  project_id: string;
  category_name: string;
  supplier_id: string;
  supplier_name: string;
  strength: number;
  items_categoria: number;
  /** Cobertura DEMOSTRADA: ítems de la categoría que este proveedor ya cotizó. */
  items_cotizados: number;
  solicitudes_enviadas: number;
  solicitudes_respondidas: number;
  solicitudes_abiertas: number;
  ultimo_envio: string | null;
}

/** Fila de la vista category_summary. */
export interface CategorySummary {
  category_id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort: number;
  n_items: number;
  n_items_cotizados: number;
  n_proveedores: number;
  n_solicitudes: number;
  n_solicitudes_abiertas: number;
  n_solicitudes_respondidas: number;
}

/**
 * Tipado para supabase-js v2.
 *
 * Cada tabla debe declarar Row, Insert, Update y Relationships: si falta
 * Relationships, la inferencia colapsa a `never` y todas las escrituras fallan
 * a compilar.
 */
type Tabla<R, I = Partial<R>, U = Partial<R>> = {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Tabla<Profile>;
      projects: Tabla<Project>;
      suppliers: Tabla<Supplier>;
      items: Tabla<Item>;
      item_suppliers: Tabla<ItemSupplierRow, ItemSupplierRow>;
      quotes: Tabla<Quote>;
      activity_log: Tabla<ActivityRow>;
      imports: Tabla<ImportRow>;
      categories: Tabla<Category>;
      supplier_categories: Tabla<SupplierCategory>;
      quote_requests: Tabla<QuoteRequest>;
      quote_request_items: Tabla<QuoteRequestItem, QuoteRequestItem>;
    };
    Views: {
      item_quote_stats: { Row: ItemQuoteStats; Relationships: [] };
      category_supplier_coverage: { Row: CategorySupplierCoverage; Relationships: [] };
      category_summary: { Row: CategorySummary; Relationships: [] };
    };
    Functions: Record<string, never>;
    Enums: { user_role: UserRole; item_state: ItemState };
    CompositeTypes: Record<string, never>;
  };
}
