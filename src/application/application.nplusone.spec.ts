import { describe, it, expect, vi } from 'vitest'
import { Role } from '@prisma/client'
import { ApplicationService } from './application.service'

describe('ApplicationService - E2-03 (N+1 Query Elimination)', () => {
  it('E2-03: resuelve la lista de 200 postulaciones con una sola consulta sin llamadas individuales por candidato', async () => {
    let applicationQueries = 0
    let userQueries = 0

    const mockApplications = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      offerId: 10,
      studentId: 1000 + i,
      status: 'SUBMITTED',
      motivation: `Motivación postulante ${i + 1}`,
      submittedAt: new Date(),
      decidedAt: null,
      student: {
        id: 1000 + i,
        email: `estudiante${i + 1}@miyura.com`,
        fullName: `Estudiante ${i + 1}`,
      },
    }))

    const prismaMock = {
      offer: {
        findUnique: vi.fn().mockImplementation(() => Promise.resolve({ id: 10, companyId: 5 })),
      },
      application: {
        findMany: vi.fn().mockImplementation(() => {
          applicationQueries++
          return Promise.resolve(mockApplications)
        }),
      },
      user: {
        findUnique: vi.fn().mockImplementation(() => {
          userQueries++
          return Promise.resolve(null)
        }),
      },
    }

    const service = new ApplicationService(prismaMock as never, {} as never)

    const start = performance.now()
    const results = await service.listByOffer(10, { sub: 1, role: Role.COORDINATOR })
    const duration = performance.now() - start

    // 1. Debe procesar las 200 postulaciones
    expect(results).toHaveLength(200)

    // 2. No debe ejecutar consultas individuales por cada candidato (N = 200 -> 0 consultas a user.findUnique)
    expect(userQueries).toBe(0)
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()

    // 3. Debe realizar una sola consulta a application.findMany con include
    expect(applicationQueries).toBe(1)
    expect(prismaMock.application.findMany).toHaveBeenCalledWith({
      where: { offerId: 10 },
      include: {
        student: {
          select: { id: true, email: true, fullName: true },
        },
      },
    })

    // 4. La estructura de cada elemento debe incluir el objeto student intacto
    expect(results[0]).toMatchObject({
      id: 1,
      studentId: 1000,
      student: {
        id: 1000,
        email: 'estudiante1@miyura.com',
        fullName: 'Estudiante 1',
      },
    })

    // 5. El tiempo de respuesta debe ser muy inferior a 500ms
    expect(duration).toBeLessThan(500)
  })
})
