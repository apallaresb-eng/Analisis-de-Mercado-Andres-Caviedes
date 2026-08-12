import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import type { Project } from "../lib/types";

/**
 * Fase 0: pantalla mínima que demuestra que la cadena completa funciona —
 * sesión válida, perfil con rol, y lectura real de la base bajo RLS.
 * En la Fase 1 se reemplaza por el tablero portado.
 */
export default function Dashboard() {
  const { profile, isAdmin, signOut } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setProjects(data ?? []);
      });
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <span className="lbl">Sesión iniciada</span>
          <h1 style={{ fontSize: 22 }}>{profile?.full_name || profile?.email}</h1>
        </div>
        <button className="btn ghost" onClick={() => void signOut()}>Cerrar sesión</button>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <span className="lbl">Estado de la conexión</span>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", marginTop: 10, fontSize: 13.5 }}>
          <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Correo</dt>
          <dd style={{ margin: 0 }} className="mono">{profile?.email}</dd>
          <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Rol</dt>
          <dd style={{ margin: 0 }}>
            <b style={{ color: isAdmin ? "var(--accent)" : "var(--ink-2)" }}>
              {isAdmin ? "Administrador" : "Operario"}
            </b>
          </dd>
          <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Base de datos</dt>
          <dd style={{ margin: 0 }}>
            {error ? <span style={{ color: "var(--crit)" }}>Error: {error}</span>
              : projects === null ? "Consultando…"
              : <span style={{ color: "var(--ok)" }}>Conectada · {projects.length} proyecto(s) visibles</span>}
          </dd>
        </dl>
      </div>

      {projects !== null && projects.length === 0 && (
        <div className="banner" style={{ marginTop: 12 }}>
          No hay proyectos todavía. {isAdmin
            ? "Como administrador, el siguiente paso es sembrar el estudio de Simití o importar un Excel."
            : "Pídale al administrador que cargue la obra."}
        </div>
      )}

      {projects !== null && projects.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <span className="lbl">Proyectos</span>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13.5 }}>
            {projects.map((p) => (
              <li key={p.id} style={{ marginBottom: 4 }}>
                <b>{p.name}</b>
                {p.municipality && <span style={{ color: "var(--muted)" }}> — {p.municipality}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
