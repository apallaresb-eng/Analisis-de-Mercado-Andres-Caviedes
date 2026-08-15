/**
 * Reconstruye scripts/data/proveedores.json desde Supabase.
 *
 * Para qué sirve: el JSON de proveedores no va al repositorio porque tiene
 * contactos comerciales. Al abrir el proyecto en otro computador, el código y
 * las migraciones llegan por git pero ese archivo no, y sin él no corren ni el
 * generador del seed ni el ranking.
 *
 * Como la base ya tiene exactamente los mismos datos —los doce campos del
 * proveedor y sus coberturas por categoría—, el archivo se puede reconstruir
 * en vez de andarlo copiando en una USB. La base pasa a ser la única fuente de
 * verdad, y cualquier equipo con el repositorio y las claves reproduce el resto.
 *
 * USO
 *
 *   Las credenciales van por variable de entorno y NO se guardan en ningún
 *   archivo. Se escriben una vez en la terminal y desaparecen al cerrarla.
 *
 *   PowerShell:
 *     $env:SIMITI_EMAIL    = "usted@ejemplo.com"
 *     $env:SIMITI_PASSWORD = "su-contraseña"
 *     node scripts/recuperar-proveedores.mjs
 *
 *   Git Bash:
 *     SIMITI_EMAIL="usted@ejemplo.com" SIMITI_PASSWORD="su-contraseña" \
 *       node scripts/recuperar-proveedores.mjs
 *
 * Hace falta iniciar sesión porque Row Level Security no le entrega nada a un
 * anónimo: es la misma protección que impide que cualquiera con la dirección
 * del sitio vea los precios y contactos.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(raiz, "scripts", "data", "proveedores.json");

/**
 * Se lanza para abortar con un mensaje entendible.
 *
 * No se usa process.exit() porque cortar el proceso con una petición HTTP en
 * vuelo hace que Node imprima un "Assertion failed" de libuv en Windows, que
 * asusta y no dice nada. Se deja terminar el proceso solo con un código de
 * salida.
 */
class Aborto extends Error {}

