/**
 * Clasificación automática de ítems en categorías y subcategorías.
 *
 * Libro1.xlsx no trae columna de categoría: solo código, descripción y unidad.
 * Sin categoría no hay solicitudes segmentadas, ni cobertura, ni matriz — así
 * que hay que deducirla de la descripción.
 *
 * Esto es una PROPUESTA, no una verdad: el resultado se revisa en pantalla y
 * se corrige en bloque antes de guardarse. Por eso cada acierto viene con un
 * nivel de confianza, para poder ordenar la revisión por lo más dudoso.
 */

/* ---------------------------------------------------------------------------
   Taxonomía
   --------------------------------------------------------------------------- */
export interface SubcategoriaDef {
  slug: string;
  name: string;
}

export interface CategoriaDef {
  slug: string;
  name: string;
  subs: SubcategoriaDef[];
}

/**
 * Las 14 categorías raíz del estudio, en el orden en que se muestran.
 *
 * El `slug` se usa para el código legible de las solicitudes (PVC-DURMAN-001),
 * así que debe ser corto, en mayúsculas y sin acentos.
 */
export const TAXONOMIA: CategoriaDef[] = [
  {
    slug: "ELEC", name: "Eléctricos",
    subs: [
      { slug: "CABLE", name: "Cables y conductores" },
      { slug: "TABLERO", name: "Tableros y protecciones" },
      { slug: "DUCTO", name: "Canalización y ductería" },
      { slug: "SALIDA", name: "Tomas, interruptores y salidas" },
      { slug: "TIERRA", name: "Puesta a tierra" },
    ],
  },
  {
    slug: "MT", name: "Media y baja tensión",
    subs: [
      { slug: "TRAFO", name: "Transformadores" },
      { slug: "CELDA", name: "Celdas y protecciones MT" },
      { slug: "POSTE", name: "Postería y herrajes" },
    ],
  },
  { slug: "ILUM", name: "Iluminación", subs: [] },
  {
    slug: "RED", name: "Redes y datos",
    subs: [
      { slug: "ESTRUCT", name: "Cableado estructurado" },
      { slug: "ACTIVO", name: "Equipos activos" },
      { slug: "SEGURI", name: "Seguridad electrónica" },
    ],
  },
  {
    slug: "PVC", name: "PVC e hidrosanitario",
    subs: [
      { slug: "POTABLE", name: "Agua potable" },
      { slug: "NEGRAS", name: "Aguas negras y sanitario" },
      { slug: "LLUVIAS", name: "Aguas lluvias" },
      { slug: "ACCES", name: "Accesorios PVC" },
    ],
  },
  {
    slug: "HID", name: "Hidráulico y accesorios",
    subs: [
      { slug: "TUBMET", name: "Tubería metálica" },
      { slug: "VALVULA", name: "Válvulas y registros" },
      { slug: "ROSCADO", name: "Accesorios roscados" },
    ],
  },
  { slug: "SANI", name: "Aparatos sanitarios", subs: [] },
  { slug: "CONC", name: "Concreto y agregados", subs: [] },
  { slug: "ACERO", name: "Acero y metálicos", subs: [] },
  { slug: "FERR", name: "Ferretería y fijaciones", subs: [] },
  { slug: "MAMP", name: "Mampostería y prefabricados", subs: [] },
  { slug: "ACAB", name: "Acabados y pintura", subs: [] },
  { slug: "CARP", name: "Carpintería, cubierta y vidrio", subs: [] },
  { slug: "SERV", name: "Servicios y subcontratos", subs: [] },
];

export const CATEGORIA_POR_SLUG: Record<string, CategoriaDef> = Object.fromEntries(
  TAXONOMIA.map((c) => [c.slug, c])
);

/* ---------------------------------------------------------------------------
   Reglas
   --------------------------------------------------------------------------- */
