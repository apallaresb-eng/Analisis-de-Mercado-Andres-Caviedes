# Puesta en marcha: cargar y clasificar los 1.071 ítems

Guía paso a paso · Consorcio AMG · CPI Educación Superior Simití

Al terminar esta guía el tablero queda con los **1.071 ítems de Libro1 cargados
y clasificados en 14 categorías**, listo para asignarles proveedores.

Son 7 pasos. Los cinco primeros se hacen en Supabase y toman unos 15 minutos.
Los dos últimos se hacen dentro de la aplicación.

> **Antes de empezar necesita dos cosas:**
> - Entrar a Supabase con la cuenta dueña del proyecto.
> - Que su usuario de la aplicación sea **administrador**. Si no lo es, en el
>   SQL Editor corra:
>   `update public.profiles set role = 'admin' where email = 'su-correo@ejemplo.com';`

---

## Cómo se ejecuta un archivo SQL en Supabase

Los pasos 2 a 5 se hacen siempre igual:

1. En Supabase, menú lateral → **SQL Editor** → **New query**.
2. Abrir el archivo `.sql` que se indique, copiar **todo** el contenido y pegarlo.
3. Pulsar **Run** (o `Ctrl+Enter`).

> **Truco importante para el paso 4:** si selecciona un trozo del texto con el
> mouse y pulsa Run, Supabase ejecuta **solo lo seleccionado**. Eso es lo que
> permite correr el reset por partes.

---

## Paso 1 — Respaldo

**Dónde:** en la aplicación.

Entre como administrador y pulse **Exportar Excel** en la barra de arriba.
Guarde el archivo en la carpeta del consorcio.

> Este es el único respaldo que va a existir. El plan gratuito de Supabase **no
> hace copias de seguridad**, y el paso 4 borra datos de forma permanente.
> No se salte este paso aunque hoy haya poca información cargada.

---

## Paso 2 — Crear las tablas nuevas

**Archivo:** `supabase/migrations/0004_categorias_solicitudes.sql`

Crea todo lo que necesita el sistema de categorías y solicitudes: las tablas
`categories`, `supplier_categories`, `quote_requests` y `quote_request_items`,
las columnas nuevas en `items`, `quotes` y `suppliers`, los permisos y la
sincronización en vivo.

**Lo que debe ver al terminar:** dos tablas de resultados.

| Resultado | Debe mostrar |
|---|---|
| Primera tabla | 4 filas, todas con `rowsecurity` en `true` |
| Segunda tabla | 8 nombres de tabla |

No borra nada. Si algo sale mal, no continúe: revise el error antes de seguir.

---

## Paso 3 — Crear las vistas de cobertura

**Archivo:** `supabase/migrations/0005_vistas_cobertura.sql`

**Lo que debe ver al terminar: 0 filas.**

Eso es correcto y esperado — todavía no hay categorías sembradas, así que no hay
nada que contar. Lo único que importa es que **termine sin error**.

---

## Paso 4 — Vaciar la obra ⚠️

**Archivo:** `scripts/reset_datos_obra.sql`

Este es el único paso que borra información. Borra los ítems, proveedores,
cotizaciones y categorías de **una** obra. **No** toca las obras en sí ni las
cuentas de las personas.

Se ejecuta en tres tandas, seleccionando con el mouse solo el bloque de cada una:

### 4a. Ver las obras

Seleccione y ejecute únicamente el primer `select` (el que está bajo el
comentario *PASO 1*). Le devuelve algo así:

| id | name | items | proveedores | cotizaciones |
|---|---|---|---|---|
| `a1b2c3d4-…` | Sede de Educación Superior — Simití | 200 | 31 | 0 |

**Copie el `id`** de la obra de Simití.

### 4b. Vaciar

Busque esta línea dentro del bloque `do $$`:

```sql
  crudo text := 'PEGUE-AQUI-EL-ID';
```

Reemplace `PEGUE-AQUI-EL-ID` por el id que copió, **dejando las comillas**:

