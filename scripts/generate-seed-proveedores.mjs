/**
 * Genera la siembra de proveedores investigados: SQL para Supabase + Excel para
 * revisar antes de cargar.
 *
 *   node scripts/generate-seed-proveedores.mjs \
 *        scripts/data/proveedores.json \
 *        supabase/seeds/seed_proveedores.sql \
 *        proveedores_investigacion.xlsx
 *
 * FORMATO DE ENTRADA (scripts/data/proveedores.json):
 *
 *   [
 *     {
 *       "name": "PAVCO WAVIN",
 *       "city": "Bogotá",
 *       "kind": "Fabricante",
 *       "phone": "01 8000 XXXXX",
 *       "whatsapp": null,
 *       "email": null,
 *       "web": "https://pavcowavin.com.co",
 *       "fast_contact": null,
 *       "contact_source": "Sitio oficial, consultado 2026-08-13",
 *       "notes": "Fabricante de tubería y accesorios PVC.",
 *       "contact_confidence": "alta",
 *       "national": true,
 *       "categorias": ["PVC", "HID"]
 *     }
 *   ]
 *
 * "categorias" son SLUGS de la taxonomía (ver TAXONOMIA en
 * src/lib/clasificador.ts). Si un slug no existe, el script se detiene: es
 * preferible fallar aquí que sembrar un proveedor que nadie va a ver porque
 * quedó colgado de una categoría inexistente.
 *
 * El SQL resultante contiene datos comerciales, así que se escribe FUERA del
 * repositorio o en una ruta ignorada por git.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { TAXONOMIA } from "../src/lib/clasificador.ts";

const [, , entrada, salidaSql, salidaXlsx] = process.argv;
if (!entrada || !salidaSql) {
  console.error(
    "Uso: node scripts/generate-seed-proveedores.mjs <proveedores.json> <salida.sql> [salida.xlsx]"
  );
  process.exit(1);
}

const provs = JSON.parse(readFileSync(entrada, "utf8"));

// --- Validación -------------------------------------------------------------
const slugsValidos = new Set();
for (const c of TAXONOMIA) {
  slugsValidos.add(c.slug);
  for (const s of c.subs) slugsValidos.add(`${c.slug}-${s.slug}`);
}

const errores = [];
const vistos = new Map();
provs.forEach((p, i) => {
  if (!p.name?.trim()) errores.push(`#${i}: falta "name"`);
  if (!Array.isArray(p.categorias) || p.categorias.length === 0)
    errores.push(`#${i} (${p.name}): sin categorías`);
  for (const s of p.categorias ?? []) {
    if (!slugsValidos.has(s)) errores.push(`#${i} (${p.name}): slug desconocido "${s}"`);
  }
  if (p.contact_confidence && !["alta", "media", "baja"].includes(p.contact_confidence))
    errores.push(`#${i} (${p.name}): confianza inválida "${p.contact_confidence}"`);

  // Un mismo proveedor dos veces produce dos fichas y parte su historial.
  const k = p.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (vistos.has(k)) errores.push(`#${i}: "${p.name}" repite a "${vistos.get(k)}"`);
  else vistos.set(k, p.name);
});

if (errores.length) {
  console.error("No se generó nada. Corrija primero:\n  " + errores.join("\n  "));
  process.exit(1);
}

// --- SQL ---------------------------------------------------------------------
const S = (v) => {
  if (v === null || v === undefined) return "NULL";
  const t = String(v).trim();
  return t === "" ? "NULL" : `'${t.replace(/'/g, "''")}'`;
};

const porCategoria = new Map();
for (const p of provs) for (const s of p.categorias) {
  porCategoria.set(s, (porCategoria.get(s) ?? 0) + 1);
}

const L = [];
L.push(`-- ============================================================================
-- Proveedores investigados — estudio de mercado Simití
-- ${provs.length} proveedores · ${[...porCategoria.keys()].length} categorías cubiertas
--
-- GENERADO por scripts/generate-seed-proveedores.mjs. No lo edite a mano.
--
-- Ejecutar en: Supabase > SQL Editor > New query > pegar todo > Run
-- Requiere 0004_categorias_solicitudes.sql y seed_categorias.sql aplicados.
--
-- CONTIENE DATOS COMERCIALES (contactos de proveedores). No lo suba a GitHub.
--
-- Es re-ejecutable: si el proveedor ya existe se actualiza en vez de duplicarse.
--
-- SOBRE LA VERIFICACIÓN
--   contact_confidence dice qué tan confiable es el contacto PUBLICADO:
--     alta  = sitio oficial activo con el contacto publicado ahí
--     media = presencia verificable, contacto de fuente secundaria
--     baja  = solo referencias indirectas
--   NINGUNO significa "el teléfono contesta". Eso lo confirma el equipo al
--   lograr comunicación, y queda en suppliers.contact_verified_at.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Reemplace PEGUE-AQUI-EL-ID por el id de la obra.
-- Para verlo:  select id, name from public.projects order by created_at;
-- ----------------------------------------------------------------------------
do $$
declare
  obra  uuid;
  crudo text := 'PEGUE-AQUI-EL-ID';
  prov  uuid;
  cat   uuid;
begin
  if crudo = 'PEGUE-AQUI-EL-ID' then
    raise exception 'No reemplazó el id de la obra. Vea: select id, name from public.projects;';
  end if;
  obra := crudo::uuid;

  if not exists (select 1 from public.projects where id = obra) then
    raise exception 'No existe ninguna obra con el id %', obra;
  end if;

  if not exists (select 1 from public.categories where project_id = obra) then
    raise exception 'La obra no tiene categorías. Corra primero seed_categorias.sql.';
  end if;
`);

for (const p of provs) {
  L.push(`  -- --- ${p.name} ---`);
  // suppliers no tiene índice único por nombre, así que el "upsert" se hace a
  // mano: buscar, y actualizar o insertar según el caso.
  L.push(`  select id into prov from public.suppliers
   where project_id = obra and upper(name) = upper(${S(p.name)}) limit 1;

  if prov is null then
    insert into public.suppliers
      (project_id, name, city, kind, phone, whatsapp, email, web,
       fast_contact, contact_source, notes, contact_confidence, national)
    values (obra, ${S(p.name)}, ${S(p.city)}, ${S(p.kind)}, ${S(p.phone)},
            ${S(p.whatsapp)}, ${S(p.email)}, ${S(p.web)}, ${S(p.fast_contact)},
            ${S(p.contact_source)}, ${S(p.notes)}, ${S(p.contact_confidence)},
            ${p.national ? "true" : "false"})
    returning id into prov;
  else
    update public.suppliers set
      city = coalesce(${S(p.city)}, city),
      kind = coalesce(${S(p.kind)}, kind),
      phone = coalesce(${S(p.phone)}, phone),
      whatsapp = coalesce(${S(p.whatsapp)}, whatsapp),
      email = coalesce(${S(p.email)}, email),
      web = coalesce(${S(p.web)}, web),
      fast_contact = coalesce(${S(p.fast_contact)}, fast_contact),
      contact_source = coalesce(${S(p.contact_source)}, contact_source),
      notes = coalesce(${S(p.notes)}, notes),
      contact_confidence = coalesce(${S(p.contact_confidence)}, contact_confidence),
      national = ${p.national ? "true" : "false"}
    where id = prov;
  end if;`);

  for (const slug of p.categorias) {
    L.push(`  select id into cat from public.categories where project_id = obra and slug = ${S(slug)};
  if cat is not null then
    insert into public.supplier_categories (supplier_id, category_id, strength)
    values (prov, cat, ${slug.includes("-") ? 3 : 2})
    on conflict do nothing;
  end if;`);
  }
  L.push("");
}

L.push(`  raise notice 'Proveedores en la obra: % · coberturas declaradas: %',
    (select count(*) from public.suppliers where project_id = obra),
    (select count(*) from public.supplier_categories sc
       join public.suppliers s on s.id = sc.supplier_id where s.project_id = obra);
end $$;

-- --- Verificación ------------------------------------------------------------
-- Ninguna categoría debe quedar en cero: una categoría sin proveedores no se
-- puede cotizar.
select c.name as categoria,
       count(sc.supplier_id) as proveedores,
       count(*) filter (where s.contact_confidence = 'alta') as confianza_alta
from public.categories c
left join public.supplier_categories sc on sc.category_id = c.id
left join public.suppliers s on s.id = sc.supplier_id
where c.parent_id is null
group by c.name, c.sort
order by c.sort;
`);

mkdirSync(dirname(salidaSql), { recursive: true });
writeFileSync(salidaSql, L.join("\n"), "utf8");

console.log(`SQL escrito en: ${salidaSql}`);
console.log(`  proveedores : ${provs.length}`);
console.log(`  nacionales  : ${provs.filter((p) => p.national).length}`);
for (const nivel of ["alta", "media", "baja"]) {
  console.log(`  confianza ${nivel.padEnd(5)}: ${provs.filter((p) => p.contact_confidence === nivel).length}`);
}
/**
 * Subcategorías de nivel A: las que concentran los ítems o no tienen ninguna
 * cobertura histórica. Salieron de medir Libro1, y son las que exigen 12-15
 * proveedores; el resto se conforma con menos o hereda los del padre.
 */