interface Regla {
  cat: string;
  sub?: string;
  re: RegExp;
  /** Patrón genérico: acierta la categoría pero podría ser otra. Baja la confianza. */
  debil?: boolean;
}

/**
 * Gana la PRIMERA regla que coincide, así que el orden es la lógica principal:
 *
 * - "Redes" antes que "Eléctricos" porque PATCH PANEL contiene PANEL.
 * - "Iluminación" antes que "Eléctricos" porque PANEL LED contiene PANEL.
 * - "Media tensión" antes que "Eléctricos" porque un transformador es un
 *   equipo eléctrico, pero lo vende otro tipo de proveedor.
 * - "Aparatos sanitarios" antes que "PVC" porque un tubo PVC sanitario y un
 *   sanitario de porcelana no los surte el mismo proveedor.
 * - "PVC" antes que "Hidráulico" porque TUBO PVC es PVC, no tubería metálica.
 * - "Ferretería" antes que "Acero" porque un tornillo se compra en ferretería
 *   aunque sea de acero.
 *
 * Sin acentos: el texto llega normalizado por `normalizar()`.
 */
const REGLAS: Regla[] = [
  // --- Servicios que se confunden con equipos -------------------------------
  // Van de primeras: "CONTRATO SMARTNET PARA WS-C2960X" es un servicio, no un
  // switch, y "INSTALACION MONITOR A PARED" es mano de obra, no un monitor.
  { cat: "SERV", re: /CONTRATO DE SERVICIO|SMARTNET|STARTUP|EXTENSION DE GARANTIA|PLAN SERVICIO|MANTENIMIENTO DE FABRICA|^INSTALACION|CUADRILLA|^INGENIERO|OBRA CIVIL|EXCAVACION|RESANE|PRUEBA.?HIDRO|PLANOS RECORD|ROTULADO|BOTADERO|DESINFECCION|MATERIAL DE OFICINA|CONEXIONES ACOMETIDA|CONEXIONES DOMICILIARIAS|MONTACARGAS|ROSCADORA|ACPM/ },

  // --- Redes y datos --------------------------------------------------------
  { cat: "RED", sub: "SEGURI", re: /CCTV|CAMARA|NVR|DVR|CONTROL DE ACCESO|TALANQUERA|BIOMETR|VIDEOPORTERO|ALARMA|INCENDIO|SIRENA|ESTROBO|STOPPER|ESTACION MANUAL|PULSADOR|DETECTOR|ELECTROIMAN|ELECTROIMAN|TORNIQUETE|LECTOR|PROXIMIDAD|WIEGAND|BUZZER|TECLADO REMOTO|PANEL DE INTRUSION|BRAZO HIDRAULICO|CONTROLADORA?( MODULAR)? \d* ?LECTORAS?|EXPANSION CONTROLADOR/ },
  { cat: "RED", sub: "ACTIVO", re: /SWITCH|ACCESS POINT|SFP|ROUTER|FIREWALL|CONTROLADOR|MONITOR|POWERPACK|COMPUTADOR|IMPRESORA|DISCO DURO|TOTEM|TOUCHSCREEN/ },
  { cat: "RED", sub: "ESTRUCT", re: /PATCH|RACK|FIBRA OPTICA|UTP|CAT ?[567]|JACK|RJ ?45|FACEPLATE|ODF|BALUN|BANDEJA DE FIBRA|BANDEJA SENCILLA|ORGANIZADOR HORIZONTAL|PIGTAIL|OM4|PUNTO CONSOLIDACION|CERTIFICACION DE PUNTO/ },
  { cat: "RED", re: /TELEFON|CABLEADO ESTRUCTURADO|ANTENA/, debil: true },

  // --- Media y baja tensión -------------------------------------------------
  { cat: "MT", sub: "TRAFO", re: /TRANSFORMADOR|BOMBINADO/ },
  { cat: "MT", sub: "CELDA", re: /CELDA|SECCIONADOR|CORTACIRCUITO|PARARRAY|DPS|15 ?KV|13\.?2 ?KV|MEDIA TENSION/ },
  { cat: "MT", sub: "POSTE", re: /CRUCETA|AISLADOR|POSTE|ANTIBALANCEO|RETENIDA|HERRAJE|PERCHA/ },

  // --- Iluminación ----------------------------------------------------------
  { cat: "ILUM", re: /LUMINARIA|BOMBILL|LAMPARA|REFLECTOR|APLIQUE|FOTOCELDA|BALASTO|ILUMINACION|PANEL LED|TUBO LED|LED/ },

  // --- Eléctricos -----------------------------------------------------------
  { cat: "ELEC", sub: "CABLE", re: /CABLE|CONDUCTOR|ENCAUCHE|AWG|ALAMBRE DE COBRE|HFFRLS|ANTIFLAMA|XLPE|ASCR/ },
  { cat: "ELEC", sub: "TABLERO", re: /TABLERO|BREAKER|INTERRUPTOR AUTOMATICO|TOTALIZADOR|GABINETE|BARRAJE|CONTACTOR|RELE|UPS|PLANTA ELECTRICA|MEDIDOR DE ENERGIA|MEDIDOR ELECTRONICO|DIFERENCIAL|ELECTROGENO|FUSIBLE|TERMOMAGNETIC|CLAVIJA|BORNAS|INVERSOR|BATERIA|PANEL SOLAR|DRIVER|DIMMER|RIEL CHANNEL|DERIVACION PLANA|PRENSAESTOPA|CAPACETE|UNIDAD DE PROGRAMACION|^TC[ ,]/ },
  { cat: "ELEC", sub: "TIERRA", re: /PUESTA A TIERRA|COPPERWELD|EXOTERMIC|MALLA A TIERRA|VARILLA DE TIERRA|PUNTA CAPT|BASE DE PUNTA|TEMPLETE|HIDROSOLTAX|TRATAMIENTO DE TERRENO/ },
  { cat: "ELEC", sub: "DUCTO", re: /CANALETA|CORAZA|CONDUIT|EMT|IMC|TUBO ELECTRIC|BANDEJA PORTACABLE|TROQUEL|DIVISION CANALETA/ },
  { cat: "ELEC", sub: "SALIDA", re: /TOMA|INTERRUPTOR|SALIDA ELECTRIC|CAJA RAWELT|CAJA ELECTRIC|CAJA DE PASO/ },
  { cat: "ELEC", re: /TERMINAL|CONECTOR|SENSOR|MODULO|FUENTE|ELECTRIC|VOLTAJE|AMPERIMETRO|SUPLEMENTO PARA CAJA/, debil: true },

  // --- Aparatos sanitarios --------------------------------------------------
  { cat: "SANI", re: /LAVAMANOS|ORINAL|DUCHA|GRIFERIA|LAVAPLATOS|INODORO|POCETA|SANITARIO DE|TAZA SANITARIA|TOALLER|SECADOR DE MANO|DISPENSADOR|BARRA DE APOYO/ },

  // --- PVC e hidrosanitario -------------------------------------------------
  { cat: "PVC", sub: "POTABLE", re: /AGUA POTABLE|CPVC|PVC PRESION|RDE ?\d|PRESION RDE/ },
  { cat: "PVC", sub: "NEGRAS", re: /AGUAS? NEGRA|AGUAS? RESIDUAL|SANITARI|ALCANTARILLADO|NOVAFORT|DESAGUE|SIFON/ },
  { cat: "PVC", sub: "LLUVIAS", re: /AGUAS? LLUVIA|BAJANTE|CANAL DE AGUA/ },
  { cat: "PVC", re: /PVC/ },

  // --- Hidráulico -----------------------------------------------------------
  { cat: "HID", sub: "VALVULA", re: /VALVULA|REGISTRO|CHEQUE|HIDRANTE|FLOTADOR|MEDIDOR DE AGUA|MEDIDOR CHORRO|LLAVE DE PASO|LLAVE TERMINAL|SIAMESA|BOMBEROS|EXTINTOR|BOMBA/ },
  { cat: "HID", sub: "TUBMET", re: /SCH ?40|TUBO GALVANIZAD|TUBERIA GALVANIZAD|TUBO DE COBRE|HIERRO FUNDIDO|GORRO CHINO/ },
  { cat: "HID", sub: "ROSCADO", re: /NIPLE|BUJE|TAPON|SEMICODO|FLANCHE|ADAPTADOR|ACOPLE|UNION UNIVERSAL|UNIVERSAL GALVANIZADA|COUPLIN|BRIDA|SELLO EL[AE]STOMERICO|SILLA YE|CUPULA TRAGANTE|JUNTA DE EXPANSION|TANQUE/ },
  { cat: "HID", re: /TUBO|TUBERIA|CODO|TEE|YEE|UNION|REDUCCION|MANGUERA|ABASTO|LLAVE/, debil: true },

  // --- Concreto y agregados -------------------------------------------------
  { cat: "CONC", re: /CONCRETO|CEMENTO|ARENA|GRAVA|TRITURADO|MORTERO|RECEBO|SUB ?BASE|BASE GRANULAR|GROUT|PLASTOCRETE|ADITIVO|CURASEAL|SIKAFLOOR|ENDURECEDOR|MARMOLINA|CARPETA ASFALTICA|EMULSION ASFALTICA|RAJON|GRAVILLA|POLIETILENO|ANTISOL|DESMOLDANTE|^AGUA$/ },

  // --- Ferretería y fijaciones ----------------------------------------------
  { cat: "FERR", re: /BROCA|PERNO|PUNTILLA|REMACHE|TORNILLO|ARANDELA|TUERCA|ESPARRAGO|ABRAZADERA|GRAPA|ANCLAJE|CLAVO|FULMINANTE|CHAZO|LIJA|DISCO|SEGUETA|SILICONA|SIKABOND|SIKAFLEX|MASILLA|PEGANTE|PEGACOR|ADHESIVO|CINTA|EPOXIC|ELEMENTOS? DE FIJACION|ACCESORIOS? DE FIJACION|SOLDADURA|ELECTRODO|HEBILLA|ESLABON|GRILLETE|AMARRE|ANILLO|EMPAQUE|VASELINA|PASADOR/ },

  // --- Acero y metálicos ----------------------------------------------------
  { cat: "ACERO", re: /ACERO|VARILLA|MALLA (ELECTROSOLDADA|ESLABONADA)|PERFIL|PERLIN|LAMINA|PLATINA|ANGULO|CERCHA|CORREA|BASTIDOR|PARAL|CANAL FC|OMEGA|TUBULAR|ALAMBRE|BOLARDO|WIN METALICO|ESPEJO|SUPLEMENTO/, debil: true },

  // --- Mampostería y prefabricados ------------------------------------------
  { cat: "MAMP", re: /BLOQUE|LADRILLO|SARDINEL|ADOQUIN|PREFABRICAD|CALADO|BORDILLO|CAJA DE INSPECCION|POZO DE INSPECCION|GAVION|TAPA/ },

  // --- Acabados y pintura ---------------------------------------------------
  { cat: "ACAB", re: /PINTURA|ESTUCO|SIKA|IMPERMEABILIZ|ENCHAPE|CERAMIC|PORCELANATO|BOQUILLA|GRANITO|MARMOL|SAPOLIN|VINILO|ANTICORROSIV|ESMALTE|MANTO|TABLETA|GUARDAESCOBA|SELLADOR|POLISOMBRA|COBERTURA VEGETAL|CESPED|ARBOL/ },

  // --- Carpintería, cubierta y vidrio ---------------------------------------
  { cat: "CARP", re: /PUERTA|VENTANA|MADERA|DRYWALL|SUPERBOARD|CIELO RASO|TEJA|CUBIERTA|POLICARBONATO|ALUMINIO|VIDRIO|CERRADURA|BISAGRA|MARCO|MUEBLE|CLOSET|PASAMANOS|BARANDA|DURMIENTE|TABLA |CHAPA|REJILLA|FIBRA DE VID|DIVISION|SOPORTE EN L/ },

  // --- Servicios y subcontratos ---------------------------------------------
  { cat: "SERV", re: /SUBCONTRATO|MANO DE OBRA|TRANSPORTE|ALQUILER|DERECHOS DE CONEXION|TRAMITE|LICENCIA|ENSAYO|ESTUDIO|DISENO|CERTIFICAC|RETIE|CAPACITACION|JORNAL|SENALIZACION|VALLA|EQUIPO|HERRAMIENTA/ },

  // --- Cajones genéricos: solo si nada anterior coincidió -------------------
  { cat: "ELEC", re: /CAJA|CURVA|UNION|ACCESORIOS/, debil: true },
  { cat: "ACERO", re: /SOPORTE|BARRA|KIT|ELEMENTOS/, debil: true },
];

