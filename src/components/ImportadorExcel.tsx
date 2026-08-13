import { useMemo, useState } from "react";
import {
  CAMPOS_DESTINO, detectarFilaEncabezados, extraerFilas, leerLibro, mapeoAutomatico,
  type CampoDestino, type HojaLeida,
} from "../lib/excel";
import { importarItems, registrarImportacion, siguienteSeq } from "../lib/datos";
import { useToast } from "./Toast";
import { useAuth } from "../lib/auth";
import type { Project } from "../lib/types";

type Paso = "archivo" | "mapeo" | "resultado";

interface Props {
  proyecto: Project;
  onCerrar: () => void;
  onImportado: () => void | Promise<void>;
}

export default function ImportadorExcel({ proyecto, onCerrar, onImportado }: Props) {
  const { avisar, avisarError } = useToast();
  const { session } = useAuth();

  const [paso, setPaso] = useState<Paso>("archivo");
  const [cargando, setCargando] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [hojas, setHojas] = useState<HojaLeida[]>([]);
  const [hojaIdx, setHojaIdx] = useState(0);
  const [filaEnc, setFilaEnc] = useState(0);
  const [mapeo, setMapeo] = useState<Partial<Record<CampoDestino, number>>>({});
  const [resultado, setResultado] = useState<{
    insertados: number; duplicados: number; codigos: string[]; descartadas: number;
  } | null>(null);

  const hoja = hojas[hojaIdx];
  const encabezados = hoja?.filas[filaEnc] ?? [];

  const extraccion = useMemo(() => {
    if (!hoja) return null;
    return extraerFilas(hoja.filas, filaEnc, mapeo);
  }, [hoja, filaEnc, mapeo]);

  const faltanObligatorios = CAMPOS_DESTINO
    .filter((c) => c.obligatorio && mapeo[c.id] === undefined)
    .map((c) => c.lbl);

  async function alElegirArchivo(file: File) {
    setCargando(true);
    try {
      const leidas = await leerLibro(file);
      if (!leidas.length) throw new Error("El archivo no tiene hojas legibles.");
      const fila = detectarFilaEncabezados(leidas[0].filas);
      setNombreArchivo(file.name);
      setHojas(leidas);
      setHojaIdx(0);
      setFilaEnc(fila);
      setMapeo(mapeoAutomatico(leidas[0].filas[fila] ?? []));
      setPaso("mapeo");
    } catch (e) {
      avisarError(e instanceof Error ? e : new Error("No se pudo leer el archivo."));
    } finally {
      setCargando(false);
    }
  }

  function cambiarHoja(idx: number) {
    setHojaIdx(idx);
    const fila = detectarFilaEncabezados(hojas[idx].filas);
    setFilaEnc(fila);
    setMapeo(mapeoAutomatico(hojas[idx].filas[fila] ?? []));
  }

  function cambiarFilaEnc(n: number) {
    setFilaEnc(n);
    setMapeo(mapeoAutomatico(hoja?.filas[n] ?? []));
  }

  async function confirmar() {
    if (!extraccion || !session) return;
    setCargando(true);
    try {
      const seq = await siguienteSeq(proyecto.id);
      const r = await importarItems(proyecto.id, extraccion.validas, seq);

      await registrarImportacion({
        project_id: proyecto.id,
        filename: nombreArchivo,
        sheet_name: hoja.nombre,
        header_row: filaEnc + 1,
        rows_read: hoja.filas.length,
        rows_imported: r.insertados,
        rows_skipped: extraccion.descartadas + r.duplicados,
        mapping: Object.fromEntries(
          Object.entries(mapeo).map(([k, v]) => [k, encabezados[v as number] ?? String(v)])
        ),
        created_by: session.user.id,
      });

      setResultado({
        insertados: r.insertados,
        duplicados: r.duplicados,
        codigos: r.codigosDuplicados,
        descartadas: extraccion.descartadas,
      });
      setPaso("resultado");
      await onImportado();
    } catch (e) {
      avisarError(e);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Importar ítems desde Excel"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
        display: "grid", placeItems: "center", zIndex: 100, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !cargando) onCerrar(); }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 780, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span className="lbl">Importar ítems · {proyecto.name}</span>
          <button className="mini" onClick={onCerrar} disabled={cargando}>Cerrar</button>
        </div>

        {/* ---------------- paso 1: archivo ---------------- */}
        {paso === "archivo" && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Elija el archivo de Excel</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, marginTop: 0 }}>
              Sirve un presupuesto o lista de insumos en <b>.xlsx</b>. No importa que los
              encabezados no estén en la primera fila: después podrá indicar en cuál están.
              Los ítems se agregan a esta obra; los códigos que ya existan no se tocan.
            </p>

            <label
              className="card"
              style={{
                display: "block", textAlign: "center", cursor: "pointer",
                background: "var(--surface-2)", borderStyle: "dashed", padding: 28, marginTop: 8,
              }}
            >
              <input
                type="file" accept=".xlsx" hidden disabled={cargando}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void alElegirArchivo(f); e.target.value = ""; }}
              />
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {cargando ? "Leyendo el archivo…" : "Seleccionar archivo .xlsx"}
              </div>
              <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 4 }}>
                El archivo se procesa en su navegador; no se sube a ningún servidor.
              </div>
            </label>
          </>
        )}

        {/* ---------------- paso 2: mapeo ---------------- */}
        {paso === "mapeo" && hoja && extraccion && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Revise antes de importar</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label>
                <span className="lbl">Hoja</span>
                <select className="field" style={{ marginTop: 5 }} value={hojaIdx}
                  onChange={(e) => cambiarHoja(Number(e.target.value))}>
                  {hojas.map((h, i) => (
                    <option key={h.nombre} value={i}>{h.nombre} ({h.filas.length} filas)</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="lbl">Fila de encabezados</span>
                <input className="field" style={{ marginTop: 5 }} type="number" min={1}
                  max={Math.min(hoja.filas.length, 100)} value={filaEnc + 1}
                  onChange={(e) => cambiarFilaEnc(Math.max(0, Number(e.target.value) - 1))} />
              </label>
            </div>

            <div className="note is-ok" style={{ marginTop: 10, fontSize: 12 }}>
              Encabezados detectados en la fila {filaEnc + 1}:{" "}
              <b>{encabezados.filter(Boolean).slice(0, 8).join(" · ") || "(fila vacía)"}</b>
            </div>

            <div className="sec">
              <span className="lbl">Qué columna corresponde a cada campo</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8, marginTop: 6 }}>
                {CAMPOS_DESTINO.map((c) => (
                  <label key={c.id}>
                    <span className="lbl">
                      {c.lbl}{c.obligatorio && <span style={{ color: "var(--crit)" }}> *</span>}
                    </span>
                    <select
                      className="field" style={{ marginTop: 4 }}
                      value={mapeo[c.id] ?? ""}
                      onChange={(e) => setMapeo((m) => ({
                        ...m, [c.id]: e.target.value === "" ? undefined : Number(e.target.value),
                      }))}
                    >
                      <option value="">— sin asignar —</option>
                      {encabezados.map((h, i) => (
                        <option key={i} value={i}>
                          {String.fromCharCode(65 + (i % 26))}: {h || "(sin título)"}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            {faltanObligatorios.length > 0 && (
              <div className="banner is-crit" style={{ marginTop: 12 }}>
                Falta asignar: <b>{faltanObligatorios.join(", ")}</b>. Sin esas columnas no se
                puede identificar un ítem.
              </div>
            )}

            <div className="sec">
              <span className="lbl">Vista previa — primeras 8 filas de {extraccion.validas.length}</span>
              <div style={{ overflowX: "auto", marginTop: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["Código", "Descripción", "Unidad", "Cantidad"].map((h) => (
                        <th key={h} style={{
                          textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--line)",
                          color: "var(--faint)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extraccion.validas.slice(0, 8).map((f, i) => (
                      <tr key={i}>
                        <td className="mono" style={{ padding: "5px 8px", borderBottom: "1px solid var(--line-2)", fontWeight: 700 }}>{f.code}</td>
                        <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--line-2)", maxWidth: 320 }}>{f.description}</td>
                        <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--line-2)" }}>{f.unit ?? "—"}</td>
                        <td className="mono" style={{ padding: "5px 8px", borderBottom: "1px solid var(--line-2)" }}>{f.quantity ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {extraccion.descartadas > 0 && (
                <div className="note" style={{ marginTop: 8, fontSize: 12 }}>
                  Se omitirán <b>{extraccion.descartadas}</b> {extraccion.motivoDescartes}.
                </div>
              )}
            </div>

            <div className="btns">
              <button className="btn" disabled={cargando || faltanObligatorios.length > 0 || extraccion.validas.length === 0}
                onClick={() => void confirmar()}>
                {cargando ? "Importando…" : `Importar ${extraccion.validas.length} ítems`}
              </button>
              <button className="btn ghost" onClick={() => setPaso("archivo")} disabled={cargando}>
                Elegir otro archivo
              </button>
            </div>
          </>
        )}

        {/* ---------------- paso 3: resultado ---------------- */}
        {paso === "resultado" && resultado && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Importación terminada</h2>
            <div className="statbar" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              <div>
                <span className="lbl">Importados</span>
                <span className="sv mono" style={{ color: "var(--ok)" }}>{resultado.insertados}</span>
              </div>
              <div>
                <span className="lbl">Ya existían</span>
                <span className="sv mono" style={{ color: "var(--warn)" }}>{resultado.duplicados}</span>
              </div>
              <div>
                <span className="lbl">Omitidas</span>
                <span className="sv mono">{resultado.descartadas}</span>
              </div>
            </div>

            {resultado.duplicados > 0 && (
              <div className="note" style={{ marginTop: 12 }}>
                Los códigos que ya existían <b>no se modificaron</b>, para no pisar trabajo ya
                hecho{resultado.codigos.length > 0 && (
                  <>: <span className="mono">{resultado.codigos.join(", ")}</span>
                  {resultado.duplicados > resultado.codigos.length && " …"}</>
                )}.
              </div>
            )}

            <div className="btns">
              <button className="btn" onClick={() => { avisar("Ítems importados"); onCerrar(); }}>
                Ver el tablero
              </button>
              <button className="btn ghost" onClick={() => { setPaso("archivo"); setResultado(null); }}>
                Importar otro archivo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
