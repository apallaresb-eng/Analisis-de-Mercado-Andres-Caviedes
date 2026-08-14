-- ============================================================================
-- Vistas de cobertura por categoría
--
-- Ejecutar en: Supabase > SQL Editor > New query > pegar todo > Run
-- Requiere 0004_categorias_solicitudes.sql aplicada.
--
-- Responden las dos preguntas que sostienen la decisión de compra:
--
--   1. ¿Qué proveedor cubre mejor esta categoría?      -> category_supplier_coverage
--   2. ¿Qué categorías están ciegas o sin cotizar?     -> category_summary
--
-- Ambas van con security_invoker = true, igual que item_quote_stats: la vista
-- no salta RLS, cada quien ve lo que ya podía ver.
--
-- Se arman con CTE y no con LEFT JOIN encadenados a propósito: unir en la misma
-- consulta items, quotes y quote_requests multiplica las filas entre sí y los
-- conteos salen inflados. Agregando por separado y uniendo después, cada número
-- se calcula una sola vez.
-- ============================================================================

begin;

-- --- Cobertura de cada proveedor dentro de cada categoría --------------------
create or replace view public.category_supplier_coverage
with (security_invoker = true) as
with items_por_cat as (
  select category_id, count(*) as n_items
  from public.items
  where category_id is not null
  group by category_id
),
cotizados as (
  -- Cobertura DEMOSTRADA: ítems de la categoría para los que este proveedor
  -- ya puso precio. Es la única que sirve para sustentar.
  select i.category_id, q.supplier_id, count(distinct q.item_id) as n_cotizados
  from public.quotes q
  join public.items i on i.id = q.item_id
  where i.category_id is not null and q.supplier_id is not null
  group by i.category_id, q.supplier_id
),
solicitudes as (
  select category_id, supplier_id,
         count(*) filter (where sent_at is not null)          as n_enviadas,
         count(*) filter (where responded_at is not null)     as n_respondidas,
         count(*) filter (where status = 'enviada')           as n_abiertas,
         max(sent_at)                                         as ultimo_envio
  from public.quote_requests
  where category_id is not null
  group by category_id, supplier_id
)
select
  c.id                              as category_id,
  c.project_id,
  c.name                            as category_name,
  s.id                              as supplier_id,
  s.name                            as supplier_name,
  sc.strength,
  coalesce(ipc.n_items, 0)          as items_categoria,
  coalesce(co.n_cotizados, 0)       as items_cotizados,
  coalesce(so.n_enviadas, 0)        as solicitudes_enviadas,
  coalesce(so.n_respondidas, 0)     as solicitudes_respondidas,
  coalesce(so.n_abiertas, 0)        as solicitudes_abiertas,
  so.ultimo_envio
from public.categories c
join public.supplier_categories sc on sc.category_id = c.id
join public.suppliers s            on s.id = sc.supplier_id
left join items_por_cat ipc        on ipc.category_id = c.id
left join cotizados co             on co.category_id = c.id and co.supplier_id = s.id
left join solicitudes so           on so.category_id = c.id and so.supplier_id = s.id;

-- --- Estado general de cada categoría ----------------------------------------
create or replace view public.category_summary
with (security_invoker = true) as
with items_por_cat as (
  select category_id, count(*) as n_items
  from public.items
  where category_id is not null
  group by category_id
),
con_cotizacion as (
  select i.category_id, count(distinct i.id) as n_cotizados
  from public.items i
  join public.quotes q on q.item_id = i.id
  where i.category_id is not null
  group by i.category_id
),
proveedores as (
  select category_id, count(*) as n_proveedores
  from public.supplier_categories
  group by category_id
),
solicitudes as (
  select category_id,
         count(*)                                          as n_solicitudes,
         count(*) filter (where status = 'enviada')        as n_abiertas,
         count(*) filter (where status = 'respondida')     as n_respondidas
  from public.quote_requests
  where category_id is not null
  group by category_id
)
select
  c.id            as category_id,
  c.project_id,
  c.parent_id,
  c.name,
  c.slug,
  c.sort,
  coalesce(ipc.n_items, 0)        as n_items,
  coalesce(cc.n_cotizados, 0)     as n_items_cotizados,
  coalesce(p.n_proveedores, 0)    as n_proveedores,
  coalesce(so.n_solicitudes, 0)   as n_solicitudes,
  coalesce(so.n_abiertas, 0)      as n_solicitudes_abiertas,
  coalesce(so.n_respondidas, 0)   as n_solicitudes_respondidas
from public.categories c
left join items_por_cat ipc on ipc.category_id = c.id
left join con_cotizacion cc on cc.category_id = c.id
left join proveedores p     on p.category_id = c.id
left join solicitudes so    on so.category_id = c.id;

commit;

-- --- Verificación ------------------------------------------------------------
-- Con la base recién sembrada debe listar las categorías con sus conteos en
-- cero y, sobre todo, n_proveedores > 0 en todas: una categoría sin proveedores
-- es una categoría que no se puede cotizar.
select name, n_items, n_proveedores, n_items_cotizados
from public.category_summary
where parent_id is null
order by n_items desc;
