# Auditoría de seguridad, E3-01

Inventario de endpoints: método, ruta, roles permitidos, y si además del rol
comprueba que el recurso le pertenece a quien llama.

| Método | Ruta | Roles permitidos | Comprueba pertenencia |
|---|---|---|---|
| POST | /auth/login | público | N/A |
| POST | /hour-logs | STUDENT | Sí, el placement debe ser del estudiante |
| GET | /placements/:id/hour-logs | cualquier rol autenticado | Sí, vía assertPlacementAccess |
| GET | /placements/:id/progress | cualquier rol autenticado | Sí, vía assertPlacementAccess |
| PATCH | /hour-logs/:id/review | TUTOR | **No** |
| POST | /evaluations | TUTOR, COMPANY, STUDENT | Sí, por tipo de evaluación |
| GET | /placements/:id/evaluations | cualquier rol autenticado | Sí |
| GET | /placements/accreditation | COORDINATOR | N/A, reporte global |
| POST | /placements | COORDINATOR | N/A, acción administrativa |
| GET | /placements/me | STUDENT | Sí, implícito por token |
| PATCH | /placements/:id/activate | COORDINATOR | N/A, acción administrativa |
| POST | /placements/:id/documents | STUDENT, COORDINATOR | Sí |
| GET | /companies | cualquier rol autenticado | N/A, catálogo de lectura |
| POST | /companies | COORDINATOR | N/A, acción administrativa |
| POST | /applications | STUDENT | Sí, implícito por token |
| GET | /offers/:offerId/applications | COMPANY, COORDINATOR | **No** |
| GET | /applications/me | STUDENT | Sí, implícito por token |
| PATCH | /applications/:id/decide | COMPANY, COORDINATOR | **No** |
| GET | /offers | cualquier rol autenticado | N/A, catálogo publicado |
| GET | /offers/me | COMPANY | Sí, implícito por token |
| GET | /offers/:id | cualquier rol autenticado | **No** |
| POST | /offers | COMPANY, COORDINATOR | **No** |
| PATCH | /offers/:id/publish | COMPANY, COORDINATOR | **No** |
| PATCH | /offers/:id/close | COMPANY, COORDINATOR | **No** |
| GET | /sync/pull | cualquier rol autenticado | Sí, acotado por userId |
| POST | /sync/push | cualquier rol autenticado | Sí, acotado por userId |

Frontend: no tiene autorización propia, confía en el backend. No se audita aparte.

## Hallazgos explotables

### 1. PATCH /hour-logs/:id/review — cualquier tutor aprueba horas ajenas

`hour-log.service.ts`, método `review`, nunca compara `reviewerId` contra
`placement.tutorId`. Cualquier usuario con rol TUTOR aprueba o rechaza horas
de un placement que no tutoriza.

**Confirmado el 2026-10-06.** La hora #4025, del placement 201, cuyo tutor
asignado es el usuario 224 (tutor0), fue aprobada con el token del usuario
225 (tutor1), que no tiene ninguna relación con ese placement.

Login:

    curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"tutor1@miyura.com","password":"yura1234"}'

Explotación:

    curl -X PATCH http://localhost:3000/api/hour-logs/4025/review -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"status":"APPROVED"}'

Respuesta real obtenida: 200, `reviewedById: 225`, estado `APPROVED`.

Esta es la historia **E3-02** que le toca a tu compañero.

### 2. GET /offers/:offerId/applications y PATCH /applications/:id/decide — una empresa ve y decide postulaciones ajenas

`application.service.ts`, `listByOffer` y `decide` nunca comparan
`offer.companyId` contra la empresa del usuario que llama.

Prueba a reproducir, pendiente de confirmar con datos reales:

Login:

    curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"empresa1@miyura.com","password":"yura1234"}'

Explotación:

    curl -X PATCH http://localhost:3000/api/applications/<id-de-una-postulacion-de-otra-empresa>/decide -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"status":"ACCEPTED"}'

Esta es la historia **E3-07** que también le toca a tu compañero.

### 3. POST /offers, PATCH /offers/:id/publish, PATCH /offers/:id/close — una empresa crea o cierra ofertas ajenas

`offer.service.ts` nunca compara `companyId` contra la empresa del usuario.
Además `CreateOfferDto` deja que `companyId` venga suelto en el body, así
que una empresa puede crear una oferta a nombre de otra.

Prueba a reproducir, pendiente de confirmar con datos reales:

    curl -X PATCH http://localhost:3000/api/offers/<id-de-una-oferta-de-otra-empresa>/close -H "Authorization: Bearer <token-de-empresa1>"

**No está en el backlog todavía.** Hay que reportárselo a Ali como hallazgo
nuevo, mismo patrón que E3-07, prioridad alta.

### 4. GET /offers/:id — se puede ver una oferta en borrador ajena

No valida rol ni estado, cualquier usuario autenticado consulta una oferta
`DRAFT` de otra empresa por id, aunque el catálogo público solo muestre
`PUBLISHED`. Prioridad media, es fuga de información, no de escritura.