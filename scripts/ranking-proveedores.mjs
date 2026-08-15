/**
 * Ordena los proveedores de cada subcategoría por probabilidad de responder
 * rápido y de cubrir buena parte de la lista.
 *
 *   node --experimental-strip-types scripts/ranking-proveedores.mjs \
 *        scripts/data/proveedores.json D:/USER/Downloads/Libro1.xlsx
 *
 * No hay forma de medir "responde rápido" antes de escribirle. Lo que sí se
 * puede medir son señales que se le acercan, y eso es lo que pondera:
 *
 *   - Que ya haya cotizado esta obra antes es la señal más fuerte que existe.
 *     Alguien de este equipo ya le sacó un precio: contesta.
 *   - Un contacto directo publicado (celular o WhatsApp) ahorra la etapa de
 *     buscar a quién escribirle, que es donde se pierden los primeros días.
 *   - Un mayorista responde más rápido que un fabricante, porque el fabricante
 *     suele remitir a su distribuidor y eso agrega una semana.
 *   - Declarar la subcategoría de forma explícita, y no heredarla del padre,
 *     indica que esa línea sí es lo suyo.
 *
 * El puntaje es una heurística, no una verdad. Sirve para decidir a quién
 * escribirle primero, no para descartar a nadie.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { TAXONOMIA } from "../src/lib/clasificador.ts";

const [, , rutaProv, rutaLibro] = process.argv;
if (!rutaProv) {
  console.error("Uso: node scripts/ranking-proveedores.mjs <proveedores.json> [Libro1.xlsx]");
  process.exit(1);
}

const provs = JSON.parse(readFileSync(rutaProv, "utf8"));

/* --- Historial: quién ya cotizó esta obra --------------------------------- */
const canon = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/\bS\.?A\.?S\.?\b|\bS\.?A\.?\b|\bLTDA\b/g, "")
    .replace(/[^A-Z0-9]/g, "");

const historial = new Map();
if (rutaLibro) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(rutaLibro);
  const ws = wb.getWorksheet("LISTA INSUMOS");
  const val = (c) => {
    const v = c?.value;
    if (v == null) return "";
    if (typeof v === "object") {
      if ("result" in v) return String(v.result ?? "");
      if ("richText" in v) return v.richText.map((t) => t.text).join("");
      if ("text" in v) return String(v.text);
      return "";
    }
    return String(v);
  };
  for (let r = 14; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!val(row.getCell(1)).trim() || !val(row.getCell(2)).trim()) continue;
    for (const col of [6, 8, 10]) {
      const n = val(row.getCell(col)).trim();
      if (!n) continue;
      const k = canon(n);
      historial.set(k, (historial.get(k) ?? 0) + 1);
    }
  }
}

/* --- Puntaje --------------------------------------------------------------- */
const CONF = { alta: 30, media: 15, baja: 0 };

function puntuar(p, slug, esPropio) {
  const razones = [];
  let n = 0;

  const hist = historial.get(canon(p.name)) ?? 0;
  if (hist > 0) {
    const v = Math.min(40, 20 + hist);            // techo, para que no domine
    n += v;
    razones.push(`ya cotizó ${hist} ítem(s) de esta obra`);
  }

  if (p.whatsapp || p.phone) {
    n += 25;
    razones.push("contacto directo publicado");
  }

  n += CONF[p.contact_confidence] ?? 0;
  if (p.contact_confidence === "alta") razones.push("contacto verificado en sitio oficial");

  const k = (p.kind ?? "").toLowerCase();
  if (/mayorista|distribuidor/.test(k)) { n += 15; razones.push("mayorista: cotiza sin remitir"); }
  else if (/integrador|organismo|laboratorio|alquiler|cantera|deposito/.test(k)) n += 10;
  else if (/fabricante|importador/.test(k)) { n += 5; razones.push("fabricante: puede remitir a distribuidor"); }

  if (esPropio) { n += 20; razones.push("la línea es lo suyo, no la hereda"); }

  if (!p.national) { n += 10; razones.push("regional: flete y entrega más cortos"); }

  // Cubrir muchas líneas ayuda a consolidar, pero un especialista de una sola
  // línea suele tener más fondo de catálogo. Se premia poco.
  n += Math.min(8, p.categorias.length);

  return { n, razones };
}

