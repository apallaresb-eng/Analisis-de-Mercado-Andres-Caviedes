import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "./Toast";

/**
 * Panel de cuenta accesible estando ya logueado.
 *
 * Existe porque, sin dominio propio para enviar correo, las cuentas se crean
 * a mano en Supabase con una contraseña inicial que pone el administrador.
 * Sin esta pantalla, esa persona no tendría ninguna forma de cambiarla por
 * una propia: el único cambio de clave que existía dependía de un enlace de
 * invitación por correo, que aquí no se está usando.
 */
export default function CuentaModal({ onCerrar }: { onCerrar: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const { avisar, avisarError } = useToast();

  const [nombre, setNombre] = useState(profile?.full_name ?? "");
  const [clave, setClave] = useState("");
  const [claveConfirmar, setClaveConfirmar] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [errorClave, setErrorClave] = useState<string | null>(null);

  async function guardarNombre(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setGuardandoNombre(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: nombre.trim() || null })
      .eq("id", profile.id);
    setGuardandoNombre(false);
    if (error) {
      avisarError(new Error("No se pudo guardar el nombre."));
      return;
    }
    await refreshProfile();
    avisar("Nombre actualizado");
  }

  async function cambiarClave(e: FormEvent) {
    e.preventDefault();
    setErrorClave(null);

    if (clave.length < 10) {
      setErrorClave("Use al menos 10 caracteres.");
      return;
    }
    if (clave !== claveConfirmar) {
      setErrorClave("Las dos contraseñas no coinciden.");
      return;
    }

    setGuardandoClave(true);
    // No pide la contraseña anterior: basta con tener sesión válida, que ya
    // es la garantía de identidad. Es el mismo mecanismo de Supabase que usa
    // la pantalla de primer ingreso tras una invitación.
    const { error } = await supabase.auth.updateUser({ password: clave });
    setGuardandoClave(false);

    if (error) {
      setErrorClave(error.message);
      return;
    }
    setClave("");
    setClaveConfirmar("");
    avisar("Contraseña actualizada");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mi cuenta"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.4)",
        display: "grid", placeItems: "center", zIndex: 100, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="lbl">Mi cuenta</span>
          <button className="mini" onClick={onCerrar} aria-label="Cerrar">Cerrar</button>
        </div>
        <h2 style={{ fontSize: 18, marginTop: 4, marginBottom: 4 }}>{profile?.email}</h2>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
          {profile?.role === "admin" ? "Administrador" : "Operario"}
        </div>

        <form onSubmit={guardarNombre} style={{ marginBottom: 20 }}>
          <label>
            <span className="lbl">Nombre para mostrar</span>
            <input
              className="field" style={{ marginTop: 6 }}
              value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Como quiere que lo vean sus compañeros"
            />
          </label>
          <button className="btn ghost" style={{ marginTop: 8 }} disabled={guardandoNombre}>
            {guardandoNombre ? "Guardando…" : "Guardar nombre"}
          </button>
        </form>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <span className="lbl">Cambiar contraseña</span>
          <form onSubmit={cambiarClave} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <input
              className="field" type="password" autoComplete="new-password"
              placeholder="Contraseña nueva (mínimo 10 caracteres)"
              value={clave} onChange={(e) => setClave(e.target.value)}
            />
            <input
              className="field" type="password" autoComplete="new-password"
              placeholder="Repetir contraseña nueva"
              value={claveConfirmar} onChange={(e) => setClaveConfirmar(e.target.value)}
            />
            {errorClave && <div className="banner is-crit">{errorClave}</div>}
            <button className="btn" disabled={guardandoClave}>
              {guardandoClave ? "Guardando…" : "Cambiar contraseña"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
