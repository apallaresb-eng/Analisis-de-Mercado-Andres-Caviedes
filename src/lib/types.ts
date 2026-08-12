export type UserRole = "admin" | "operario";

export type ItemState =
  | "pendiente"
  | "contactado"
  | "cotizado"
  | "cerrado"
  | "replantear";

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
  created_at: string;
}

export interface Item {
  id: string;
  project_id: string;
  seq: number | null;
  code: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  category: string | null;
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

/** Tipado mínimo para supabase-js: evita `any` en las consultas. */
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string }; Update: Partial<Profile> };
      projects: { Row: Project; Insert: Partial<Project> & { name: string }; Update: Partial<Project> };
      suppliers: { Row: Supplier; Insert: Partial<Supplier> & { project_id: string; name: string }; Update: Partial<Supplier> };
      items: { Row: Item; Insert: Partial<Item> & { project_id: string; code: string; description: string }; Update: Partial<Item> };
      item_suppliers: {
        Row: { item_id: string; supplier_id: string };
        Insert: { item_id: string; supplier_id: string };
        Update: Partial<{ item_id: string; supplier_id: string }>;
      };
      quotes: { Row: Quote; Insert: Partial<Quote> & { item_id: string }; Update: Partial<Quote> };
      activity_log: { Row: ActivityRow; Insert: Partial<ActivityRow>; Update: Partial<ActivityRow> };
      imports: {
        Row: {
          id: string; project_id: string; filename: string | null; sheet_name: string | null;
          header_row: number | null; rows_read: number | null; rows_imported: number | null;
          rows_skipped: number | null; mapping: Record<string, string> | null;
          created_by: string | null; created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Views: {
      item_quote_stats: { Row: ItemQuoteStats };
    };
    Functions: Record<string, never>;
    Enums: { user_role: UserRole; item_state: ItemState };
  };
}
