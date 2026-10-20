---
name: tests-caracterizacion
description: Cómo congelar con tests el comportamiento actual de una función (tests de caracterización) y luego refactorizarla sin cambiar resultados. Úsala en E5-01 y E5-02 (calculateAccreditationStatus, deuda D-05) o antes de reescribir cualquier lógica compleja del backend.
---

# Tests de caracterización y refactor seguro

Un test de caracterización describe **lo que el código hace hoy**, no lo que debería hacer. Si una regla te parece mal, **no la corrijas**: anótala como tarea aparte en el tablero y el test la congela tal como está.

Archivo objetivo: `src/placement/accreditation.ts` → `calculateAccreditationStatus`. Tests actuales: `src/placement/accreditation.spec.ts` (solo 2 casos). Deuda D-05 en `KNOWN_ISSUES.md`.

## E5-01: congelar el comportamiento

### 1. Lista de caminos

```bash
pnpm lint
```

ESLint marca la función con `complexity` (umbral 10, hoy 17). Cada `if`/`else` es un camino. Estos son los de hoy:

| # | Entrada (lo que cambia respecto al caso completo) | level | reasons |
|---|---|---|---|
| 1 | `placementStatus: 'ABANDONED'`, sin pendientes | NO_ACREDITADO | `placement abandonado` |
| 2 | ABANDONED con `pendingHours > 0` | NO_ACREDITADO | + `hay N horas pendientes sin revisar` |
| 3 | `placementStatus: 'SUSPENDED'`, sin convenio | NO_ACREDITADO | `placement suspendido` |
| 4 | SUSPENDED con `hasAgreement` | NO_ACREDITADO | + `convenio vigente pese a la suspensión` |
| 5 | horas insuficientes, sin pendientes | PENDIENTE | `horas insuficientes` |
| 6 | horas insuficientes con pendientes | PENDIENTE | + `hay N horas pendientes de aprobación` |
| 7 | horas completas, sin convenio, sin seguro | NO_ACREDITADO | `falta convenio` |
| 8 | sin convenio, con seguro | NO_ACREDITADO | + `seguro vigente pese a la falta de convenio` |
| 9 | sin seguro, sin pendientes | NO_ACREDITADO | `falta seguro` |
| 10 | sin seguro, con pendientes | NO_ACREDITADO | + `hay N horas pendientes de aprobación` |
| 11 | sin informe final | PENDIENTE | `falta informe final` |
| 12 | `tutorEvaluationScore: null` | PENDIENTE | `falta evaluación del tutor` |
| 13 | tutor < 3 | NO_ACREDITADO | `evaluación del tutor por debajo del mínimo`, `informe final entregado pese a evaluación baja` |
| 14 | tutor ≥ 3, empresa `null` | ACREDITADO_CON_OBSERVACIONES | `falta evaluación de la empresa o es baja` |
| 15 | tutor ≥ 3, empresa < 3 | ACREDITADO_CON_OBSERVACIONES | igual que 14 |
| 16 | todo completo, ambas ≥ 3 | ACREDITADO | `[]` |

Verifica la tabla contra el código antes de confiar en ella. Esta tabla (corregida si hace falta) va en el PR de E5-01.

### 2. Bordes que también se congelan

- Notas justo en el límite: tutor `3` y empresa `3` (ambos ≥ 3, cuentan como aprobados).
- `approvedHours === requiredHours` (cuenta como completo) y `approvedHours` una hora por debajo.
- `completionPercentage`: redondeo (`Math.round`), más de 100 % si hay horas de sobra, y `requiredHours: 0` (hoy da `Infinity` o `NaN`: **congélalo así** y anótalo como hallazgo).
- Orden de las `reasons`: compara el arreglo completo con `toEqual`, no con `toContain`, para que E5-02 no pueda reordenarlas sin que se note.
- `placementId` y `studentName` se devuelven tal cual.

### 3. Forma de los tests

Usa `it.each` con la tabla para que cada fila sea un test con nombre:

```ts
it.each([
  ['abandonado sin pendientes', { placementStatus: 'ABANDONED' }, 'NO_ACREDITADO', ['placement abandonado']],
  // ...
])('%s', (_name, overrides, level, reasons) => {
  const result = calculateAccreditationStatus({ ...base, ...overrides })
  expect(result.level).toBe(level)
  expect(result.reasons).toEqual(reasons)
})
```

### 4. Terminado

```bash
pnpm test:cov
```

`accreditation.ts` debe superar el **90 %** (líneas y ramas). **No toques `accreditation.ts` en este PR.**

## E5-02: refactor sin tocar los tests

Regla central: **los tests de E5-01 no se modifican**. Si tienes que cambiar un test, cambiaste el comportamiento. Al abrir el PR, `git diff develop -- src/placement/accreditation.spec.ts` debe salir vacío.

### Estructuras válidas (elige una y justifícala en el PR)

- **Cláusulas de guarda:** `if (abandonado) return ...` en orden de prioridad. Es la más simple.
- **Reglas como datos:** un arreglo ordenado de `{ cuando: (input) => boolean, resultado: (input) => { level, reasons } }`, donde la primera que coincide gana. Añadir una regla es añadir una entrada, que es lo que pide la historia.
- **Tabla de decisión:** parecida a la anterior, pero más declarativa.

Las razones "extra" (por ejemplo "convenio vigente pese a la suspensión") dependen de la regla. Modélalas dentro de cada regla, no como un segundo pase.

### Terminado

- `pnpm test` en verde **sin cambios en el spec**.
- `pnpm lint` ya no marca la función por `complexity`.
- Borra el comentario `// D-05 ... No refactorizar` y saca D-05 de `KNOWN_ISSUES.md` (o márcala como resuelta con la referencia al PR).
- Prueba de legibilidad: pídele a alguien que no la escribió que lea las reglas en voz alta.
