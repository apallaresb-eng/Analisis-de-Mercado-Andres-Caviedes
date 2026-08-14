/**
 * Genera el SQL de siembra de la taxonomía de categorías.
 *
 *   node --experimental-strip-types scripts/generate-seed-categorias.mjs \
 *        supabase/seeds/seed_categorias.sql
 *
 * La única fuente de verdad de la taxonomía es TAXONOMIA en
 * src/lib/clasificador.ts: el clasificador automático y la base de datos tienen
 * que coincidir slug por slug, o los ítems quedarían clasificados en categorías
 * que no existen. Por eso el SQL se genera y no se escribe a mano.
 *
 * A diferencia de la siembra de proveedores, este archivo NO tiene datos
 * comerciales, así que sí puede vivir en el repositorio.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { TAXONOMIA } from "../src/lib/clasificador.ts";

const salida = process.argv[2] ?? "supabase/seeds/seed_categorias.sql";

/** Escapa para literal SQL. */
const S = (v) => `'${String(v).replace(/'/g, "''")}'`;

const nRaiz = TAXONOMIA.length;
const nSub = TAXONOMIA.reduce((a, c) => a + c.subs.length, 0);

const L = [];
L.push(`-- ============================================================================
-- Taxonomía de categorías del estudio de mercado
-- ${nRaiz} categorías raíz · ${nSub} subcategorías
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
`);

TAXONOMIA.forEach((cat, i) => {
  L.push(`  -- --- ${cat.name} ---`);
  L.push(`  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, null, ${S(cat.name)}, ${S(cat.slug)}, ${i * 10})
  on conflict do nothing;`);

  if (cat.subs.length) {
    L.push(`  select id into padre from public.categories
   where project_id = obra and slug = ${S(cat.slug)};`);
    cat.subs.forEach((sub, j) => {
      L.push(`  insert into public.categories (project_id, parent_id, name, slug, sort)
  values (obra, padre, ${S(sub.name)}, ${S(cat.slug + "-" + sub.slug)}, ${j * 10})
  on conflict do nothing;`);
    });
  }
  L.push("");
});

L.push(`  raise notice 'Taxonomía sembrada: % categorías',
    (select count(*) from public.categories where project_id = obra);
end $$;

-- --- Verificación ------------------------------------------------------------
-- Deben aparecer ${nRaiz} raíces y ${nSub} subcategorías (${nRaiz + nSub} filas).
select
  coalesce(p.name, '(raíz)') as categoria_padre,
  c.name,
  c.slug,
  c.sort
from public.categories c
left join public.categories p on p.id = c.parent_id
order by coalesce(p.sort, c.sort), p.name nulls first, c.sort;
`);

mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, L.join("\n"), "utf8");

console.log(`SQL escrito en: ${salida}`);
console.log(`  categorías raíz : ${nRaiz}`);
console.log(`  subcategorías   : ${nSub}`);
