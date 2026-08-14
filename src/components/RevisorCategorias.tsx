import { useMemo, useState } from "react";
import type { Category, Item } from "../lib/types";
import { asignarCategoriaVarios } from "../lib/datos";
import { clasificar, type Confianza } from "../lib/clasificador";
import { useAuth } from "../lib/auth";
import { useToast } from "./Toast";

interface Props {
  items: Item[];
  categorias: Category[];
  onRecargar: () => void | Promise<void>;
}

type Filtro = "sin" | "dudosos" | "propuestos" | "todos";

interface Propuesta {
  item: Item;
  categoria: Category | null;
  confianza: Confianza | null;
}

/**
 * Revisión en bloque de las categorías propuestas por el clasificador.
 *
 * El clasificador acierta ~99% de los 1.071 ítems, pero "acierta" no es
 * "correcto": una parte la deduce de palabras genéricas (TUBO, CAJA, SOPORTE) y
 * puede equivocarse. Por eso nada se guarda solo — aquí se confirma por lotes.
 *
 * El orden por defecto pone primero lo que no clasificó y lo dudoso: es donde
 * el tiempo de una persona rinde.
 */
export default function RevisorCategorias({ items, categorias, onRecargar }: Props) {
  const { isAdmin } = useAuth();
  const { avisar, avisarError } = useToast();

  const [filtro, setFiltro] = useState<Filtro>("sin");
  const [busqueda, setBusqueda] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");
  const [guardando, setGuardando] = useState(false);

  const raices = useMemo(
    () => categorias.filter((c) => !c.parent_id).sort((a, b) => a.sort - b.sort),
    [categorias]
  );
  const porSlug = useMemo(() => new Map(categorias.map((c) => [c.slug, c])), [categorias]);

  /** Propuesta del clasificador para cada ítem que aún no tiene categoría. */
  const propuestas = useMemo<Propuesta[]>(() => {
    return items.map((item) => {
      if (item.category_id) {
        return {
          item,
          categoria: categorias.find((c) => c.id === item.category_id) ?? null,
          confianza: null,
        };
      }
      const c = clasificar(item.description);
      // El clasificador propone la subcategoría cuando puede; si esa subcategoría
      // no existe en la obra, se cae a la raíz.
      const sub = c.cat && c.sub ? porSlug.get(`${c.cat}-${c.sub}`) : undefined;
      return {
        item,
        categoria: sub ?? (c.cat ? porSlug.get(c.cat) ?? null : null),
        confianza: c.confianza,
      };
    });
  }, [items, categorias, porSlug]);

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return propuestas.filter((p) => {
      if (filtro === "sin" && (p.item.category_id || p.categoria)) return false;
      if (filtro === "dudosos" && (p.item.category_id || p.confianza !== "media")) return false;
      if (filtro === "propuestos" && (p.item.category_id || !p.categoria)) return false;
      if (t && !`${p.item.code} ${p.item.description}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [propuestas, filtro, busqueda]);

  const conteos = useMemo(() => {
    let sin = 0, dudosos = 0, propuestos = 0, confirmados = 0;
    for (const p of propuestas) {
      if (p.item.category_id) { confirmados++; continue; }
      if (!p.categoria) sin++;
      else if (p.confianza === "media") { dudosos++; propuestos++; }
      else propuestos++;
    }
    return { sin, dudosos, propuestos, confirmados, total: propuestas.length };
  }, [propuestas]);

  function alternar(id: string) {
    setMarcados((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  /** Guarda las propuestas visibles tal como están, sin tocar nada más. */
  async function aceptarPropuestas() {
    const conCat = visibles.filter((p) => !p.item.category_id && p.categoria);
    if (!conCat.length) return;

    setGuardando(true);
    try {
      // Se agrupa por categoría: cada grupo es un update masivo, no uno por ítem.
      const grupos = new Map<string, { cat: Category; ids: string[] }>();
      for (const p of conCat) {
        const g = grupos.get(p.categoria!.id) ?? { cat: p.categoria!, ids: [] };
        g.ids.push(p.item.id);
        grupos.set(p.categoria!.id, g);
      }
      for (const g of grupos.values()) {
        await asignarCategoriaVarios(g.ids, g.cat.id, g.cat.name);
      }
      await onRecargar();
      setMarcados(new Set());
      avisar(`${conCat.length} ítems clasificados`);
    } catch (e) {
      avisarError(e);
    } finally {
      setGuardando(false);
    }
  }

  /** Manda los ítems marcados a una categoría elegida a mano. */
  async function asignarMarcados() {
    if (!destino || marcados.size === 0) return;
    const cat = categorias.find((c) => c.id === destino);
    if (!cat) return;

    setGuardando(true);
    try {
      await asignarCategoriaVarios([...marcados], cat.id, cat.name);
      await onRecargar();
      setMarcados(new Set());
      avisar(`${marcados.size} ítems movidos a ${cat.name}`);
    } catch (e) {
      avisarError(e);
    } finally {
      setGuardando(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="card">
        <span className="lbl">Clasificación</span>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
          La categoría es ficha técnica del ítem: solo un administrador puede cambiarla.
        </p>
      </div>
    );
  }

  if (!categorias.length) {
    return (
      <div className="card">
        <span className="lbl">Clasificación</span>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
          Primero hay que sembrar la taxonomía en Supabase con{" "}
          <span className="mono">supabase/seeds/seed_categorias.sql</span>.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Clasificar los ítems</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
          El sistema propone una categoría leyendo la descripción. <b>Nada se guarda solo.</b>{" "}
          Revise la propuesta, corrija lo que esté mal marcando varios ítems a la vez, y
          confirme. Empiece por lo que quedó <b>sin proponer</b> y por lo <b>dudoso</b>.
        </p>
        <div className="statbar">
          <div>
            <span className="lbl">Ya clasificados</span>
            <span className="sv mono" style={{ color: "var(--ok)" }}>{conteos.confirmados}</span>
          </div>
          <div>
            <span className="lbl">Con propuesta</span>
            <span className="sv mono" style={{ color: "var(--accent)" }}>{conteos.propuestos}</span>
          </div>
          <div>
            <span className="lbl">Dudosos</span>
            <span className="sv mono" style={{ color: "var(--warn)" }}>{conteos.dudosos}</span>
          </div>
          <div>
            <span className="lbl">Sin proponer</span>
            <span className="sv mono" style={{ color: "var(--crit)" }}>{conteos.sin}</span>
          </div>
        </div>
      </div>

      <div className="filters">
        <input
          className="search"
          type="search"
          placeholder="Buscar por código o descripción…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar ítems"
        />
        {([
          ["sin", "Sin proponer", conteos.sin],
          ["dudosos", "Dudosos", conteos.dudosos],
          ["propuestos", "Con propuesta", conteos.propuestos],
          ["todos", "Todos", conteos.total],
        ] as const).map(([f, lbl, n]) => (
          <button key={f} className="chip" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
            {lbl} <span className="c mono">{n}</span>
          </button>
        ))}
      </div>

      <div className="filters">
        <button
          className="btn"
          disabled={guardando || !visibles.some((p) => !p.item.category_id && p.categoria)}
          onClick={() => void aceptarPropuestas()}
        >
          {guardando ? "Guardando…" : `Aceptar las propuestas visibles (${visibles.filter((p) => !p.item.category_id && p.categoria).length})`}
        </button>

        <span style={{ flex: 1 }} />

        <span className="lbl">{marcados.size} marcados</span>
        <select
          className="sel"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          aria-label="Categoría de destino"
        >
          <option value="">Mover los marcados a…</option>
          {raices.map((c) => (
            <optgroup key={c.id} label={c.name}>
              <option value={c.id}>{c.name} (general)</option>
              {categorias
                .filter((s) => s.parent_id === c.id)
                .sort((a, b) => a.sort - b.sort)
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </optgroup>
          ))}
        </select>
        <button
          className="btn ghost"
          disabled={guardando || !destino || marcados.size === 0}
          onClick={() => void asignarMarcados()}
        >
          Mover
        </button>
        {marcados.size > 0 && (
          <button className="mini" onClick={() => setMarcados(new Set())}>Desmarcar</button>
        )}
      </div>

      {visibles.length === 0 ? (
        <div className="empty">
          {filtro === "sin"
            ? "No queda ningún ítem sin propuesta. Revise los dudosos."
            : "Ningún ítem coincide con el filtro."}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <button
              className="mini"
              onClick={() => setMarcados(new Set(visibles.map((p) => p.item.id)))}
            >
              Marcar los {visibles.length} visibles
            </button>
          </div>
          <div className="revlist">
            {visibles.slice(0, 400).map((p) => (
              <button
                key={p.item.id}
                className="revrow"
                aria-selected={marcados.has(p.item.id)}
                onClick={() => alternar(p.item.id)}
              >
                <input
                  type="checkbox"
                  checked={marcados.has(p.item.id)}
                  onChange={() => alternar(p.item.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Marcar ${p.item.code}`}
                />
                <span className="mono" style={{ fontSize: 11, color: "var(--faint)", fontWeight: 700 }}>
                  {p.item.code}
                </span>
                <span className="rd" title={p.item.description}>{p.item.description}</span>
                {p.item.category_id ? (
                  <span
                    className="pill"
                    style={{ ["--pc" as string]: "var(--ok)", ["--pl" as string]: "var(--ok-line)", ["--pb" as string]: "var(--ok-soft)" }}
                  >
                    {p.categoria?.name ?? "Clasificado"}
                  </span>
                ) : p.categoria ? (
                  <span
                    className="pill"
                    style={{
                      ["--pc" as string]: p.confianza === "media" ? "var(--warn)" : "var(--accent)",
                      ["--pl" as string]: p.confianza === "media" ? "var(--warn-line)" : "var(--accent-line)",
                      ["--pb" as string]: p.confianza === "media" ? "var(--warn-soft)" : "var(--accent-soft)",
                    }}
                    title={p.confianza === "media" ? "Deducido de una palabra genérica: revíselo" : "Coincidencia clara"}
                  >
                    {p.categoria.name}
                  </span>
                ) : (
                  <span
                    className="pill"
                    style={{ ["--pc" as string]: "var(--crit)", ["--pl" as string]: "var(--crit-line)", ["--pb" as string]: "var(--crit-soft)" }}
                  >
                    Sin proponer
                  </span>
                )}
              </button>
            ))}
          </div>
          {visibles.length > 400 && (
            <div className="note" style={{ marginTop: 8 }}>
              Se muestran los primeros 400 de {visibles.length}. Acepte o mueva estos y el
              resto aparece solo.
            </div>
          )}
        </>
      )}
    </>
  );
}
