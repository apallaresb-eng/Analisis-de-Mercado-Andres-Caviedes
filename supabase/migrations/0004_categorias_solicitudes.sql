-- ============================================================================
-- Categorías, cobertura de proveedores y solicitudes de cotización
--
-- Ejecutar en: Supabase > SQL Editor > New query > pegar todo > Run
--
-- POR QUÉ EXISTE ESTA MIGRACIÓN
--
-- Hasta ahora el sistema solo sabía responder "¿a qué proveedores ya
-- contacté?". El estado vivía en el ítem (`items.state`), así que pedirle una
-- cotización a UN proveedor marcaba el ítem como gestionado para TODOS, y el
-- proveedor desaparecía de la lista de llamadas junto con el rastro de lo que
-- se le había pedido.
--
-- Además, vincular proveedores ítem por ítem (`item_suppliers`) no escala: con
-- 1.071 ítems y 8-10 candidatos cada uno serían ~9.000 decisiones a mano.
--
-- La pieza central de esta migración es `supplier_categories`: se declara UNA
-- vez qué categorías atiende cada proveedor (~300 filas) y cada ítem hereda los
-- candidatos de su categoría. La categoría pasa a ser la llave que une ítems
-- con proveedores, y `item_suppliers` queda como excepción puntual.
--
-- Sobre esa llave se apoya `quote_requests`: la solicitud tiene identidad
-- propia (PVC-DURMAN-001) y su PROPIO estado, de modo que pedirle PVC a Durman
-- no toca en nada lo que falte pedirle a Pavco.
--
-- Esta migración NO borra datos. El reset va aparte, en
-- scripts/reset_datos_obra.sql, y lo ejecuta usted a conciencia.
-- ============================================================================

begin;

-- --- 1. Taxonomía ------------------------------------------------------------
-- Lista de adyacencia de dos niveles: parent_id nulo = categoría raíz.
-- Se eligió adyacencia y no un árbol arbitrario porque el estudio de mercado
-- trabaja con "capítulo > subcapítulo" y nada más profundo; permitir más
-- niveles complica la interfaz sin que nadie los use.
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  parent_id   uuid references public.categories(id) on delete cascade,
  name        text not null,
  slug        text not null,              -- PVC, ELEC: entra en el código de la solicitud
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Postgres no considera iguales dos NULL, así que un índice único sobre
-- (project_id, parent_id, name) NO impediría dos raíces con el mismo nombre.
-- Por eso van dos índices parciales.
create unique index if not exists categories_root_uniq
  on public.categories(project_id, name) where parent_id is null;
create unique index if not exists categories_child_uniq
  on public.categories(project_id, parent_id, name) where parent_id is not null;
create unique index if not exists categories_slug_uniq
  on public.categories(project_id, slug);
create index if not exists categories_project_idx
  on public.categories(project_id, parent_id, sort);

-- Impide un tercer nivel: una subcategoría no puede tener hijas.
create or replace function public.categories_solo_dos_niveles()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null
     and exists (select 1 from public.categories where id = new.parent_id and parent_id is not null)
  then
    raise exception 'La taxonomía admite solo dos niveles: categoría y subcategoría'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists on_category_nivel on public.categories;
create trigger on_category_nivel
  before insert or update on public.categories
  for each row execute function public.categories_solo_dos_niveles();

-- --- 2. La llave: qué categorías atiende cada proveedor ----------------------
create table if not exists public.supplier_categories (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  strength    smallint not null default 2 check (strength between 1 and 3),
  created_at  timestamptz not null default now(),
  primary key (supplier_id, category_id)
);
comment on column public.supplier_categories.strength is
  '1 = ocasional, 2 = habitual, 3 = especialista de la categoría';

create index if not exists supplier_categories_cat_idx
  on public.supplier_categories(category_id);

-- --- 3. Columnas nuevas en tablas existentes ---------------------------------
alter table public.items add column if not exists category_id uuid
  references public.categories(id) on delete set null;
create index if not exists items_category_idx on public.items(project_id, category_id);

-- items.category (texto libre) se CONSERVA y se sigue poblando en paralelo:
-- el filtro del tablero, la búsqueda y la hoja de export lo usan hoy. Se retira
-- en una migración posterior, cuando category_id esté consolidado.