const NIVEL_A = new Set([
  "ELEC-TABLERO", "ELEC-DUCTO", "ELEC-CABLE", "ELEC-SALIDA", "ELEC",
  "RED-SEGURI", "RED-ESTRUCT", "RED-ACTIVO",
  "FERR-FIJACION", "PVC", "HID-ROSCADO", "HID-VALVULA", "HID",
  "MT-CELDA", "MT-POSTE", "ILUM-INTERIOR", "CONC-CEMENTO",
  "SERV-CERTIF", "SERV-OBRA", "SERV-LICENCIA",
]);
const META_A = 12;
const META_B = 6;

console.log(`\n  Cobertura por categoría y subcategoría:`);
const faltantes = [];
for (const c of TAXONOMIA) {
  const propios = porCategoria.get(c.slug) ?? 0;
  const subs = c.subs.reduce((a, s) => a + (porCategoria.get(`${c.slug}-${s.slug}`) ?? 0), 0);
  console.log(`\n    ${String(propios + subs).padStart(3)}  ${c.slug.padEnd(6)} ${c.name}`);

  // El proveedor declarado en la raíz sirve para todas sus subcategorías, así
  // que el conteo efectivo de una subcategoría los incluye.
  const nodos = [{ slug: c.slug, name: "(general)", n: propios },
    ...c.subs.map((s) => ({ slug: `${c.slug}-${s.slug}`, name: s.name,
      n: (porCategoria.get(`${c.slug}-${s.slug}`) ?? 0) + propios }))];

  for (const nodo of nodos) {
    const meta = NIVEL_A.has(nodo.slug) ? META_A : META_B;
    const nivel = NIVEL_A.has(nodo.slug) ? "A" : "B";
    const falta = nodo.n < meta;
    if (falta) faltantes.push({ ...nodo, meta, nivel });
    console.log(
      `         ${String(nodo.n).padStart(3)}/${String(meta).padStart(2)}  [${nivel}] ${nodo.name}` +
      (nodo.n === 0 ? "   <-- SIN NINGUNO" : falta ? "   <-- faltan" : "")
    );
  }
}

