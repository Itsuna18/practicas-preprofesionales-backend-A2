# Auditoría de exposición de datos sensibles (E3-06)

Revisión técnica de todos los endpoints de la API para garantizar que ninguna respuesta exponga contraseñas, hashes, tokens internos ni datos personales no solicitados.

---

## 1. Inventario de endpoints y exposición de usuarios

| Método | Ruta | Rol(es) | ¿Devuelve usuario? | Campos de usuario expuestos | Protección aplicada |
|---|---|---|:---:|---|---|
| POST | `/api/auth/login` | Público | Sí | `id`, `email`, `fullName`, `role`, `companyId` | DTO acotado, `password` excluido explícitamente |
| POST | `/api/auth/refresh` | Público / Bearer | Sí | `id`, `email`, `fullName`, `role`, `companyId` | Consulta con `select` acotado, `password` excluido |
| GET | `/api/offers/:offerId/applications` | COMPANY, COORDINATOR | Sí (`student`) | `id`, `email`, `fullName` | `select: { id: true, email: true, fullName: true }` |
| GET | `/api/placements/me` | STUDENT | Sí (`tutor`) | `id`, `fullName`, `email` | `tutor: { select: { id: true, fullName: true, email: true } }` |
| GET | `/api/placements/accreditation` | COORDINATOR | Indirecto | Solo `studentName` | `student: { select: { fullName: true } }` |
| POST | `/api/applications` | STUDENT | No | N/A (solo devuelve Application) | No expone entidad User |
| GET | `/api/applications/me` | STUDENT | No | N/A (solo Application con Offer y Company) | No expone entidad User |
| PATCH | `/api/applications/:id/decide` | COMPANY, COORDINATOR | No | N/A (devuelve Application) | No expone entidad User |
| GET | `/api/companies` | Cualquier rol | No | N/A (catálogo de Company) | Relación `users` no incluida |
| POST | `/api/companies` | COORDINATOR | No | N/A (Company creada) | Relación `users` no incluida |
| POST | `/api/evaluations` | TUTOR, COMPANY, STUDENT | No | N/A (Evaluation creada) | Validación interna acotada con `select: { companyId: true }` |
| GET | `/api/placements/:id/evaluations` | Participantes / COORDINATOR | No | N/A (devuelve Evaluation con `evaluatorId`) | Entidad User no incluida |
| POST | `/api/hour-logs` | STUDENT | No | N/A (HourLog creado con `reviewedById`) | Entidad User no incluida |
| GET | `/api/placements/:id/hour-logs` | Participantes / COORDINATOR | No | N/A (lista de HourLog) | Entidad User no incluida |
| GET | `/api/placements/:id/progress` | Participantes / COORDINATOR | No | N/A (métricas agregadas) | Entidad User no incluida |
| PATCH | `/api/hour-logs/:id/review` | TUTOR | No | N/A (HourLog actualizado) | Entidad User no incluida |
| GET | `/api/offers` | Cualquier rol | No | N/A (Offer con Company) | Relación User no incluida |
| GET | `/api/offers/me` | COMPANY | No | N/A (Offer con Company y recuento) | Consulta de usuario previa acotada con `select: { companyId: true }` |
| GET | `/api/offers/:id` | Cualquier rol | No | N/A (Offer con Company) | Relación User no incluida |
| POST | `/api/offers` | COMPANY, COORDINATOR | No | N/A (Offer creada) | Relación User no incluida |
| PATCH | `/api/offers/:id/publish` | COMPANY, COORDINATOR | No | N/A (Offer publicada) | Relación User no incluida |
| PATCH | `/api/offers/:id/close` | COMPANY, COORDINATOR | No | N/A (Offer cerrada) | Relación User no incluida |
| POST | `/api/placements` | COORDINATOR | No | N/A (Placement creado) | Relación User no incluida |
| PATCH | `/api/placements/:id/activate` | COORDINATOR | No | N/A (Placement actualizado) | Relación User no incluida |
| POST | `/api/placements/:id/documents` | STUDENT, COORDINATOR | No | N/A (Document creado) | Relación User no incluida |
| GET | `/api/sync/pull` | Cualquier rol | No | N/A (entidades planas sin relaciones) | No incluye objetos de usuario |
| POST | `/api/sync/push` | Cualquier rol | No | N/A (resultados de operaciones) | No incluye objetos de usuario |

---

## 2. Puntos críticos corregidos

1. **`AccreditationService.reportForPeriod` (`src/placement/accreditation.service.ts`)**:
   * *Estado previo*: Usaba `include: { student: true, documents: true, evaluations: true }`, trayendo a memoria todas las columnas del modelo `User` (incluyendo la contraseña cifrada).
   * *Corrección*: Se acotó la consulta en Prisma a:
     ```typescript
     student: { select: { fullName: true } }
     ```

2. **`EvaluationService.assertCompanyEvaluation` (`src/evaluation/evaluation.service.ts`)**:
   * *Estado previo*: Ejecutaba `findUnique({ where: { id: evaluatorId } })` sin cláusula `select`, cargando el hash de contraseña en memoria únicamente para verificar `companyId`.
   * *Corrección*: Se acotó la consulta en Prisma a:
     ```typescript
     select: { companyId: true }
     ```

3. **`AuthService.refresh` (`src/auth/auth.service.ts`)**:
   * *Estado previo*: Ejecutaba `findUnique({ where: { id: payload.sub } })` sin acotar columnas.
   * *Corrección*: Se acotó la consulta en Prisma a:
     ```typescript
     select: { id: true, email: true, fullName: true, role: true, companyId: true }
     ```

4. **Defensa en profundidad: `SanitizeResponseInterceptor` (`src/common/sanitize.interceptor.ts`)**:
   * Interceptor global registrado en `AppModule` que recorre recursivamente cualquier carga útil devuelta por los controladores y purga cualquier clave sensible (`password`, `passwordHash`, `hash`, `salt`, `secret`).

---

## 3. Pruebas de regresión automatizadas

* `src/common/sanitize.interceptor.spec.ts`: Verifica la purga recursiva de campos sensibles y preservación de campos válidos.
* `src/common/sensitive-data.spec.ts`: Verifica que cada servicio acote sus consultas y que ninguna respuesta filtre contraseñas o hashes.
