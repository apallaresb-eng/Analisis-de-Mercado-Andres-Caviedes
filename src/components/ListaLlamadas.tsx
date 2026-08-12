import { useMemo } from "react";
import type { Item, Project, Supplier } from "../lib/types";
import type { VinculosItemProveedor } from "../lib/datos";
import { actualizarEstadoVarios } from "../lib/datos";
import { contactoRapido, copiar, mensajeProveedor } from "../lib/dominio";
import { useToast } from "./Toast";

interface Props {
  items: Item[];
  proveedores: Supplier[];
  vinculos: VinculosItemProveedor;
  proyecto: Project;
  onRecargar: () => void | Promise<void>;
}

export default function ListaLlamadas({
  items, proveedores, vinculos, proyecto, onRecargar,
}: Props) {
  const { avisar, avisarError } = useToast();

  /** Agrupa por proveedor los ítems que siguen sin gestionar. */
  const grupos = useMemo(() => {
    const porId = new Map<string, Item[]>();
    for (const it of items) {
      if (it.state !== "pendiente") continue;
      for (const pid of vinculos[it.id] ?? []) {
        const lista = porId.get(pid) ?? [];
        lista.push(it);
        porId.set(pid, lista);
      }
    }
    return [...porId.entries()]
      .map(([pid, lista]) => ({
        proveedor: proveedores.find((p) => p.id === pid),
        items: lista,
      }))
      .filter((g): g is { proveedor: Supplier; items: Item[] } => !!g.proveedor)
      .sort((a, b) => b.items.length - a.items.length);
  }, [items, vinculos, proveedores]);

  const ctx = {
    nombre: proyecto.name,
    contrato: proyecto.contract_no,
    municipio: proyecto.municipality,
  };

  async function marcarContactados(lista: Item[]) {
    try {
      await actualizarEstadoVarios(lista.map((i) => i.id), "contactado");
      await onRecargar();
      avisar(`${lista.length} ítem(s) marcados como contactados`);
    } catch (e) {
      avisarError(e);
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Una llamada por proveedor, no una por ítem</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
          Cada tarjeta agrupa <b>todos los ítems pendientes</b> de ese proveedor y arma un solo
          mensaje consolidado. Están ordenadas por cantidad de ítems pendientes: empiece por arriba.
          Al marcar gestión, los ítems salen automáticamente de estas listas.
        </p>
      </div>

      {grupos.length === 0 ? (
        <div className="empty">No quedan ítems pendientes. Todo está gestionado.</div>
      ) : (
        <div className="calls">
          {grupos.map(({ proveedor, items: lista }) => (
            <div className="call" key={proveedor.id}>
              <h3>{proveedor.name}</h3>
              <div className="cc">{proveedor.city}</div>

              <div className="cnt">
                <b className="mono">{lista.length}</b> ítem(s) pendientes con este proveedor
              </div>

              <span className="lbl">Contacto más rápido</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", margin: "4px 0 9px" }}>
                {contactoRapido(proveedor)}
              </div>

              <span className="lbl">Ítems</span>
              <div className="codes">
                {lista.map((i) => (
                  <span className="mono" key={i.id} title={i.description}>
                    {i.code}
                  </span>
                ))}
              </div>

              <div className="links" style={{ marginBottom: 9 }}>
                {proveedor.web?.startsWith("http") && (
                  <a className="mini" href={proveedor.web} target="_blank" rel="noopener noreferrer">
                    Sitio web
                  </a>
                )}
                {proveedor.email?.includes("@") && (
                  <a className="mini" href={`mailto:${proveedor.email}`}>
                    Correo
                  </a>
                )}
              </div>

              <div className="btns" style={{ marginTop: "auto" }}>
                <button
                  className="btn"
                  onClick={async () => {
                    const ok = await copiar(mensajeProveedor(lista, ctx));
                    ok
                      ? avisar("Mensaje consolidado copiado")
                      : avisarError(new Error("No se pudo copiar. Seleccione el texto manualmente."));
                  }}
                >
                  Copiar mensaje ({lista.length})
                </button>
                <button className="btn ghost" onClick={() => void marcarContactados(lista)}>
                  Marcar contactados
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
