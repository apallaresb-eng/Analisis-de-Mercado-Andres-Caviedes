import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { errorEnlace, limpiarEnlace, tipoEnlace } from "../lib/enlaceAuth";
import { useAuth } from "../lib/auth";

/**
 * Pantalla a la que llega el usuario desde el enlace de invitación o de
 * recuperación. Supabase ya dejó una sesión temporal, así que aquí solo se
 * define la contraseña definitiva.
 */
export default function SetPassword() {
  const { session, loading, refreshProfile } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [errEnlace] = useState(() => errorEnlace());
  const [tipo] = useState(() => tipoEnlace());

  useEffect(() => {
    if (errEnlace) setError(errEnlace);
  }, [errEnlace]);

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
        err.message.toLowerCase().includes("session") ||
          err.message.toLowerCase().includes("auth")
          ? "El enlace ya venció. Pida al administrador que le reenvíe la invitación."
          : err.message
      );
      return;
    }

    limpiarEnlace();
    await refreshProfile();
    setDone(true);
  }

  if (loading) return <div className="center-note">Cargando…</div>;

  if (done) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Contraseña definida</h1>
          <p className="sub">Ya puede usar el sistema con su correo y esta contraseña.</p>
          <a className="btn" href="/" style={{ display: "inline-block", textDecoration: "none" }}>
            Ir al tablero
          </a>
        </div>
      </div>
    );
  }

  // Sin sesión no se puede cambiar la contraseña: el enlace venció o ya se usó.
  if (!session) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Enlace no válido</h1>
          <p className="sub">
            {errEnlace ??
              "Este enlace ya venció o fue usado. Pida al administrador que le reenvíe la invitación, o use «Olvidé mi contraseña» desde la pantalla de ingreso."}
          </p>
          <a className="btn ghost" href="/entrar" style={{ display: "inline-block", textDecoration: "none" }}>
            Ir a ingresar
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="lbl">{tipo === "recovery" ? "Recuperación" : "Primer ingreso"}</span>
        <h1>Defina su contraseña</h1>
        <p className="sub">
          Mínimo 10 caracteres. No la comparta: cada persona debe tener la suya, porque el
          sistema registra quién hace cada cambio.
        </p>

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
