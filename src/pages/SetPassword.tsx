import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

/**
 * Pantalla a la que llega el usuario desde el enlace de invitación o de
 * recuperación. Supabase ya dejó una sesión temporal válida en la URL, así que
 * aquí solo se define la contraseña definitiva.
 */
export default function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError("Use al menos 10 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (err) {
      setError(
        err.message.toLowerCase().includes("session")
          ? "El enlace expiró. Pida al administrador que lo reenvíe."
          : err.message
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Contraseña definida</h1>
          <p className="sub">Ya puede usar el sistema con este correo y su nueva contraseña.</p>
          <a className="btn" href="/" style={{ display: "inline-block", textDecoration: "none" }}>
            Ir al tablero
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="lbl">Primer ingreso</span>
        <h1>Defina su contraseña</h1>
        <p className="sub">Mínimo 10 caracteres. No la comparta: cada persona debe tener la suya.</p>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            <span className="lbl">Nueva contraseña</span>
            <input
              className="field" type="password" value={password} required
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            <span className="lbl">Repetir contraseña</span>
            <input
              className="field" type="password" value={confirm} required
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>

          {error && <div className="banner is-crit">{error}</div>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Guardar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
