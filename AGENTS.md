# AGENTS.md — Backend de Prácticas Preprofesionales (equipo A2)

Instrucciones para cualquier agente de código (Claude Code, Codex, Gemini CLI, Antigravity, Cursor, Copilot…). Las mismas reglas valen para las personas del equipo.

## Proyecto

API REST en NestJS 11, Prisma y PostgreSQL, con JWT y cuatro roles: `STUDENT`, `TUTOR`, `COMPANY` y `COORDINATOR`. La consume el cliente offline-first del repo `practicas-preprofesionales-frontend-A2`.

- `src/auth/`: login, JWT, renovación y guards de rol.
- `src/sync/`: `/sync/pull` y `/sync/push` del cliente offline.
- `src/hour-log/`: libro de horas (validación, reportes, exportación y notificaciones en servicios separados).
- `src/placement/`: prácticas y acreditación (`accreditation.ts`, deuda D-05).
- `src/offer/`, `src/application/`, `src/company/`, `src/evaluation/`.
- `prisma/`: esquema, migraciones y seed.

## Reglas que no se rompen

1. Cada endpoint comprueba **rol y pertenencia**. Ser tutor no significa ser el tutor de esa práctica. No quites ni debilites guards ni filtros por usuario.
2. Un cambio de esquema lleva su migración (`pnpm db:migrate`) en el mismo PR.
3. Si cambia la forma de `/sync/pull` o `/sync/push`, avisa al frontend.
4. Cada cambio de comportamiento lleva su test en un `*.spec.ts` junto al archivo. La cobertura no baja.
5. Una historia del backlog = una rama `feat|fix|chore/<CLAVE>-<descripcion>` desde `develop`. Los commits llevan la clave (`test(E5-01): ...`). Los PR van a `develop`, nunca a `main`, tienen menos de 400 líneas de diff y usan `.github/PULL_REQUEST_TEMPLATE.md`.
6. Trabaja contra los criterios de aceptación de la historia (guía del curso). Lo que quede fuera se dice en el PR.
7. No agregues líneas de coautoría de herramientas de IA en commits ni en PR.

## Comandos

```bash
pnpm install
cp .env.example .env   # JWT_SECRET es obligatorio
docker compose up -d
pnpm db:deploy && pnpm db:seed
pnpm dev               # http://localhost:3000/api
pnpm lint
pnpm typecheck
pnpm test:cov          # necesita la base de datos arriba
```

Usuarios del seed: `estudiante0@miyura.com`, `tutor0@…`, `empresa0@…`, `coordinador@…`, todos con contraseña `yura1234`.

## Skills compartidas

Viven en **`.agents/skills/`** (estándar Agent Skills). Ábrelas y síguelas cuando la tarea coincida:

| Skill | Cuándo |
|---|---|
| `.agents/skills/historia-sprint/SKILL.md` | Empezar una historia, hacer commits, abrir el PR |
| `.agents/skills/tests-caracterizacion/SKILL.md` | Congelar comportamiento con tests y refactorizar sin cambiarlo (E5-01, E5-02) |

`.claude/skills/` y `.agent/skills/` son copias generadas para Claude Code y Antigravity. **Edita solo `.agents/skills/`** y ejecuta `pnpm skills:sync`. La CI falla si las copias no coinciden.
