# Valores de referencia de mano de obra — 2026

Guía para presupuestar los ítems de *Mano de obra y subcontratos* · Consorcio AMG · CPI

> **Esto NO es una cotización.** Son valores de referencia del mercado colombiano
> para que el equipo tenga un punto de partida al negociar con contratistas
> locales. La mano de obra se contrata en Barrancabermeja y Simití por
> referencia directa, no por catálogo de proveedores — por eso aquí van cifras
> y no empresas.
>
> Consultado el 13 de agosto de 2026. Verifique antes de usarlas en una
> propuesta formal: los valores de mano de obra cambian con cada decreto y con
> cada negociación sindical.

---

## 1. La base legal de 2026

Todo lo demás se deriva de aquí.

| Concepto | Valor 2026 |
|---|---:|
| Salario mínimo mensual (SMLMV) | **$1.750.905** |
| Auxilio de transporte | $249.095 |
| Ingreso mínimo mensual | **$2.000.000** |
| Valor hora ordinaria | **$8.338** |
| Jornada máxima legal | **42 horas/semana** |
| Factor prestacional | **52%** |

Dos cambios de 2026 que afectan cualquier presupuesto viejo que tenga a la mano:

- **El salario mínimo subió cerca de 23%** frente a 2025. Cualquier APU armado
  con cifras de 2025 quedó corto en mano de obra por ese margen.
- **Desde el 15 de julio de 2026 la jornada bajó de 44 a 42 horas semanales**
  (fase final de la Ley 2101 de 2021). El valor hora pasó de $7.959 a $8.338.
  El mismo trabajo cuesta más por hora, aunque el salario mensual no cambie.

---

## 2. Jornales por categoría

Valores **con prestaciones sociales incluidas** (factor 52%), jornada de 8 horas.

| Categoría | Múltiplo | Por jornal | Por hora |
|---|---|---:|---:|
| **Ayudante** | 1,0 SMLMV | **$110.824** | $13.853 |
| **Oficial** | 1,5 SMLMV | **$138.866** | $17.358 |
| **Maestro de obra** | 2,0 SMLMV | **$185.128** | $23.141 |

---

## 3. Cuadrillas

La cuadrilla es la unidad con la que se presupuesta de verdad. Es la suma de
sus integrantes, con prestaciones.

| Cuadrilla | Composición | Por hora | Por jornal |
|---|---|---:|---:|
| **C1** | 1 oficial + 1 ayudante | **$31.211** | **$249.688** |
| C2 | 1 oficial + 2 ayudantes | $45.064 | $360.512 |
| C3 | 1 maestro + 1 oficial + 1 ayudante | $54.352 | $434.816 |

> **C1 es la que aplica a los ítems del presupuesto** que dicen
> `CUADRILLA (OFICIAL + AYUDANTE)`, tanto los de hora (`HR`) como los de
> jornal (`JR`).

C2 y C3 están calculadas sumando las tarifas de la tabla anterior; úselas solo
como orden de magnitud.

---

## 4. La diferencia que más se equivoca: nómina vs. APU

Esta distinción es la que hace que un presupuesto se quede corto.

| Enfoque | Ayudante por hora | Qué incluye |
|---|---:|---|
| **Costo de nómina** | ~$13.850 | Solo el salario con prestaciones |
| **Tarifa de APU** | ~$20.800 | Salario + herramienta menor + equipo + overhead |

**La diferencia es de aproximadamente 50%.** Un análisis de precios unitarios
se compone de:

```
Materiales (con desperdicio)
  + Mano de obra (con 52% de prestaciones)
  + Equipo y herramienta
  + AIU (Administración, Imprevistos, Utilidad)
```

Si negocia con un contratista un valor "por jornal", confirme si incluye
herramienta o no. Es la fuente más común de discusión a mitad de obra.

---

## 5. Qué falta cotizar aparte

Estos ítems del presupuesto **no** salen de las tablas de arriba y hay que
pedirlos directamente:

| Ítem | Por qué |
|---|---|
| **Ingeniero electricista** | Honorario profesional, no jornal. Depende de dedicación y alcance |
| **Ingeniero electrónico** (configuración, pruebas, puesta en marcha) | Igual, y además suele venir atado al fabricante del equipo |
| **Subcontratos de certificación** (RETIE, RETILAP, fibra, datos) | Van a los organismos acreditados ONAC de la lista de proveedores |
| **Obra civil, regata, excavación y resane** | Se cotizan por unidad de obra (ml, m², m³), no por jornal |

Para los dos ingenieros, la vía práctica es pedir propuesta a los integradores
que ya están en la lista de proveedores: SH Ingeniería, Certifibra y Cobre,
H323 y Sucomputo hacen configuración y puesta en marcha.

---

## 6. Ajuste para Simití

Las cifras de arriba son de referencia nacional. Simití está en el sur de
Bolívar, en el Magdalena Medio, y eso mueve el costo en dos direcciones
opuestas:

**Sube el costo:**
- Transporte y hospedaje de personal calificado que no vive en la zona
- Escasez local de oficiales certificados para trabajos eléctricos bajo RETIE
- Los honorarios de ingeniería suelen incluir desplazamiento

**Baja el costo:**
- El jornal local de ayudante suele negociarse por debajo del promedio nacional

**Recomendación:** use estas cifras como **piso** para el personal calificado
—no acepte por debajo, porque significa que el contratista no está pagando
prestaciones— y valide el jornal de ayudante con dos o tres contratistas de
Barrancabermeja antes de cerrar.

---

## 7. Cómo verificar

Como estas cifras se mueven, conviene contrastarlas antes de una propuesta
formal:

| Fuente | Para qué |
|---|---|
| **DANE — ICCED** | Índice de Costos de Construcción de Edificaciones. En enero de 2026 varió 3,69% mensual por el alza del salario mínimo |
| **INVIAS** | Publica análisis de precios unitarios oficiales para obra pública |
| **datos.gov.co** | Lista oficial de precios unitarios fijos de obra pública |
| **Camacol Santander** | Referencia regional, la más cercana a la obra |

---

*Actualice este documento cuando cambie el salario mínimo (enero de cada año).
Todo lo demás se recalcula a partir de esa cifra.*
