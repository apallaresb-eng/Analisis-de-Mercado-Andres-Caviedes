import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { signIn, sendReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!email.trim()) {
      setError("Escriba primero su correo para enviarle el enlace.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await sendReset(email.trim());
      setInfo("Si ese correo tiene cuenta autorizada, le llegará un enlace para definir la contraseña.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el enlace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="lbl">Consorcio AMG · CPI</span>
        <h1>Control de compras de obra</h1>
        <p className="sub">
          El acceso es solo para personal autorizado. Si no tiene cuenta, pídale al
          administrador que lo invite: no hay registro abierto.
        </p>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            <span className="lbl">Correo</span>
            <input
              className="field"
              type="email"
              value={email}
              autoComplete="username"
              required
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@empresa.com"
            />
          </label>

          <label>
            <span className="lbl">Contraseña</span>
            <input
              className="field"
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <div className="banner is-crit">{error}</div>}
          {info && <div className="banner is-ok">{info}</div>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>

          <button
            type="button"
            className="btn ghost"
            onClick={onReset}
            disabled={busy}
          >
            Olvidé mi contraseña
          </button>
        </form>
      </div>
    </div>
  );
}
