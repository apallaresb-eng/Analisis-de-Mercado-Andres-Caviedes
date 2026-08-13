import { useEffect, useState } from "react";
import type { Item, ItemQuoteStats, Project, Quote, Supplier } from "../lib/types";
import {
  ESTADOS, alertaDe, cop, contactoRapido, copiar, enlaceWhatsApp, mensajeItem,
} from "../lib/dominio";
import {
  actualizarItem, borrarCotizacion, cargarCotizaciones, crearCotizacion,
  desvincularProveedor, vincularProveedor,
} from "../lib/datos";
import { useToast } from "./Toast";
import { useAuth } from "../lib/auth";
import EditorProveedor from "./EditorProveedor";
import EditorItem from "./EditorItem";

interface Props {
  item: Item;
  proyecto: Project;
  /** Proveedores ya vinculados a este ítem. */
  proveedores: Supplier[];
  /** Todos los de la obra, para poder vincular más. */
  todosProveedores: Supplier[];
  stats?: ItemQuoteStats;
  onCambio: (it: Item) => void;
  onRecargarStats: () => void;
  /** Recarga completa: hace falta al cambiar vínculos o crear proveedores. */
  onRecargarTodo: () => void | Promise<void>;
}

export default function DetalleItem({
  item, proyecto, proveedores, todosProveedores, stats,
  onCambio, onRecargarStats, onRecargarTodo,
}: Props) {
  const { avisar, avisarError } = useToast();
  const { session, isAdmin } = useAuth();
  const a = alertaDe(item);

  const ctxProyecto = {
    nombre: proyecto.name,
    contrato: proyecto.contract_no,
    municipio: proyecto.municipality,
  };

  const [nota, setNota] = useState(item.note ?? "");
  const [cantidad, setCantidad] = useState(item.quantity?.toString() ?? "");
  const [cotizaciones, setCotizaciones] = useState<Quote[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [creandoProv, setCreandoProv] = useState(false);
  const [editandoProv, setEditandoProv] = useState<Supplier | null>(null);
  const [editandoItem, setEditandoItem] = useState(false);

  // Proveedores de la obra que todavía no están vinculados a este ítem.
  const vinculados = new Set(proveedores.map((p) => p.id));
  const disponibles = todosProveedores.filter((p) => !vinculados.has(p.id));

  async function vincular(supplierId: string) {
    try {
      await vincularProveedor(item.id, supplierId);
      await onRecargarTodo();
      avisar("Proveedor vinculado al ítem");
    } catch (e) {
      avisarError(e);
    }
  }

  async function quitarProveedor(p: Supplier) {
    try {
      await desvincularProveedor(item.id, p.id);
      await onRecargarTodo();
      avisar(`${p.name} ya no está en este ítem`);
    } catch (e) {
      avisarError(e);
    }
  }

  useEffect(() => {
    setNota(item.note ?? "");
    setCantidad(item.quantity?.toString() ?? "");
    setMostrarForm(false);
    cargarCotizaciones(item.id).then(setCotizaciones).catch(avisarError);
  }, [item.id, item.note, item.quantity, avisarError]);

  async function cambiarEstado(estado: Item["state"]) {
    try {
      onCambio(await actualizarItem(item.id, { state: estado }));
    } catch (e) {
      avisarError(e);
    }
  }

  async function guardarNota() {
    if ((item.note ?? "") === nota) return;
    try {
      onCambio(await actualizarItem(item.id, { note: nota || null }));
      avisar("Nota guardada");
    } catch (e) {
      avisarError(e);
    }
  }

  async function guardarCantidad() {
    const v = cantidad.trim() === "" ? null : Number(cantidad.replace(",", "."));
    if (v !== null && !Number.isFinite(v)) {
      avisarError(new Error("La cantidad debe ser un número."));
      return;
    }
    if (item.quantity === v) return;
    try {
      onCambio(await actualizarItem(item.id, { quantity: v }));
      avisar("Cantidad guardada");
    } catch (e) {
      avisarError(e);
    }
  }

  async function seleccionar(q: Quote | null) {
    try {
      onCambio(await actualizarItem(item.id, { selected_quote_id: q?.id ?? null }));
      avisar(q ? "Cotización marcada como elegida" : "Selección quitada");
    } catch (e) {
      avisarError(e);
    }
  }

  async function eliminar(q: Quote) {
    if (!confirm("¿Borrar esta cotización?")) return;
    try {
      await borrarCotizacion(q.id);
      setCotizaciones(await cargarCotizaciones(item.id));
      onRecargarStats();
      avisar("Cotización borrada");
    } catch (e) {
      avisarError(e);
    }
  }

  const nombreProv = (id: string | null) =>
    proveedores.find((p) => p.id === id)?.name ?? "Proveedor no indicado";

  return (
    <div className="detail">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="lbl">
          {item.code} · ítem {item.seq} · {item.category}
        </span>
        {isAdmin && (
          <button className="mini" onClick={() => setEditandoItem(true)}>Editar ficha</button>
        )}
      </div>
      <h2>{item.description}</h2>
      {item.spec && (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 5, lineHeight: 1.5 }}>
          {item.spec}
        </div>
      )}

      <div className="dgrid">
        <div>
          <span className="lbl">Unidad</span>
          <span className="v mono">{item.unit ?? "—"}</span>
        </div>
        <div>
          <span className="lbl">IVA</span>
          <span className="v mono">{item.iva_treatment ?? "—"}</span>
        </div>
        <div>
          <span className="lbl">Referencia</span>
          <span className="v mono">
            {item.ref_price !== null ? (
              <>
                {cop(item.ref_price)}{" "}
                <small style={{ fontWeight: 500, color: "var(--faint)", fontSize: 10.5 }}>
                  {item.ref_price_unit}
                </small>
              </>
            ) : (
              <span style={{ color: "var(--warn)" }}>Sin precio</span>
            )}
          </span>
        </div>
      </div>

      {item.ref_product && (
        <div className="sec">
          <span className="lbl">Producto de referencia (precio publicado)</span>
          <div className="note is-ok">
            <b>{item.ref_product}</b>
            <br />
            <b>No incluye flete a {proyecto.municipality ?? "la obra"}.</b>
          </div>
        </div>
      )}

      <div className="sec">
        <span className="lbl">{a.t} — observación</span>
        <div className={`note${a.sev <= 1 ? " is-crit" : ""}`}>{item.observation}</div>
      </div>

      {/* --- gestión ---------------------------------------------------- */}
      <div className="sec">
        <span className="lbl">Estado de la gestión</span>
        <div className="states">
          {ESTADOS.map((e) => (
            <button
              key={e.id}
              className="st"
              aria-pressed={item.state === e.id}
              style={{ ["--sc" as string]: e.color }}
              title={e.desc}
              onClick={() => void cambiarEstado(e.id)}
            >
              {e.lbl}
            </button>
          ))}
        </div>

        <input
          className="field"
          style={{ marginTop: 8 }}
          placeholder={`Cantidad en ${item.unit ?? "unidades"}`}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          onBlur={() => void guardarCantidad()}
          inputMode="decimal"
        />
        <input
          className="field"
          style={{ marginTop: 8 }}
          placeholder="Nota (vigencia, tiempo de entrega, con quién se habló…)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onBlur={() => void guardarNota()}
        />
      </div>

      {/* --- cotizaciones ------------------------------------------------ */}
      <div className="sec">
        <span className="lbl">Cotizaciones recibidas ({cotizaciones.length})</span>

        {stats && stats.n_quotes >= 2 && (
          <div className="statbar">
            <div>
              <span className="lbl">Mínimo</span>
              <span className="sv mono">{cop(stats.min_delivered)}</span>
            </div>
            <div>
              <span className="lbl">Mediana</span>
              <span className="sv mono" style={{ color: "var(--accent)" }}>
                {cop(stats.median_delivered)}
              </span>
            </div>
            <div>
              <span className="lbl">Promedio</span>
              <span className="sv mono">{cop(stats.avg_delivered)}</span>
            </div>
            <div>
              <span className="lbl">Máximo</span>
              <span className="sv mono">{cop(stats.max_delivered)}</span>
            </div>
          </div>
        )}

        {cotizaciones.length > 0 && (
          <div className="quotes" style={{ marginTop: 8 }}>
            {cotizaciones.map((q) => (
              <div key={q.id} className={`quote${item.selected_quote_id === q.id ? " is-sel" : ""}`}>
                <div>
                  <div className="qn">{nombreProv(q.supplier_id)}</div>
                  <div className="qd">
                    {q.total_delivered !== null ? "Puesto en obra" : "Sin total"}
                    {q.valid_until ? ` · vigente hasta ${q.valid_until}` : ""}
                    {q.lead_time_days !== null ? ` · ${q.lead_time_days} días` : ""}
                  </div>
                </div>
                <div>
                  <div className="qp mono">{cop(q.total_delivered ?? q.price_with_iva)}</div>
                  <div className="btns" style={{ marginTop: 4, justifyContent: "flex-end" }}>
                    <button
                      className="mini"
                      onClick={() => void seleccionar(item.selected_quote_id === q.id ? null : q)}
                    >
                      {item.selected_quote_id === q.id ? "Quitar" : "Elegir"}
                    </button>
                    {isAdmin && (
                      <button className="mini" onClick={() => void eliminar(q)}>
                        Borrar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!mostrarForm ? (
          <div className="btns">
            <button className="btn ghost" onClick={() => setMostrarForm(true)}>
              + Registrar cotización recibida
            </button>
          </div>
        ) : (
          <FormCotizacion
            item={item}
            proveedores={proveedores}
            userId={session!.user.id}
            onCancelar={() => setMostrarForm(false)}
            onGuardado={async () => {
              setMostrarForm(false);
              setCotizaciones(await cargarCotizaciones(item.id));
              onRecargarStats();
              if (item.state === "pendiente" || item.state === "contactado") {
                onCambio(await actualizarItem(item.id, { state: "cotizado" }));
              }
              avisar("Cotización registrada");
            }}
          />
        )}
      </div>

      {/* --- proveedores -------------------------------------------------- */}
      <div className="sec">
        <span className="lbl">A quién llamar — {proveedores.length} proveedores</span>

        {proveedores.length < 4 && (
          <div className="note" style={{ marginBottom: 8, fontSize: 12 }}>
            Con pocos proveedores basta que uno diga «eso no lo manejamos» para quedarse
            sin opciones. Agregue los que vaya encontrando.
          </div>
        )}

        {proveedores.map((p) => (
          <div className="prov" key={p.id}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <div className="pn" style={{ flex: 1 }}>{p.name}</div>
              <button className="mini" onClick={() => setEditandoProv(p)}>Corregir</button>
              <button className="mini" onClick={() => void quitarProveedor(p)}>Quitar</button>
            </div>
            <div className="pc">
              {p.city}
              {p.kind ? ` · ${p.kind}` : ""}
            </div>
            <div className="fast">
              <span className="lbl" style={{ color: "var(--faint)" }}>
                Contacto más rápido
              </span>
              <span>{contactoRapido(p)}</span>
            </div>
            <div className="links">
              {/* Un clic abre WhatsApp con la solicitud de cotización ya escrita
                  para ESTE ítem: sin copiar, cambiar de app ni buscar el contacto. */}
              {enlaceWhatsApp(p, mensajeItem(item, ctxProyecto)) && (
                <a
                  className="mini"
                  href={enlaceWhatsApp(p, mensajeItem(item, ctxProyecto))!}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ borderColor: "var(--ok-line)", color: "var(--ok)", fontWeight: 700 }}
                  onClick={() => void cambiarEstado("contactado")}
                >
                  Cotizar por WhatsApp
                </a>
              )}
              {p.web?.startsWith("http") && (
                <a className="mini" href={p.web} target="_blank" rel="noopener noreferrer">
                  Sitio web
                </a>
              )}
              {p.email?.includes("@") && (
                <a
                  className="mini"
                  href={`mailto:${p.email}?subject=${encodeURIComponent(
                    `Solicitud de cotización — ${item.code} ${item.description.slice(0, 60)}`
                  )}&body=${encodeURIComponent(mensajeItem(item, ctxProyecto))}`}
                >
                  Cotizar por correo
                </a>
              )}
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
          <select
            className="field" style={{ flex: "1 1 180px" }}
            value="" aria-label="Vincular un proveedor existente"
            onChange={(e) => { if (e.target.value) void vincular(e.target.value); }}
          >
            <option value="">+ Vincular proveedor de la obra…</option>
            {disponibles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.city ? ` — ${p.city}` : ""}</option>
            ))}
          </select>
          <button className="btn ghost" onClick={() => setCreandoProv(true)}>
            + Proveedor nuevo
          </button>
        </div>
      </div>

      {/* --- mensaje ------------------------------------------------------ */}
      <div className="sec">
        <span className="lbl">Mensaje para enviar</span>
        <textarea
          className="msg"
          readOnly
          value={mensajeItem(item, ctxProyecto)}
        />
        <div className="btns">
          <button
            className="btn"
            onClick={async () => {
              const ok = await copiar(mensajeItem(item, ctxProyecto));
              ok ? avisar("Mensaje copiado") : avisarError(new Error("No se pudo copiar. Seleccione el texto manualmente."));
            }}
          >
            Copiar mensaje
          </button>
          <button className="btn ghost" onClick={() => void cambiarEstado("contactado")}>
            Marcar como contactado
          </button>
        </div>
      </div>

      {creandoProv && (
        <EditorProveedor
          proyectoId={item.project_id}
          onCerrar={() => setCreandoProv(false)}
          onGuardado={async (nuevo) => {
            // Se crea y se vincula de una vez: si lo está agregando desde un
            // ítem, es porque lo quiere en ese ítem.
            await vincularProveedor(item.id, nuevo.id);
            await onRecargarTodo();
          }}
        />
      )}

      {editandoProv && (
        <EditorProveedor
          proyectoId={item.project_id}
          proveedor={editandoProv}
          onCerrar={() => setEditandoProv(null)}
          onGuardado={onRecargarTodo}
          onBorrado={onRecargarTodo}
        />
      )}

      {editandoItem && (
        <EditorItem
          proyectoId={item.project_id}
          item={item}
          onCerrar={() => setEditandoItem(false)}
          onGuardado={onCambio}
          onBorrado={onRecargarTodo}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Formulario de cotización
   -------------------------------------------------------------------------- */
function FormCotizacion({
  item, proveedores, userId, onCancelar, onGuardado,
}: {
  item: Item;
  proveedores: Supplier[];
  userId: string;
  onCancelar: () => void;
  onGuardado: () => void | Promise<void>;
}) {
  const { avisarError } = useToast();
  const [proveedor, setProveedor] = useState(proveedores[0]?.id ?? "");
  const [sinIva, setSinIva] = useState("");
  const [flete, setFlete] = useState("");
  const [vigencia, setVigencia] = useState("");
  const [dias, setDias] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const num = (s: string) => {
    const t = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const v = Number(t);
    return t === "" || !Number.isFinite(v) ? null : v;
  };

  // El IVA se calcula, no se teclea: menos errores de digitación.
  const base = num(sinIva);
  const iva = base !== null ? Math.round(base * 0.19) : null;
  const conIva = base !== null ? base + (iva ?? 0) : null;
  const fleteN = num(flete);
  const total = conIva !== null ? conIva + (fleteN ?? 0) : null;

  async function guardar() {
    if (base === null) {
      avisarError(new Error("Escriba al menos el precio antes de IVA."));
      return;
    }
    setGuardando(true);
    try {
      await crearCotizacion(
        {
          item_id: item.id,
          supplier_id: proveedor || null,
          price_no_iva: base,
          iva_amount: iva,
          price_with_iva: conIva,
          freight: fleteN,
          total_delivered: total,
          price_unit: item.unit,
          valid_until: vigencia || null,
          lead_time_days: dias ? Number(dias) : null,
          notes: notas || null,
        },
        userId
      );
      await onGuardado();
    } catch (e) {
      avisarError(e);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 8, background: "var(--surface-2)" }}>
      <span className="lbl">Nueva cotización</span>

      <select
        className="field"
        style={{ marginTop: 8 }}
        value={proveedor}
        onChange={(e) => setProveedor(e.target.value)}
      >
        <option value="">— Proveedor no listado —</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <input className="field" style={{ marginTop: 8 }} inputMode="decimal"
        placeholder={`Precio antes de IVA (por ${item.unit ?? "unidad"})`}
        value={sinIva} onChange={(e) => setSinIva(e.target.value)} />

      <input className="field" style={{ marginTop: 8 }} inputMode="decimal"
        placeholder="Flete hasta la obra (dejar vacío si aún no lo dan)"
        value={flete} onChange={(e) => setFlete(e.target.value)} />

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input className="field" type="date" value={vigencia}
          onChange={(e) => setVigencia(e.target.value)} title="Vigencia de la oferta" />
        <input className="field" inputMode="numeric" placeholder="Días de entrega"
          value={dias} onChange={(e) => setDias(e.target.value)} />
      </div>

      <input className="field" style={{ marginTop: 8 }} placeholder="Notas"
        value={notas} onChange={(e) => setNotas(e.target.value)} />

      {base !== null && (
        <div className="statbar" style={{ marginTop: 10, gridTemplateColumns: "repeat(3,1fr)" }}>
          <div>
            <span className="lbl">IVA 19%</span>
            <span className="sv mono">{cop(iva)}</span>
          </div>
          <div>
            <span className="lbl">Con IVA</span>
            <span className="sv mono">{cop(conIva)}</span>
          </div>
          <div>
            <span className="lbl">Puesto en obra</span>
            <span className="sv mono" style={{ color: fleteN === null ? "var(--warn)" : "var(--ok)" }}>
              {fleteN === null ? "falta flete" : cop(total)}
            </span>
          </div>
        </div>
      )}

      <div className="btns">
        <button className="btn" onClick={() => void guardar()} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar cotización"}
        </button>
        <button className="btn ghost" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
