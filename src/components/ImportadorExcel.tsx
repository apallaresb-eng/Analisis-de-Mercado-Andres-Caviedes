import { useMemo, useState } from "react";
import {
  CAMPOS_DESTINO, CAMPOS_PROVEEDOR, CAMPOS_VINCULO,
  buscarParecido, detectarFilaEncabezados, detectarTipoHoja,
  extraerFilas, extraerProveedores, extraerVinculos, generarPlantilla, leerLibro,
  mapeoAutomatico, mapeoProveedores, mapeoVinculos, normalizarNombre,
  type CampoDestino, type CampoProveedor, type CampoVinculo, type HojaLeida, type TipoHoja,
} from "../lib/excel";
import {
  importarItems, importarProveedores, importarVinculos, listarProveedoresBasico,
  registrarImportacion, siguienteSeq,
} from "../lib/datos";
import { useToast } from "./Toast";
import { useAuth } from "../lib/auth";
import type { Project } from "../lib/types";

type Paso = "archivo" | "hojas" | "mapeo" | "resultado";

interface Props {
  proyecto: Project;
  onCerrar: () => void;
  onImportado: () => void | Promise<void>;
}

/** Asignación de cada hoja del libro a un rol, con su mapeo de columnas. */
interface Asignacion {
  tipo: TipoHoja;
  filaEnc: number;
  mapeo: Record<string, number | undefined>;
}

interface Resultado {
  items: { insertados: number; duplicados: number; omitidas: number };
  proveedores: { creados: number; actualizados: number; omitidas: number };
  vinculos: { creados: number; yaExistian: number; sinItem: string[]; sinProveedor: string[] };
}

