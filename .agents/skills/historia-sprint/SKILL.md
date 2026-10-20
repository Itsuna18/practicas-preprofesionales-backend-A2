---
name: historia-sprint
description: Flujo del equipo A2 para trabajar una historia del backlog (E5-xx, E6-xx, etc.) en el backend. Úsala al empezar una historia, al hacer commits y al preparar el PR. Crea la rama con la clave, recuerda las reglas del proyecto y redacta el PR con la plantilla del repo.
---

# Historia de sprint (backend)

La fuente de verdad de cada historia es la guía del curso (sección "Backlog"): historia, criterios de aceptación y definición de terminado. Lee la historia completa antes de tocar código y trabaja contra sus criterios, no contra lo que "parece mejor".

## 1. Empezar

```bash
git checkout develop && git pull
git checkout -b <tipo>/<CLAVE>-<descripcion-corta>
```

- `<tipo>` sale del tipo de la historia: `feat`, `fix` (bug) o `chore`.
- Ejemplos: `chore/E5-01-tests-acreditacion`, `chore/E5-02-reglas-acreditacion-legibles`.
- Revisa la columna "Depende de". Si la dependencia no está en `develop`, no empieces: avisa en el tablero.

## 2. Reglas del proyecto que no se rompen

- Los endpoints comprueban **rol y pertenencia** (épica E3). No quites ni debilites un guard o un filtro por usuario.
- Si cambias el esquema de Prisma: `pnpm db:migrate` genera la migración, y la migración va en el mismo PR.
- `/sync/pull` y `/sync/push` los consume el cliente offline. Si cambias su forma, avisa al equipo de frontend.
- Las pruebas van en el mismo PR que el código, en un archivo `*.spec.ts` junto al archivo probado.
- No bajes la cobertura. Si baja, explica por qué en el PR.
- Un PR de menos de 400 líneas de diff. Si crece, pártelo.

## 3. Commits

Commits pequeños, en español, con la clave de la historia:

```
test(E5-01): caracterizar la rama de placement suspendido
refactor(E5-02): expresar las reglas de acreditacion como tabla
```

## 4. Antes de abrir el PR

Con la base de datos arriba (`docker compose up -d`):

```bash
pnpm lint
pnpm typecheck
pnpm test:cov
```

Los tres deben pasar. Compara la cobertura total con la de `develop` (la CI la publica en el resumen).

## 5. Abrir el PR

- Base: **`develop`**, nunca `main`.
- Usa `.github/PULL_REQUEST_TEMPLATE.md` y llena todas las secciones: Qué cambia, Por qué (`Closes #NN` del issue del tablero), Deuda técnica (si paga una deuda de `KNOWN_ISSUES.md`, como D-05, di cuál), Cómo probarlo (comandos o `curl` que el revisor puede copiar) y Checklist.
- Añade "Qué queda fuera" si dejaste algo sin hacer a propósito.
- Si la historia pide una tabla o una medición (E5-01), va en la descripción del PR.
- Pide revisión a un compañero. Cuando se integre, mueve la tarjeta del tablero a **Done**.

## 6. Demo en la review

Prepara en 3 o 4 pasos cómo enseñar la historia funcionando (`pnpm dev`, seed cargado, usuarios con contraseña `yura1234`), contrastando cada criterio de aceptación. Para historias sin interfaz, la demo es la suite de tests en verde más el informe de cobertura o de lint.