```sql
  crudo text := 'a1b2c3d4-0000-4000-8000-000000000001';
```

Seleccione todo el bloque `do $$ … end $$;` y ejecútelo.

> Si olvida reemplazar el id, el script se detiene con el mensaje
> *"No reemplazó el id de la obra"* y **no borra nada**. Es la protección, no un
> error.

### 4c. Comprobar

Ejecute el último `select`. Los cinco conteos de la obra deben quedar en **cero**:

| items | proveedores | cotizaciones | categorias | solicitudes |
|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 |

---

## Paso 5 — Sembrar las categorías

**Archivo:** `supabase/seeds/seed_categorias.sql`

Reemplace `PEGUE-AQUI-EL-ID` por el **mismo id** del paso anterior y ejecute
todo el archivo.

**Lo que debe ver al terminar: 32 filas** — 14 categorías principales y 18
subcategorías.

Las 14 categorías son:

| Categoría | Subcategorías |
|---|---|
| Eléctricos | Cables · Tableros · Canalización · Salidas · Puesta a tierra |
| Media y baja tensión | Transformadores · Celdas · Postería y herrajes |
| Iluminación | — |
| Redes y datos | Cableado estructurado · Equipos activos · Seguridad electrónica |
| PVC e hidrosanitario | Agua potable · Aguas negras · Aguas lluvias · Accesorios |
| Hidráulico y accesorios | Tubería metálica · Válvulas · Accesorios roscados |
| Aparatos sanitarios | — |
| Concreto y agregados | — |
| Acero y metálicos | — |
| Ferretería y fijaciones | — |
| Mampostería y prefabricados | — |
| Acabados y pintura | — |
| Carpintería, cubierta y vidrio | — |
| Servicios y subcontratos | — |

---

## Paso 6 — Importar Libro1

**Dónde:** en la aplicación.

1. Pestaña **Gestionar obras**.
2. Verifique que arriba esté seleccionada la obra de Simití.
3. Pulse **Importar ítems desde Excel** → **Seleccionar archivo .xlsx**.
4. Elija `Libro1.xlsx`.

### Lo que debe revisar en la pantalla de mapeo

| Campo | Valor correcto |
|---|---|
| Hoja | `LISTA INSUMOS` |
| **Fila de encabezados** | **13** |
| Código | `CODIGO` |
| Descripción | `DESCRIPCION` |
| Unidad | `UNIDAD` |
| Cantidad | *— sin asignar —* |
| Categoría | *— sin asignar —* |
| Especificación | *— sin asignar —* |

> **La fila de encabezados es lo más importante.** En Libro1 las filas 1 a 12
> son el membrete de la obra (municipio, contrato, contratista). Los títulos
> `CODIGO | DESCRIPCION | UNIDAD` están en la **fila 13**. El sistema la detecta
> solo, pero confírmelo antes de importar.

**`VALOR UNITARIO`, `COTIZACION 1/2/3` y `PROVEEDOR 1/2/3` se dejan sin
asignar.** Se acordó cargar solamente los ítems; los precios entran después como
cotizaciones formales, con su proveedor, IVA y flete.

### Lo que debe ver al terminar

| Número | Valor esperado |
|---|---|
| Importados | **1.071** |
| Ya existían | 0 |
| Omitidas | 5 |

Las 5 omitidas son correctas: una fila en blanco a mitad del archivo, el código
`M-0978` que viene sin descripción, y tres filas vacías al final.

---

## Paso 7 — Clasificar los ítems

**Dónde:** en la aplicación, pestaña **Clasificar ítems** (solo la ve el
administrador).

El sistema lee la descripción de cada ítem y **propone** una categoría. Nada se
guarda solo: usted revisa y confirma.

Al entrar, los contadores deben decir:

| Contador | Valor |
|---|---|
| Ya clasificados | 0 |
| Con propuesta | **1.070** |
| Dudosos | **138** |
| Sin proponer | **1** |

Trabaje en este orden — de lo poco a lo mucho:

