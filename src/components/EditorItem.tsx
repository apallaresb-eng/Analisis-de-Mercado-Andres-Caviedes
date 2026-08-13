import { useState, type FormEvent } from "react";
import type { Item } from "../lib/types";
import { borrarItem, contarCotizaciones, crearItem, editarItemTecnico, type CamposItem } from "../lib/datos";
import { useToast } from "./Toast";
import { useAuth } from "../lib/auth";

interface Props {
  proyectoId: string;
  /** Si viene, se edita; si no, se crea uno nuevo. */
  item?: Item;
  onCerrar: () => void;
  onGuardado: (it: Item) => void | Promise<void>;
  onBorrado?: () => void | Promise<void>;
}

export default function EditorItem({
  proyectoId, item, onCerrar, onGuardado, onBorrado,
}: Props) {
  const { avisar, avisarError } = useToast();
  const { isAdmin } = useAuth();
  const editando = !!item;

  const [f, setF] = useState<CamposItem>({
    code: item?.code ?? "",
    description: item?.description ?? "",
    unit: item?.unit ?? "",
    quantity: item?.quantity ?? null,
    category: item?.category ?? "",
    spec: item?.spec ?? "",
    iva_treatment: item?.iva_treatment ?? "19%",
    observation: item?.observation ?? "",
  });
  const [cantidadTxt, setCantidadTxt] = useState(item?.quantity?.toString() ?? "");
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [nCotizaciones, setNCotizaciones] = useState<number | null>(null);

  const set = (k: keyof CamposItem) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!f.code.trim() || !f.description.trim()) {
      avisarError(new Error("El código y la descripción son obligatorios."));
      return;
    }

    const cant = cantidadTxt.trim() === "" ? null : Number(cantidadTxt.replace(",", "."));
    if (cant !== null && !Number.isFinite(cant)) {
      avisarError(new Error("La cantidad debe ser un número."));
      return;
    }

    const limpio: CamposItem = {
      code: f.code.trim(),
      description: f.description.trim(),
      unit: f.unit?.trim() || null,
      quantity: cant,
      category: f.category?.trim() || null,
      spec: f.spec?.trim() || null,
      iva_treatment: f.iva_treatment?.trim() || null,
      observation: f.observation?.trim() || null,
    };

    setGuardando(true);
    try {
      const guardado = editando
        ? await editarItemTecnico(item.id, limpio)
        : await crearItem(proyectoId, limpio);
      await onGuardado(guardado);
      avisar(editando ? "Ítem actualizado" : "Ítem creado");
      onCerrar();
    } catch (err) {
      avisarError(err);
    } finally {
      setGuardando(false);
    }
  }

  async function pedirBorrado() {
    if (!item) return;
    setNCotizaciones(await contarCotizaciones(item.id));
    setConfirmandoBorrado(true);
  }

  async function confirmarBorrado() {
    if (!item) return;
    setGuardando(true);
    try {
      await borrarItem(item.id);
      await onBorrado?.();
      avisar("Ítem borrado");
      onCerrar();
    } catch (err) {
      avisarError(err);
    } finally {
      setGuardando(false);
      setConfirmandoBorrado(false);
    }
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label={editando ? "Editar ítem" : "Nuevo ítem"}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
        display: "grid", placeItems: "center", zIndex: 105, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !guardando) onCerrar(); }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="lbl">{editando ? `Editar ${item.code}` : "Nuevo ítem"}</span>
          <button className="mini" onClick={onCerrar} disabled={guardando}>Cerrar</button>
        </div>

        {editando && !isAdmin && (
          <div className="banner" style={{ marginTop: 10 }}>
            La ficha técnica de un ítem solo la puede modificar un administrador. Usted sí
            puede cambiar el estado, la cantidad y las notas desde el panel del ítem.
          </div>
        )}

        <form onSubmit={guardar}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginTop: 12 }}>
            <label>
              <span className="lbl">Código <span style={{ color: "var(--crit)" }}>*</span></span>
              <input className="field mono" style={{ marginTop: 4 }} value={f.code}
                onChange={set("code")} placeholder="M-0202" required
                disabled={editando && !isAdmin} />
            </label>
            <label>
              <span className="lbl">Unidad</span>
              <input className="field" style={{ marginTop: 4 }} value={f.unit ?? ""}
                onChange={set("unit")} placeholder="kg, m2, un…"
                disabled={editando && !isAdmin} />
            </label>
            <label>
              <span className="lbl">Cantidad</span>
              <input className="field" style={{ marginTop: 4 }} value={cantidadTxt}
                onChange={(e) => setCantidadTxt(e.target.value)} inputMode="decimal"
                placeholder="Opcional" />
            </label>
            <label>
              <span className="lbl">Categoría</span>
              <input className="field" style={{ marginTop: 4 }} value={f.category ?? ""}
                onChange={set("category")} placeholder="ELECTRICO, ACERO…"
                disabled={editando && !isAdmin} />
            </label>
            <label>
              <span className="lbl">Tratamiento de IVA</span>
              <input className="field" style={{ marginTop: 4 }} value={f.iva_treatment ?? ""}
                onChange={set("iva_treatment")} placeholder="19%"
                disabled={editando && !isAdmin} />
            </label>
          </div>

          <label style={{ display: "block", marginTop: 10 }}>
            <span className="lbl">Descripción <span style={{ color: "var(--crit)" }}>*</span></span>
            <input className="field" style={{ marginTop: 4 }} value={f.description}
              onChange={set("description")} required disabled={editando && !isAdmin} />
          </label>

          <label style={{ display: "block", marginTop: 10 }}>
            <span className="lbl">Especificación técnica</span>
            <input className="field" style={{ marginTop: 4 }} value={f.spec ?? ""}
              onChange={set("spec")} placeholder="Norma, dimensiones, resistencia…"
              disabled={editando && !isAdmin} />
          </label>

          <label style={{ display: "block", marginTop: 10 }}>
            <span className="lbl">Observación</span>
            <input className="field" style={{ marginTop: 4 }} value={f.observation ?? ""}
              onChange={set("observation")} disabled={editando && !isAdmin} />
          </label>

          <div className="btns">
            <button className="btn" type="submit" disabled={guardando || (editando && !isAdmin)}>
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear ítem"}
            </button>
            {editando && isAdmin && (
              <button className="btn ghost" type="button" onClick={() => void pedirBorrado()}
                disabled={guardando}
                style={{ borderColor: "var(--crit-line)", color: "var(--crit)" }}>
                Borrar ítem
              </button>
            )}
            <button className="btn ghost" type="button" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </button>
          </div>
        </form>

        {confirmandoBorrado && item && (
          <div className="banner is-crit" style={{ marginTop: 14 }}>
            <b>¿Borrar {item.code}?</b><br />
            Se pierde el ítem
            {nCotizaciones ? <> y sus <b>{nCotizaciones} cotización(es)</b> registradas</> : null}.
            No se puede deshacer.
            <div className="btns">
              <button className="btn danger" onClick={() => void confirmarBorrado()} disabled={guardando}>
                Sí, borrar
              </button>
              <button className="btn ghost" onClick={() => setConfirmandoBorrado(false)} disabled={guardando}>
                No
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
