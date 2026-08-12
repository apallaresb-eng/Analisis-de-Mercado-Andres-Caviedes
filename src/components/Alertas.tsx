import { useMemo } from "react";
import type { Item } from "../lib/types";
import { alertaDe } from "../lib/dominio";

export default function Alertas({ items }: { items: Item[] }) {
  const filas = useMemo(
    () =>
      items
        .filter((it) => alertaDe(it).sev <= 3)
        .sort((a, b) => alertaDe(a).sev - alertaDe(b).sev || (a.seq ?? 0) - (b.seq ?? 0)),
    [items]
  );

  const criticos = filas.filter((it) => alertaDe(it).sev <= 1).length;

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Lo que no se resuelve con una llamada</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
          Estos ítems necesitan una <b>decisión técnica</b> antes de poder cotizarse.
          Están ordenados por severidad: los {criticos} críticos van primero.
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="empty">No hay ítems con observaciones pendientes.</div>
      ) : (
        <div className="alist">
          {filas.map((it) => {
            const a = alertaDe(it);
            return (
              <div className="acard" key={it.id} style={{ ["--stripe" as string]: a.c }}>
                <div className="ah">
                  <span
                    className="pill"
                    style={{ ["--pc" as string]: a.c, ["--pl" as string]: a.l, ["--pb" as string]: a.b }}
                  >
                    {a.t}
                  </span>
                  <b>
                    {it.code} · {it.description}
                  </b>
                </div>
                {it.observation && <p>{it.observation}</p>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
