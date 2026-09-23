import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { SyncService } from './sync.service'
import * as bcrypt from 'bcryptjs'
import type { SyncOperationInput } from './dto/push.dto'

describe('SyncService Concurrency (Idempotency)', () => {
  let prisma: PrismaClient
  let service: SyncService

  beforeAll(async () => {
    prisma = new PrismaClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new SyncService(prisma as any)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('no debe duplicar registros cuando se envía la misma operación concurrentemente', async () => {
    const suffix = Date.now().toString()
    const password = await bcrypt.hash('test', 10)
    const company = await prisma.company.create({
      data: { taxId: `99${suffix}`.substring(0, 13), name: 'Test', sector: 'IT', contactEmail: `test${suffix}@test.com`, verified: true }
    })
    const student = await prisma.user.create({
      data: { email: `sync_test_student_${suffix}@miyura.com`, password, fullName: 'Student', role: 'STUDENT' }
    })
    const tutor = await prisma.user.create({
      data: { email: `sync_test_tutor_${suffix}@miyura.com`, password, fullName: 'Tutor', role: 'TUTOR' }
    })
    const offer = await prisma.offer.create({
      data: { companyId: company.id, title: 'Offer', description: 'Desc', modality: 'PRESENCIAL', seats: 1, requiredHours: 240, periodStart: new Date(), periodEnd: new Date(), status: 'PUBLISHED' }
    })
    const application = await prisma.application.create({
      data: { offerId: offer.id, studentId: student.id, status: 'ACCEPTED', motivation: 'Motivacion' }
    })
    const placement = await prisma.placement.create({
      data: { applicationId: application.id, studentId: student.id, tutorId: tutor.id, companyId: company.id, startDate: new Date(), endDate: new Date(), requiredHours: 240, status: 'ACTIVE' }
    })

    const op: SyncOperationInput = {
      clientOpId: `op-${suffix}`,
      entity: 'hourLog',
      op: 'create',
      baseVersion: null,
      payload: {
        placementId: placement.id,
        date: '2026-05-01',
        startTime: '08:00',
        endTime: '10:00',
        hours: 2,
        activity: 'Concurrency Test'
      }
    }

    // Enviar dos veces al MISMO tiempo
    const [res1, res2] = await Promise.all([
      service.push(student.id, [op]),
      service.push(student.id, [op])
    ])

    // Ambos deben decir 'applied' (uno lo aplicó y el otro esperó el resultado)
    expect(res1.results[0].status).toBe('applied')
    expect(res2.results[0].status).toBe('applied')

    // Pero en BD solo debe haber UNA hora para este placement
    const logs = await prisma.hourLog.findMany({ where: { placementId: placement.id } })
    expect(logs.length).toBe(1)
  })
})