async function main() {
  /* --- Credenciales ---------------------------------------------------------- */
  function cargarEnv() {
    const env = {};
    try {
      for (const linea of readFileSync(join(raiz, ".env"), "utf8").split(/\r?\n/)) {
        const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) env[m[1]] = m[2].trim();
      }
    } catch {
      throw new Aborto("No se encontró .env. Cópielo de .env.example y ponga las dos claves de Supabase.");
    }
    return env;
  }
  
  const env = cargarEnv();
  const URL_BASE = env.VITE_SUPABASE_URL;
  const ANON = env.VITE_SUPABASE_ANON_KEY;
  const EMAIL = process.env.SIMITI_EMAIL;
  const PASS = process.env.SIMITI_PASSWORD;
  
  if (!URL_BASE || !ANON) {
    throw new Aborto("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env");
  }
  if (!EMAIL || !PASS) {
    throw new Aborto("Faltan las credenciales. Defina SIMITI_EMAIL y SIMITI_PASSWORD como variables\n" +
      "de entorno antes de correr el script (vea el encabezado del archivo).\n\n" +
      "No las escriba dentro de ningún archivo del proyecto.");
  }
  
  /* --- Sesión ---------------------------------------------------------------- */
  const rLogin = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!rLogin.ok) {
    throw new Aborto(`No se pudo iniciar sesión (HTTP ${rLogin.status}). Revise correo y contraseña.`);
  }
  const { access_token } = await rLogin.json();
  const cab = { apikey: ANON, Authorization: `Bearer ${access_token}` };
  
  /** GET contra PostgREST, con el error traducido a algo entendible. */
  async function traer(ruta) {
    const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: cab });
    if (!r.ok) {
      throw new Aborto(`Error consultando ${ruta}: HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
    }
    return r.json();
  }
  
  /* --- Datos ----------------------------------------------------------------- */
  const proyectos = await traer("projects?select=id,name,archived_at&order=created_at");
  if (!proyectos.length) {
    throw new Aborto("No hay ninguna obra visible con esta cuenta.");
  }
  
  // Si hay varias obras se toma la que más proveedores tenga: es la que se está
  // trabajando. Con el argumento --obra=<id> se puede forzar otra.
  const forzada = process.argv.find((a) => a.startsWith("--obra="))?.split("=")[1];
  let obra = forzada
    ? proyectos.find((p) => p.id === forzada)
    : null;
  
  if (!obra) {
    const conteos = await Promise.all(
      proyectos.map(async (p) => ({
        p,
        n: (await traer(`suppliers?select=id&project_id=eq.${p.id}`)).length,
      }))
    );
    conteos.sort((a, b) => b.n - a.n);
    obra = conteos[0].p;
    if (conteos.length > 1) {
      console.log("Obras encontradas:");
      for (const c of conteos) console.log(`   ${c.n} proveedores · ${c.p.name}  (${c.p.id})`);
    }
  }
  console.log(`\nObra: ${obra.name}`);
  
  const [suppliers, categories] = await Promise.all([
    traer(
      `suppliers?select=id,name,city,kind,phone,whatsapp,email,web,fast_contact,` +
      `contact_source,notes,contact_confidence,national&project_id=eq.${obra.id}&order=name`
    ),
    traer(`categories?select=id,slug&project_id=eq.${obra.id}`),
  ]);
  
  if (!suppliers.length) {
    throw new Aborto("Esa obra no tiene proveedores cargados. ¿Corrió seed_proveedores.sql?");
  }
  
  // supplier_categories no tiene project_id: se filtra por los proveedores de la
  // obra, y por lotes porque la lista de ids no cabe en la URL.
  const slugPorId = new Map(categories.map((c) => [c.id, c.slug]));
  const LOTE = 100;
  const coberturas = [];
  for (let i = 0; i < suppliers.length; i += LOTE) {
    const ids = suppliers.slice(i, i + LOTE).map((s) => s.id).join(",");
    coberturas.push(...(await traer(`supplier_categories?select=supplier_id,category_id&supplier_id=in.(${ids})`)));
  }
  
  const catsPorProveedor = new Map();
  for (const c of coberturas) {
    const slug = slugPorId.get(c.category_id);
    if (!slug) continue;
    if (!catsPorProveedor.has(c.supplier_id)) catsPorProveedor.set(c.supplier_id, []);
    catsPorProveedor.get(c.supplier_id).push(slug);
  }
  
  /* --- Reconstrucción -------------------------------------------------------- */
  // El orden de las claves se conserva igual al original para que el archivo se
  // vea idéntico y un diff no muestre ruido.
  const salida = suppliers.map((s) => ({
    name: s.name,
    city: s.city,
    kind: s.kind,
    phone: s.phone,
    whatsapp: s.whatsapp,
    email: s.email,
    web: s.web,
    fast_contact: s.fast_contact,
    contact_source: s.contact_source,
    notes: s.notes,
    contact_confidence: s.contact_confidence,
    national: s.national ?? false,
    categorias: (catsPorProveedor.get(s.id) ?? []).sort(),
  }));
  
  const sinCategoria = salida.filter((s) => s.categorias.length === 0);
  
  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, JSON.stringify(salida, null, 2) + "\n", "utf8");
  
  console.log(`\nEscrito: ${SALIDA}`);
  console.log(`  proveedores : ${salida.length}`);
  console.log(`  coberturas  : ${coberturas.length}`);
  console.log(`  confianza alta : ${salida.filter((s) => s.contact_confidence === "alta").length}`);
  if (sinCategoria.length) {
    console.log(`\n  ${sinCategoria.length} proveedor(es) sin ninguna categoría:`);
    for (const s of sinCategoria.slice(0, 10)) console.log(`     ${s.name}`);
  }
  console.log(`\nYa puede regenerar el resto:`);
  console.log(`  node --experimental-strip-types scripts/generate-seed-proveedores.mjs \\`);
  console.log(`       scripts/data/proveedores.json supabase/seeds/seed_proveedores.sql proveedores_investigacion.xlsx`);
  
}

main().catch((e) => {
  console.error(e instanceof Aborto ? e.message : e);
  process.exitCode = 1;
});
