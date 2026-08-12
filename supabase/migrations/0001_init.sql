-- ============================================================================
-- Control de compras de obra — esquema inicial
-- Consorcio AMG · CPI Educación Superior Simití
--
-- Ejecutar en: Supabase > SQL Editor > New query > pegar todo > Run
--
-- PRINCIPIO DE SEGURIDAD
-- La clave anónima de Supabase es pública y viaja al navegador. Lo que protege
-- los datos NO es esconderla, sino Row Level Security. Toda tabla nace con RLS
-- activo; sin política explícita, nadie lee ni escribe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin', 'operario');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.item_state as enum ('pendiente','contactado','cotizado','cerrado','replantear');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Perfiles (extiende auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  role        public.user_role not null default 'operario',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil y rol de cada usuario. El rol NUNCA se asigna desde el navegador: solo un admin puede cambiarlo.';

-- Al crear un usuario en auth.users se crea su perfil con el rol MÍNIMO.
-- Nunca 'admin': el primer administrador se promueve a mano (ver paso final).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    'operario'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Función auxiliar de rol
--
-- SECURITY DEFINER a propósito: si la política de una tabla consultara
-- directamente public.profiles, y profiles a su vez tiene RLS, se produce
-- recursión infinita. Esta función lee el rol saltando RLS de forma controlada.
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' and active from public.profiles where id = auth.uid()), false)
$$;

-- Usuario autenticado Y activo. Un usuario desactivado conserva su sesión
-- pero deja de tener acceso a los datos.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------------
-- 4. Proyectos (obras)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contract_no   text,
  contractor    text,
  supervision   text,
  municipality  text,
  department    text,
  notes         text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  archived_at   timestamptz
);

-- ---------------------------------------------------------------------------
-- 5. Proveedores
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  ext_id        text,
  name          text not null,
  city          text,
  kind          text,
  phone         text,
  whatsapp      text,
  email         text,
  web           text,
  fast_contact  text,
  contact_source text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists suppliers_project_idx on public.suppliers(project_id);
create unique index if not exists suppliers_project_ext_uniq
  on public.suppliers(project_id, ext_id) where ext_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Ítems
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  seq             integer,
  code            text not null,
  description     text not null,
  unit            text,
  quantity        numeric,              -- la columna que faltaba en Libro1.xlsx
  category        text,
  spec            text,
  iva_treatment   text,
  alert           text,
  observation     text,
  ref_price       numeric,
  ref_price_unit  text,
  ref_product     text,
  ref_source      text,
  state           public.item_state not null default 'pendiente',
  selected_quote_id uuid,
  note            text,
  updated_by      uuid references public.profiles(id),
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists items_project_idx on public.items(project_id);
create index if not exists items_state_idx   on public.items(project_id, state);
create unique index if not exists items_project_code_uniq on public.items(project_id, code);

