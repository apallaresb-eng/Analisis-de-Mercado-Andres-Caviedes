import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Login from "./pages/Login";
import SetPassword from "./pages/SetPassword";
import Dashboard from "./pages/Dashboard";

function Protegido({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, signOut } = useAuth();

  if (loading) return <div className="center-note">Cargando…</div>;
  if (!session) return <Navigate to="/entrar" replace />;

  // El perfil aún no llegó (recién invitado, o el trigger no alcanzó a correr).
  if (!profile) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Cuenta sin perfil</h1>
          <p className="sub">
            Su usuario existe pero todavía no tiene perfil asignado. Avísele al
            administrador para que lo habilite.
          </p>
          <button className="btn ghost" onClick={() => void signOut()}>Cerrar sesión</button>
        </div>
      </div>
    );
  }

  // Desactivado: conserva la sesión pero RLS ya le niega los datos.
  // Se le dice explícitamente en vez de mostrarle un tablero vacío.
  if (!profile.active) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Acceso desactivado</h1>
          <p className="sub">
            Su cuenta fue desactivada por el administrador. Si cree que es un
            error, comuníquese con el área de compras.
          </p>
          <button className="btn ghost" onClick={() => void signOut()}>Cerrar sesión</button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function SoloInvitados({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="center-note">Cargando…</div>;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/entrar" element={<SoloInvitados><Login /></SoloInvitados>} />
          {/* Sin guardia: aquí se llega con la sesión temporal del enlace. */}
          <Route path="/definir-clave" element={<SetPassword />} />
          <Route path="/" element={<Protegido><Dashboard /></Protegido>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
