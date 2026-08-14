-- ============================================================================
--  ⚠  BORRA DATOS. LEA ESTO COMPLETO ANTES DE EJECUTAR.  ⚠
--
--  Deja una obra vacía para volver a sembrarla desde cero: borra sus ítems,
--  proveedores, cotizaciones, solicitudes y categorías.
--
--  NO toca:  projects · profiles · auth.users
--  Es decir: la obra sigue existiendo y las cuentas de las personas también.
--
--  ANTES DE CORRER ESTO:
--    1. Entre a la aplicación y pulse "Exportar Excel".
--    2. Guarde ese archivo en la carpeta del consorcio.
--  Ese Excel es el único respaldo: el plan gratuito de Supabase no hace copias.
--
--  Se ejecuta en dos pasos, a propósito. No hay forma de correrlo por accidente
--  de una sola pasada.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — Ver qué obras hay y cuánto tiene cada una.
--          Ejecute SOLO esto primero y copie el id de la obra que va a vaciar.
-- ----------------------------------------------------------------------------
select
  p.id,
  p.name,
  (select count(*) from public.items     i where i.project_id = p.id) as items,
  (select count(*) from public.suppliers s where s.project_id = p.id) as proveedores,
  (select count(*) from public.quotes    q where q.project_id = p.id) as cotizaciones
from public.projects p
order by p.created_at;


-- ----------------------------------------------------------------------------
-- PASO 2 — Reemplace PEGUE-AQUI-EL-ID por el id de la obra y ejecute el bloque.
--
--          Si no lo reemplaza, el script se detiene con un error y no borra
--          nada. Esa es la red de seguridad.
-- ----------------------------------------------------------------------------
do $$
declare
  obra   uuid;
  crudo  text := 'PEGUE-AQUI-EL-ID';
  n_it   integer;
  n_pr   integer;
  n_ct   integer;
begin
  if crudo = 'PEGUE-AQUI-EL-ID' then
    raise exception
      'No reemplazó el id de la obra. Corra el PASO 1, copie el id y péguelo en la variable "crudo".';
  end if;

  obra := crudo::uuid;

  if not exists (select 1 from public.projects where id = obra) then
    raise exception 'No existe ninguna obra con el id %', obra;
  end if;

  select count(*) into n_it from public.items     where project_id = obra;
  select count(*) into n_pr from public.suppliers where project_id = obra;
  select count(*) into n_ct from public.quotes    where project_id = obra;

  raise notice 'Vaciando "%": % ítems, % proveedores, % cotizaciones',
    (select name from public.projects where id = obra), n_it, n_pr, n_ct;

  -- El orden importa poco porque casi todo va en cascada desde items y
  -- suppliers, pero se hace explícito para que se vea qué se está borrando.
  --
  --   quote_request_items  <- cascada de quote_requests y de items
  --   quote_requests       <- cascada de suppliers
  --   supplier_categories  <- cascada de suppliers y de categories
  --   item_suppliers       <- cascada de items y de suppliers
  --   quotes               <- cascada de items

  delete from public.quotes         where project_id = obra;
  delete from public.quote_requests where project_id = obra;
  delete from public.items          where project_id = obra;
  delete from public.suppliers      where project_id = obra;
  delete from public.categories     where project_id = obra;
  delete from public.imports        where project_id = obra;

  -- activity_log se conserva: es el rastro de quién hizo qué y no debe
  -- desaparecer porque se resembró la obra.

  raise notice 'Listo. La obra quedó vacía y lista para sembrar de nuevo.';
end $$;


-- ----------------------------------------------------------------------------
-- PASO 3 — Comprobar. Los cuatro conteos deben quedar en cero.
-- ----------------------------------------------------------------------------
select
  p.name,
  (select count(*) from public.items          i where i.project_id = p.id) as items,
  (select count(*) from public.suppliers      s where s.project_id = p.id) as proveedores,
  (select count(*) from public.quotes         q where q.project_id = p.id) as cotizaciones,
  (select count(*) from public.categories     c where c.project_id = p.id) as categorias,
  (select count(*) from public.quote_requests r where r.project_id = p.id) as solicitudes
from public.projects p
order by p.created_at;
