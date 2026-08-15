-- ============================================================================
-- Fecha límite de respuesta en la solicitud
--
-- Ejecutar en: Supabase > SQL Editor > New query > pegar todo > Run
-- Requiere 0004_categorias_solicitudes.sql aplicada.
--
-- POR QUÉ
--
-- "Lo antes posible" no obliga a nada. Una fecha concreta sí: fuerza un sí o un
-- no, y un "no alcanzo" también sirve porque libera el cupo para otro
-- proveedor. Es una de las dos palancas de presión que se acordó usar.
--
-- Hasta ahora el seguimiento se medía contra un umbral fijo de días desde el
-- envío. Con una fecha por solicitud se puede apretar donde el cronograma
-- aprieta y aflojar donde no, en vez de tratar todo igual.
--
-- No es destructiva: agrega una columna que admite nulos.
-- ============================================================================

begin;

alter table public.quote_requests
  add column if not exists due_date date;

comment on column public.quote_requests.due_date is
  'Fecha límite para que el proveedor responda. Se escribe en el mensaje y el '
  'seguimiento la usa para marcar la solicitud vencida.';

-- Ordenar la cola de "qué vence primero" es la consulta que más se va a hacer.
create index if not exists quote_requests_due_idx
  on public.quote_requests(project_id, due_date)
  where status = 'enviada';

commit;

-- --- Verificación ------------------------------------------------------------
-- Debe aparecer la columna due_date de tipo date y nullable.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'quote_requests'
  and column_name = 'due_date';
