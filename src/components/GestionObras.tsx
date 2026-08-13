import { useState, type FormEvent } from "react";
import type { Project } from "../lib/types";
import { archivarObra, borrarObra, crearObra, type NuevaObra } from "../lib/datos";
import { useToast } from "./Toast";
import { useAuth } from "../lib/auth";
import { fecha } from "../lib/dominio";
import ImportadorExcel from "./ImportadorExcel";

interface Props {
  proyectos: Project[];
  proyectoActual: Project | null;
  nItemsActual: number;
  onCambio: () => void | Promise<void>;
  onSeleccionar: (id: string) => void;
}

export default function GestionObras({
  proyectos, proyectoActual, nItemsActual, onCambio, onSeleccionar,
}: Props) {
  const { avisar, avisarError } = useToast();
  const { session } = useAuth();
  const [creando, setCreando] = useState(false);
  const [importando, setImportando] = useState(false);

  async function alternarArchivo(p: Project) {
    try {
      await archivarObra(p.id, !p.archived_at);
      await onCambio();
      avisar(p.archived_at ? "Obra reactivada" : "Obra archivada");
    } catch (e) {
      avisarError(e);
    }
  }

  async function eliminar(p: Project) {
    // Doble confirmación: escribir el nombre evita el borrado por clic
    // accidental, que aquí es irreversible y se lleva ítems y cotizaciones.
    const escrito = prompt(
      `Esto borra la obra "${p.name}" con TODOS sus ítems, proveedores y cotizaciones.\n` +
      `No se puede deshacer.\n\nPara confirmar, escriba el nombre exacto de la obra:`
    );
    if (escrito === null) return;
    if (escrito.trim() !== p.name) {
      avisarError(new Error("El nombre no coincide. No se borró nada."));
      return;
    }
    try {
      await borrarObra(p.id);
      await onCambio();
      avisar("Obra eliminada");
    } catch (e) {
      avisarError(e);
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Obras registradas</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
          Cada obra es independiente: sus ítems, proveedores y cotizaciones no se mezclan.
          Archivar una obra la saca del selector del día a día sin borrar nada.
        </p>
        <div className="btns">
          <button className="btn" onClick={() => setCreando(true)}>+ Nueva obra</button>
          {proyectoActual && (
            <button className="btn ghost" onClick={() => setImportando(true)}>
              Importar ítems desde Excel
            </button>
          )}
        </div>
      </div>

      {creando && (
        <FormNuevaObra
          onCancelar={() => setCreando(false)}
          onCreada={async (p) => {
            setCreando(false);
            await onCambio();
            onSeleccionar(p.id);
            avisar("Obra creada. Ahora importe sus ítems.");
          }}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
        {proyectos.map((p) => {
          const esActual = p.id === proyectoActual?.id;
          return (
            <div
              key={p.id}
              className="card"
              style={{
                borderTop: `3px solid ${esActual ? "var(--accent)" : "var(--line)"}`,
                opacity: p.archived_at ? 0.65 : 1,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 14.5, flex: 1 }}>{p.name}</h3>
                {esActual && <span className="pill" style={{ ["--pc" as string]: "var(--accent)", ["--pl" as string]: "var(--accent)" }}>En pantalla</span>}
                {p.archived_at && <span className="pill">Archivada</span>}
              </div>

              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 12, marginTop: 10 }}>
                <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Contrato</dt>
                <dd style={{ margin: 0 }} className="mono">{p.contract_no ?? "—"}</dd>
                <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Ubicación</dt>
                <dd style={{ margin: 0 }}>
                  {[p.municipality, p.department].filter(Boolean).join(", ") || "—"}
                </dd>
                <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Creada</dt>
                <dd style={{ margin: 0 }}>{fecha(p.created_at)}</dd>
                {esActual && (
                  <>
                    <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Ítems</dt>
                    <dd style={{ margin: 0 }} className="mono">{nItemsActual}</dd>
                  </>
                )}
              </dl>

              <div className="btns">
                {!esActual && (
                  <button className="mini" onClick={() => onSeleccionar(p.id)}>Abrir</button>
                )}
                <button className="mini" onClick={() => void alternarArchivo(p)}>
                  {p.archived_at ? "Reactivar" : "Archivar"}
                </button>
                <button
                  className="mini"
                  style={{ borderColor: "var(--crit-line)", color: "var(--crit)" }}
                  onClick={() => void eliminar(p)}
                >
                  Borrar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {importando && proyectoActual && session && (
        <ImportadorExcel
          proyecto={proyectoActual}
          onCerrar={() => setImportando(false)}
          onImportado={onCambio}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function FormNuevaObra({
  onCancelar, onCreada,
}: {
  onCancelar: () => void;
  onCreada: (p: Project) => void | Promise<void>;
}) {
  const { avisarError } = useToast();
  const { session } = useAuth();
  const [f, setF] = useState<NuevaObra>({
    name: "", contract_no: "", contractor: "", supervision: "",
    municipality: "", department: "", notes: "",
  });
  const [guardando, setGuardando] = useState(false);

  const set = (k: keyof NuevaObra) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !session) {
      avisarError(new Error("El nombre de la obra es obligatorio."));
      return;
    }
    setGuardando(true);
    try {
      const limpio: NuevaObra = Object.fromEntries(
        Object.entries(f).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v])
      ) as NuevaObra;
      await onCreada(await crearObra({ ...limpio, name: f.name.trim() }, session.user.id));
    } catch (err) {
      avisarError(err);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="card" onSubmit={enviar} style={{ marginBottom: 12 }}>
      <span className="lbl">Nueva obra</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 8 }}>
        <label>
          <span className="lbl">Nombre <span style={{ color: "var(--crit)" }}>*</span></span>
          <input className="field" style={{ marginTop: 4 }} value={f.name} onChange={set("name")}
            placeholder="Sede de Educación Superior — Simití" required />
        </label>
        <label>
          <span className="lbl">Contrato No.</span>
          <input className="field" style={{ marginTop: 4 }} value={f.contract_no ?? ""} onChange={set("contract_no")} />
        </label>
        <label>
          <span className="lbl">Contratista</span>
          <input className="field" style={{ marginTop: 4 }} value={f.contractor ?? ""} onChange={set("contractor")} />
        </label>
        <label>
          <span className="lbl">Interventoría</span>
          <input className="field" style={{ marginTop: 4 }} value={f.supervision ?? ""} onChange={set("supervision")} />
        </label>
        <label>
          <span className="lbl">Municipio</span>
          <input className="field" style={{ marginTop: 4 }} value={f.municipality ?? ""} onChange={set("municipality")} />
        </label>
        <label>
          <span className="lbl">Departamento</span>
          <input className="field" style={{ marginTop: 4 }} value={f.department ?? ""} onChange={set("department")} />
        </label>
      </div>
      <label style={{ display: "block", marginTop: 10 }}>
        <span className="lbl">Notas</span>
        <input className="field" style={{ marginTop: 4 }} value={f.notes ?? ""} onChange={set("notes")}
          placeholder="Contexto logístico, riesgos, condiciones de entrega…" />
      </label>
      <div className="btns">
        <button className="btn" type="submit" disabled={guardando}>
          {guardando ? "Creando…" : "Crear obra"}
        </button>
        <button className="btn ghost" type="button" onClick={onCancelar} disabled={guardando}>Cancelar</button>
      </div>
    </form>
  );
}
