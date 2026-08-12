/**
 * Diagnóstico de conexión con Supabase.
 * Comprueba que el proyecto responde, que la migración se aplicó y que RLS
 * está realmente bloqueando el acceso anónimo.
 *
 *   node scripts/check-db.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

function cargarEnv() {
  const env = {};
  try {
    for (const linea of readFileSync(join(raiz, ".env"), "utf8").split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {
    console.error("No se encontró el archivo .env");
    process.exit(1);
  }
  return env;
}

const env = cargarEnv();
const URL_BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

if (!URL_BASE || !ANON) {
  console.error("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env");
  process.exit(1);
}

// Confirma que la clave entregada es la anónima y no la de servicio.
try {
  const payload = JSON.parse(Buffer.from(ANON.split(".")[1], "base64").toString());
  console.log(`Proyecto : ${payload.ref}`);
  console.log(`Rol clave: ${payload.role}`);
  if (payload.role !== "anon") {
    console.error("\n  ALTO: esta NO es la clave anónima. No debe usarse en el navegador.\n");
    process.exit(1);
  }
} catch {
  console.error("La clave no tiene formato JWT válido.");
  process.exit(1);
}

const TABLAS = [
  "profiles", "projects", "suppliers", "items",
  "item_suppliers", "quotes", "activity_log", "imports",
];

const cab = { apikey: ANON, Authorization: `Bearer ${ANON}` };

console.log(`\n--- Tablas (esperado: existen, y RLS niega al anónimo) ---`);
let faltantes = 0;
let expuestas = 0;

for (const t of TABLAS) {
  const r = await fetch(`${URL_BASE}/rest/v1/${t}?select=*&limit=1`, { headers: cab });
  const cuerpo = await r.text();

  if (r.status === 404 || cuerpo.includes("does not exist") || cuerpo.includes("PGRST205")) {
    console.log(`  ${t.padEnd(15)} NO EXISTE  -> falta correr la migración`);
    faltantes++;
  } else if (r.ok && cuerpo.trim() === "[]") {
    console.log(`  ${t.padEnd(15)} OK         -> existe y RLS bloquea al anónimo`);
  } else if (r.ok) {
    console.log(`  ${t.padEnd(15)} EXPUESTA   -> devolvió datos sin sesión: ${cuerpo.slice(0, 90)}`);
    expuestas++;
  } else {
    console.log(`  ${t.padEnd(15)} ${r.status}        -> ${cuerpo.slice(0, 90)}`);
  }
}

// El registro público abierto anula todo el control de acceso.
console.log(`\n--- Registro público (debe estar CERRADO) ---`);
const r = await fetch(`${URL_BASE}/auth/v1/signup`, {
  method: "POST",
  headers: { ...cab, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: `prueba-cierre-${Date.now()}@ejemplo-invalido.test`,
    password: `x${Math.random().toString(36).slice(2)}A1!`,
  }),
});
const txt = await r.text();
const cerrado = /signup.*disabled|not allowed|closed/i.test(txt);

if (cerrado) {
  console.log("  CERRADO    -> correcto, nadie puede autoregistrarse");
} else if (r.ok) {
  console.log("  ABIERTO    -> RIESGO: cualquiera puede crearse una cuenta");
  console.log("               Desactive Authentication > Providers > Email > Enable sign ups");
} else {
  console.log(`  ${r.status} -> ${txt.slice(0, 160)}`);
}

console.log(`\n--- Resumen ---`);
if (faltantes) console.log(`  ${faltantes} tabla(s) sin crear: falta aplicar 0001_init.sql`);
if (expuestas) console.log(`  ${expuestas} tabla(s) legibles sin sesión: revise RLS`);
if (!faltantes && !expuestas && cerrado) console.log("  Todo correcto. La base está lista.");
