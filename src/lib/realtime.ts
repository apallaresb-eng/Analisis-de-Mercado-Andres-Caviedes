import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

/**
 * Sincronización en vivo entre dispositivos.
 *
 * Sin esto, si Ana cambia un ítem y Luis lo tiene en pantalla, Luis no se entera
 * hasta recargar: dos personas terminan llamando al mismo proveedor.
 *
 * Escucha los cambios de PostgreSQL sobre items y quotes y avisa para recargar.
 * Los avisos se agrupan con un retardo corto: al importar o al marcar varios
 * ítems de golpe llegan decenas de eventos seguidos y no tiene sentido recargar
 * una vez por cada uno.
 */
export function useSincronizacion(
  proyectoId: string | null,
  alCambiar: () => void
): void {
  // El callback se guarda en una referencia para que reconectar no dependa de
  // que la función cambie de identidad en cada render.
  const cb = useRef(alCambiar);
  cb.current = alCambiar;

  useEffect(() => {
    if (!proyectoId) return;

    let temporizador: number | undefined;
    const agrupar = () => {
      window.clearTimeout(temporizador);
      temporizador = window.setTimeout(() => cb.current(), 600);
    };

    const canal = supabase
      .channel(`obra:${proyectoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter: `project_id=eq.${proyectoId}` },
        agrupar
      )
      // quotes no tiene project_id, así que no se puede filtrar en el servidor.
      // Llegan las de todas las obras; recargar de más es inofensivo y mucho
      // más simple que mantener una lista de ids de ítems en el filtro.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quotes" },
        agrupar
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "suppliers", filter: `project_id=eq.${proyectoId}` },
        agrupar
      )
      .subscribe();

    return () => {
      window.clearTimeout(temporizador);
      void supabase.removeChannel(canal);
    };
  }, [proyectoId]);
}
