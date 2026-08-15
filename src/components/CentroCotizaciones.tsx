import { useCallback, useEffect, useMemo, useState } from "react";
import type { DatosProyecto } from "../lib/datos";
import {
  cargarCotizacionesDeProyecto, crearSolicitud, siguienteCodigoSolicitud,
  vincularProveedorCategoria,
} from "../lib/datos";
import type { Category, Item, Quote, QuoteRequest, Supplier } from "../lib/types";
import {
  ESTADO_SOLICITUD_POR_ID, diasDesde, mensajeCritico, mensajeSolicitud, requiereSeguimiento,
} from "../lib/dominio";
import { DIFICULTAD_POR_ID, dificultadDe, separarPorDificultad } from "../lib/dificultad";
import { combinacionRecomendada, itemsSinCotizar, metricasDeCategoria, pct } from "../lib/cobertura";
import { useAuth } from "../lib/auth";
import { useToast } from "./Toast";
import PanelSolicitud from "./PanelSolicitud";

type Vista = "matriz" | "pipeline" | "cobertura" | "criticos";

interface Props {
  datos: DatosProyecto;
  onRecargar: () => void | Promise<void>;
}

export default function CentroCotizaciones({ datos, onRecargar }: Props) {
  const { session } = useAuth();
  const { avisar, avisarError } = useToast();

  const [vista, setVista] = useState<Vista>("matriz");
  const [selId, setSelId] = useState<string | null>(null);
  const [creando, setCreando] = useState<string | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Quote[] | null>(null);
  const [catAbierta, setCatAbierta] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<Set<string>>(new Set());

  const { proyecto, items, proveedores, categorias, coberturas, solicitudes, lineas } = datos;

  const provPorId = useMemo(
    () => new Map(proveedores.map((p) => [p.id, p])),
    [proveedores]
  );
  const catPorId = useMemo(
    () => new Map(categorias.map((c) => [c.id, c])),
    [categorias]
  );

  const raices = useMemo(
    () => categorias.filter((c) => !c.parent_id).sort((a, b) => a.sort - b.sort),
    [categorias]
  );

  const subsDe = useMemo(() => {
    const m = new Map<string, Category[]>();
    for (const c of raices) {
      m.set(c.id, categorias.filter((x) => x.parent_id === c.id).sort((a, b) => a.sort - b.sort));
    }
    return m;
  }, [raices, categorias]);

  /**
   * Ítems de cada nodo EXACTO, sin acumular en el padre.
   *
   * Es la diferencia entre mandarle a un especialista en cable sus 66 ítems, o
   * mandarle los 347 de todo Eléctricos. Una solicitud de subcategoría tiene
   * que traer solo lo suyo.
   */
  const itemsPorNodo = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const c of categorias) m.set(c.id, []);
    for (const it of items) {
      if (!it.category_id) continue;
      m.get(it.category_id)?.push(it);
    }
    return m;
  }, [items, categorias]);

  /**
   * Ítems de toda la rama de una raíz. La cobertura se mide sobre la categoría
   * completa, aunque las solicitudes se manden por subcategoría.
   */
  const itemsDeRama = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const c of raices) {
      m.set(c.id, [
        ...(itemsPorNodo.get(c.id) ?? []),
        ...(subsDe.get(c.id) ?? []).flatMap((s) => itemsPorNodo.get(s.id) ?? []),
      ]);
    }
    return m;
  }, [raices, subsDe, itemsPorNodo]);

  const totalPorRaiz = useMemo(
    () => new Map([...itemsDeRama].map(([id, l]) => [id, l.length])),
    [itemsDeRama]
  );

  /**
   * Proveedores de cada nodo. Una subcategoría hereda los del padre: quien
   * declaró que atiende "Eléctricos" atiende también sus cables.
   */
  const provsPorNodo = useMemo(() => {
    const m = new Map<string, Supplier[]>();
    const resolver = (ids: Set<string>) =>
      [...ids].map((id) => provPorId.get(id)).filter((p): p is Supplier => !!p)
        .sort((a, b) => a.name.localeCompare(b.name));

    for (const c of raices) {
      // La raíz muestra todo lo suyo y lo de sus hijas, para que la fila
      // colapsada deje ver con cuánta gente se cuenta en total.
      const propios = new Set(coberturas[c.id] ?? []);
      const todos = new Set(propios);
      for (const sub of subsDe.get(c.id) ?? []) {
        for (const p of coberturas[sub.id] ?? []) todos.add(p);
        m.set(sub.id, resolver(new Set([...(coberturas[sub.id] ?? []), ...propios])));
      }
      m.set(c.id, resolver(todos));
    }
    return m;
  }, [raices, subsDe, coberturas, provPorId]);

  /** Solicitud existente para cada par (nodo exacto, proveedor). */
  const solicitudPorCelda = useMemo(() => {
    const m = new Map<string, QuoteRequest>();
    for (const s of solicitudes) {
      if (!s.category_id) continue;
      const k = `${s.category_id}|${s.supplier_id}`;
      // Si hay varias, se muestra la más reciente: solicitudes ya viene ordenada.
      if (!m.has(k)) m.set(k, s);
    }
    return m;
  }, [solicitudes]);

  const itemsPorId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const seleccionada = selId ? solicitudes.find((s) => s.id === selId) ?? null : null;
  const itemsSeleccion = useMemo(() => {
    if (!seleccionada) return [];
    return (lineas[seleccionada.id] ?? [])
      .map((id) => itemsPorId.get(id))
      .filter((i): i is Item => !!i)
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  }, [seleccionada, lineas, itemsPorId]);

  // Las cotizaciones solo hacen falta para medir cobertura, y son la consulta
  // más pesada: se piden cuando se abre esa vista, no al entrar.
  useEffect(() => {
    if (vista !== "cobertura" || cotizaciones !== null) return;
    cargarCotizacionesDeProyecto(proyecto.id).then(setCotizaciones).catch(avisarError);
  }, [vista, cotizaciones, proyecto.id, avisarError]);

  const aplicarCambio = useCallback((s: QuoteRequest) => {
    // Se recarga para que la matriz y el pipeline reflejen el nuevo estado.
    void onRecargar();
    setSelId(s.id);
  }, [onRecargar]);

  /**
   * Crea la solicitud de una celda vacía y la deja abierta para revisarla.
   *
   * Los ítems críticos NO entran: un grupo electrógeno de 300 kVA dentro de una
   * lista de 98 tableros es la forma más segura de que no lo coticen. Van por
   * su propia ruta desde la vista de Críticos.
   */
  async function abrirCelda(cat: Category, prov: Supplier) {
    const clave = `${cat.id}|${prov.id}`;
    const existente = solicitudPorCelda.get(clave);
    if (existente) { setSelId(existente.id); return; }

    const todos = itemsPorNodo.get(cat.id) ?? [];
    const { normales, criticos } = separarPorDificultad(todos);

    if (!normales.length) {
      avisarError(new Error(
        todos.length
          ? `Todos los ítems de "${cat.name}" son especializados. Créelos desde la pestaña Críticos.`
          : `"${cat.name}" no tiene ítems clasificados todavía.`
      ));
      return;
    }
    if (!session) return;

    setCreando(clave);
    try {
      const codigo = siguienteCodigoSolicitud(solicitudes, cat.slug, prov.name);
      const ctx = {
        nombre: proyecto.name,
        contrato: proyecto.contract_no,
        municipio: proyecto.municipality,
      };
      const nueva = await crearSolicitud(
        {
          project_id: proyecto.id,
          supplier_id: prov.id,
          category_id: cat.id,
          scope: cat.parent_id ? "subcategoria" : "categoria",
          code: codigo,
          message_text: mensajeSolicitud(normales, ctx, cat.name, {
            codigo,
            tipoProveedor: prov.kind,
            totalObra: items.length,
          }),
        },
        normales.map((i) => i.id),
        Object.fromEntries(normales.map((i) => [i.id, i.quantity])),
        session.user.id
      );
      await onRecargar();
      setSelId(nueva.id);
      avisar(
        criticos.length
          ? `Solicitud ${codigo} con ${normales.length} ítems. ${criticos.length} especializados quedaron aparte.`
          : `Solicitud ${codigo} creada con ${normales.length} ítems`
      );
    } catch (e) {
      avisarError(e);
    } finally {
      setCreando(null);
    }
  }

  /** Solicitud especial para los ítems críticos que se marquen. */
  async function crearSolicitudCritica(prov: Supplier, criticos: Item[]) {
    if (!session || !criticos.length) return;
    setCreando(`critica|${prov.id}`);
    try {
      const codigo = siguienteCodigoSolicitud(solicitudes, "ESP", prov.name);
      const ctx = {
        nombre: proyecto.name,
        contrato: proyecto.contract_no,
        municipio: proyecto.municipality,
      };
      const nueva = await crearSolicitud(
        {
          project_id: proyecto.id,
          supplier_id: prov.id,
          category_id: null,
          scope: "manual",
          code: codigo,
          message_text: mensajeCritico(criticos, ctx, { codigo }),
        },
        criticos.map((i) => i.id),
        Object.fromEntries(criticos.map((i) => [i.id, i.quantity])),
        session.user.id
      );
      await onRecargar();
      setVista("matriz");
      setSelId(nueva.id);
      avisar(`Solicitud especial ${codigo} con ${criticos.length} ítems`);
    } catch (e) {
      avisarError(e);
    } finally {
      setCreando(null);
    }
  }

  async function agregarProveedor(cat: Category, supplierId: string) {
    try {
      await vincularProveedorCategoria(supplierId, cat.id);
      await onRecargar();
      avisar(`${provPorId.get(supplierId)?.name} ahora atiende ${cat.name}`);
    } catch (e) {
      avisarError(e);
    }
  }

  const sinClasificar = items.filter((i) => !i.category_id).length;
  const nCriticos = useMemo(() => separarPorDificultad(items).criticos.length, [items]);

  // La vista de críticos también necesita las cotizaciones, para saber cuáles
  // siguen sin precio después de haber preguntado.
  useEffect(() => {
    if (vista !== "criticos" || cotizaciones !== null) return;
    cargarCotizacionesDeProyecto(proyecto.id).then(setCotizaciones).catch(avisarError);
  }, [vista, cotizaciones, proyecto.id, avisarError]);

  if (!categorias.length) {
    return (
      <div className="card">
        <span className="lbl">Centro de cotizaciones</span>
        <h3 style={{ fontSize: 16, margin: "6px 0 8px" }}>Todavía no hay categorías</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
          Las solicitudes se arman por categoría, así que primero hay que sembrar la
          taxonomía y clasificar los ítems. Vaya a <b>Categorías</b> para hacerlo.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="filters">
        {([
          ["matriz", "Matriz por categoría", 0],
          ["pipeline", "Seguimiento", 0],
          ["cobertura", "Cobertura", 0],
          ["criticos", "Críticos", nCriticos],
        ] as const).map(([v, lbl, n]) => (
          <button key={v} className="chip" aria-pressed={vista === v} onClick={() => setVista(v)}>
            {lbl}
            {n > 0 && <span className="c mono">{n}</span>}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {sinClasificar > 0 && (
          <span
            className="pill"
            style={{ ["--pc" as string]: "var(--warn)", ["--pl" as string]: "var(--warn-line)", ["--pb" as string]: "var(--warn-soft)" }}
          >
            {sinClasificar} ítems sin categoría
          </span>
        )}
      </div>

      <div className="split">
        <div>
          {vista === "matriz" && (
            <Matriz
              raices={raices}
              subsDe={subsDe}
              itemsPorNodo={itemsPorNodo}
              totalPorRaiz={totalPorRaiz}
              provsPorNodo={provsPorNodo}
              solicitudPorCelda={solicitudPorCelda}
              proveedores={proveedores}
              creando={creando}
              selId={selId}
              expandida={expandida}
              catAbierta={catAbierta}
              onAbrirCelda={abrirCelda}
              onToggleExpandir={(id) =>
                setExpandida((s) => {
                  const n = new Set(s);
                  n.has(id) ? n.delete(id) : n.add(id);
                  return n;
                })
              }
              onToggleCat={(id) => setCatAbierta((a) => (a === id ? null : id))}
              onAgregarProveedor={agregarProveedor}
            />
          )}

          {vista === "criticos" && (
            <Criticos
              items={items}
              catPorId={catPorId}
              proveedores={proveedores}
              cotizaciones={cotizaciones}
              creando={creando}
              onCrear={crearSolicitudCritica}
            />
          )}

          {vista === "pipeline" && (
            <Pipeline
              solicitudes={solicitudes}
              provPorId={provPorId}
              catPorId={catPorId}
              lineas={lineas}
              selId={selId}
              onSeleccionar={setSelId}
            />
          )}

          {vista === "cobertura" && (
            <Cobertura
              raices={raices}
              itemsPorRaiz={itemsDeRama}
              provsPorRaiz={provsPorNodo}
              solicitudes={solicitudes}
              cotizaciones={cotizaciones}
            />
          )}
        </div>

        {seleccionada && provPorId.get(seleccionada.supplier_id) ? (
          <PanelSolicitud
            solicitud={seleccionada}
            proveedor={provPorId.get(seleccionada.supplier_id)!}
            categoria={seleccionada.category_id ? catPorId.get(seleccionada.category_id) ?? null : null}
            items={itemsSeleccion}
            proyecto={proyecto}
            totalObra={items.length}
            onCambio={aplicarCambio}
            onRecargar={onRecargar}
            onCerrar={() => setSelId(null)}
          />
        ) : (
          <div className="reqpanel">
            <div className="empty">
              Elija una celda de la matriz para abrir o crear la solicitud de esa
              categoría con ese proveedor.
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Vista 1 — Matriz categoría × proveedor
   --------------------------------------------------------------------------- */
function Matriz({
  raices, subsDe, itemsPorNodo, totalPorRaiz, provsPorNodo, solicitudPorCelda,
  proveedores, creando, selId, expandida, catAbierta,
  onAbrirCelda, onToggleExpandir, onToggleCat, onAgregarProveedor,
}: {
  raices: Category[];
  subsDe: Map<string, Category[]>;
  itemsPorNodo: Map<string, Item[]>;
  totalPorRaiz: Map<string, number>;
  provsPorNodo: Map<string, Supplier[]>;
  solicitudPorCelda: Map<string, QuoteRequest>;
  proveedores: Supplier[];
  creando: string | null;
  selId: string | null;
  expandida: Set<string>;
  catAbierta: string | null;
  onAbrirCelda: (c: Category, p: Supplier) => void;
  onToggleExpandir: (id: string) => void;
  onToggleCat: (id: string) => void;
  onAgregarProveedor: (c: Category, supplierId: string) => void;
}) {
  /** Una fila de celdas para un nodo concreto (raíz o subcategoría). */
  function Celdas({ nodo, sangria }: { nodo: Category; sangria: boolean }) {
    const provs = provsPorNodo.get(nodo.id) ?? [];
    const todos = itemsPorNodo.get(nodo.id) ?? [];
    const { normales, criticos } = separarPorDificultad(todos);
    const abierta = catAbierta === nodo.id;
    const disponibles = proveedores.filter((p) => !provs.some((x) => x.id === p.id));

    if (todos.length === 0) return null;

    return (
      <div style={sangria ? { marginTop: 10, paddingLeft: 14, borderLeft: "2px solid var(--line-2)" } : { marginTop: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
          <b style={{ fontSize: 12.5 }}>{sangria ? nodo.name : "Sin subcategoría"}</b>
          <span className="cn mono">{normales.length} ítems</span>
          {criticos.length > 0 && (
            <span
              className="pill"
              style={{ ["--pc" as string]: "var(--crit)", ["--pl" as string]: "var(--crit-line)", ["--pb" as string]: "var(--crit-soft)" }}
              title="Van por la pestaña Críticos, no dentro de esta solicitud"
            >
              +{criticos.length} especializados
            </span>
          )}
        </div>

        {provs.length === 0 ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 12, color: "var(--crit)" }}>Sin proveedores.</b>
            <button className="mini" onClick={() => onToggleCat(nodo.id)}>Asignar</button>
          </div>
        ) : (
          <div className="cells">
            {provs.map((p) => {
              const s = solicitudPorCelda.get(`${nodo.id}|${p.id}`);
              const est = s ? ESTADO_SOLICITUD_POR_ID[s.status] : null;
              const tarde = s ? requiereSeguimiento(s) : false;
              const dias = s?.sent_at ? diasDesde(s.sent_at) : null;
              return (
                <button
                  key={p.id}
                  className={`cell${s ? "" : " is-nueva"}${tarde ? " is-alerta" : ""}`}
                  aria-current={s ? s.id === selId : undefined}
                  disabled={creando === `${nodo.id}|${p.id}`}
                  style={{
                    ["--cc" as string]: est?.color ?? "var(--faint)",
                    ["--cl" as string]: s && s.id === selId ? "var(--accent)" : est?.linea ?? "var(--line)",
                    ["--cb" as string]: est?.fondo ?? "var(--surface)",
                  }}
                  title={s ? `${s.code} · ${est!.lbl}` : `Crear solicitud de ${nodo.name} para ${p.name} (${normales.length} ítems)`}
                  onClick={() => onAbrirCelda(nodo, p)}
                >
                  <i className="cd" />
                  {p.name}
                  <span className="cx">
                    {s ? (tarde && dias !== null ? `${dias}d` : est!.lbl) : `${normales.length}`}
                  </span>
                </button>
              );
            })}
            <button className="cell is-nueva" onClick={() => onToggleCat(nodo.id)} title="Agregar un proveedor">
              + Proveedor
            </button>
          </div>
        )}

        {abierta && (
          <div style={{ marginTop: 8 }}>
            <span className="lbl">Agregar un proveedor que atienda {nodo.name}</span>
            <select
              className="field"
              style={{ marginTop: 4 }}
              value=""
              aria-label={`Agregar proveedor a ${nodo.name}`}
              onChange={(e) => { if (e.target.value) onAgregarProveedor(nodo, e.target.value); }}
            >
              <option value="">Elija un proveedor…</option>
              {disponibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.city ? ` — ${p.city}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Una solicitud por subcategoría y proveedor</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
          Despliegue la categoría para pedir por línea: a un especialista en cable le llegan
          sus <b>66 cables</b>, no los 347 ítems de todo Eléctricos. Cada casilla es
          independiente — pedirle PVC a un proveedor no toca lo que le falte pedirle de otra
          cosa, y nada desaparece al enviar.
        </p>
      </div>

      <div className="cats">
        {raices.map((cat) => {
          const subs = subsDe.get(cat.id) ?? [];
          const total = totalPorRaiz.get(cat.id) ?? 0;
          const provs = provsPorNodo.get(cat.id) ?? [];
          const abierto = expandida.has(cat.id);

          // Todas las solicitudes de la rama, para el contador de la cabecera.
          const nodos = [cat, ...subs];
          let enviadas = 0, respondidas = 0, posibles = 0;
          for (const n of nodos) {
            if ((itemsPorNodo.get(n.id) ?? []).length === 0) continue;
            for (const p of provsPorNodo.get(n.id) ?? []) {
              posibles++;
              const s = solicitudPorCelda.get(`${n.id}|${p.id}`);
              if (s?.sent_at) enviadas++;
              if (s?.responded_at) respondidas++;
            }
          }
          const hueco = provs.length === 0;
          const avance = posibles ? enviadas / posibles : 0;

          return (
            <div
              className={`catrow${hueco ? " is-hueco" : ""}`}
              key={cat.id}
              style={{ ["--stripe" as string]: hueco ? "var(--crit)" : "var(--accent)" }}
            >
              <button
                className="ch"
                style={{ background: "none", border: 0, padding: 0, width: "100%", textAlign: "left", cursor: "pointer" }}
                aria-expanded={abierto}
                onClick={() => onToggleExpandir(cat.id)}
              >
                <span style={{ fontSize: 11, color: "var(--faint)", width: 10 }}>{abierto ? "▾" : "▸"}</span>
                <h3>{cat.name}</h3>
                <span className="cn mono">{total} ítems</span>
                {subs.length > 0 && <span className="cn">{subs.length} líneas</span>}
                <span style={{ flex: 1 }} />
                <span className="cn">{enviadas}/{posibles} enviadas · {respondidas} respondieron</span>
              </button>

              {!hueco && (
                <div className="cbar">
                  <i style={{ width: `${Math.round(avance * 100)}%` }} />
                </div>
              )}

              {hueco && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                  <b style={{ fontSize: 12.5, color: "var(--crit)" }}>
                    Sin proveedores: esta categoría no se puede cotizar.
                  </b>
                  <button className="mini" onClick={() => onToggleCat(cat.id)}>Asignar proveedores</button>
                </div>
              )}

              {abierto && !hueco && (
                <>
                  <Celdas nodo={cat} sangria={false} />
                  {subs.map((s) => <Celdas key={s.id} nodo={s} sangria />)}
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Vista 4 — Ítems críticos
   --------------------------------------------------------------------------- */
function Criticos({
  items, catPorId, proveedores, cotizaciones, creando, onCrear,
}: {
  items: Item[];
  catPorId: Map<string, Category>;
  proveedores: Supplier[];
  cotizaciones: Quote[] | null;
  creando: string | null;
  onCrear: (p: Supplier, items: Item[]) => void;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");

  const criticos = useMemo(() => {
    const conPrecio = new Set((cotizaciones ?? []).map((q) => q.item_id));
    return separarPorDificultad(items).criticos
      .map((it) => ({
        item: it,
        ev: dificultadDe(it),
        sinCotizar: cotizaciones !== null && !conPrecio.has(it.id),
      }))
      .sort((a, b) =>
        Number(b.sinCotizar) - Number(a.sinCotizar) || b.ev.puntaje - a.ev.puntaje
      );
  }, [items, cotizaciones]);

  const sinCotizar = criticos.filter((c) => c.sinCotizar).length;

  if (!criticos.length) {
    return <div className="empty">No hay ítems marcados como especializados.</div>;
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Los que ningún mayorista va a tener</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
          Un grupo electrógeno dentro de una lista de 98 tableros no lo cotiza nadie: el
          vendedor ve que no es lo suyo y no responde. Estos salen de las solicitudes
          normales y van directo al fabricante, pidiendo <b>equivalente homologado</b> —
          que es lo que en la práctica destraba la compra.
        </p>
        <div className="statbar" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div>
            <span className="lbl">Especializados</span>
            <span className="sv mono" style={{ color: "var(--crit)" }}>{criticos.length}</span>
          </div>
          <div>
            <span className="lbl">Todavía sin cotizar</span>
            <span className="sv mono" style={{ color: cotizaciones === null ? "var(--faint)" : "var(--warn)" }}>
              {cotizaciones === null ? "…" : sinCotizar}
            </span>
          </div>
        </div>
      </div>

      <div className="filters">
        <span className="lbl">{marcados.size} marcados</span>
        <select
          className="sel"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          aria-label="Proveedor de la solicitud especial"
        >
          <option value="">Pedir los marcados a…</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.city ? ` — ${p.city}` : ""}</option>
          ))}
        </select>
        <button
          className="btn"
          disabled={!destino || marcados.size === 0 || creando !== null}
          onClick={() => {
            const prov = proveedores.find((p) => p.id === destino);
            if (!prov) return;
            onCrear(prov, criticos.filter((c) => marcados.has(c.item.id)).map((c) => c.item));
            setMarcados(new Set());
          }}
        >
          Crear solicitud especial
        </button>
        {marcados.size > 0 && (
          <button className="mini" onClick={() => setMarcados(new Set())}>Desmarcar</button>
        )}
      </div>

      <div className="revlist">
        {criticos.map(({ item, ev, sinCotizar: sc }) => {
          const def = DIFICULTAD_POR_ID[ev.nivel];
          const cat = item.category_id ? catPorId.get(item.category_id) : null;
          return (
            <button
              key={item.id}
              className="revrow"
              aria-selected={marcados.has(item.id)}
              onClick={() =>
                setMarcados((s) => {
                  const n = new Set(s);
                  n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                  return n;
                })
              }
            >
              <input
                type="checkbox"
                checked={marcados.has(item.id)}
                onChange={() => {}}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Marcar ${item.code}`}
              />
              <span className="mono" style={{ fontSize: 11, color: "var(--faint)", fontWeight: 700 }}>
                {item.code}
              </span>
              <span style={{ overflow: "hidden" }}>
                <span className="rd" style={{ display: "block" }} title={item.description}>
                  {item.description}
                </span>
                <span style={{ fontSize: 11, color: "var(--faint)" }}>
                  {cat?.name ?? "Sin categoría"} · {ev.razones.join(" · ")}
                </span>
              </span>
              <span style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {sc && (
                  <span
                    className="pill"
                    style={{ ["--pc" as string]: "var(--warn)", ["--pl" as string]: "var(--warn-line)", ["--pb" as string]: "var(--warn-soft)" }}
                  >
                    Sin cotizar
                  </span>
                )}
                <span
                  className="pill"
                  style={{ ["--pc" as string]: def.color, ["--pl" as string]: def.linea, ["--pb" as string]: def.fondo }}
                >
                  {def.lbl}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Vista 2 — Seguimiento
   --------------------------------------------------------------------------- */
function Pipeline({
  solicitudes, provPorId, catPorId, lineas, selId, onSeleccionar,
}: {
  solicitudes: QuoteRequest[];
  provPorId: Map<string, Supplier>;
  catPorId: Map<string, Category>;
  lineas: Record<string, string[]>;
  selId: string | null;
  onSeleccionar: (id: string) => void;
}) {
  const columnas = [
    { id: "borrador", lbl: "Sin enviar" },
    { id: "enviada", lbl: "Esperando respuesta" },
    { id: "respondida", lbl: "Respondieron" },
    { id: "cerrada", lbl: "Cerradas" },
  ] as const;

  if (!solicitudes.length) {
    return (
      <div className="empty">
        Todavía no hay solicitudes. Créelas desde la matriz por categoría.
      </div>
    );
  }

  return (
    <div className="pipe">
      {columnas.map((col) => {
        const lista = solicitudes.filter((s) => s.status === col.id);
        return (
          <div className="pipecol" key={col.id}>
            <span className="lbl">
              {col.lbl} <span className="mono">{lista.length}</span>
            </span>
            <div className="stack">
              {lista.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--faint)", padding: "6px 2px" }}>—</div>
              ) : (
                lista.map((s) => {
                  const est = ESTADO_SOLICITUD_POR_ID[s.status];
                  const tarde = requiereSeguimiento(s);
                  const dias = diasDesde(s.sent_at);
                  const n = (lineas[s.id] ?? []).length;
                  return (
                    <button
                      key={s.id}
                      className={`scard${tarde ? " is-tarde" : ""}`}
                      aria-current={s.id === selId}
                      style={{ ["--stripe" as string]: tarde ? "var(--crit)" : est.color }}
                      onClick={() => onSeleccionar(s.id)}
                    >
                      <div className="sn">{provPorId.get(s.supplier_id)?.name ?? "Proveedor"}</div>
                      <div className="sm">
                        {s.category_id ? catPorId.get(s.category_id)?.name ?? "—" : "—"} · {n} ítems
                      </div>
                      <div className="sm mono">
                        {s.code}
                        {tarde && dias !== null ? ` · ${dias} días sin respuesta` : ""}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Vista 3 — Cobertura
   --------------------------------------------------------------------------- */
function Cobertura({
  raices, itemsPorRaiz, provsPorRaiz, solicitudes, cotizaciones,
}: {
  raices: Category[];
  itemsPorRaiz: Map<string, Item[]>;
  provsPorRaiz: Map<string, Supplier[]>;
  solicitudes: QuoteRequest[];
  cotizaciones: Quote[] | null;
}) {
  if (cotizaciones === null) {
    return <div className="empty">Calculando la cobertura…</div>;
  }

  return (
    <div className="cats">
      {raices.map((cat) => {
        const lista = itemsPorRaiz.get(cat.id) ?? [];
        const provs = provsPorRaiz.get(cat.id) ?? [];
        const propias = solicitudes.filter((s) => s.category_id === cat.id);
        const metricas = metricasDeCategoria(lista, provs, cotizaciones, propias);
        const combo = combinacionRecomendada(lista, provs, cotizaciones);
        const huecos = itemsSinCotizar(lista, cotizaciones);

        return (
          <div className="catrow" key={cat.id} style={{ ["--stripe" as string]: "var(--accent)" }}>
            <div className="ch">
              <h3>{cat.name}</h3>
              <span className="cn mono">{lista.length} ítems</span>
              <span style={{ flex: 1 }} />
              <span className="cn">
                {lista.length - huecos.length}/{lista.length} con al menos un precio
              </span>
            </div>

            <div className="cbar">
              <i style={{ width: `${lista.length ? Math.round(((lista.length - huecos.length) / lista.length) * 100) : 0}%` }} />
            </div>

            {provs.length === 0 ? (
              <b style={{ fontSize: 12.5, color: "var(--crit)" }}>Sin proveedores asignados.</b>
            ) : (
              <>
                {combo.pasos.length > 0 && (
                  <div className={`note${combo.modo === "demostrada" ? " is-ok" : ""}`} style={{ marginBottom: 10 }}>
                    {combo.modo === "demostrada" ? (
                      <>
                        Con <b>{combo.pasos.length} proveedor(es)</b> —{" "}
                        {combo.pasos.map((p) => p.proveedor.name).join(", ")} — cubre el{" "}
                        <b>{pct(combo.pasos[combo.pasos.length - 1].porcentaje)}</b> de {cat.name}.
                      </>
                    ) : (
                      <>
                        Todavía no hay cotizaciones para medir cobertura real. Por especialidad
                        declarada, empiece por{" "}
                        <b>{combo.pasos.map((p) => p.proveedor.name).join(", ")}</b>.
                      </>
                    )}
                  </div>
                )}

                <span className="lbl">Proveedores de la categoría</span>
                <div className="rank" style={{ marginTop: 6 }}>
                  {metricas.map((m) => (
                    <div className="rankrow" key={m.proveedor.id}>
                      <span className="rn" title={m.proveedor.name}>{m.proveedor.name}</span>
                      <span className="rv mono" title="Cobertura demostrada: ítems que ya cotizó">
                        {m.itemsCotizados}/{m.itemsCategoria}
                      </span>
                      <span className="mono" style={{ color: "var(--faint)", fontSize: 11.5 }} title="Solicitudes respondidas / enviadas">
                        {m.tasaRespuesta === null
                          ? "sin enviar"
                          : `${m.solicitudesRespondidas}/${m.solicitudesEnviadas} resp.`}
                      </span>
                    </div>
                  ))}
                </div>

                {huecos.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <span className="lbl">Sin ninguna cotización ({huecos.length})</span>
                    <div className="codes" style={{ marginTop: 5 }}>
                      {huecos.slice(0, 40).map((i) => (
                        <span className="mono" key={i.id} title={i.description}>{i.code}</span>
                      ))}
                      {huecos.length > 40 && (
                        <span className="mono">+{huecos.length - 40} más</span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
