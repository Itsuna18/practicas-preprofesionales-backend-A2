# PR: test(E5-01): fijar las reglas actuales de acreditación

## Qué cambia

Amplía `accreditation.spec.ts` de 2 a 28 tests: caminos de decisión, prioridad de reglas,
orden exacto de motivos, identidad y bordes numéricos. `accreditation.ts` permanece intacto.

Rama: `chore/E5-01-tests-acreditacion`. Base del PR: `develop`.

## Por qué

Closes #52. Congela el comportamiento actual antes del refactor E5-02.

## Deuda técnica

- [x] Este PR paga parcialmente D-05: añade la red de caracterización.
- [ ] Este PR no toca deuda existente.
- [ ] Este PR introduce deuda a propósito.

La complejidad de la función queda para E5-02; D-05 aún no se considera resuelta.

## Tabla entrada → resultado esperado

Base: práctica COMPLETED, 240 horas requeridas y aprobadas, 0 pendientes, convenio,
seguro e informe presentes, tutor 4.5 y empresa 4.2. Cada fila indica solo los cambios.
Los motivos se muestran en su orden exacto; el porcentaje base es 100.

| Entrada respecto a la base | Resultado | Motivos |
|---|---|---|
| ABANDONED | NO_ACREDITADO | placement abandonado |
| ABANDONED, 12 pendientes | NO_ACREDITADO | placement abandonado; hay 12 horas pendientes sin revisar |
| SUSPENDED, sin convenio | NO_ACREDITADO | placement suspendido |
| SUSPENDED, con convenio | NO_ACREDITADO | placement suspendido; convenio vigente pese a la suspensión |
| 120 aprobadas | PENDIENTE (50 %) | horas insuficientes |
| 120 aprobadas, 12 pendientes | PENDIENTE (50 %) | horas insuficientes; hay 12 horas pendientes de aprobación |
| Sin convenio ni seguro | NO_ACREDITADO | falta convenio |
| Sin convenio, con seguro | NO_ACREDITADO | falta convenio; seguro vigente pese a la falta de convenio |
| Sin seguro | NO_ACREDITADO | falta seguro |
| Sin seguro, 12 pendientes | NO_ACREDITADO | falta seguro; hay 12 horas pendientes de aprobación |
| Sin informe final | PENDIENTE | falta informe final |
| Tutor null | PENDIENTE | falta evaluación del tutor |
| Tutor 2.99 | NO_ACREDITADO | evaluación del tutor por debajo del mínimo; informe final entregado pese a evaluación baja |
| Empresa null | ACREDITADO_CON_OBSERVACIONES | falta evaluación de la empresa o es baja |
| Empresa 2.99 | ACREDITADO_CON_OBSERVACIONES | falta evaluación de la empresa o es baja |
| Base completa | ACREDITADO | [] |
| Tutor 3, empresa 3 | ACREDITADO | [] |
| 239/240 horas | PENDIENTE (100 % redondeado) | horas insuficientes |
| 1/3 horas | PENDIENTE (33 %) | horas insuficientes |
| 2/3 horas | PENDIENTE (67 %) | horas insuficientes |
| 1/8 horas | PENDIENTE (13 %) | horas insuficientes |
| 300/240 horas | ACREDITADO (125 %) | [] |
| 240/0 horas | ACREDITADO (Infinity) | [] |
| 0/0 horas | ACREDITADO (NaN) | [] |
| placementId 52, studentName María Ñauta | ACREDITADO | []; devuelve ambos datos sin cambios |
| 0 aprobadas, sin documentos ni evaluaciones | PENDIENTE (0 %) | horas insuficientes |

Los dos tests originales también se conservan.

## Hallazgos para seguimiento

- Cero horas requeridas produce Infinity o NaN; estos tests conservan esa conducta.
- El porcentaje puede superar 100 o redondearse a 100 con horas aún insuficientes.
- La segunda comprobación de `hasFinalReport` en la rama de tutor bajo nunca puede
  ser falsa con una entrada ordinaria: la condición exterior ya exige true. No se
  usan getters cambiantes para fabricar una entrada ajena al contrato de datos.
- El nombre real del nivel con observaciones es `ACREDITADO_CON_OBSERVACIONES`.

## Cómo probarlo

```bash
pnpm exec vitest run src/placement/accreditation.spec.ts --coverage --coverage.include=src/placement/accreditation.ts
pnpm lint
pnpm typecheck
pnpm test:cov
git diff develop -- src/placement/accreditation.ts
```

Medición inicial: 48.61 % líneas, 20 % ramas. Después: 100 % líneas, ramas,
funciones y sentencias con V8. Los 28 tests específicos pasan; typecheck pasa.
La suite completa obtiene 138 correctos y 2 fallos de integración por PostgreSQL
inaccesible en localhost:5433. Docker no está disponible en esta sesión.
El spec modificado pasa ESLint. El lint global encuentra 13 errores y 5 warnings
en archivos sin cambios de esta historia, incluida la complejidad pendiente de
E5-02. No se altera la función ni se desactivan reglas para ocultarlos.
No se pudo comparar la cobertura global con develop porque la suite completa
no termina en verde. GitHub CLI (`gh`) no está instalado; el PR no fue publicado.

## Qué queda fuera

Refactor E5-02, correcciones de reglas y cambios de producción.

## Checklist

- [ ] Todos los tests pasan en local (pendiente levantar PostgreSQL y repetir integración).
- [x] Agregué tests para el comportamiento actual.
- [ ] PR publicado apuntando a develop (este archivo contiene la descripción preparada).
- [x] El cambio tiene menos de 400 líneas de diff.

Demo: ejecutar el test específico, mostrar sus cuatro niveles y el informe de
cobertura, y comprobar que el diff de `accreditation.ts` está vacío.