### 7a. Los que no tienen propuesta (1 ítem)

Pulse el chip **Sin proponer**. Aparece un solo ítem: *Estufa 4 quemadores*.

Márquelo con la casilla, elija una categoría en el desplegable
**Mover los marcados a…** y pulse **Mover**.

### 7b. Los dudosos (138 ítems)

Pulse el chip **Dudosos**. Son los que el sistema dedujo de una palabra genérica
—`TUBO`, `CAJA`, `SOPORTE`, `ACCESORIOS`— y por eso podrían estar mal.

Recórralos. Cuando encuentre varios mal clasificados hacia la misma categoría,
márquelos todos, elija la categoría correcta y pulse **Mover**. No hace falta
corregirlos uno por uno.

> Puede marcar de golpe con el botón **Marcar los N visibles**, y usar el
> buscador para filtrar (por ejemplo, escriba `PVC` para revisar solo esos).

### 7c. Aceptar el resto

Pulse el chip **Con propuesta** y luego el botón
**Aceptar las propuestas visibles**.

Un solo clic aplica todas las que queden. El botón procesa **toda la lista
filtrada**, no solamente las 400 filas que se alcanzan a ver en pantalla.

### Cómo debe quedar el reparto

Al terminar, en la **Cola de trabajo** el desplegable de categorías debe mostrar
aproximadamente esto:

| Categoría | Ítems |
|---|---:|
| Eléctricos | 328 |
| Redes y datos | 117 |
| Hidráulico y accesorios | 100 |
| Ferretería y fijaciones | 100 |
| PVC e hidrosanitario | 92 |
| Media y baja tensión | 72 |
| Acero y metálicos | 51 |
| Concreto y agregados | 51 |
| Servicios y subcontratos | 46 |
| Iluminación | 44 |
| Acabados y pintura | 22 |
| Mampostería y prefabricados | 18 |
| Carpintería, cubierta y vidrio | 16 |
| Aparatos sanitarios | 13 |

Si sus números difieren un poco es normal: dependen de las correcciones que haya
hecho en el paso 7b. Lo que **no** debe pasar es que quede un número alto en
*Sin categoría*.

---

## Si algo sale mal

| Lo que ve | Qué significa y qué hacer |
|---|---|
| `No reemplazó el id de la obra` | Falta pegar el id en la línea `crudo text := …`. Es la protección funcionando; no se borró nada |
| `No existe ninguna obra con el id …` | El id quedó mal copiado. Vuelva al paso 4a |
| `La obra no tiene categorías` | Falta el paso 5 |
| `permission denied for column category_id` | Falta el paso 2 |
| El importador propone otra fila de encabezados | Escriba **13** a mano. La vista previa se corrige sola |
| Importados muy por debajo de 1.071 | Mire el número de *Ya existían*: el reset del paso 4 no se aplicó a esa obra |
| La vista previa sale vacía | La fila de encabezados está mal |
| No aparece la pestaña *Clasificar ítems* | Su cuenta es de operario. Pida que la pasen a administrador |
| Quedaron muchos ítems *Sin categoría* | No se pulsó **Aceptar las propuestas visibles** en el paso 7c |

---

## Lo que sigue

Con los ítems cargados y clasificados, el tablero ya sirve para trabajar. Los
pasos siguientes son:

| # | Paso | Quién |
|---|---|---|
| 8 | Completar los proveedores que faltan (8 categorías cortas) | En curso |
| 9 | Cargar `supabase/seeds/seed_proveedores.sql` en Supabase | Usted |
| 10 | Crear y enviar las solicitudes desde el **Centro de cotizaciones** | Usted |

En el paso 10, cada casilla de la matriz es una solicitud independiente por
categoría y proveedor: pedirle PVC a un proveedor no cambia en nada lo que le
falte pedirle de Eléctricos, y **el proveedor no desaparece de la lista al
enviarle el mensaje**.

---

*Ante cualquier duda, pregunte antes de correr el paso 4. Todo lo demás se puede
repetir sin consecuencias; ese no.*
