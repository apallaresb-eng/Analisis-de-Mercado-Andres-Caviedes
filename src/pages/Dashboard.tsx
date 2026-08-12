import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { cargarProyecto, listarProyectos, type DatosProyecto } from "../lib/datos";
import type { Item, Project } from "../lib/types";
import { ESTADOS, ESTADO_POR_ID, alertaDe, cop, prioridad } from "../lib/dominio";
import { ToastProvider, useToast } from "../components/Toast";
import DetalleItem from "../components/DetalleItem";
import ListaLlamadas from "../components/ListaLlamadas";
import Alertas from "../components/Alertas";
import CuentaModal from "../components/CuentaModal";

type Vista = "cola" | "llamadas" | "alertas" | "proyecto";
type Filtro = "todos" | "sinprecio" | "conprecio" | "rojo" | "abierto";

export default function Dashboard() {
  return (
    <ToastProvider>
      <Contenido />
    </ToastProvider>
  );
}

function Contenido() {
  const { profile, isAdmin, signOut } = useAuth();
  const { avisarError } = useToast();

  const [proyectos, setProyectos] = useState<Project[]>([]);
  const [proyectoId, setProyectoId] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosProyecto | null>(null);
  const [cargando, setCargando] = useState(true);

  const [vista, setVista] = useState<Vista>("cola");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [categoria, setCategoria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [mostrarCuenta, setMostrarCuenta] = useState(false);

  // --- carga inicial --------------------------------------------------------
  useEffect(() => {
    listarProyectos()
      .then((ps) => {
        setProyectos(ps);
        setProyectoId((actual) => actual ?? ps.find((p) => !p.archived_at)?.id ?? ps[0]?.id ?? null);
        if (ps.length === 0) setCargando(false);
      })
      .catch((e) => {
        avisarError(e);
        setCargando(false);
      });
  }, [avisarError]);

  const recargar = useCallback(async () => {
    if (!proyectoId) return;
    try {
      const d = await cargarProyecto(proyectoId);
      setDatos(d);
      setSeleccion((s) => (s && d.items.some((i) => i.id === s) ? s : d.items[0]?.id ?? null));
    } catch (e) {
      avisarError(e);
    } finally {
      setCargando(false);
    }
  }, [proyectoId, avisarError]);

  useEffect(() => {
    if (!proyectoId) return;
    setCargando(true);
    void recargar();
  }, [proyectoId, recargar]);

  /** Reemplaza un ítem en memoria sin recargar todo el proyecto. */
  const aplicarCambio = useCallback((it: Item) => {
    setDatos((d) => (d ? { ...d, items: d.items.map((x) => (x.id === it.id ? it : x)) } : d));
  }, []);

  const recargarStats = useCallback(() => void recargar(), [recargar]);

  // --- métricas -------------------------------------------------------------
  const conteos = useMemo(() => {
    const c = {
      pendiente: 0, contactado: 0, cotizado: 0, cerrado: 0, replantear: 0,
      conRef: 0, sinRef: 0, rojo: 0, abierto: 0, total: 0,
    };
    for (const it of datos?.items ?? []) {
      c.total++;
      c[it.state]++;
      it.ref_price !== null ? c.conRef++ : c.sinRef++;
      if (alertaDe(it).sev <= 1) c.rojo++;
      if (it.state !== "cerrado" && it.state !== "replantear") c.abierto++;
    }
    return c;
  }, [datos]);

  const pct = conteos.total
    ? Math.round(((conteos.cerrado + conteos.replantear) / conteos.total) * 100)
    : 0;

  const categorias = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of datos?.items ?? []) {
      if (it.category) m.set(it.category, (m.get(it.category) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [datos]);

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return (datos?.items ?? [])
      .filter((it) => {
        if (filtro === "sinprecio" && it.ref_price !== null) return false;
        if (filtro === "conprecio" && it.ref_price === null) return false;
        if (filtro === "rojo" && alertaDe(it).sev > 1) return false;
        if (filtro === "abierto" && (it.state === "cerrado" || it.state === "replantear")) return false;
        if (categoria && it.category !== categoria) return false;
        if (t && !`${it.code} ${it.description} ${it.category ?? ""} ${it.spec ?? ""}`.toLowerCase().includes(t))
          return false;
        return true;
      })
      .sort((a, b) => prioridad(a) - prioridad(b) || (a.seq ?? 0) - (b.seq ?? 0));
  }, [datos, filtro, categoria, busqueda]);

  const itemSel = datos?.items.find((i) => i.id === seleccion) ?? null;
  const proyecto = datos?.proyecto ?? null;

  const provsDelItem = useMemo(() => {
    if (!datos || !itemSel) return [];
    const ids = new Set(datos.vinculos[itemSel.id] ?? []);
    return datos.proveedores.filter((p) => ids.has(p.id));
  }, [datos, itemSel]);

  // --- render ---------------------------------------------------------------
  if (cargando) return <div className="center-note">Cargando el proyecto…</div>;

  if (proyectos.length === 0) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Sin proyectos</h1>
          <p className="sub">
            {isAdmin
              ? "Todavía no hay ninguna obra cargada. Aplique el SQL de siembra o importe un Excel."
              : "El administrador aún no ha cargado ninguna obra."}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" onClick={() => setMostrarCuenta(true)}>Mi cuenta</button>
            <button className="btn ghost" onClick={() => void signOut()}>Cerrar sesión</button>
          </div>
        </div>
        {mostrarCuenta && <CuentaModal onCerrar={() => setMostrarCuenta(false)} />}
      </div>
    );
  }

  return (
    <>
      <div className="bar">
        <div className="bar-in">
          <div className="brand">
            <h1>{proyecto?.name ?? "Control de compras"}</h1>
            <div className="sub">
              {proyecto?.contract_no ? `Contrato ${proyecto.contract_no} · ` : ""}
              {conteos.total} ítems · {profile?.full_name || profile?.email}
              {isAdmin ? " (administrador)" : ""}
            </div>
          </div>

          {proyectos.length > 1 && (
            <select
              className="sel"
              value={proyectoId ?? ""}
              onChange={(e) => setProyectoId(e.target.value)}
              aria-label="Cambiar de obra"
            >
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived_at ? " (archivada)" : ""}
                </option>
              ))}
            </select>
          )}

          <div className="gprog">
            <div>
              <div className="lbl">Gestión cerrada</div>
              <div className="num mono">{pct}%</div>
            </div>
            <div className="gbar">
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>

          <button className="btn ghost" onClick={() => setMostrarCuenta(true)}>Mi cuenta</button>
          <button className="btn ghost" onClick={() => void signOut()}>Salir</button>
        </div>
      </div>

      {mostrarCuenta && <CuentaModal onCerrar={() => setMostrarCuenta(false)} />}

      <div className="wrap">
        <div className="metrics">
          <Tile n={conteos.total} cap="Ítems en el estudio" tone="var(--ink)" stripe="var(--line)" />
          <Tile n={conteos.conRef} cap="Con precio de referencia publicado" tone="var(--ok)" stripe="var(--ok)" />
          <Tile n={conteos.sinRef} cap="Sin ningún precio — cotizar desde cero" tone="var(--warn)" stripe="var(--warn)" />
          <Tile n={conteos.rojo} cap="Críticos: necesitan decisión técnica" tone="var(--crit)" stripe="var(--crit)" />
          <Tile n={conteos.cerrado} sub={`/${conteos.total}`} cap="Cerrados con precio aprobado" tone="var(--accent)" stripe="var(--accent)" />
        </div>

        <div className="funnel">
          <span className="lbl">Avance de la gestión de cotizaciones</span>
          <div className="fbar">
            {ESTADOS.map((e) => (
              <span
                key={e.id}
                style={{ width: `${(conteos[e.id] / (conteos.total || 1)) * 100}%`, background: e.color }}
                title={`${e.lbl}: ${conteos[e.id]}`}
              />
            ))}
          </div>
          <div className="fkey">
            {ESTADOS.map((e) => (
              <b key={e.id}>
                <i className="dot" style={{ background: e.color }} />
                {e.lbl} <span className="mono">{conteos[e.id]}</span>
              </b>
            ))}
          </div>
        </div>

        <div className="tabs" role="tablist">
          {([
            ["cola", "Cola de trabajo"],
            ["llamadas", "A quién llamo"],
            ["alertas", "Alertas y notas"],
            ["proyecto", "La obra"],
          ] as const).map(([v, lbl]) => (
            <button key={v} role="tab" aria-selected={vista === v} onClick={() => setVista(v)}>
              {lbl}
            </button>
          ))}
        </div>

        {vista === "cola" && (
          <>
            <div className="filters">
              <input
                className="search"
                type="search"
                placeholder="Buscar por código, descripción o categoría…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Buscar ítems"
              />
              {([
                ["todos", "Todos", conteos.total],
                ["sinprecio", "Sin precio", conteos.sinRef],
                ["conprecio", "Con referencia", conteos.conRef],
                ["rojo", "Críticos", conteos.rojo],
                ["abierto", "Sin cerrar", conteos.abierto],
              ] as const).map(([f, lbl, n]) => (
                <button key={f} className="chip" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
                  {lbl} <span className="c mono">{n}</span>
                </button>
              ))}
              <select className="sel" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Filtrar por categoría">
                <option value="">Todas las categorías</option>
                {categorias.map(([c, n]) => (
                  <option key={c} value={c}>
                    {c} ({n})
                  </option>
                ))}
              </select>
            </div>

            <div className="split">
              <div className="list">
                {visibles.length === 0 ? (
                  <div className="empty">Ningún ítem coincide con el filtro.</div>
                ) : (
                  visibles.map((it) => {
                    const st = ESTADO_POR_ID[it.state];
                    const a = alertaDe(it);
                    const nProv = (datos?.vinculos[it.id] ?? []).length;
                    return (
                      <button
                        key={it.id}
                        className="row"
                        aria-current={it.id === seleccion}
                        style={{ ["--stripe" as string]: st.color }}
                        onClick={() => setSeleccion(it.id)}
                      >
                        <span className="code mono">{it.code}</span>
                        <span>
                          <span className="ttl">{it.description}</span>
                          <span className="meta">
                            {it.category} · {it.unit} · {nProv} proveedores
                            {it.quantity !== null ? ` · cant. ${it.quantity}` : ""}
                          </span>
                        </span>
                        <span className="right">
                          <span className="pill" style={{ ["--pc" as string]: st.color, ["--pl" as string]: st.color }}>
                            {st.lbl}
                          </span>
                          {it.ref_price !== null ? (
                            <span className="price mono">
                              {cop(it.ref_price)} <small>{it.ref_price_unit}</small>
                            </span>
                          ) : (
                            <span className="price mono" style={{ color: "var(--warn)" }}>
                              — <small>sin precio</small>
                            </span>
                          )}
                          {a.sev <= 1 && (
                            <span className="pill" style={{ ["--pc" as string]: a.c, ["--pl" as string]: a.l, ["--pb" as string]: a.b }}>
                              {a.t}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {itemSel && proyecto ? (
                <DetalleItem
                  item={itemSel}
                  proyecto={proyecto}
                  proveedores={provsDelItem}
                  stats={datos?.stats[itemSel.id]}
                  onCambio={aplicarCambio}
                  onRecargarStats={recargarStats}
                />
              ) : (
                <div className="detail">
                  <div className="empty">Seleccione un ítem de la lista.</div>
                </div>
              )}
            </div>
          </>
        )}

        {vista === "llamadas" && datos && proyecto && (
          <ListaLlamadas
            items={datos.items}
            proveedores={datos.proveedores}
            vinculos={datos.vinculos}
            proyecto={proyecto}
            onRecargar={recargar}
          />
        )}

        {vista === "alertas" && datos && <Alertas items={datos.items} />}

        {vista === "proyecto" && proyecto && (
          <div className="card">
            <span className="lbl">Ficha de la obra</span>
            <h3 style={{ fontSize: 17, margin: "4px 0 12px" }}>{proyecto.name}</h3>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13 }}>
              <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Contrato</dt>
              <dd style={{ margin: 0 }} className="mono">{proyecto.contract_no ?? "—"}</dd>
              <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Contratista</dt>
              <dd style={{ margin: 0 }}>{proyecto.contractor ?? "—"}</dd>
              <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Interventoría</dt>
              <dd style={{ margin: 0 }}>{proyecto.supervision ?? "—"}</dd>
              <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Ubicación</dt>
              <dd style={{ margin: 0 }}>
                {[proyecto.municipality, proyecto.department].filter(Boolean).join(", ") || "—"}
              </dd>
              <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Proveedores</dt>
              <dd style={{ margin: 0 }} className="mono">{datos?.proveedores.length ?? 0}</dd>
            </dl>
            {proyecto.notes && (
              <div className="note" style={{ marginTop: 14 }}>
                {proyecto.notes}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Tile({ n, sub, cap, tone, stripe }: {
  n: number; sub?: string; cap: string; tone: string; stripe: string;
}) {
  return (
    <div className="tile" style={{ ["--tone" as string]: tone, ["--stripe" as string]: stripe }}>
      <div className="n mono">
        {n}
        {sub && <small>{sub}</small>}
      </div>
      <div className="cap">{cap}</div>
    </div>
  );
}