export type Confianza = "alta" | "media";

export interface Clasificacion {
  /** Slug de la categoría raíz, o null si ninguna regla coincidió. */
  cat: string | null;
  /** Slug de la subcategoría dentro de esa categoría, si la regla la precisó. */
  sub: string | null;
  confianza: Confianza | null;
}

/** Mayúsculas y sin acentos: los datos vienen escritos de cualquier forma. */
export function normalizar(s: string): string {
  // ̀-ͯ es el bloque de tildes que NFD separa de la letra base.
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

export function clasificar(descripcion: string): Clasificacion {
  const d = normalizar(descripcion);
  for (const r of REGLAS) {
    if (r.re.test(d)) {
      return { cat: r.cat, sub: r.sub ?? null, confianza: r.debil ? "media" : "alta" };
    }
  }
  return { cat: null, sub: null, confianza: null };
}

/* ---------------------------------------------------------------------------
   Normalización de unidades
   --------------------------------------------------------------------------- */

/**
 * Libro1 trae 43 grafías distintas para unas 15 unidades reales: UN, un, UND,
 * und, UNIDAD, Und, Unidad son todas la misma. Sin unificarlas, cualquier
 * agrupación o total por unidad sale partido en pedazos.
 */
const UNIDADES: Array<[RegExp, string]> = [
  [/^(UN|UND|UNID|UNIDAD|U)$/, "un"],
  [/^(ML|LM|M\.?L\.?)$/, "ml"],
  [/^(M|MT|MTS|METRO)$/, "m"],
  [/^(M2|MT2|METRO2)$/, "m2"],
  [/^(M3|MT3|METRO3)$/, "m3"],
  [/^(KG|KILO|KILOS|KGS)$/, "kg"],
  [/^(GL|GLN|GALON|GALONES)$/, "gl"],
  [/^(GLB|GLOBAL)$/, "glb"],
  [/^(LT|L|LITRO|LITROS)$/, "lt"],
  [/^(HR|HORA|HORAS|H)$/, "hr"],
  [/^(JR|JORNAL|JORNALES)$/, "jornal"],
  [/^(LB|LIBRA|LIBRAS)$/, "lb"],
  [/^(CC|CM3)$/, "cc"],
  [/^(PL|PULG|PULGADA)$/, "pl"],
  [/^(DIA|DIAS)$/, "dia"],
];

export function normalizarUnidad(u: string | null | undefined): string | null {
  if (!u) return null;
  const n = normalizar(u).replace(/[.\s]/g, "");
  if (!n) return null;
  for (const [re, canon] of UNIDADES) if (re.test(n)) return canon;
  // Lo que no está en el catálogo se conserva tal cual: es mejor una unidad
  // rara visible que una unidad borrada.
  return u.trim();
}