export default function ImportadorExcel({ proyecto, onCerrar, onImportado }: Props) {
  const { avisar, avisarError } = useToast();
  const { session } = useAuth();

  const [paso, setPaso] = useState<Paso>("archivo");
  const [cargando, setCargando] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [hojas, setHojas] = useState<HojaLeida[]>([]);
  const [asig, setAsig] = useState<Asignacion[]>([]);
  const [activa, setActiva] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  /* --------------------------------------------------------------- archivo */
  async function alElegirArchivo(file: File) {
    setCargando(true);
    try {
      const leidas = await leerLibro(file);
      if (!leidas.length) throw new Error("El archivo no tiene hojas legibles.");

      const a: Asignacion[] = leidas.map((h) => {
        const tipo = detectarTipoHoja(h);
        const filaEnc = detectarFilaEncabezados(h.filas);
        const enc = h.filas[filaEnc] ?? [];
        return { tipo, filaEnc, mapeo: mapeoPara(tipo, enc) };
      });

      setNombreArchivo(file.name);
      setHojas(leidas);
      setAsig(a);
      // Si solo hay una hoja útil, se salta el paso de asignación.
      setActiva(Math.max(0, a.findIndex((x) => x.tipo !== "ninguno")));
      setPaso(leidas.length === 1 ? "mapeo" : "hojas");
    } catch (e) {
      avisarError(e instanceof Error ? e : new Error("No se pudo leer el archivo."));
    } finally {
      setCargando(false);
    }
  }

  function mapeoPara(tipo: TipoHoja, enc: string[]): Record<string, number | undefined> {
    if (tipo === "items") return mapeoAutomatico(enc);
    if (tipo === "proveedores") return mapeoProveedores(enc);
    if (tipo === "vinculos") return mapeoVinculos(enc);
    return {};
  }

  function cambiarTipo(i: number, tipo: TipoHoja) {
    setAsig((prev) => prev.map((a, j) => {
      if (j !== i) return a;
      const enc = hojas[i].filas[a.filaEnc] ?? [];
      return { ...a, tipo, mapeo: mapeoPara(tipo, enc) };
    }));
  }

  function cambiarFilaEnc(i: number, n: number) {
    setAsig((prev) => prev.map((a, j) => {
      if (j !== i) return a;
      const enc = hojas[i].filas[n] ?? [];
      return { ...a, filaEnc: n, mapeo: mapeoPara(a.tipo, enc) };
    }));
  }

  /* ----------------------------------------------------------- extracción */
  const extraidos = useMemo(() => {
    const out = { items: [] as ReturnType<typeof extraerFilas>["validas"], itemsOmit: 0,
      provs: [] as ReturnType<typeof extraerProveedores>["validos"], provsOmit: 0,
      vincs: [] as ReturnType<typeof extraerVinculos>["validos"], vincsOmit: 0 };
    hojas.forEach((h, i) => {
      const a = asig[i];
      if (!a) return;
      if (a.tipo === "items") {
        const r = extraerFilas(h.filas, a.filaEnc, a.mapeo as Partial<Record<CampoDestino, number>>);
        out.items.push(...r.validas); out.itemsOmit += r.descartadas;
      } else if (a.tipo === "proveedores") {
        const r = extraerProveedores(h.filas, a.filaEnc, a.mapeo as Partial<Record<CampoProveedor, number>>);
        out.provs.push(...r.validos); out.provsOmit += r.descartadas;
      } else if (a.tipo === "vinculos") {
        const r = extraerVinculos(h.filas, a.filaEnc, a.mapeo as Partial<Record<CampoVinculo, number>>);
        out.vincs.push(...r.validos); out.vincsOmit += r.descartadas;
      }
    });
    return out;
  }, [hojas, asig]);

  const hojaActiva = hojas[activa];
  const asigActiva = asig[activa];
  const encActiva = hojaActiva?.filas[asigActiva?.filaEnc ?? 0] ?? [];

  const camposDe = (t: TipoHoja) =>
    t === "items" ? CAMPOS_DESTINO : t === "proveedores" ? CAMPOS_PROVEEDOR
      : t === "vinculos" ? CAMPOS_VINCULO : [];

  const faltantes = asig.flatMap((a, i) =>
    camposDe(a.tipo).filter((c) => c.obligatorio && a.mapeo[c.id] === undefined)
      .map((c) => `${hojas[i]?.nombre}: ${c.lbl}`)
  );

  const nadaQueImportar =
    extraidos.items.length === 0 && extraidos.provs.length === 0 && extraidos.vincs.length === 0;

  /* ------------------------------------------------------------ confirmar */
  async function confirmar() {
    if (!session) return;
    setCargando(true);
    try {
      const res: Resultado = {
        items: { insertados: 0, duplicados: 0, omitidas: extraidos.itemsOmit },
        proveedores: { creados: 0, actualizados: 0, omitidas: extraidos.provsOmit },
        vinculos: { creados: 0, yaExistian: 0, sinItem: [], sinProveedor: [] },
      };

      // El orden importa: los vínculos necesitan que ítems y proveedores existan.
      if (extraidos.items.length) {
        const seq = await siguienteSeq(proyecto.id);
        const r = await importarItems(proyecto.id, extraidos.items, seq);
        res.items.insertados = r.insertados;
        res.items.duplicados = r.duplicados;
      }

      if (extraidos.provs.length) {
        const r = await importarProveedores(proyecto.id, extraidos.provs, normalizarNombre);
        res.proveedores.creados = r.creados;
        res.proveedores.actualizados = r.actualizados;
      }

      if (extraidos.vincs.length) {
        const catalogo = await listarProveedoresBasico(proyecto.id);
        const pares: { code: string; supplierId: string }[] = [];
        const sinProv: string[] = [];
        for (const v of extraidos.vincs) {
          const m = buscarParecido(v.supplier, catalogo);
          if (m) pares.push({ code: v.code, supplierId: m.id });
          else if (!sinProv.includes(v.supplier)) sinProv.push(v.supplier);
        }
        const r = await importarVinculos(proyecto.id, pares);
        res.vinculos = { ...r, sinProveedor: sinProv.slice(0, 20) };
      }

      await registrarImportacion({
        project_id: proyecto.id,
        filename: nombreArchivo,
        sheet_name: asig.map((a, i) => `${hojas[i]?.nombre}=${a.tipo}`).join(" · "),
        header_row: (asig[0]?.filaEnc ?? 0) + 1,
        rows_read: hojas.reduce((s, h) => s + h.filas.length, 0),
        rows_imported: res.items.insertados + res.proveedores.creados + res.vinculos.creados,
        rows_skipped: res.items.omitidas + res.proveedores.omitidas + extraidos.vincsOmit,
        mapping: Object.fromEntries(asig.map((a, i) => [hojas[i]?.nombre ?? String(i), a.tipo])),
        created_by: session.user.id,
      });

      setResultado(res);
      setPaso("resultado");
      await onImportado();
    } catch (e) {
      avisarError(e);
    } finally {
      setCargando(false);
    }
  }

  async function descargarPlantilla() {
    setCargando(true);
    try {
      const blob = await generarPlantilla();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Plantilla_carga_masiva.xlsx";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      avisar("Plantilla descargada");
    } catch (e) {
      avisarError(e);
    } finally {
      setCargando(false);
    }
  }

  const ETIQ: Record<TipoHoja, string> = {
    items: "Ítems", proveedores: "Proveedores", vinculos: "Vínculos ítem–proveedor", ninguno: "No importar",
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Importar desde Excel"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
        display: "grid", placeItems: "center", zIndex: 100, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !cargando) onCerrar(); }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 820, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span className="lbl">Importar · {proyecto.name}</span>
          <button className="mini" onClick={onCerrar} disabled={cargando}>Cerrar</button>
        </div>

        {/* ---------------- paso 1 ---------------- */}
        {paso === "archivo" && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Elija el archivo de Excel</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, marginTop: 0 }}>
              Puede traer <b>hasta tres hojas</b>: ítems, proveedores y los vínculos entre
              ambos. El asistente reconoce cada una y usted confirma. Si su archivo solo tiene
              ítems, también sirve.
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
                Se procesa en su navegador; no se sube a ningún servidor.
              </div>
            </label>

            <div className="btns">
              <button className="btn ghost" onClick={() => void descargarPlantilla()} disabled={cargando}>
                Descargar plantilla vacía
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--faint)", lineHeight: 1.5, marginTop: 4 }}>
              La plantilla trae las tres hojas con los encabezados correctos y una fila de
              ejemplo. Llenarla es más seguro que adivinar el formato.
            </p>
          </>
        )}

        {/* ---------------- paso 2: qué es cada hoja ---------------- */}
        {paso === "hojas" && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>¿Qué contiene cada hoja?</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, marginTop: 0 }}>
              Esto es lo que reconocí. Corrija lo que esté mal; las hojas marcadas como
              «No importar» se ignoran.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {hojas.map((h, i) => (
                <div key={h.nombre} className="card" style={{ background: "var(--surface-2)", padding: 12 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.nombre}</div>
                      <div style={{ fontSize: 11.5, color: "var(--faint)" }}>{h.filas.length} filas</div>
                    </div>
                    <select
                      className="field" style={{ flex: "0 0 240px" }}
                      value={asig[i]?.tipo ?? "ninguno"}
                      onChange={(e) => cambiarTipo(i, e.target.value as TipoHoja)}
                    >
                      {(["items", "proveedores", "vinculos", "ninguno"] as TipoHoja[]).map((t) => (
                        <option key={t} value={t}>{ETIQ[t]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div className="btns">
              <button className="btn" onClick={() => setPaso("mapeo")}>Continuar</button>
              <button className="btn ghost" onClick={() => setPaso("archivo")}>Otro archivo</button>
            </div>
          </>
        )}

        {/* ---------------- paso 3: mapeo y vista previa ---------------- */}
        {paso === "mapeo" && hojaActiva && asigActiva && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Revise antes de importar</h2>

            {hojas.length > 1 && (
              <div className="tabs" style={{ margin: "0 0 12px" }}>
                {hojas.map((h, i) => (
                  <button
                    key={h.nombre} role="tab" aria-selected={i === activa}
                    onClick={() => setActiva(i)}
                  >
                    {h.nombre} · {ETIQ[asig[i]?.tipo ?? "ninguno"]}
                  </button>
                ))}
              </div>
            )}

            {asigActiva.tipo === "ninguno" ? (
              <div className="note">Esta hoja no se va a importar.</div>
            ) : (
              <>
                <label style={{ display: "block", maxWidth: 240 }}>
                  <span className="lbl">Fila de encabezados</span>
                  <input
                    className="field" style={{ marginTop: 5 }} type="number" min={1}
                    max={Math.min(hojaActiva.filas.length, 100)}
                    value={asigActiva.filaEnc + 1}
                    onChange={(e) => cambiarFilaEnc(activa, Math.max(0, Number(e.target.value) - 1))}
                  />
                </label>

                <div className="note is-ok" style={{ marginTop: 10, fontSize: 12 }}>
                  Encabezados en la fila {asigActiva.filaEnc + 1}:{" "}
                  <b>{encActiva.filter(Boolean).slice(0, 8).join(" · ") || "(fila vacía)"}</b>
                </div>

                <div className="sec">
                  <span className="lbl">Qué columna corresponde a cada campo</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 8, marginTop: 6 }}>
                    {camposDe(asigActiva.tipo).map((c) => (
                      <label key={c.id}>
                        <span className="lbl">
                          {c.lbl}{c.obligatorio && <span style={{ color: "var(--crit)" }}> *</span>}
                        </span>
                        <select
                          className="field" style={{ marginTop: 4 }}
                          value={asigActiva.mapeo[c.id] ?? ""}
                          onChange={(e) => setAsig((prev) => prev.map((a, j) =>
                            j !== activa ? a : {
                              ...a,
                              mapeo: { ...a.mapeo, [c.id]: e.target.value === "" ? undefined : Number(e.target.value) },
                            }
                          ))}
                        >
                          <option value="">— sin asignar —</option>
                          {encActiva.map((h, i) => (
                            <option key={i} value={i}>
                              {String.fromCharCode(65 + (i % 26))}: {h || "(sin título)"}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {faltantes.length > 0 && (
              <div className="banner is-crit" style={{ marginTop: 12 }}>
                Falta asignar: <b>{faltantes.join(" · ")}</b>
              </div>
            )}

            <div className="sec">
              <span className="lbl">Lo que se va a importar</span>
              <div className="statbar" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                <div>
                  <span className="lbl">Ítems</span>
                  <span className="sv mono">{extraidos.items.length}</span>
                </div>
                <div>
                  <span className="lbl">Proveedores</span>
                  <span className="sv mono">{extraidos.provs.length}</span>
                </div>
                <div>
                  <span className="lbl">Vínculos</span>
                  <span className="sv mono">{extraidos.vincs.length}</span>
                </div>
              </div>
              {(extraidos.itemsOmit + extraidos.provsOmit + extraidos.vincsOmit) > 0 && (
                <div className="note" style={{ marginTop: 8, fontSize: 12 }}>
                  Se omitirán <b>{extraidos.itemsOmit + extraidos.provsOmit + extraidos.vincsOmit}</b> filas
                  incompletas (subtotales, títulos o filas sin los datos obligatorios).
                </div>
              )}
            </div>

            {asigActiva.tipo !== "ninguno" && (
              <div className="sec">
                <span className="lbl">Vista previa de esta hoja — primeras 6 filas</span>
                <div style={{ overflowX: "auto", marginTop: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        {camposDe(asigActiva.tipo).slice(0, 5).map((c) => (
                          <th key={c.id} style={{
                            textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--line)",
                            color: "var(--faint)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em",
                          }}>{c.lbl}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hojaActiva.filas.slice(asigActiva.filaEnc + 1, asigActiva.filaEnc + 7).map((f, i) => (
                        <tr key={i}>
                          {camposDe(asigActiva.tipo).slice(0, 5).map((c) => {
                            const idx = asigActiva.mapeo[c.id];
                            return (
                              <td key={c.id} style={{
                                padding: "5px 8px", borderBottom: "1px solid var(--line-2)", maxWidth: 220,
                              }}>{idx === undefined ? "—" : (f[idx] ?? "").trim() || "—"}</td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="btns">
              <button
                className="btn"
                disabled={cargando || faltantes.length > 0 || nadaQueImportar}
                onClick={() => void confirmar()}
              >
                {cargando ? "Importando…" : "Importar"}
              </button>
              {hojas.length > 1 && (
                <button className="btn ghost" onClick={() => setPaso("hojas")} disabled={cargando}>
                  Volver a las hojas
                </button>
              )}
              <button className="btn ghost" onClick={() => setPaso("archivo")} disabled={cargando}>
                Otro archivo
              </button>
            </div>
          </>
        )}

        {/* ---------------- paso 4: resultado ---------------- */}
        {paso === "resultado" && resultado && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Importación terminada</h2>

            <span className="lbl">Ítems</span>
            <div className="statbar" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 12 }}>
              <div>
                <span className="lbl">Importados</span>
                <span className="sv mono" style={{ color: "var(--ok)" }}>{resultado.items.insertados}</span>
              </div>
              <div>
                <span className="lbl">Ya existían</span>
                <span className="sv mono" style={{ color: "var(--warn)" }}>{resultado.items.duplicados}</span>
              </div>
              <div>
                <span className="lbl">Omitidas</span>
                <span className="sv mono">{resultado.items.omitidas}</span>
              </div>
            </div>

            <span className="lbl">Proveedores</span>
            <div className="statbar" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 12 }}>
              <div>
                <span className="lbl">Creados</span>
                <span className="sv mono" style={{ color: "var(--ok)" }}>{resultado.proveedores.creados}</span>
              </div>
              <div>
                <span className="lbl">Actualizados</span>
                <span className="sv mono" style={{ color: "var(--accent)" }}>{resultado.proveedores.actualizados}</span>
              </div>
              <div>
                <span className="lbl">Omitidas</span>
                <span className="sv mono">{resultado.proveedores.omitidas}</span>
              </div>
            </div>

            <span className="lbl">Vínculos ítem–proveedor</span>
            <div className="statbar" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
              <div>
                <span className="lbl">Creados</span>
                <span className="sv mono" style={{ color: "var(--ok)" }}>{resultado.vinculos.creados}</span>
              </div>
              <div>
                <span className="lbl">Ya existían</span>
                <span className="sv mono" style={{ color: "var(--warn)" }}>{resultado.vinculos.yaExistian}</span>
              </div>
            </div>

            {resultado.vinculos.sinItem.length > 0 && (
              <div className="note" style={{ marginTop: 12 }}>
                <b>No se encontró el ítem</b> para estos códigos, así que esos vínculos no se
                crearon: <span className="mono">{resultado.vinculos.sinItem.join(", ")}</span>.
                Revise que el código esté escrito igual en las dos hojas.
              </div>
            )}
            {resultado.vinculos.sinProveedor.length > 0 && (
              <div className="note" style={{ marginTop: 8 }}>
                <b>No se encontró el proveedor</b> con estos nombres:{" "}
                <span className="mono">{resultado.vinculos.sinProveedor.join(", ")}</span>.
                Agréguelos en la hoja de proveedores o créelos a mano y vuelva a importar.
              </div>
            )}

            <div className="note is-ok" style={{ marginTop: 12 }}>
              Los códigos y proveedores que ya existían <b>no se duplicaron</b>. Los proveedores
              repetidos se actualizaron con los datos del archivo, que es lo que se quiere al
              reimportar un estudio corregido.
            </div>

            <div className="btns">
              <button className="btn" onClick={() => { avisar("Importación aplicada"); onCerrar(); }}>
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
