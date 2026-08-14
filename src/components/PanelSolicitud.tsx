import { useEffect, useMemo, useState } from "react";
import type { Category, Item, Project, QuoteRequest, RequestStatus, Supplier } from "../lib/types";
import {
  actualizarSolicitud, borrarSolicitud, marcarSolicitudEnviada, quitarItemDeSolicitud,
} from "../lib/datos";
import {
  ESTADOS_SOLICITUD, ESTADO_SOLICITUD_POR_ID, asuntoSolicitud, contactoRapido, copiar,
  diasDesde, enlaceDemasiadoLargo, enlaceWhatsApp, fecha, listaCompletaSolicitud,
  mensajeSolicitud, requiereSeguimiento,
} from "../lib/dominio";
import { useAuth } from "../lib/auth";
import { useToast } from "./Toast";

interface Props {
  solicitud: QuoteRequest;
  proveedor: Supplier;
  categoria: Category | null;
  items: Item[];
  proyecto: Project;
  onCambio: (s: QuoteRequest) => void;
  onRecargar: () => void | Promise<void>;
  onCerrar: () => void;
}

export default function PanelSolicitud({
  solicitud, proveedor, categoria, items, proyecto, onCambio, onRecargar, onCerrar,
}: Props) {
  const { isAdmin } = useAuth();
  const { avisar, avisarError } = useToast();

  const [mensaje, setMensaje] = useState("");
  const [editado, setEditado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const ctx = {
    nombre: proyecto.name,
    contrato: proyecto.contract_no,
    municipio: proyecto.municipality,
  };

  // El mensaje se regenera cuando cambia la solicitud o su lista de ítems, pero
  // NUNCA pisa lo que la persona haya escrito a mano.
  useEffect(() => {
    if (editado) return;
    setMensaje(solicitud.message_text || mensajeSolicitud(items, ctx, categoria?.name ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitud.id, items.length, categoria?.id]);

  useEffect(() => {
    setEditado(false);
    setConfirmando(false);
  }, [solicitud.id]);

  const est = ESTADO_SOLICITUD_POR_ID[solicitud.status];
  const enlace = enlaceWhatsApp(proveedor, mensaje);
  const largo = enlaceDemasiadoLargo(mensaje);
  const dias = diasDesde(solicitud.sent_at);
  const atrasada = requiereSeguimiento(solicitud);

  const listaCompleta = useMemo(
    () => listaCompletaSolicitud(items, categoria?.name ?? null),
    [items, categoria]
  );

  async function cambiarEstado(status: RequestStatus) {
    setOcupado(true);
    try {
      onCambio(await actualizarSolicitud(solicitud.id, { status }));
      avisar(`Solicitud marcada como ${ESTADO_SOLICITUD_POR_ID[status].lbl.toLowerCase()}`);
    } catch (e) {
      avisarError(e);
    } finally {
      setOcupado(false);
    }
  }

  /** Guarda el texto tal como se va a enviar: es parte de la sustentación. */
  async function confirmarEnvio() {
    setOcupado(true);
    try {
      await actualizarSolicitud(solicitud.id, {
        message_text: mensaje,
        whatsapp_url: enlace,
      });
      onCambio(await marcarSolicitudEnviada(solicitud.id, "whatsapp"));
      setConfirmando(false);
      avisar("Solicitud registrada como enviada");
    } catch (e) {
      avisarError(e);
    } finally {
      setOcupado(false);
    }
  }

  async function quitar(item: Item) {
    try {
      await quitarItemDeSolicitud(solicitud.id, item.id);
      await onRecargar();
      avisar(`${item.code} ya no está en esta solicitud`);
    } catch (e) {
      avisarError(e);
    }
  }

  async function eliminar() {
    if (!confirm(`¿Borrar la solicitud ${solicitud.code}? Se pierde su historial.`)) return;
    try {
      await borrarSolicitud(solicitud.id);
      onCerrar();
      await onRecargar();
      avisar("Solicitud borrada");
    } catch (e) {
      avisarError(e);
    }
  }

  return (
    <div className="reqpanel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="lbl mono">{solicitud.code}</span>
        <button className="mini" onClick={onCerrar}>Cerrar</button>
      </div>

      <h2 style={{ fontSize: 17, lineHeight: 1.25, margin: "5px 0 3px" }}>{proveedor.name}</h2>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
        {categoria?.name ?? "Sin categoría"}
        {proveedor.city ? ` · ${proveedor.city}` : ""}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
        <span
          className="pill"
          style={{ ["--pc" as string]: est.color, ["--pl" as string]: est.linea, ["--pb" as string]: est.fondo }}
        >
          {est.lbl}
        </span>
        {atrasada && (
          <span
            className="pill"
            style={{ ["--pc" as string]: "var(--crit)", ["--pl" as string]: "var(--crit-line)", ["--pb" as string]: "var(--crit-soft)" }}
          >
            {dias} días sin respuesta
          </span>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", marginBottom: 4 }}>
        {contactoRapido(proveedor)}
      </div>
      {proveedor.contact_confidence && !proveedor.contact_verified_at && (
        <div className="note" style={{ marginBottom: 10 }}>
          Contacto de confianza <b>{proveedor.contact_confidence}</b>, sin verificar todavía.
          {proveedor.contact_source ? ` Fuente: ${proveedor.contact_source}.` : ""}
        </div>
      )}

      {/* --- Ítems --- */}
      <div className="sec">
        <span className="lbl">Ítems solicitados ({items.length})</span>
        {items.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>
            Esta solicitud quedó sin ítems. Bórrela o agregue ítems desde la categoría.
          </div>
        ) : (
          <div className="reqitems">
            {items.map((it) => (
              <div className="reqitem" key={it.id}>
                <span className="rc mono">{it.code}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.description}>
                  {it.description}
                </span>
                <button className="mini" onClick={() => void quitar(it)} title="Quitar de esta solicitud">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Mensaje --- */}
      <div className="sec">
        <span className="lbl">Mensaje</span>
        <textarea
          className="msg"
          value={mensaje}
          onChange={(e) => { setMensaje(e.target.value); setEditado(true); }}
          aria-label="Mensaje de la solicitud"
        />
        {largo && (
          <div className="note is-crit" style={{ marginTop: 7 }}>
            El mensaje es muy largo para un enlace de WhatsApp y puede llegar cortado.
            Envíe el mensaje corto y luego pegue la lista completa como segundo mensaje.
          </div>
        )}

        <div className="btns">
          {enlace ? (
            <a
              className="btn"
              href={enlace}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
              onClick={() => setConfirmando(true)}
            >
              Enviar por WhatsApp
            </a>
          ) : (
            <button className="btn" disabled title="El proveedor no tiene un celular registrado">
              Sin WhatsApp
            </button>
          )}
          <button
            className="btn ghost"
            onClick={async () => {
              (await copiar(mensaje))
                ? avisar("Mensaje copiado")
                : avisarError(new Error("No se pudo copiar. Seleccione el texto manualmente."));
            }}
          >
            Copiar mensaje
          </button>
          <button
            className="btn ghost"
            onClick={async () => {
              (await copiar(listaCompleta))
                ? avisar(`Lista completa copiada (${items.length} ítems)`)
                : avisarError(new Error("No se pudo copiar."));
            }}
          >
            Copiar lista completa
          </button>
          {proveedor.email?.includes("@") && (
            <a
              className="btn ghost"
              style={{ textDecoration: "none" }}
              href={`mailto:${proveedor.email}?subject=${encodeURIComponent(
                asuntoSolicitud(solicitud.code, categoria?.name ?? null)
              )}&body=${encodeURIComponent(mensaje + "\n\n" + listaCompleta)}`}
              onClick={() => setConfirmando(true)}
            >
              Enviar por correo
            </a>
          )}
        </div>

        {/* Se pregunta DESPUÉS de abrir WhatsApp, no al pulsar el enlace: abrir
            la aplicación y cerrarla sin mandar nada no es haber contactado a
            nadie, y antes eso quedaba registrado como si sí. */}
        {confirmando && solicitud.status === "borrador" && (
          <div className="banner" style={{ marginTop: 10 }}>
            <b>¿Alcanzó a enviar el mensaje?</b>
            <div className="btns">
              <button className="btn" disabled={ocupado} onClick={() => void confirmarEnvio()}>
                Sí, quedó enviado
              </button>
              <button className="btn ghost" disabled={ocupado} onClick={() => setConfirmando(false)}>
                Todavía no
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- Estado --- */}
      <div className="sec">
        <span className="lbl">Estado de la solicitud</span>
        <div className="states">
          {ESTADOS_SOLICITUD.map((e) => (
            <button
              key={e.id}
              className="st"
              aria-pressed={solicitud.status === e.id}
              disabled={ocupado}
              style={{ ["--sc" as string]: e.color }}
              title={e.desc}
              onClick={() => void cambiarEstado(e.id)}
            >
              {e.lbl}
            </button>
          ))}
        </div>
      </div>

      {/* --- Historial --- */}
      <div className="sec">
        <span className="lbl">Historial</span>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 12.5, margin: 0 }}>
          <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Creada</dt>
          <dd style={{ margin: 0 }}>{fecha(solicitud.created_at)}</dd>
          <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Enviada</dt>
          <dd style={{ margin: 0 }}>
            {fecha(solicitud.sent_at)}
            {solicitud.channel ? ` · ${solicitud.channel}` : ""}
          </dd>
          <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Respondió</dt>
          <dd style={{ margin: 0 }}>{fecha(solicitud.responded_at)}</dd>
          <dt style={{ color: "var(--faint)", fontWeight: 600 }}>Último movimiento</dt>
          <dd style={{ margin: 0 }}>{fecha(solicitud.last_interaction_at ?? solicitud.updated_at)}</dd>
        </dl>
      </div>

      <div className="sec">
        <span className="lbl">Observaciones</span>
        <textarea
          className="field"
          style={{ minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
          defaultValue={solicitud.notes ?? ""}
          placeholder="Qué dijo, con quién se habló, qué quedó pendiente…"
          onBlur={async (e) => {
            const v = e.target.value.trim() || null;
            if (v === (solicitud.notes ?? null)) return;
            try {
              onCambio(await actualizarSolicitud(solicitud.id, { notes: v }));
              avisar("Observación guardada");
            } catch (err) {
              avisarError(err);
            }
          }}
        />
      </div>

      {isAdmin && (
        <div className="btns" style={{ marginTop: 14 }}>
          <button className="mini" style={{ borderColor: "var(--crit-line)", color: "var(--crit)" }} onClick={() => void eliminar()}>
            Borrar solicitud
          </button>
        </div>
      )}
    </div>
  );
}