/* --- Ranking por nodo ------------------------------------------------------ */
const decl = new Map();
for (const p of provs) for (const s of p.categorias) {
  if (!decl.has(s)) decl.set(s, []);
  decl.get(s).push(p);
}

const TOP = 5;
const md = [];
md.push(`# Por dónde empezar a cotizar

Los cinco primeros proveedores de cada subcategoría, ordenados por
probabilidad de responder rápido y de cubrir buena parte de la lista.

> **Cómo se calculó.** No hay forma de medir "responde rápido" antes de
> escribirle. Lo que se pondera son señales que se le acercan:
>
> | Señal | Peso | Por qué |
> |---|---:|---|
> | Ya cotizó esta obra antes | hasta 40 | Es la más fuerte: alguien ya le sacó un precio |
> | Contacto directo publicado | 25 | Ahorra buscar a quién escribirle |
> | Contacto verificado en sitio oficial | 30 | El dato no está desactualizado |
> | Es mayorista | 15 | Un fabricante suele remitir a su distribuidor: una semana más |
> | La línea es lo suyo | 20 | La declara, no la hereda de la categoría padre |
> | Es regional | 10 | Flete y entrega más cortos hasta Simití |
>
> Es una heurística para decidir a quién escribirle **primero**, no para
> descartar a nadie. Generado el ${new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}.
`);

console.log("LOS 5 POR LOS QUE EMPEZAR EN CADA SUBCATEGORIA\n");

for (const cat of TAXONOMIA) {
  md.push(`\n## ${cat.name}\n`);
  const raiz = decl.get(cat.slug) ?? [];
  const nodos = [
    { slug: cat.slug, nombre: `${cat.name} — general`, propios: raiz },
    ...cat.subs.map((s) => ({
      slug: `${cat.slug}-${s.slug}`,
      nombre: `${cat.name} > ${s.name}`,
      propios: decl.get(`${cat.slug}-${s.slug}`) ?? [],
    })),
  ];

  for (const nodo of nodos) {
    const idsPropios = new Set(nodo.propios.map((p) => p.name));
    const universo = nodo.slug === cat.slug
      ? nodo.propios
      : [...new Map([...nodo.propios, ...raiz].map((p) => [p.name, p])).values()];
    if (!universo.length) continue;

    const rank = universo
      .map((p) => ({ p, ...puntuar(p, nodo.slug, idsPropios.has(p.name)) }))
      .sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name));

    console.log(`\n### ${nodo.nombre}   (${universo.length} disponibles)`);
    rank.slice(0, TOP).forEach((r, i) => {
      const wa = r.p.whatsapp ? ` · WhatsApp ${r.p.whatsapp}` : "";
      console.log(`  ${i + 1}. [${String(r.n).padStart(3)}] ${r.p.name}${r.p.city ? " — " + r.p.city : ""}${wa}`);
      console.log(`          ${r.razones.join(" · ") || "sin señales fuertes"}`);
    });

    const etiqueta = nodo.slug === cat.slug ? "General" : nodo.nombre.split(" > ")[1];
    md.push(`### ${etiqueta}  ·  ${universo.length} disponibles\n`);
    md.push(`| # | Proveedor | Ciudad | Contacto | Por qué |`);
    md.push(`|---|---|---|---|---|`);
    rank.slice(0, TOP).forEach((r, i) => {
      const con = r.p.whatsapp ?? r.p.phone ?? (r.p.web ? "sitio web" : "—");
      md.push(
        `| ${i + 1} | **${r.p.name}** | ${r.p.city ?? "—"} | ${con} | ${r.razones.join(" · ") || "—"} |`
      );
    });
    md.push("");
  }
}

const salidaMd = "POR_DONDE_EMPEZAR.md";
writeFileSync(salidaMd, md.join("\n"), "utf8");
console.log(`\n\nDocumento escrito en: ${salidaMd}`);
