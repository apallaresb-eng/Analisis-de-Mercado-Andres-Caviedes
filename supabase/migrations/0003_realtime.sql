-- ============================================================================
-- Sincronización en vivo entre dispositivos
--
-- Ejecutar en: Supabase > SQL Editor > New query > pegar todo > Run
--
-- Supabase no emite eventos de cambio de una tabla hasta que la tabla se agrega
-- a la publicación `supabase_realtime`. Sin esto, la aplicación se suscribe
-- correctamente pero nunca recibe nada, y el tablero se queda desactualizado
-- sin dar ninguna señal de error.
--
-- Row Level Security SIGUE aplicando sobre los eventos: cada quien solo recibe
-- avisos de las filas que ya tiene permiso de leer.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quotes'
  ) then
    alter publication supabase_realtime add table public.quotes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suppliers'
  ) then
    alter publication supabase_realtime add table public.suppliers;
  end if;
end $$;

-- --- Verificación ------------------------------------------------------------
-- Deben aparecer las tres tablas.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