alter table public.suppliers add column if not exists contact_confidence text
  check (contact_confidence in ('alta','media','baja'));
alter table public.suppliers add column if not exists contact_verified_at timestamptz;
alter table public.suppliers add column if not exists national boolean not null default false;

comment on column public.suppliers.contact_confidence is
  'Qué tan confiable es el contacto publicado. La verificación real la hace el '
  'equipo al lograr el primer contacto, y queda en contact_verified_at.';

-- --- 4. La solicitud ---------------------------------------------------------
create table if not exists public.quote_requests (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete set null,
  scope        text not null default 'categoria'
                 check (scope in ('categoria','subcategoria','manual')),
  code         text not null,               -- PVC-DURMAN-001
  status       text not null default 'borrador'
                 check (status in ('borrador','enviada','respondida','cerrada',
                                   'sin_respuesta','descartada')),
  channel      text check (channel in ('whatsapp','correo','llamada','presencial')),
  message_text text,
  whatsapp_url text,
  sent_at             timestamptz,
  responded_at        timestamptz,
  last_interaction_at timestamptz,
  notes        text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists quote_requests_code_uniq
  on public.quote_requests(project_id, code);
create index if not exists quote_requests_proj_idx
  on public.quote_requests(project_id, status);
create index if not exists quote_requests_sup_cat_idx
  on public.quote_requests(supplier_id, category_id);

-- Líneas de la solicitud. Referencia al ítem, NUNCA copia: el mismo ítem puede
-- estar en diez solicitudes a diez proveedores sin duplicarse en la base.
create table if not exists public.quote_request_items (
  request_id        uuid not null references public.quote_requests(id) on delete cascade,
  item_id           uuid not null references public.items(id) on delete cascade,
  quantity_snapshot numeric,
  primary key (request_id, item_id)
);
create index if not exists quote_request_items_item_idx
  on public.quote_request_items(item_id);

-- Trazabilidad de la respuesta: de qué solicitud salió esta cotización.
alter table public.quotes add column if not exists request_id uuid
  references public.quote_requests(id) on delete set null;
create index if not exists quotes_request_idx on public.quotes(request_id);

-- quotes nunca tuvo project_id, y por eso había que pedirlas por lotes de
-- item_id y suscribir realtime sin filtro (llegaban las de todas las obras).
alter table public.quotes add column if not exists project_id uuid
  references public.projects(id) on delete cascade;
create index if not exists quotes_project_idx on public.quotes(project_id);

update public.quotes q
   set project_id = i.project_id
  from public.items i
 where i.id = q.item_id and q.project_id is null;

-- Se llena solo: depender de que la aplicación lo mande siempre es frágil.
create or replace function public.quotes_fijar_proyecto()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is null then
    select i.project_id into new.project_id from public.items i where i.id = new.item_id;
  end if;
  return new;
end $$;

drop trigger if exists on_quote_proyecto on public.quotes;
create trigger on_quote_proyecto
  before insert or update of item_id on public.quotes
  for each row execute function public.quotes_fijar_proyecto();

-- --- 5. updated_at e historial de la solicitud -------------------------------
create or replace function public.quote_requests_tocar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  -- El cambio de estado es lo que hay que poder sustentar después, así que se
  -- registra en activity_log (que solo escriben funciones SECURITY DEFINER).
  if TG_OP = 'UPDATE' and old.status is distinct from new.status then
    new.last_interaction_at := now();
    insert into public.activity_log(project_id, item_id, user_id, action, detail)
    values (new.project_id, null, auth.uid(), 'solicitud_actualizada',
      jsonb_strip_nulls(jsonb_build_object(
        'solicitud',       new.code,
        'estado_anterior', old.status,
        'estado_nuevo',    new.status
      )));
  end if;
  return new;
end $$;

drop trigger if exists on_quote_request_tocar on public.quote_requests;
create trigger on_quote_request_tocar
  before update on public.quote_requests
  for each row execute function public.quote_requests_tocar();

-- --- 6. Permiso de columna sobre items ---------------------------------------
-- 0002 revocó el UPDATE global y lo devolvió columna por columna. category_id
-- es nueva, así que NADIE podría escribirla —ni un administrador— si no se
-- agrega aquí.
revoke update on public.items from authenticated;
grant update (
  state, note, quantity, selected_quote_id, updated_at, updated_by,
  code, description, unit, category, category_id, spec, iva_treatment,
  alert, observation, ref_price, ref_price_unit, ref_product, ref_source, seq
) on public.items to authenticated;

-- category_id es ficha técnica: solo el administrador la cambia. Se recrea la
-- función de 0002 agregándola a la lista de campos protegidos.
create or replace function public.items_cambio_permitido(
  antes public.items, despues public.items
) returns boolean
language sql
stable
as $$
  select public.is_admin() or (
        antes.code           is not distinct from despues.code
    and antes.description    is not distinct from despues.description
    and antes.unit           is not distinct from despues.unit
    and antes.category       is not distinct from despues.category
    and antes.category_id    is not distinct from despues.category_id
    and antes.spec           is not distinct from despues.spec
    and antes.iva_treatment  is not distinct from despues.iva_treatment
    and antes.alert          is not distinct from despues.alert
    and antes.observation    is not distinct from despues.observation
    and antes.ref_price      is not distinct from despues.ref_price
    and antes.ref_price_unit is not distinct from despues.ref_price_unit
    and antes.ref_product    is not distinct from despues.ref_product
    and antes.ref_source     is not distinct from despues.ref_source
    and antes.seq            is not distinct from despues.seq
  );
$$;

-- --- 7. Row Level Security ---------------------------------------------------
alter table public.categories          enable row level security;
alter table public.supplier_categories enable row level security;
alter table public.quote_requests      enable row level security;
alter table public.quote_request_items enable row level security;

-- categories: la taxonomía es ficha técnica de la obra. Solo el administrador
-- la toca, igual que items.category hoy.
drop policy if exists categories_select      on public.categories;
drop policy if exists categories_admin_write on public.categories;
create policy categories_select on public.categories
  for select to authenticated using (public.is_active_user());
create policy categories_admin_write on public.categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- supplier_categories: el operario descubre al hablar con el proveedor que
-- también maneja otra categoría; debe poder registrarlo sin pedir permiso.
drop policy if exists supplier_categories_select on public.supplier_categories;
drop policy if exists supplier_categories_write  on public.supplier_categories;
create policy supplier_categories_select on public.supplier_categories
  for select to authenticated using (public.is_active_user());
create policy supplier_categories_write on public.supplier_categories
  for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- quote_requests: el operario crea y gestiona; borrar es del administrador
-- (borrar una solicitud enviada destruye la sustentación).
drop policy if exists quote_requests_select       on public.quote_requests;
drop policy if exists quote_requests_insert       on public.quote_requests;
drop policy if exists quote_requests_update       on public.quote_requests;
drop policy if exists quote_requests_admin_delete on public.quote_requests;
create policy quote_requests_select on public.quote_requests
  for select to authenticated using (public.is_active_user());
create policy quote_requests_insert on public.quote_requests
  for insert to authenticated with check (public.is_active_user());
create policy quote_requests_update on public.quote_requests
  for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy quote_requests_admin_delete on public.quote_requests
  for delete to authenticated using (public.is_admin());

drop policy if exists quote_request_items_select on public.quote_request_items;
drop policy if exists quote_request_items_write  on public.quote_request_items;
create policy quote_request_items_select on public.quote_request_items
  for select to authenticated using (public.is_active_user());
create policy quote_request_items_write on public.quote_request_items
  for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

commit;

-- --- 8. Sincronización en vivo -----------------------------------------------
-- Fuera de la transacción: alter publication no admite ejecutarse dentro de un
-- bloque con otras operaciones DDL en algunos planes de Supabase.
--
-- Se agrega también item_suppliers, que se había quedado fuera en 0003: hasta
-- ahora vincular un proveedor en un dispositivo no se veía en los demás.
do $$
declare
  t text;
begin
  foreach t in array array['categories','supplier_categories','quote_requests',
                           'quote_request_items','item_suppliers']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- --- Verificación ------------------------------------------------------------
-- Las cuatro tablas nuevas deben existir y aparecer con RLS activo.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('categories','supplier_categories','quote_requests','quote_request_items')
order by tablename;

-- Deben aparecer ocho tablas en la publicación.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
