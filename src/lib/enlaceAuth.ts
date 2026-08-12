/**
 * Lee lo que el script de index.html capturó del fragmento de la URL antes de
 * que supabase-js lo consumiera.
 */

const CLAVE_TIPO = "auth_tipo_enlace";
const CLAVE_ERROR = "auth_error_enlace";

/** Tipos de enlace que obligan a definir contraseña antes de usar el sistema. */
const EXIGEN_CLAVE = new Set(["invite", "recovery", "signup"]);

function leer(clave: string): string | null {
  try {
    return sessionStorage.getItem(clave);
  } catch {
    return null;
  }
}

function borrar(clave: string): void {
  try {
    sessionStorage.removeItem(clave);
  } catch {
    /* sin sessionStorage no hay nada que limpiar */
  }
}

/**
 * El error del enlace se consume UNA sola vez, al cargar el módulo, y queda en
 * memoria. Si se leyera desde React, el modo estricto invocaría dos veces el
 * inicializador de estado: la primera pasada lo borraría y la segunda ya no
 * encontraría nada, así que el aviso nunca se vería.
 */
const ERROR_INICIAL: string | null = (() => {
  const e = leer(CLAVE_ERROR);
  if (e) borrar(CLAVE_ERROR);
  return e;
})();

export function tipoEnlace(): string | null {
  return leer(CLAVE_TIPO);
}

export function vieneDeInvitacion(): boolean {
  const t = tipoEnlace();
  return t !== null && EXIGEN_CLAVE.has(t);
}

export function errorEnlace(): string | null {
  return ERROR_INICIAL ? traducirErrorEnlace(ERROR_INICIAL) : null;
}

/** Se llama cuando la contraseña ya quedó definida. */
export function limpiarEnlace(): void {
  borrar(CLAVE_TIPO);
  borrar(CLAVE_ERROR);
}

function traducirErrorEnlace(e: string): string {
  const m = decodeURIComponent(e.replace(/\+/g, " ")).toLowerCase();
  if (m.includes("expired"))
    return "El enlace ya venció. Pida al administrador que le reenvíe la invitación.";
  if (m.includes("already") || m.includes("used"))
    return "Ese enlace ya se usó. Ingrese con su correo y contraseña, o pida uno nuevo.";
  if (m.includes("invalid"))
    return "El enlace no es válido. Pida al administrador que le reenvíe la invitación.";
  return decodeURIComponent(e.replace(/\+/g, " "));
}
