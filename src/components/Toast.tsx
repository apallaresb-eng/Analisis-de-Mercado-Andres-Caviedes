import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Aviso = { texto: string; error: boolean } | null;

const Ctx = createContext<{
  avisar: (texto: string) => void;
  avisarError: (e: unknown) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso>(null);
  const timer = useRef<number | undefined>(undefined);

  const mostrar = useCallback((texto: string, error: boolean) => {
    setAviso({ texto, error });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAviso(null), error ? 5000 : 2400);
  }, []);

  const avisar = useCallback((t: string) => mostrar(t, false), [mostrar]);
  const avisarError = useCallback(
    (e: unknown) => mostrar(e instanceof Error ? e.message : "Ocurrió un error inesperado.", true),
    [mostrar]
  );

  return (
    <Ctx.Provider value={{ avisar, avisarError }}>
      {children}
      <div
        className={`toast${aviso ? " on" : ""}${aviso?.error ? " is-error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {aviso?.texto}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return v;
}
