# Cómo cargar ítems desde un Excel

Manual para el equipo de compras · Consorcio AMG · CPI

---

## Para qué sirve

Para pasar una lista de materiales de un archivo de Excel al tablero, sin
escribirlos uno por uno. Sirve para presupuestos, listas de insumos o cualquier
tabla que tenga por lo menos **un código y una descripción** por fila.

**Solo el administrador puede importar.** Si usted no ve el botón, no es un
error: su cuenta es de operario.

---

## Antes de empezar

- El archivo debe terminar en **.xlsx**. Si el suyo es `.xls` o `.csv`, ábralo
  en Excel y guárdelo como *Libro de Excel (.xlsx)*.
- Escoja primero la obra a la que van los ítems, arriba en el selector.
- El archivo **no se sube a internet**: se lee en su computador.

---

## Los tres pasos

### Paso 1 — Elegir el archivo

1. Entre a la pestaña **Gestionar obras**.
2. Presione **Importar ítems desde Excel**.
3. Presione **Seleccionar archivo .xlsx** y busque su archivo.

Espere unos segundos. Si el archivo es grande puede demorar.

---

### Paso 2 — Revisar

Esta es la pantalla importante. Tiene cuatro cosas que revisar.

#### a) La hoja

Si su archivo tiene varias hojas, elija la que tiene la lista de materiales.
Al lado de cada nombre aparece cuántas filas tiene, lo que ayuda a reconocerla:
la hoja buena casi siempre es la de más filas.

#### b) La fila de encabezados

**Esto es lo que más confunde, y es sencillo.**

La *fila de encabezados* es la fila donde están los títulos de las columnas:
`CODIGO`, `DESCRIPCION`, `UNIDAD`…

Muchas veces **no es la fila 1**. En los presupuestos de obra lo normal es que
arriba vaya el membrete: nombre de la obra, contrato, contratista. Los títulos
de verdad aparecen más abajo.

> **Ejemplo real:** en el archivo `Libro1.xlsx` de Simití, las filas 1 a 12 son
> el membrete de la obra. Los títulos `CODIGO | DESCRIPCION | UNIDAD` están en
> la **fila 13**.

El sistema la busca solo y casi siempre acierta. Debajo del recuadro le muestra
qué encontró:

> *Encabezados detectados en la fila 13: CODIGO · DESCRIPCION · UNIDAD · …*

**Compare eso con su archivo.** Si son los títulos correctos, siga. Si no,
corrija el número a mano: escriba el número de fila tal como lo ve en Excel,
en la barra gris de la izquierda.

#### c) El mapeo de columnas

Aquí le dice al sistema qué columna de su archivo corresponde a cada campo.

| Campo | ¿Obligatorio? | Qué es |
|---|---|---|
| **Código** | **Sí** | El identificador del ítem: `M-0102` |
| **Descripción** | **Sí** | El nombre del material |
| Unidad | No | `kg`, `m2`, `un`… |
| Cantidad | No | Cuánto se necesita |
| Categoría | No | Grupo o capítulo |
| Especificación | No | Detalle técnico |

El sistema propone el mapeo solo, comparando los títulos. Revíselo y corrija lo
que esté mal con las listas desplegables.

Si falta **Código** o **Descripción**, el botón de importar queda apagado y le
dice cuál falta. Sin esos dos no se puede identificar un material.

#### d) La vista previa

Muestra las primeras 8 filas **tal como van a quedar guardadas**.

**Mírela con calma.** Si aquí se ve bien, la importación va a salir bien. Si ve
títulos de capítulo, subtotales o celdas corridas, es que la fila de encabezados
o el mapeo están mal: corrija arriba y la vista previa se actualiza sola.

Abajo puede aparecer un aviso como:

> *Se omitirán 18 filas sin código o sin descripción.*

Eso es **normal y bueno**: son los subtotales, los títulos de capítulo y las
notas al pie. No son materiales.

---

### Paso 3 — Confirmar

Presione **Importar N ítems**. Al terminar aparecen tres números:

| Número | Qué significa |
|---|---|
| **Importados** | Ítems nuevos que quedaron cargados |
| **Ya existían** | Códigos que ya estaban en la obra. **No se tocaron** |
| **Omitidas** | Filas que no eran materiales (subtotales, títulos) |

---

## Lo más importante que debe saber

> ### Reimportar nunca daña el trabajo hecho
>
> Si un código ya existe en la obra, el sistema **no lo modifica**: lo cuenta
> como "ya existía" y sigue.
>
> Esto quiere decir que puede importar el mismo archivo dos veces sin miedo, y
> que puede importar un archivo corregido sin perder los estados, las notas ni
> las cotizaciones que ya haya cargado el equipo.

---

## Si algo sale mal

| Lo que ve | Qué hacer |
|---|---|
| «No se pudo leer el archivo» | El archivo no es `.xlsx` o está dañado. Ábralo en Excel y guárdelo de nuevo como `.xlsx`. |
| La vista previa sale vacía | La fila de encabezados está mal. Corrija el número. |
| Salen títulos de capítulo como si fueran materiales | La columna de Código está mal asignada. Revise el mapeo. |
| Los importados son muchos menos de los esperados | Revise el número de "Ya existían": probablemente ya estaban cargados. |
| El botón de importar está apagado | Falta asignar Código o Descripción. El aviso rojo dice cuál. |
| No veo el botón de importar | Su cuenta es de operario. Pídale al administrador que importe. |

---

## Preguntas frecuentes

**¿Puedo importar solo una parte del archivo?**
No directamente. Borre en Excel las filas que no quiera y guarde una copia.
Recuerde que los subtotales y títulos se omiten solos.

**¿Qué pasa si me equivoqué de obra?**
Los ítems quedan en la obra que estaba seleccionada. Un administrador puede
borrarlos uno por uno desde el panel del ítem, en *Editar ficha → Borrar ítem*.

**¿Se pierden las cantidades si el Excel no las trae?**
No se pierde nada: la cantidad queda vacía y se puede escribir después, ítem por
ítem, desde el panel de detalle.

**¿Y si mi archivo tiene los precios?**
El importador no carga precios. Los precios entran como **cotizaciones**, con su
proveedor, su IVA y su flete, desde el panel de cada ítem.

---

*Ante cualquier duda, escriba al administrador antes de importar. Una
importación mal hecha se puede corregir, pero es más trabajo que preguntar.*
