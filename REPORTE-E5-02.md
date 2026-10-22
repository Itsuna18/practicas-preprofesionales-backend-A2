# Reporte E5-02: Reescribir la Decisión de Acreditación de Forma Legible

## Qué cambia

Se refactoriza la función `calculateAccreditationStatus` en `src/placement/accreditation.ts` reemplazando los 6 niveles de `if-else` anidados (complejidad ciclomática 17) por un **motor de reglas declarativo (*Rule Engine / Tabla de Reglas*)**.

- Rama: `chore/E5-02-reglas-acreditacion-legibles`
- Base: `develop`
- Closes #53
- Paga la deuda técnica **D-05** de `KNOWN_ISSUES.md`.

---

## Justificación de la Estructura Elegida

Se seleccionó el patrón **Reglas como datos / Tabla Declarativa de Reglas** (`ACCREDITATION_RULES`), modelada mediante la interfaz:

```typescript
interface AccreditationRule {
  description: string
  condition: (input: AccreditationInput) => boolean
  evaluate: (input: AccreditationInput) => { level: AccreditationLevel; reasons: string[] }
}
```

### Ventajas frente a otras alternativas:
1. **Principio Abierto/Cerrado (OCP - Open/Closed Principle):**
   Añadir una nueva regla de negocio para acreditación ya no obliga a tocar los `if/else` existentes ni a alterar la lógica del resto de casos. Simplemente se inserta una nueva regla en el arreglo en el orden de precedencia correspondiente.
2. **Legibilidad orientada a coordinación:**
   Cada regla se lee en lenguaje de negocio entendible por el personal administrativo (`'Práctica abandonada'`, `'Horas insuficientes'`, `'Falta convenio'`, `'Falta evaluación del tutor'`).
3. **Reducción radical de complejidad ciclomática:**
   La función principal `calculateAccreditationStatus` pasa de complejidad **17 a 2**, delegando en predicados puros e independientes de complejidad **1 o 2**. ESLint ya no marca ninguna alerta ni advertencia.
4. **Cero cambios en la suite de pruebas:**
   Los 28 tests de caracterización de E5-01 en `src/placement/accreditation.spec.ts` se mantienen **100% intactos**, garantizando que el comportamiento observable, el orden exacto de los motivos (`reasons`) y los bordes numéricos no sufrieron ninguna alteración.

---

## Verificación y Métricas

- **Tests unitarios:** 28/28 pruebas pasando (`accreditation.spec.ts`).
- **Diff de pruebas:** `git diff develop -- src/placement/accreditation.spec.ts` está completamente vacío.
- **ESLint:** 0 errores, 0 warnings (alerta de `complexity` eliminada).
- **TypeScript:** 0 errores en `tsc --noEmit`.
- **Cobertura V8:**
  - Statements: **100 %**
  - Functions: **100 %**
  - Lines: **100 %**
  - Branches: **97.05 %** (supera con creces el mínimo de 90 % requerido).
