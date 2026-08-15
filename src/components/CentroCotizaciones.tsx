import { useCallback, useEffect, useMemo, useState } from "react";
import type { DatosProyecto } from "../lib/datos";
import {
  cargarCotizacionesDeProyecto, crearSolicitud, siguienteCodigoSolicitud,
  vincularProveedorCategoria,
} from "../lib/datos";
import type { Category, Item, Quote, QuoteRequest, Supplier } from "../lib/types";
import {
  ESTADO_SOLICITUD_POR_ID, diasDesde, mensajeSolicitud, requiereSeguimiento,
} from "../lib/dominio";
import { combinacionRecomendada, itemsSinCotizar, metricasDeCategoria, pct } from "../lib/cobertura";
import { useAuth } from "../lib/auth";
import { useToast } from "./Toast";
import PanelSolicitud from "./PanelSolicitud";

type Vista = "matriz" | "pipeline" | "cobertura";

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

  /**
   * Ítems de cada categoría raíz, incluyendo los de sus subcategorías: pedir
   * "PVC" tiene que traer también lo que esté clasificado en "PVC > sanitario".
   */
  const itemsPorRaiz = useMemo(() => {
    const raizDe = new Map<string, string>();
    for (const c of categorias) raizDe.set(c.id, c.parent_id ?? c.id);

    const m = new Map<string, Item[]>();
    for (const c of raices) m.set(c.id, []);
    for (const it of items) {
      if (!it.category_id) continue;
      const raiz = raizDe.get(it.category_id);
      if (raiz) m.get(raiz)?.push(it);
    }
    return m;
  }, [items, categorias, raices]);

  /** Proveedores de cada raíz: los suyos más los declarados en sus subcategorías. */
  const provsPorRaiz = useMemo(() => {
    const m = new Map<string, Supplier[]>();
    for (const c of raices) {
      const ids = new Set(coberturas[c.id] ?? []);
      for (const sub of categorias.filter((x) => x.parent_id === c.id)) {
        for (const p of coberturas[sub.id] ?? []) ids.add(p);
      }
      m.set(
        c.id,
        [...ids].map((id) => provPorId.get(id)).filter((p): p is Supplier => !!p)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    return m;
  }, [raices, categorias, coberturas, provPorId]);

  /** Solicitud existente para cada par (categoría raíz, proveedor). */
  const solicitudPorCelda = useMemo(() => {
    const m = new Map<string, QuoteRequest>();
    for (const s of solicitudes) {
      if (!s.category_id) continue;
      const raiz = catPorId.get(s.category_id)?.parent_id ?? s.category_id;
      const k = `${raiz}|${s.supplier_id}`;
      // Si hay varias, se muestra la más reciente: solicitudes ya viene ordenada.
      if (!m.has(k)) m.set(k, s);
    }
    return m;
  }, [solicitudes, catPorId]);

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

  /** Crea la solicitud de una celda vacía y la deja abierta para revisarla. */
  async function abrirCelda(cat: Category, prov: Supplier) {
    const clave = `${cat.id}|${prov.id}`;
    const existente = solicitudPorCelda.get(clave);
    if (existente) { setSelId(existente.id); return; }

    const lista = itemsPorRaiz.get(cat.id) ?? [];
    if (!lista.length) {
      avisarError(new Error(`"${cat.name}" no tiene ítems clasificados todavía.`));
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
          scope: "categoria",
          code: codigo,
          message_text: mensajeSolicitud(lista, ctx, cat.name),
        },
        lista.map((i) => i.id),
        Object.fromEntries(lista.map((i) => [i.id, i.quantity])),
        session.user.id
      );
      await onRecargar();
      setSelId(nueva.id);
      avisar(`Solicitud ${codigo} creada con ${lista.length} ítems`);
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
          ["matriz", "Matriz por categoría"],
          ["pipeline", "Seguimiento"],
          ["cobertura", "Cobertura"],
        ] as const).map(([v, lbl]) => (
          <button key={v} className="chip" aria-pressed={vista === v} onClick={() => setVista(v)}>
            {lbl}
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
              itemsPorRaiz={itemsPorRaiz}
              provsPorRaiz={provsPorRaiz}
              solicitudPorCelda={solicitudPorCelda}
              proveedores={proveedores}
              creando={creando}
              selId={selId}
              catAbierta={catAbierta}
              onAbrirCelda={abrirCelda}
              onToggleCat={(id) => setCatAbierta((a) => (a === id ? null : id))}
              onAgregarProveedor={agregarProveedor}
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
              itemsPorRaiz={itemsPorRaiz}
              provsPorRaiz={provsPorRaiz}
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
  raices, itemsPorRaiz, provsPorRaiz, solicitudPorCelda, proveedores, creando, selId,
  catAbierta, onAbrirCelda, onToggleCat, onAgregarProveedor,
}: {
  raices: Category[];
  itemsPorRaiz: Map<string, Item[]>;
  provsPorRaiz: Map<string, Supplier[]>;
  solicitudPorCelda: Map<string, QuoteRequest>;
  proveedores: Supplier[];
  creando: string | null;
  selId: string | null;
  catAbierta: string | null;
  onAbrirCelda: (c: Category, p: Supplier) => void;
  onToggleCat: (id: string) => void;
  onAgregarProveedor: (c: Category, supplierId: string) => void;
}) {
  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Una solicitud por categoría y proveedor</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
          Cada casilla es una solicitud independiente: pedirle <b>PVC</b> a un proveedor no
          cambia en nada lo que le falte pedirle de <b>Eléctricos</b>, ni afecta a los demás
          proveedores. Nada desaparece al enviar — el estado queda a la vista.
        </p>
      </div>

      <div className="cats">
        {raices.map((cat) => {
          const lista = itemsPorRaiz.get(cat.id) ?? [];
          const provs = provsPorRaiz.get(cat.id) ?? [];
          const enviadas = provs.filter(
            (p) => solicitudPorCelda.get(`${cat.id}|${p.id}`)?.sent_at
          ).length;
          const respondidas = provs.filter(
            (p) => solicitudPorCelda.get(`${cat.id}|${p.id}`)?.responded_at
          ).length;
          const avance = provs.length ? enviadas / provs.length : 0;
          const hueco = provs.length === 0;
          const abierta = catAbierta === cat.id;
          const disponibles = proveedores.filter((p) => !provs.some((x) => x.id === p.id));

          return (
            <div
              className={`catrow${hueco ? " is-hueco" : ""}`}
              key={cat.id}
              style={{ ["--stripe" as string]: hueco ? "var(--crit)" : "var(--accent)" }}
            >
              <div className="ch">
                <h3>{cat.name}</h3>
                <span className="cn mono">{lista.length} ítems</span>
                <span style={{ flex: 1 }} />
                <span className="cn">
                  {enviadas}/{provs.length} enviadas · {respondidas} respondieron
                </span>
              </div>

              {!hueco && (
                <div className="cbar">
                  <i style={{ width: `${Math.round(avance * 100)}%` }} />
                </div>
              )}

              {hueco ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                  <b style={{ fontSize: 12.5, color: "var(--crit)" }}>
                    Sin proveedores: esta categoría no se puede cotizar.
                  </b>
                  <button className="mini" onClick={() => onToggleCat(cat.id)}>
                    Asignar proveedores
                  </button>
                </div>
              ) : (
                <div className="cells">
                  {provs.map((p) => {
                    const s = solicitudPorCelda.get(`${cat.id}|${p.id}`);
                    const est = s ? ESTADO_SOLICITUD_POR_ID[s.status] : null;
                    const tarde = s ? requiereSeguimiento(s) : false;
                    const dias = s?.sent_at ? diasDesde(s.sent_at) : null;
                    return (
                      <button
                        key={p.id}
                        className={`cell${s ? "" : " is-nueva"}${tarde ? " is-alerta" : ""}`}
                        aria-current={s ? s.id === selId : undefined}
                        disabled={creando === `${cat.id}|${p.id}`}
                        style={{
                          ["--cc" as string]: est?.color ?? "var(--faint)",
                          ["--cl" as string]: s && s.id === selId ? "var(--accent)" : est?.linea ?? "var(--line)",
                          ["--cb" as string]: est?.fondo ?? "var(--surface)",
                        }}
                        title={s ? `${s.code} · ${est!.lbl}` : `Crear solicitud de ${cat.name} para ${p.name}`}
                        onClick={() => onAbrirCelda(cat, p)}
                      >
                        <i className="cd" />
                        {p.name}
                        {s
                          ? <span className="cx">{tarde && dias !== null ? `${dias}d` : est!.lbl}</span>
                          : <span className="cx">+</span>}
                      </button>
                    );
                  })}
                  <button className="cell is-nueva" onClick={() => onToggleCat(cat.id)} title="Agregar un proveedor a esta categoría">
                    + Proveedor
                  </button>
                </div>
              )}

              {abierta && (
                <div style={{ marginTop: 10 }}>
                  <span className="lbl">Agregar un proveedor que atienda {cat.name}</span>
                  <select
                    className="field"
                    style={{ marginTop: 4 }}
                    value=""
                    aria-label={`Agregar proveedor a ${cat.name}`}
                    onChange={(e) => { if (e.target.value) onAgregarProveedor(cat, e.target.value); }}
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
