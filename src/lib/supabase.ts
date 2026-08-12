import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. " +
      "Copie .env.example como .env y complete los datos de su proyecto de Supabase."
  );
}

/**
 * Cliente del navegador. Usa la clave anónima, que es pública por diseño.
 * Los datos los protege Row Level Security en PostgreSQL, no esta clave.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
