import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Profile, UserRole } from "../lib/types";
import { fecha } from "../lib/dominio";
import { useToast } from "./Toast";
import { useAuth } from "../lib/auth";

/**
 * Administración de personas.
 *
 * Permite cambiar el rol y activar o desactivar cuentas sin entrar a Supabase
 * ni escribir SQL. NO crea cuentas: crear un usuario exige la clave
 * service_role, que nunca debe estar en el navegador. Mientras no haya un
 * dominio propio para enviar correo, la creación se hace en el panel de
 * Supabase, que son dos clics.
 */
export default function PanelUsuarios() {
  const { avisar, avisarError } = useToast();
  const { profile: yo, refreshProfile } = useAuth();
  const [personas, setPersonas] = useState<Profile[] | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  async function cargar() {
    const { data, error } = await supabase
      .from("profiles").select("*").order("created_at", { ascending: true });
    if (error) { avisarError(new Error(error.message)); return; }
    setPersonas((data ?? []) as Profile[]);
  }

  useEffect(() => { void cargar(); /* eslint-disable-next-line */ }, []);

  async function cambiar(p: Profile, campos: Partial<Pick<Profile, "role" | "active">>) {
    setGuardando(p.id);
    try {
      const { data, error } = await supabase
        .from("profiles").update(campos).eq("id", p.id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error("No se modificó nada. Verifique que su cuenta sea de administrador.");
      }
      await cargar();
      if (p.id === yo?.id) await refreshProfile();
      avisar("Cambio guardado");
    } catch (e) {
      avisarError(e);
    } finally {
      setGuardando(null);
    }
  }

  const admins = (personas ?? []).filter((p) => p.role === "admin" && p.active).length;

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Personas con acceso</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
          Cada persona debe tener <b>su propia cuenta</b>. Si varias comparten una,
          el registro de actividad deja de servir: todos los cambios aparecen a nombre
          de la misma persona, y en una auditoría de obra eso no se puede sustentar.
        </p>
        <div className="note" style={{ marginTop: 10 }}>
          <b>Para crear una cuenta nueva</b>, en Supabase:
          <b> Authentication → Users → Add user</b>. Escriba el correo, una contraseña
          temporal, y marque <b>Auto Confirm User</b>. Entréguele esos datos a la persona
          por un canal seguro; ella la cambia desde «Mi cuenta» al entrar.
          <br /><br />
          Desde aquí no se pueden crear cuentas: eso exige una clave maestra que nunca
          debe viajar al navegador.
        </div>
      </div>

      {personas === null ? (
        <div className="empty">Cargando…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 12 }}>
          {personas.map((p) => {
            const esYo = p.id === yo?.id;
            const ultimoAdmin = p.role === "admin" && p.active && admins <= 1;
            return (
              <div
                key={p.id}
                className="card"
                style={{
                  borderTop: `3px solid ${p.active ? (p.role === "admin" ? "var(--accent)" : "var(--line)") : "var(--crit)"}`,
                  opacity: p.active ? 1 : 0.65,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: 14, flex: 1 }}>{p.full_name || p.email}</h3>
                  {esYo && <span className="pill">Usted</span>}
                  {!p.active && (
                    <span className="pill" style={{ ["--pc" as string]: "var(--crit)", ["--pl" as string]: "var(--crit-line)", ["--pb" as string]: "var(--crit-soft)" }}>
                      Desactivada
                    </span>
                  )}
                </div>
                <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                  {p.email}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 3 }}>
                  Desde {fecha(p.created_at)}
                </div>

                <div className="sec" style={{ marginTop: 12 }}>
                  <span className="lbl">Rol</span>
                  <div className="states" style={{ marginTop: 5 }}>
                    {(["operario", "admin"] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        className="st"
                        aria-pressed={p.role === r}
                        disabled={guardando === p.id || (ultimoAdmin && r === "operario")}
                        style={{ ["--sc" as string]: r === "admin" ? "var(--accent)" : "var(--muted)" }}
                        onClick={() => void cambiar(p, { role: r })}
                      >
                        {r === "admin" ? "Administrador" : "Operario"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="btns">
                  <button
                    className="btn ghost"
                    disabled={guardando === p.id || (ultimoAdmin && p.active)}
                    onClick={() => void cambiar(p, { active: !p.active })}
                    style={p.active ? { borderColor: "var(--crit-line)", color: "var(--crit)" } : undefined}
                  >
                    {p.active ? "Desactivar acceso" : "Reactivar acceso"}
                  </button>
                </div>

                {ultimoAdmin && (
                  <div className="note" style={{ marginTop: 8, fontSize: 11.5 }}>
                    Es el único administrador activo. No se puede quitar ni desactivar,
                    porque quedarían todos sin poder administrar.
                  </div>
                )}
                {esYo && p.role === "admin" && !ultimoAdmin && (
                  <div className="note" style={{ marginTop: 8, fontSize: 11.5 }}>
                    Si se cambia a operario a usted mismo, perderá el acceso a esta pantalla.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
