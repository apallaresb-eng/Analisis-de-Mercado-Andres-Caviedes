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
  {
    slug: "ILUM", name: "Iluminación",
    subs: [
      { slug: "INTERIOR", name: "Luminarias interiores" },
      { slug: "EXTERIOR", name: "Alumbrado público y exterior" },
    ],
  },
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
  {
    slug: "SANI", name: "Aparatos sanitarios",
    subs: [
      { slug: "APARATO", name: "Aparatos y grifería" },
      { slug: "ACCES", name: "Accesorios de baño en acero inoxidable" },
    ],
  },
  {
    slug: "CONC", name: "Concreto y agregados",
    subs: [
      { slug: "CEMENTO", name: "Cemento, concreto y mortero" },
      { slug: "AGREG", name: "Agregados pétreos" },
      { slug: "ADITIVO", name: "Aditivos y químicos para concreto" },
    ],
  },
  {
    // La razón de ser de estas tres: una siderúrgica no vende aluminio, y un
    // taller de inoxidable no vende varilla de refuerzo. Son mercados distintos.
    slug: "ACERO", name: "Acero y metálicos",
    subs: [
      { slug: "REFUERZO", name: "Acero de refuerzo" },
      { slug: "ESTRUCT", name: "Perfilería, lámina y estructural" },
      { slug: "INOX", name: "Acero inoxidable" },
    ],
  },
  {
    slug: "FERR", name: "Ferretería y fijaciones",
    subs: [
      { slug: "FIJACION", name: "Tornillería y fijaciones" },
      { slug: "HERRAM", name: "Herramienta y abrasivos" },
      { slug: "QUIMICO", name: "Selladores, adhesivos y cintas" },
      { slug: "SOLDADURA", name: "Soldadura y electrodos" },
    ],
  },
  {
    slug: "MAMP", name: "Mampostería y prefabricados",
    subs: [
      { slug: "LADRILLO", name: "Ladrillo y bloque" },
      { slug: "PREFAB", name: "Prefabricados de concreto" },
    ],
  },
  {
    slug: "ACAB", name: "Acabados y pintura",
    subs: [
      { slug: "PINTURA", name: "Pintura y recubrimientos" },
      { slug: "ENCHAPE", name: "Enchapes, pisos y cerámica" },
      { slug: "IMPER", name: "Impermeabilización" },
    ],
  },
  {
    slug: "CARP", name: "Carpintería, cubierta y vidrio",
    subs: [
      { slug: "MADERA", name: "Madera y carpintería" },
      { slug: "ALUM", name: "Aluminio y vidrio" },
      { slug: "PUERTA", name: "Puertas y cerrajería" },
      { slug: "DRYWALL", name: "Drywall y cielo raso" },
      { slug: "CUBIERTA", name: "Cubierta y teja" },
    ],
  },
  {
    slug: "SERV", name: "Servicios y subcontratos",
    subs: [
      { slug: "OBRA", name: "Mano de obra y subcontratos" },
      { slug: "CERTIF", name: "Certificaciones, trámites y pruebas" },
      { slug: "EQUIPO", name: "Alquiler de equipo" },
      { slug: "LICENCIA", name: "Licencias y soporte de fábrica" },
    ],
  },
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
  { cat: "SERV", sub: "LICENCIA", re: /CONTRATO DE SERVICIO|SMARTNET|STARTUP|EXTENSION DE GARANTIA|PLAN SERVICIO|MANTENIMIENTO DE FABRICA/ },
  { cat: "SERV", sub: "OBRA", re: /^INSTALACION|CUADRILLA|^INGENIERO|OBRA CIVIL|EXCAVACION|RESANE/ },
  { cat: "SERV", sub: "CERTIF", re: /PRUEBA.?HIDRO|PLANOS RECORD|BOTADERO|DESINFECCION|CONEXIONES (ACOMETIDA|DOMICILIARIAS)/ },
  { cat: "SERV", sub: "EQUIPO", re: /MONTACARGAS|ROSCADORA/ },
  { cat: "SERV", re: /ROTULADO|MATERIAL DE OFICINA|ACPM/, debil: true },

  // --- Redes y datos --------------------------------------------------------
  { cat: "RED", sub: "SEGURI", re: /CCTV|CAMARA|NVR|DVR|CONTROL DE ACCESO|TALANQUERA|BIOMETR|VIDEOPORTERO|ALARMA|INCENDIO|SIRENA|ESTROBO|STOPPER|ESTACION MANUAL|PULSADOR|DETECTOR|ELECTROIMAN|ELECTROIMAN|TORNIQUETE|LECTOR|PROXIMIDAD|WIEGAND|BUZZER|TECLADO REMOTO|PANEL DE INTRUSION|BRAZO HIDRAULICO|CONTROLADORA?( MODULAR)? \d* ?LECTORAS?|EXPANSION CONTROLADOR/ },
  { cat: "RED", sub: "ACTIVO", re: /SWITCH|ACCESS POINT|SFP|ROUTER|FIREWALL|CONTROLADOR|MONITOR|POWERPACK|COMPUTADOR|IMPRESORA|DISCO DURO|TOTEM|TOUCHSCREEN/ },
  { cat: "RED", sub: "ESTRUCT", re: /PATCH|RACK|FIBRA OPTICA|UTP|CAT ?[567]|JACK|RJ ?45|FACEPLATE|ODF|BALUN|BANDEJA DE FIBRA|BANDEJA SENCILLA|ORGANIZADOR HORIZONTAL|PIGTAIL|OM4|PUNTO CONSOLIDACION|CERTIFICACION DE PUNTO/ },
  { cat: "RED", re: /TELEFON|CABLEADO ESTRUCTURADO|ANTENA/, debil: true },

  // --- Media y baja tensión -------------------------------------------------
  { cat: "MT", sub: "TRAFO", re: /TRANSFORMADOR|BOMBINADO/ },
  { cat: "MT", sub: "CELDA", re: /CELDA|SECCIONADOR|CORTACIRCUITO|PARARRAY|DPS|15 ?KV|13\.?2 ?KV|MEDIA TENSION/ },
  { cat: "MT", sub: "POSTE", re: /CRUCETA|AISLADOR|POSTE|ANTIBALANCEO|RETENIDA|HERRAJE|PERCHA|SOPORTE PARA ALAMBRON/ },

  // --- Puesta a tierra ------------------------------------------------------
  // Va ANTES de acero: una varilla coperweld y una barra de tierra son de cobre
  // y las vende un eléctrico, no una siderúrgica. Antes caían en "Acero".
  { cat: "ELEC", sub: "TIERRA", re: /PUESTA A TIERRA|COPP?ERWELD|EXOTERMIC|CADWELL|MALLA A TIERRA|VARILLA DE (TIERRA|COBRE)|BARRA DE (TIERRA|COBRE)|PUNTA CAPT|BASE DE PUNTA|TEMPLETE|HIDROSOLTAX|TRATAMIENTO DE TERRENO|\bSPT\b|GRAPA BIMETALICA/ },

  // --- Iluminación ----------------------------------------------------------
  // \bLED\b con límites de palabra a propósito: sin ellos "COLD ROLLED" contiene
  // "LED", y las láminas y puertas de lámina cold rolled terminaban clasificadas
  // como luminarias.
  { cat: "ILUM", sub: "EXTERIOR", re: /ALUMBRADO PUBLICO|\bLED\b STREET|ANTIV?[AB]NDALIC|BALA DE PISO|APLIQUE TORTUGA|REFLECTOR|BRAZO PARA SOPORTE DE LUMINARIA/ },
  { cat: "ILUM", sub: "INTERIOR", re: /LUMINARIA|BOMBILL|LAMPARA|APLIQUE|FOTOCELDA|BALASTO|PANEL \bLED\b|BALA \bLED\b|CINTA \bLED\b|PANEL REDONDO/ },
  { cat: "ILUM", re: /ILUMINACION|\bLED\b/, debil: true },

  // --- Eléctricos -----------------------------------------------------------
  // ALAMBRON DE ALUMINIO 6201 es conductor de línea aérea, no alambrón de acero.
  { cat: "ELEC", sub: "CABLE", re: /CABLE|CONDUCTOR|ENCAUCHE|AWG|ALAMBRE DE COBRE|HFFRLS|ANTIFLAMA|XLPE|ASCR|ALAMBRON DE ALUMINIO|ALAMBRON.*6201/ },
  { cat: "ELEC", sub: "TABLERO", re: /TABLERO|BREAKER|INTERRUPTOR AUTOMATICO|TOTALIZADOR|GABINETE|BARRAJE|CONTACTOR|RELE|UPS|PLANTA ELECTRICA|MEDIDOR DE ENERGIA|MEDIDOR ELECTRONICO|DIFERENCIAL|ELECTROGENO|FUSIBLE|TERMOMAGNETIC|CLAVIJA|BORNAS|INVERSOR|BATERIA|PANEL SOLAR|DRIVER|DIMMER|RIEL CHANNEL|DERIVACION PLANA|PRENSAESTOPA|CAPACETE|UNIDAD DE PROGRAMACION|^TC[ ,]/ },
  { cat: "ELEC", re: /AIRE ACONDICIONADO|MINISPLIT|UNIDAD CONDENSADORA/ },
  { cat: "ELEC", sub: "DUCTO", re: /CANALETA|CORAZA|CONDUIT|EMT|IMC|TUBO ELECTRIC|BANDEJA PORTACABLE|TROQUEL|DIVISION CANALETA/ },
  { cat: "ELEC", sub: "SALIDA", re: /TOMA|INTERRUPTOR|SALIDA ELECTRIC|CAJA RAWELT|CAJA ELECTRIC|CAJA DE PASO/ },
  { cat: "ELEC", re: /TERMINAL|CONECTOR|SENSOR|MODULO|FUENTE|ELECTRIC|VOLTAJE|AMPERIMETRO|SUPLEMENTO PARA CAJA/, debil: true },

  // --- Aparatos sanitarios --------------------------------------------------
  // Los accesorios en inoxidable van primero: "mesón en acero inoxidable con
  // poceta" lo hace un taller de inoxidable, no Corona.
  { cat: "SANI", sub: "ACCES", re: /DISPENSADOR|TOALLER|SECADOR DE MANO|BARRA DE APOYO|MESON EN ACERO INOX/ },
  { cat: "SANI", sub: "APARATO", re: /LAVAMANOS|ORINAL|DUCHA|GRIFERIA|LAVAPLATOS|INODORO|POCETA|SANITARIO DE|TAZA SANITARIA|DESAGUE SIFON/ },

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

  // --- Carpintería, cubierta y vidrio ---------------------------------------
  // Va ANTES de ferretería y acero. Antes las nueve puertas "P-1, P-2…" caían
  // en ferretería por traer tornillos y anclajes en la descripción, y las
  // ventanas de aluminio en acero por la palabra "perfil".
  //
  // Las puertas van de primeras dentro del bloque porque varias mencionan
  // "acero inoxidable" en su marco y se las llevaba el taller de inoxidable.
  { cat: "CARP", sub: "PUERTA", re: /PUERTA|CERRADURA|BISAGRA|MARCO DILATADO/ },
  { cat: "CARP", sub: "CUBIERTA", re: /TEJA|CUBIERTA|CANAL AMAZONAS|CABALLETE/ },

  // --- Acero inoxidable -----------------------------------------------------
  // Antes del resto de carpintería: "rejilla de cárcamo en acero inoxidable" la
  // hace un taller de inoxidable, y la palabra "rejilla" se la llevaba allá.
  { cat: "ACERO", sub: "INOX", re: /INOXIDABLE|\bINOX\b|AUSTENITICO/ },

  { cat: "CARP", sub: "ALUM", re: /ALUMINIO|ANODIZADO|VIDRIO|CRISTAL|ESPEJO|VENTANA|POLICARBONATO|VITRINA/ },
  { cat: "CARP", sub: "DRYWALL", re: /DRYWALL|SUPERBOARD|CIELO RASO|FIBROCEMENTO|CANAL FC|PARAL FC|ICOPOR/ },
  { cat: "CARP", sub: "MADERA", re: /MADERA|DURMIENTE|LISTON|BOCEL|TABLA CHAPA|TABLA |FORMALETA/ },
  { cat: "CARP", re: /MUEBLE|CLOSET|PASAMANOS|BARANDA|REJILLA|DIVISION MODULAR/, debil: true },

  // --- Concreto y agregados -------------------------------------------------
  // Los aditivos primero: Sika Grout y Plastocrete los vende un químico de
  // construcción, no una cantera ni una cementera.
  { cat: "CONC", sub: "ADITIVO", re: /ADITIVO|PLASTOCRETE|ANTISOL|DESMOLDANTE|CURASEAL|SIKAFLOOR|GROUT|ENDURECEDOR|MARMOLINA|POLIETILENO|DISTANCIADOR|CARPETA ASFALTICA|EMULSION ASFALTICA/ },
  { cat: "CONC", sub: "AGREG", re: /ARENA|GRAVA|GRAVILLA|TRITURADO|RECEBO|RAJON|SUB ?BASE|BASE GRANULAR|MATERIAL DE PRESTAMO/ },
  { cat: "CONC", sub: "CEMENTO", re: /CONCRETO|\bCEMENTO\b|MORTERO|^AGUA$/ },

  // --- Mampostería y prefabricados ------------------------------------------
  { cat: "MAMP", sub: "LADRILLO", re: /BLOQUE|LADRILLO|CALADO/ },
  { cat: "MAMP", sub: "PREFAB", re: /SARDINEL|ADOQUIN|PREFABRICAD|BORDILLO|CAJA DE INSPECCION|POZO DE INSPECCION|GAVION|LOSETA|CARCAMO|TOPELLANTAS|GARGOLA|TRAMPA DE GRASA|\bMARCO\b|TAPA/ },

  // --- Acabados y pintura ---------------------------------------------------
  // Solo los Sika de impermeabilización: SikaBond y Sikaflex son adhesivos y
  // van en ferretería, así que aquí se nombran uno por uno en vez de "SIKA".
  { cat: "ACAB", sub: "IMPER", re: /IMPERMEABILIZ|MANTO|SIKAFILL|SIKA ?1\b|SIKA LATEX|SIKA ROD|SIKA SEPAROL|ASFALTIC/ },
  { cat: "ACAB", sub: "ENCHAPE", re: /ENCHAPE|CERAMIC|PORCELANATO|BOQUILLA|GRANITO|MARMOL|TABLETA|GUARDAESCOBA|MESON EN LAMINA DE GRANITO/ },
  { cat: "ACAB", sub: "PINTURA", re: /PINTURA|ESTUCO|SAPOLIN|VINILO|ANTICORROSIV|ESMALTE|WASH PRIMER|LACA|SELLADOR ACRILICO/ },
  { cat: "ACAB", re: /POLISOMBRA|COBERTURA VEGETAL|CESPED|ARBOL|JARDIN/, debil: true },

  // --- Ferretería y fijaciones ----------------------------------------------
  { cat: "FERR", sub: "SOLDADURA", re: /SOLDADURA|ELECTRODO|OXIGENO INDUSTRIAL|ACETILENO/ },
  { cat: "FERR", sub: "HERRAM", re: /BROCA|LIJA|DISCO|SEGUETA|HERRAMIENTA|ESCOBA|ELEMENTOS DE LIMPIEZA|RODILLO|BROCHA/ },
  { cat: "FERR", sub: "QUIMICO", re: /SILICONA|SIKABOND|SIKAFLEX|MASILLA|PEGANTE|PEGACOR|ADHESIVO|CINTA|EPOXIC|VASELINA|EMPAQUE|SELLANTE/ },
  { cat: "FERR", sub: "FIJACION", re: /PERNO|PUNTILLA|REMACHE|TORNILLO|ARANDELA|TUERCA|ESPARRAGO|ABRAZADERA|GRAPA|ANCLAJE|CLAVO|FULMINANTE|CHAZO|HEBILLA|ESLABON|GRILLETE|AMARRE|ANILLO|PASADOR|ELEMENTOS? DE FIJACION|ACCESORIOS? DE FIJACION|ACCESORIO DE (ANCLAJE|FIJACION)/ },

  // --- Acero y metálicos ----------------------------------------------------
  // Tres mercados que no se solapan: la siderúrgica que hace varilla, el
  // distribuidor de perfilería y lámina, y el taller de inoxidable.
  { cat: "ACERO", sub: "INOX", re: /INOXIDABLE|\bINOX\b|AUSTENITICO/ },
  { cat: "ACERO", sub: "REFUERZO", re: /ACERO DE REFUERZO|VARILLA|MALLA (ELECTROSOLDADA|ESLABONADA)|ALAMBRE|ALAMBRON|ESTRIBO|GRAFILADA|ACERO FIGURADO/ },
  { cat: "ACERO", sub: "ESTRUCT", re: /PERFIL|PERLIN|LAMINA|PLATINA|ANGULO|CERCHA|CORREA|OMEGA|TUBULAR|VIGA|\bIPE\b|\bHEA\b|BOLARDO|WIN METALICO|BASTIDOR|MALLA EXPANDIDA|COLD ROLLED/ },
  { cat: "ACERO", re: /ACERO|METALIC|SOPORTE|BARRA|\bKIT\b|SUPLEMENTO|ESTRIBO DE SOPORTE|DIAGONAL/, debil: true },

  // --- Servicios y subcontratos ---------------------------------------------
  { cat: "SERV", sub: "CERTIF", re: /CERTIFICAC|RETIE|RETILAP|ONAC|ENSAYO|PRUEBA|TRAMITE|DERECHOS DE CONEXION|PLANOS RECORD|LICENCIA DE CONSTRUCCION|DESINFECCION|BOTADERO/ },
  { cat: "SERV", sub: "LICENCIA", re: /LICENCIA|SMARTNET|GARANTIA|PLAN SERVICIO|MANTENIMIENTO DE FABRICA|STARTUP|SOPORTE/ },
  { cat: "SERV", sub: "EQUIPO", re: /ALQUILER|ANDAMIO|MONTACARGAS|ROSCADORA|EQUIPO|HERRAMIENTA MENOR/ },
  { cat: "SERV", sub: "OBRA", re: /SUBCONTRATO|MANO DE OBRA|CUADRILLA|JORNAL|OBRA CIVIL|EXCAVACION|RESANE|REGATA|INGENIERO|TRANSPORTE|CAPACITACION|INSTALACION/ },
  { cat: "SERV", re: /SENALIZACION|VALLA|MATERIAL DE OFICINA|ROTULADO/, debil: true },

  // --- Cajones genéricos: solo si nada anterior coincidió -------------------
  { cat: "ELEC", re: /CAJA|CURVA|UNION|ACCESORIOS/, debil: true },
  { cat: "ACERO", re: /ELEMENTOS/, debil: true },
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