-- ---------------------------------------------------------------------------
-- 7. Proveedores asignados a cada ítem (los 3-4 del estudio)
-- ---------------------------------------------------------------------------
create table if not exists public.item_suppliers (
  item_id     uuid not null references public.items(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  primary key (item_id, supplier_id)
);
create index if not exists item_suppliers_supplier_idx on public.item_suppliers(supplier_id);

-- ---------------------------------------------------------------------------
-- 8. Cotizaciones — el corazón del sistema
--
-- Permite las 3-4 cotizaciones por ítem y, con ellas, calcular mínimo, máximo,
-- promedio y MEDIANA: exactamente lo que el estudio original no pudo hacer
-- porque solo existía una fuente con precio publicado.
-- ---------------------------------------------------------------------------
create table if not exists public.quotes (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.items(id) on delete cascade,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  price_no_iva    numeric,
  iva_amount      numeric,
  price_with_iva  numeric,
  freight         numeric,
  other_costs     numeric,
  total_delivered numeric,     -- precio PUESTO EN OBRA en Simití
  price_unit      text,
  availability    text,
  lead_time_days  integer,
  valid_until     date,
  payment_terms   text,
  source          text not null default 'cotizacion_formal',
  notes           text,
  quoted_at       timestamptz not null default now(),
  quoted_by       uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index if not exists quotes_item_idx on public.quotes(item_id);

alter table public.items
  drop constraint if exists items_selected_quote_fk;
alter table public.items
  add constraint items_selected_quote_fk
  foreign key (selected_quote_id) references public.quotes(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 9. Registro de actividad — "control y registro de lo ya hecho"
-- ---------------------------------------------------------------------------
create table if not exists public.activity_log (
  id          bigserial primary key,
  project_id  uuid references public.projects(id) on delete cascade,
  item_id     uuid references public.items(id) on delete set null,
  user_id     uuid references public.profiles(id),
  action      text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists activity_project_idx on public.activity_log(project_id, created_at desc);

-- Traza automática de cada cambio de estado o de nota de un ítem.
create or replace function public.log_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and (old.state is distinct from new.state
                           or old.note is distinct from new.note
                           or old.quantity is distinct from new.quantity) then
    insert into public.activity_log(project_id, item_id, user_id, action, detail)
    values (new.project_id, new.id, auth.uid(), 'item_actualizado',
      jsonb_strip_nulls(jsonb_build_object(
        'estado_anterior', old.state, 'estado_nuevo', new.state,
        'nota_anterior',   old.note,  'nota_nueva',   new.note,
        'cantidad_anterior', old.quantity, 'cantidad_nueva', new.quantity
      )));
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists on_item_change on public.items;
create trigger on_item_change
  before update on public.items
  for each row execute function public.log_item_change();

-- ---------------------------------------------------------------------------
-- 10. Importaciones
-- ---------------------------------------------------------------------------
create table if not exists public.imports (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  filename      text,
  sheet_name    text,
  header_row    integer,
  rows_read     integer,
  rows_imported integer,
  rows_skipped  integer,
  mapping       jsonb,          -- se reutiliza en la próxima importación
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 11. ROW LEVEL SECURITY
--
-- Se activa en TODAS las tablas. Sin política, no hay acceso.
-- Regla general: leer = cualquier usuario activo. Escribir = según rol.
-- ============================================================================

alter table public.profiles       enable row level security;
alter table public.projects       enable row level security;
alter table public.suppliers      enable row level security;
alter table public.items          enable row level security;
alter table public.item_suppliers enable row level security;
alter table public.quotes         enable row level security;
alter table public.activity_log   enable row level security;
alter table public.imports        enable row level security;

-- --- profiles --------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.is_active_user() or id = auth.uid());

-- Cada quien edita su propio nombre, pero NO su rol ni su estado activo.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and active = (select active from public.profiles where id = auth.uid())
  );

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- --- projects --------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated using (public.is_active_user());

drop policy if exists projects_admin_write on public.projects;
create policy projects_admin_write on public.projects
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- suppliers -------------------------------------------------------------
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select to authenticated using (public.is_active_user());

drop policy if exists suppliers_admin_write on public.suppliers;
create policy suppliers_admin_write on public.suppliers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- items -----------------------------------------------------------------
drop policy if exists items_select on public.items;
create policy items_select on public.items
  for select to authenticated using (public.is_active_user());

-- El operario puede ACTUALIZAR ítems (estado, nota, cantidad) pero no crear ni
-- borrar. La restricción de qué columnas puede tocar se refuerza abajo con un
-- GRANT por columna: RLS controla las filas, GRANT controla las columnas.
drop policy if exists items_update on public.items;
create policy items_update on public.items
  for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists items_admin_insert on public.items;
create policy items_admin_insert on public.items
  for insert to authenticated with check (public.is_admin());

drop policy if exists items_admin_delete on public.items;
create policy items_admin_delete on public.items
  for delete to authenticated using (public.is_admin());

-- --- item_suppliers --------------------------------------------------------
drop policy if exists item_suppliers_select on public.item_suppliers;
create policy item_suppliers_select on public.item_suppliers
  for select to authenticated using (public.is_active_user());

drop policy if exists item_suppliers_admin_write on public.item_suppliers;
create policy item_suppliers_admin_write on public.item_suppliers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- quotes ----------------------------------------------------------------
-- Cargar cotizaciones es justamente el trabajo del operario.
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes
  for select to authenticated using (public.is_active_user());

drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes
  for insert to authenticated
  with check (public.is_active_user() and quoted_by = auth.uid());

-- El operario corrige lo que él mismo cargó; el admin corrige cualquiera.
drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes
  for update to authenticated
  using (public.is_admin() or quoted_by = auth.uid())
  with check (public.is_admin() or quoted_by = auth.uid());

drop policy if exists quotes_admin_delete on public.quotes;
create policy quotes_admin_delete on public.quotes
  for delete to authenticated using (public.is_admin());

-- --- activity_log ----------------------------------------------------------
-- Solo lectura desde el cliente. Lo escriben los triggers (SECURITY DEFINER).
drop policy if exists activity_select on public.activity_log;
create policy activity_select on public.activity_log
  for select to authenticated using (public.is_active_user());

-- --- imports ---------------------------------------------------------------
drop policy if exists imports_select on public.imports;
create policy imports_select on public.imports
  for select to authenticated using (public.is_active_user());

drop policy if exists imports_admin_write on public.imports;
create policy imports_admin_write on public.imports
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 12. Permisos por columna
--
-- RLS decide QUÉ FILAS se tocan; los GRANT deciden QUÉ COLUMNAS.
-- Sin esto, un operario podría cambiar el precio de referencia o la
-- especificación técnica de un ítem, que son datos del estudio de mercado.
-- ============================================================================
revoke update on public.items from authenticated;
grant  update (state, note, quantity, selected_quote_id, updated_at, updated_by)
  on public.items to authenticated;

-- ============================================================================
-- 13. Vista de estadísticas por ítem (mín / máx / promedio / mediana)
-- ============================================================================
create or replace view public.item_quote_stats
with (security_invoker = true) as
select
  i.id                                        as item_id,
  i.project_id,
  count(q.id)                                 as n_quotes,
  min(q.total_delivered)                      as min_delivered,
  max(q.total_delivered)                      as max_delivered,
  round(avg(q.total_delivered), 2)            as avg_delivered,
  percentile_cont(0.5) within group (order by q.total_delivered) as median_delivered
from public.items i
left join public.quotes q
  on q.item_id = i.id and q.total_delivered is not null
group by i.id, i.project_id;

comment on view public.item_quote_stats is
  'La mediana es la referencia recomendada cuando hay valores atípicos entre cotizaciones.';

-- ============================================================================
-- 14. PASO MANUAL OBLIGATORIO — promover al primer administrador
--
-- El trigger crea a todos como 'operario' a propósito. Después de que la
-- primera persona acepte su invitación y entre una vez, ejecute:
--
--   update public.profiles set role = 'admin' where email = 'correo@dominio.com';
--
-- Verifique que quedó aplicado:
--   select email, role, active from public.profiles order by created_at;
-- ============================================================================

-- ============================================================================
-- 15. RECORDATORIO DE CONFIGURACIÓN EN EL PANEL
--
-- Authentication > Providers > Email:
--    * "Enable sign ups"  -> DESACTIVADO   (sin esto cualquiera crea cuenta)
--    * "Confirm email"    -> ACTIVADO
--
-- Este archivo NO puede aplicar esos dos ajustes: son del panel, no de SQL.
-- ============================================================================
