-- ============================================================================
-- Taxonomía de categorías del estudio de mercado
-- 14 categorías raíz · 18 subcategorías
--
-- GENERADO por scripts/generate-seed-categorias.mjs desde TAXONOMIA en
-- src/lib/clasificador.ts. No lo edite a mano: vuelva a generarlo.
--
-- Ejecutar en: Supabase > SQL Editor > New query > pegar todo > Run
-- Requiere 0004_categorias_solicitudes.sql aplicada.
--
-- Es re-ejecutable: usa on conflict do nothing, así que correrlo dos veces no
-- duplica nada ni pisa lo que usted haya ajustado a mano.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Reemplace PEGUE-AQUI-EL-ID por el id de la obra.
-- Para verlo:  select id, name from public.projects order by created_at;
-- ----------------------------------------------------------------------------
do $$
declare
  obra  uuid;
  crudo text := 'PEGUE-AQUI-EL-ID';
  padre uuid;
begin
  if crudo = 'PEGUE-AQUI-EL-ID' then
    raise exception 'No reemplazó el id de la obra. Vea: select id, name from public.projects;';
  end if;
  obra := crudo::uuid;

  if not exists (select 1 from public.projects where id = obra) then
    raise exception 'No existe ninguna obra con el id %', obra;
  end if;

  -- --- Eléctricos ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Eléctricos', 'ELEC', 0)
  on conflict do nothing;
  select id into padre from public.categories
   where project_id = obra and slug = 'ELEC';
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Cables y conductores', 'ELEC-CABLE', 0)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Tableros y protecciones', 'ELEC-TABLERO', 10)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Canalización y ductería', 'ELEC-DUCTO', 20)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Tomas, interruptores y salidas', 'ELEC-SALIDA', 30)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Puesta a tierra', 'ELEC-TIERRA', 40)
  on conflict do nothing;

  -- --- Media y baja tensión ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Media y baja tensión', 'MT', 10)
  on conflict do nothing;
  select id into padre from public.categories
   where project_id = obra and slug = 'MT';
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Transformadores', 'MT-TRAFO', 0)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Celdas y protecciones MT', 'MT-CELDA', 10)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Postería y herrajes', 'MT-POSTE', 20)
  on conflict do nothing;

  -- --- Iluminación ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Iluminación', 'ILUM', 20)
  on conflict do nothing;

  -- --- Redes y datos ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Redes y datos', 'RED', 30)
  on conflict do nothing;
  select id into padre from public.categories
   where project_id = obra and slug = 'RED';
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Cableado estructurado', 'RED-ESTRUCT', 0)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Equipos activos', 'RED-ACTIVO', 10)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Seguridad electrónica', 'RED-SEGURI', 20)
  on conflict do nothing;

  -- --- PVC e hidrosanitario ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'PVC e hidrosanitario', 'PVC', 40)
  on conflict do nothing;
  select id into padre from public.categories
   where project_id = obra and slug = 'PVC';
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Agua potable', 'PVC-POTABLE', 0)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Aguas negras y sanitario', 'PVC-NEGRAS', 10)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Aguas lluvias', 'PVC-LLUVIAS', 20)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Accesorios PVC', 'PVC-ACCES', 30)
  on conflict do nothing;

  -- --- Hidráulico y accesorios ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Hidráulico y accesorios', 'HID', 50)
  on conflict do nothing;
  select id into padre from public.categories
   where project_id = obra and slug = 'HID';
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Tubería metálica', 'HID-TUBMET', 0)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Válvulas y registros', 'HID-VALVULA', 10)
  on conflict do nothing;
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, 'Accesorios roscados', 'HID-ROSCADO', 20)
  on conflict do nothing;

  -- --- Aparatos sanitarios ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Aparatos sanitarios', 'SANI', 60)
  on conflict do nothing;

  -- --- Concreto y agregados ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Concreto y agregados', 'CONC', 70)
  on conflict do nothing;

  -- --- Acero y metálicos ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Acero y metálicos', 'ACERO', 80)
  on conflict do nothing;

  -- --- Ferretería y fijaciones ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Ferretería y fijaciones', 'FERR', 90)
  on conflict do nothing;

  -- --- Mampostería y prefabricados ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Mampostería y prefabricados', 'MAMP', 100)
  on conflict do nothing;

  -- --- Acabados y pintura ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Acabados y pintura', 'ACAB', 110)
  on conflict do nothing;

  -- --- Carpintería, cubierta y vidrio ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Carpintería, cubierta y vidrio', 'CARP', 120)
  on conflict do nothing;

  -- --- Servicios y subcontratos ---
  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, 'Servicios y subcontratos', 'SERV', 130)
  on conflict do nothing;

  raise notice 'Taxonomía sembrada: % categorías',
    (select count(*) from public.categories where project_id = obra);
end $$;

-- --- Verificación ------------------------------------------------------------
-- Deben aparecer 14 raíces y 18 subcategorías (32 filas).
select
  coalesce(p.name, '(raíz)') as categoria_padre,
  c.name,
  c.slug,
  c.sort
from public.categories c
left join public.categories p on p.id = c.parent_id
order by coalesce(p.sort, c.sort), p.name nulls first, c.sort;