if (faltantes.length) {
  const a = faltantes.filter((f) => f.nivel === "A");
  console.log(`\n  Pendiente: ${faltantes.length} nodos por debajo de la meta (${a.length} de nivel A)`);
  if (a.length) {
    console.log(`  Nivel A pendiente: ${a.map((f) => `${f.slug} (${f.n}/${f.meta})`).join(", ")}`);
  }
} else {
  console.log(`\n  Todas las subcategorías alcanzan su meta.`);
}

// --- Excel para revisar -------------------------------------------------------
if (salidaXlsx) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("PROVEEDORES");

  ws.columns = [
    { header: "Empresa", key: "name", width: 34 },
    { header: "Ciudad", key: "city", width: 16 },
    { header: "Tipo", key: "kind", width: 16 },
    { header: "Categorías", key: "cats", width: 24 },
    { header: "Nacional", key: "nac", width: 10 },
    { header: "Teléfono", key: "phone", width: 20 },
    { header: "WhatsApp", key: "whatsapp", width: 18 },
    { header: "Correo", key: "email", width: 28 },
    { header: "Web", key: "web", width: 38 },
    { header: "Confianza", key: "conf", width: 11 },
    { header: "Fuente", key: "src", width: 38 },
    { header: "Notas", key: "notes", width: 46 },
  ];

  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B6055" } };
  cab.alignment = { vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "L1" };

  for (const p of provs) {
    ws.addRow({
      name: p.name, city: p.city ?? "", kind: p.kind ?? "",
      cats: p.categorias.join(", "), nac: p.national ? "SÍ" : "",
      phone: p.phone ?? "", whatsapp: p.whatsapp ?? "", email: p.email ?? "",
      web: p.web ?? "", conf: p.contact_confidence ?? "", src: p.contact_source ?? "",
      notes: p.notes ?? "",
    });
  }

  // Semáforo en la columna de confianza: es lo primero que hay que mirar.
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const c = row.getCell("conf");
    const color = { alta: "FFDCEDE3", media: "FFF4E9D2", baja: "FFF6E0DC" }[c.value];
    if (color) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    if (n % 2 === 0) {
      row.eachCell((cell) => {
        if (!cell.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F4F3" } };
      });
    }
  });

  const res = wb.addWorksheet("COBERTURA");
  res.columns = [
    { header: "Categoría", key: "cat", width: 34 },
    { header: "Slug", key: "slug", width: 10 },
    { header: "Proveedores", key: "n", width: 13 },
    { header: "Meta", key: "meta", width: 8 },
    { header: "Estado", key: "est", width: 14 },
  ];
  res.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  res.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B6055" } };
  for (const c of TAXONOMIA) {
    const n = (porCategoria.get(c.slug) ?? 0) +
      c.subs.reduce((a, s) => a + (porCategoria.get(`${c.slug}-${s.slug}`) ?? 0), 0);
    res.addRow({ cat: c.name, slug: c.slug, n, meta: 8, est: n >= 8 ? "Completa" : "Faltan" });
  }

  await wb.xlsx.writeFile(salidaXlsx);
  console.log(`\nExcel escrito en: ${salidaXlsx}`);
}
