/**
 * Genera el SQL de siembra del estudio de Simití (100 ítems, 31 proveedores).
 *
 * Uso:
 *   node scripts/generate-seed-simiti.mjs <ruta-data.json> <ruta-salida.sql>
 *
 * El SQL resultante contiene contactos y precios comerciales de proveedores,
 * así que se escribe FUERA del repositorio y se aplica una sola vez desde el
 * SQL Editor de Supabase. Las obras siguientes entran por el importador de
 * Excel de la aplicación, no por este script.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , rutaDatos, rutaSalida] = process.argv;
if (!rutaDatos || !rutaSalida) {
  console.error("Uso: node scripts/generate-seed-simiti.mjs <data.json> <salida.sql>");
  process.exit(1);
}

const { provs, items } = JSON.parse(readFileSync(rutaDatos, "utf8"));

/** Escapa para literal SQL. null/undefined/"" -> NULL */
const S = (v) => {
  if (v === null || v === undefined) return "NULL";
  const t = String(v).trim();
  if (t === "" || t === "no") return "NULL";
  return `'${t.replace(/'/g, "''")}'`;
};
const N = (v) => (v === null || v === undefined || v === "" ? "NULL" : Number(v));

const PROYECTO = "a1b2c3d4-0000-4000-8000-000000000001"; // fijo -> re-ejecutable

const L = [];
L.push(`-- ============================================================================
-- Siembra del estudio de mercado — Simití, Bolívar
-- ${items.length} ítems · ${Object.keys(provs).length} proveedores
--
-- Generado desde Estudio_Mercado_Actualizado_Simiti_2026.xlsx
-- Aplicar UNA vez en: Supabase > SQL Editor > New query > pegar > Run
-- Es re-ejecutable: usa ON CONFLICT DO NOTHING.
-- ============================================================================

begin;

-- --- Proyecto ---------------------------------------------------------------
insert into public.projects
  (id, name, contract_no, contractor, supervision, municipality, department, notes)
values (
  '${PROYECTO}',
  'Sede de Educación Superior — Simití',
  '034-PAF-MENIES-O-032-2025',
  'CONSORCIO AMG – CPI EDUCACIÓN SUPERIOR SIMITÍ',
  'CONSORCIO UNIVERSIDAD SIMITÍ',
  'Simití',
  'Bolívar',
  'Estudio de mercado de agosto de 2026. Los precios de referencia son precios PUBLICADOS de producto con IVA: NO incluyen flete a Simití.'
)
on conflict (id) do nothing;
`);

// --- Proveedores -------------------------------------------------------------
L.push(`\n-- --- Proveedores (${Object.keys(provs).length}) ---`);
L.push(`insert into public.suppliers
  (project_id, ext_id, name, city, kind, phone, whatsapp, email, web, fast_contact, contact_source, notes)
values`);
const filasProv = Object.entries(provs).map(([id, p]) =>
  `  ('${PROYECTO}', ${S(id)}, ${S(p.nom)}, ${S(p.ciu)}, ${S(p.tipo)}, ${S(p.tel)}, ${S(p.wa)}, ` +
  `${S(p.mail)}, ${S(p.web)}, ${S(p.rapido)}, ${S(p.fuente)}, ${S(p.notas)})`
);
// El índice único de suppliers es PARCIAL (where ext_id is not null), así que
// el ON CONFLICT debe repetir el mismo predicado o PostgreSQL no lo reconoce
// y lanza 42P10.
L.push(
  filasProv.join(",\n") +
    "\non conflict (project_id, ext_id) where ext_id is not null do nothing;\n"
);

// --- Ítems -------------------------------------------------------------------
L.push(`\n-- --- Ítems (${items.length}) ---`);
L.push(`insert into public.items
  (project_id, seq, code, description, unit, category, spec, iva_treatment,
   alert, observation, ref_price, ref_price_unit, ref_product, ref_source)
values`);
const filasItem = items.map((it) => {
  const fuenteRef = it.ref
    ? `Precio publicado en Homecenter (id ${it.hcId}), consultado 2026-08-12. NO incluye flete a Simití.`
    : null;
  const refProd = it.ref ? `${it.hcProd} — $${Number(it.hcPrecio).toLocaleString("es-CO")} con IVA` : null;
  return `  ('${PROYECTO}', ${N(it.n)}, ${S(it.code)}, ${S(it.desc)}, ${S(it.unit)}, ${S(it.cat)}, ` +
         `${S(it.spec)}, ${S(it.iva)}, ${S(it.alerta)}, ${S(it.obs)}, ${N(it.precio)}, ` +
         `${S(it.precioUnit)}, ${S(refProd)}, ${S(fuenteRef)})`;
});
L.push(filasItem.join(",\n") + "\non conflict (project_id, code) do nothing;\n");

// --- Vínculos ítem-proveedor -------------------------------------------------
const pares = [];
for (const it of items) for (const pid of it.provs) pares.push(`(${S(it.code)}, ${S(pid)})`);

L.push(`\n-- --- Proveedores asignados a cada ítem (${pares.length} vínculos) ---`);
L.push(`insert into public.item_suppliers (item_id, supplier_id)
select i.id, s.id
from public.items i
join public.suppliers s on s.project_id = i.project_id
where i.project_id = '${PROYECTO}'
  and (i.code, s.ext_id) in (
${pares.map((p) => "    " + p).join(",\n")}
  )
on conflict do nothing;
`);

L.push(`
commit;

-- --- Verificación -----------------------------------------------------------
select
  (select count(*) from public.items          where project_id = '${PROYECTO}') as items,
  (select count(*) from public.suppliers      where project_id = '${PROYECTO}') as proveedores,
  (select count(*) from public.item_suppliers is_
     join public.items i on i.id = is_.item_id
    where i.project_id = '${PROYECTO}')                                          as vinculos;
-- Esperado: items = ${items.length} | proveedores = ${Object.keys(provs).length} | vinculos = ${pares.length}
`);

writeFileSync(rutaSalida, L.join("\n"), "utf8");
console.log(`SQL escrito en: ${rutaSalida}`);
console.log(`  ítems       : ${items.length}`);
console.log(`  proveedores : ${Object.keys(provs).length}`);
console.log(`  vínculos    : ${pares.length}`);
console.log(`  con precio  : ${items.filter((i) => i.ref).length}`);
