import { createClient } from "@supabase/supabase-js";

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
 *
 * Sin genérico `Database`: supabase-js 2.112 exige una forma interna de tipo
 * que solo produce su generador de tipos. Los resultados se tipan en `datos.ts`
 * con las interfaces de `types.ts`, que es donde la seguridad de tipos importa.
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
