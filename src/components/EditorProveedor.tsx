import { useState, type FormEvent } from "react";
import type { Category, ContactConfidence, Supplier } from "../lib/types";
import {
  borrarProveedor, crearProveedor, editarProveedor, fijarCategoriasProveedor,
  type CamposProveedor,
} from "../lib/datos";
import { useToast } from "./Toast";
import { useAuth } from "../lib/auth";

interface Props {
  proyectoId: string;
  /** Si viene, se edita; si no, se crea uno nuevo. */
  proveedor?: Supplier;
  /** Taxonomía de la obra, para declarar qué atiende el proveedor. */
  categorias?: Category[];
  /** Categorías que ya tiene asignadas. */
  categoriasActuales?: string[];
  onCerrar: () => void;
  onGuardado: (s: Supplier) => void | Promise<void>;
  onBorrado?: () => void | Promise<void>;
}

export default function EditorProveedor({
  proyectoId, proveedor, categorias = [], categoriasActuales = [],
  onCerrar, onGuardado, onBorrado,
}: Props) {
  const { avisar, avisarError } = useToast();
  const { isAdmin } = useAuth();
  const editando = !!proveedor;

  const [f, setF] = useState<CamposProveedor>({
    name: proveedor?.name ?? "",
    city: proveedor?.city ?? "",
    kind: proveedor?.kind ?? "",
    phone: proveedor?.phone ?? "",
    whatsapp: proveedor?.whatsapp ?? "",
    email: proveedor?.email ?? "",
    web: proveedor?.web ?? "",
    fast_contact: proveedor?.fast_contact ?? "",
    contact_source: proveedor?.contact_source ?? "",
    notes: proveedor?.notes ?? "",
    contact_confidence: proveedor?.contact_confidence ?? null,
    national: proveedor?.national ?? false,
  });
  const [cats, setCats] = useState<Set<string>>(new Set(categoriasActuales));
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const raices = categorias.filter((c) => !c.parent_id).sort((a, b) => a.sort - b.sort);

  const set = (k: keyof CamposProveedor) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) {
      avisarError(new Error("El nombre del proveedor es obligatorio."));
      return;
    }

    const limpio = Object.fromEntries(
      Object.entries(f).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v])
    ) as CamposProveedor;
    limpio.name = f.name.trim();

    setGuardando(true);
    try {
      const g = editando
        ? await editarProveedor(proveedor.id, limpio)
        : await crearProveedor(proyectoId, limpio);

      // Las categorías van después de tener el id, y solo si esta pantalla las
      // está manejando: si no se pasó la taxonomía, no hay que tocar nada.
      if (categorias.length) await fijarCategoriasProveedor(g.id, [...cats]);

      await onGuardado(g);
      avisar(editando ? "Proveedor actualizado" : "Proveedor creado");
      onCerrar();
    } catch (err) {
      avisarError(err);
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarBorrado() {
    if (!proveedor) return;
    setGuardando(true);
    try {
      await borrarProveedor(proveedor.id);
      await onBorrado?.();
      avisar("Proveedor borrado");
      onCerrar();
    } catch (err) {
      avisarError(err);
    } finally {
      setGuardando(false);
      setConfirmando(false);
    }
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label={editando ? "Editar proveedor" : "Nuevo proveedor"}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
        display: "grid", placeItems: "center", zIndex: 105, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !guardando) onCerrar(); }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="lbl">{editando ? "Editar proveedor" : "Nuevo proveedor"}</span>
          <button className="mini" onClick={onCerrar} disabled={guardando}>Cerrar</button>
        </div>
        <h2 style={{ fontSize: 18, margin: "4px 0 2px" }}>
          {editando ? proveedor.name : "Agregar un proveedor a esta obra"}
        </h2>
        <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginTop: 4 }}>
          Si al llamar encuentra que un dato está equivocado, corríjalo aquí mismo: queda
          para todo el equipo y nadie vuelve a perder esa llamada.
        </p>

        <form onSubmit={guardar}>
          <label style={{ display: "block", marginTop: 12 }}>
            <span className="lbl">Empresa <span style={{ color: "var(--crit)" }}>*</span></span>
            <input className="field" style={{ marginTop: 4 }} value={f.name}
              onChange={set("name")} required placeholder="FERRETERÍA AR&SAN" />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginTop: 10 }}>
            <label>
              <span className="lbl">Ciudad</span>
              <input className="field" style={{ marginTop: 4 }} value={f.city ?? ""}
                onChange={set("city")} placeholder="Barrancabermeja" />
            </label>
            <label>
              <span className="lbl">Tipo</span>
              <input className="field" style={{ marginTop: 4 }} value={f.kind ?? ""}
                onChange={set("kind")} placeholder="Fabricante, distribuidor, ferretería…" />
            </label>
            <label>
              <span className="lbl">Teléfono</span>
              <input className="field" style={{ marginTop: 4 }} value={f.phone ?? ""}
                onChange={set("phone")} inputMode="tel" />
            </label>
            <label>
              <span className="lbl">WhatsApp</span>
              <input className="field" style={{ marginTop: 4 }} value={f.whatsapp ?? ""}
                onChange={set("whatsapp")} inputMode="tel" />
            </label>
            <label>
              <span className="lbl">Correo</span>
              <input className="field" style={{ marginTop: 4 }} value={f.email ?? ""}
                onChange={set("email")} inputMode="email" />
            </label>
            <label>
              <span className="lbl">Sitio web</span>
              <input className="field" style={{ marginTop: 4 }} value={f.web ?? ""}
                onChange={set("web")} placeholder="https://…" />
            </label>
          </div>

          <label style={{ display: "block", marginTop: 10 }}>
            <span className="lbl">Contacto más rápido</span>
            <input className="field" style={{ marginTop: 4 }} value={f.fast_contact ?? ""}
              onChange={set("fast_contact")}
              placeholder="Cel. 300 123 4567 (Ana, ventas)" />
          </label>

          <label style={{ display: "block", marginTop: 10 }}>
            <span className="lbl">De dónde salió el contacto</span>
            <input className="field" style={{ marginTop: 4 }} value={f.contact_source ?? ""}
              onChange={set("contact_source")}
              placeholder="Sitio oficial, tarjeta del asesor, llamada del 12/08…" />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginTop: 10 }}>
            <label>
              <span className="lbl">Confianza del contacto</span>
              <select
                className="field" style={{ marginTop: 4 }}
                value={f.contact_confidence ?? ""}
                onChange={(e) =>
                  setF((p) => ({
                    ...p,
                    contact_confidence: (e.target.value || null) as ContactConfidence | null,
                  }))
                }
              >
                <option value="">Sin calificar</option>
                <option value="alta">Alta — web oficial y contacto publicado</option>
                <option value="media">Media — fuente secundaria</option>
                <option value="baja">Baja — referencia indirecta</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "flex-end", gap: 8, paddingBottom: 9 }}>
              <input
                type="checkbox"
                checked={!!f.national}
                onChange={(e) => setF((p) => ({ ...p, national: e.target.checked }))}
              />
              <span style={{ fontSize: 13 }}>Cobertura nacional</span>
            </label>
          </div>

          {proveedor?.contact_verified_at && (
            <div className="note is-ok" style={{ marginTop: 10 }}>
              Contacto verificado por el equipo. Alguien ya se comunicó de verdad con
              este proveedor.
            </div>
          )}

          {/* Qué categorías atiende: es lo que hace que sus ítems aparezcan solos
              en la matriz, sin tener que vincularlo ítem por ítem. */}
          {raices.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <span className="lbl">Qué categorías atiende</span>
              <p style={{ margin: "4px 0 8px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                Marque todo lo que este proveedor pueda surtir. Con esto sus ítems
                aparecen solos en el Centro de cotizaciones: no hay que vincularlo
                ítem por ítem.
              </p>
              <div className="cells">
                {raices.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chip"
                    aria-pressed={cats.has(c.id)}
                    onClick={() =>
                      setCats((s) => {
                        const n = new Set(s);
                        n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                        return n;
                      })
                    }
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label style={{ display: "block", marginTop: 10 }}>
            <span className="lbl">Notas</span>
            <input className="field" style={{ marginTop: 4 }} value={f.notes ?? ""}
              onChange={set("notes")}
              placeholder="Qué maneja, tiempos, condiciones de despacho…" />
          </label>

          <div className="btns">
            <button className="btn" type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear proveedor"}
            </button>
            {editando && isAdmin && (
              <button className="btn ghost" type="button" onClick={() => setConfirmando(true)}
                disabled={guardando}
                style={{ borderColor: "var(--crit-line)", color: "var(--crit)" }}>
                Borrar proveedor
              </button>
            )}
            <button className="btn ghost" type="button" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </button>
          </div>
        </form>

        {confirmando && proveedor && (
          <div className="banner is-crit" style={{ marginTop: 14 }}>
            <b>¿Borrar {proveedor.name} de esta obra?</b><br />
            Desaparece de todos los ítems donde esté asignado y se pierden sus cotizaciones.
            Si solo quiere quitarlo de un ítem, use «Quitar» en el panel de ese ítem.
            <div className="btns">
              <button className="btn danger" onClick={() => void confirmarBorrado()} disabled={guardando}>
                Sí, borrar
              </button>
              <button className="btn ghost" onClick={() => setConfirmando(false)} disabled={guardando}>
                No
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
