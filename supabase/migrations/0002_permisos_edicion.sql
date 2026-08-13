-- ============================================================================
-- Permisos de edición desde la interfaz
--
-- Ejecutar en: Supabase > SQL Editor > New query > pegar todo > Run
-- Es re-ejecutable: cada política se recrea con DROP IF EXISTS previo.
--
-- CRITERIO
-- El operario AGREGA, el administrador BORRA.
--
-- Quien está llamando proveedores es justamente quien descubre proveedores
-- nuevos y quien detecta que un teléfono está mal. Bloquearle eso lo obliga a
-- pedirle todo al administrador y el dato bueno se pierde en el camino.
-- Borrar, en cambio, es irreversible y en el plan gratuito de Supabase no hay
-- copias de respaldo, así que se queda en manos del administrador.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Proveedores: el operario puede crear y corregir, no borrar
-- ---------------------------------------------------------------------------

-- La política anterior daba TODO (incluido borrar) solo al admin. Se reemplaza
-- por uno por operación para poder abrir insertar y actualizar sin abrir borrar.
drop policy if exists suppliers_admin_write on public.suppliers;

drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers
  for insert to authenticated
  with check (public.is_active_user());

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers
  for update to authenticated
  using (public.is_active_user())
  with check (public.is_active_user());

drop policy if exists suppliers_admin_delete on public.suppliers;
create policy suppliers_admin_delete on public.suppliers
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Vínculos ítem-proveedor: el operario los gestiona libremente
--
-- Desvincular NO borra al proveedor: solo deja de estar asociado a ese ítem.
-- Es una operación de bajo riesgo y se rehace en un clic, así que no tiene
-- sentido reservarla al administrador.
-- ---------------------------------------------------------------------------
drop policy if exists item_suppliers_admin_write on public.item_suppliers;

drop policy if exists item_suppliers_insert on public.item_suppliers;
create policy item_suppliers_insert on public.item_suppliers
  for insert to authenticated
  with check (public.is_active_user());

drop policy if exists item_suppliers_delete on public.item_suppliers;
create policy item_suppliers_delete on public.item_suppliers
  for delete to authenticated
  using (public.is_active_user());

-- ---------------------------------------------------------------------------
-- 3. Ítems: crear y borrar siguen siendo solo del administrador
--
-- Las políticas items_admin_insert e items_admin_delete de 0001 ya lo hacen y
-- NO se tocan. Lo que falta es que el administrador pueda editar los campos
-- técnicos: el GRANT por columna de 0001 solo permitía estado, nota y cantidad,
-- así que ni siquiera un admin podía corregir una descripción o una unidad.
-- ---------------------------------------------------------------------------
revoke update on public.items from authenticated;
grant update (
  -- lo que puede tocar cualquier usuario activo (gestión diaria)
  state, note, quantity, selected_quote_id, updated_at, updated_by,
  -- campos técnicos: la política items_update exige ser admin para escribirlos
  code, description, unit, category, spec, iva_treatment,
  alert, observation, ref_price, ref_price_unit, ref_product, ref_source, seq
) on public.items to authenticated;

-- La política de UPDATE de 0001 permitía a cualquier usuario activo actualizar
-- filas; el control fino lo daba el GRANT por columna. Al ampliar el GRANT hay
-- que endurecer la política, o un operario podría editar la ficha técnica.
--
-- Se resuelve con una función que compara la fila nueva contra la anterior:
-- si cambió algún campo técnico, exige ser administrador.
create or replace function public.items_cambio_permitido(
  antes public.items, despues public.items
) returns boolean
language sql stable
as $$
  select
    public.is_admin()
    or (
      antes.code           is not distinct from despues.code
      and antes.description   is not distinct from despues.description
      and antes.unit          is not distinct from despues.unit
      and antes.category      is not distinct from despues.category
      and antes.spec          is not distinct from despues.spec
      and antes.iva_treatment is not distinct from despues.iva_treatment
      and antes.alert         is not distinct from despues.alert
      and antes.observation   is not distinct from despues.observation
      and antes.ref_price     is not distinct from despues.ref_price
      and antes.ref_price_unit is not distinct from despues.ref_price_unit
      and antes.ref_product   is not distinct from despues.ref_product
      and antes.ref_source    is not distinct from despues.ref_source
      and antes.seq           is not distinct from despues.seq
    )
$$;

drop policy if exists items_update on public.items;
create policy items_update on public.items
  for update to authenticated
  using (public.is_active_user())
  with check (public.is_active_user());

-- El trigger es el que realmente bloquea: una política WITH CHECK no puede ver
-- la fila anterior, y aquí hace falta comparar antes y después.
create or replace function public.items_proteger_campos_tecnicos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.items_cambio_permitido(old, new) then
    raise exception 'Solo un administrador puede modificar la ficha técnica del ítem'
      using errcode = '42501';
  end if;
  return new;
end $$;

-- El nombre empieza en "0" a propósito: PostgreSQL dispara los triggers BEFORE
-- en orden alfabético, y este debe correr ANTES que on_item_change para no
-- escribir en la auditoría un cambio que va a ser rechazado.
drop trigger if exists on_item_proteger_tecnico on public.items;
drop trigger if exists on_item_0_proteger_tecnico on public.items;
create trigger on_item_0_proteger_tecnico
  before update on public.items
  for each row execute function public.items_proteger_campos_tecnicos();

-- ---------------------------------------------------------------------------
-- 4. Verificación
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('suppliers','item_suppliers','items','projects')
order by tablename, cmd, policyname;
