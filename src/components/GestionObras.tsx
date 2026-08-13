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
  const [porBorrar, setPorBorrar] = useState<Project | null>(null);

  const activas = proyectos.filter((p) => !p.archived_at);
  const archivadas = proyectos.filter((p) => p.archived_at);

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
    try {
      await borrarObra(p.id);
      await onCambio();
      avisar("Obra eliminada");
    } catch (e) {
      avisarError(e);
    } finally {
      setPorBorrar(null);
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

      {/* Archivadas aparte: al archivar, la obra cambia de posición en la lista
          y solo se atenúa, así que parecía que el botón no hacía nada. */}
      {activas.length > 0 && <span className="lbl" style={{ display: "block", marginBottom: 6 }}>
        En uso — {activas.length}
      </span>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
        {activas.map((p) => (
          <TarjetaObra
            key={p.id} obra={p}
            esActual={p.id === proyectoActual?.id}
            nItems={nItemsActual}
            onAbrir={() => onSeleccionar(p.id)}
            onArchivar={() => void alternarArchivo(p)}
            onBorrar={() => setPorBorrar(p)}
          />
        ))}
      </div>

      {archivadas.length > 0 && (
        <>
          <span className="lbl" style={{ display: "block", margin: "22px 0 6px" }}>
            Archivadas — {archivadas.length} · no aparecen en el selector del día a día
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
            {archivadas.map((p) => (
              <TarjetaObra
                key={p.id} obra={p}
                esActual={p.id === proyectoActual?.id}
                nItems={nItemsActual}
                onAbrir={() => onSeleccionar(p.id)}
                onArchivar={() => void alternarArchivo(p)}
                onBorrar={() => setPorBorrar(p)}
              />
            ))}
          </div>
        </>
      )}

      {importando && proyectoActual && session && (
        <ImportadorExcel
          proyecto={proyectoActual}
          onCerrar={() => setImportando(false)}
          onImportado={onCambio}
        />
      )}

      {porBorrar && (
        <DialogoBorrarObra
          obra={porBorrar}
          nItems={porBorrar.id === proyectoActual?.id ? nItemsActual : null}
          onCancelar={() => setPorBorrar(null)}
          onConfirmar={() => void eliminar(porBorrar)}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function TarjetaObra({
  obra: p, esActual, nItems, onAbrir, onArchivar, onBorrar,
}: {
  obra: Project;
  esActual: boolean;
  nItems: number;
  onAbrir: () => void;
  onArchivar: () => void;
  onBorrar: () => void;
}) {
  return (
    <div
      className="card"
      style={{
        borderTop: `3px solid ${esActual ? "var(--accent)" : "var(--line)"}`,
        opacity: p.archived_at ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 14.5, flex: 1 }}>{p.name}</h3>
        {esActual && (
          <span className="pill" style={{ ["--pc" as string]: "var(--accent)", ["--pl" as string]: "var(--accent)" }}>
            En pantalla
          </span>
        )}
        {p.archived_at && (
          <span className="pill" style={{ ["--pc" as string]: "var(--warn)", ["--pl" as string]: "var(--warn-line)", ["--pb" as string]: "var(--warn-soft)" }}>
            Archivada
          </span>
        )}
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
            <dd style={{ margin: 0 }} className="mono">{nItems}</dd>
          </>
        )}
      </dl>

      <div className="btns">
        {!esActual && <button className="mini" onClick={onAbrir}>Abrir</button>}
        <button className="mini" onClick={onArchivar}>
          {p.archived_at ? "Reactivar" : "Archivar"}
        </button>
        <button
          className="mini"
          style={{ borderColor: "var(--crit-line)", color: "var(--crit)" }}
          onClick={onBorrar}
        >
          Borrar
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Confirmación de borrado

   Antes se pedía escribir el nombre exacto de la obra con prompt(). Era
   imposible de superar: "Sede de Educación Superior — Simití" lleva raya larga,
   un carácter que no está en el teclado. Ahora se pide una palabra tecleable y
   se informa qué se pierde.
   -------------------------------------------------------------------------- */

function DialogoBorrarObra({
  obra, nItems, onCancelar, onConfirmar,
}: {
  obra: Project;
  nItems: number | null;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const puede = texto.trim().toUpperCase() === "BORRAR";

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Confirmar borrado de obra"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
        display: "grid", placeItems: "center", zIndex: 110, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 460 }}>
        <span className="lbl" style={{ color: "var(--crit)" }}>Acción irreversible</span>
        <h2 style={{ fontSize: 18, margin: "4px 0 10px" }}>Borrar «{obra.name}»</h2>

        <div className="banner is-crit">
          Se borrará la obra junto con <b>todos sus ítems, proveedores, cotizaciones y
          el registro de actividad</b>.
          {nItems !== null && <> Actualmente tiene <b>{nItems} ítems</b>.</>}
          <br /><br />
          No hay copias de respaldo: <b>esto no se puede deshacer</b>.
        </div>

        <label style={{ display: "block", marginTop: 14 }}>
          <span className="lbl">Para confirmar, escriba BORRAR</span>
          <input
            className="field" style={{ marginTop: 5 }} value={texto} autoFocus
            onChange={(e) => setTexto(e.target.value)}
            placeholder="BORRAR"
          />
        </label>

        <div className="btns">
          <button className="btn danger" disabled={!puede} onClick={onConfirmar}>
            Borrar definitivamente
          </button>
          <button className="btn ghost" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
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
