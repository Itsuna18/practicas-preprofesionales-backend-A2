import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { SyncService } from './sync.service'
import { encodeCheckpoint } from './checkpoint'
import * as bcrypt from 'bcryptjs'

describe('SyncService Integration (Cursor Pagination)', () => {
  let prisma: PrismaClient
  let service: SyncService

  beforeAll(async () => {
    prisma = new PrismaClient()
    service = new SyncService(prisma as any)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('debe desempatar de forma estable cuando dos registros tienen el mismo milisegundo exacto', async () => {
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

    // 2. Insertar dos registros (HourLog) con la MISMA marca de tiempo
    const exactTime = new Date('2026-05-01T10:00:00.000Z')
    await prisma.hourLog.create({
      data: {
        placementId: placement.id,
        date: new Date(),
        startTime: '08:00',
        endTime: '10:00',
        hours: 2,
        activity: 'Reg 1',
        status: 'SUBMITTED',
        updatedAt: exactTime
      }
    })
    await prisma.hourLog.create({
      data: {
        placementId: placement.id,
        date: new Date(),
        startTime: '10:00',
        endTime: '12:00',
        hours: 2,
        activity: 'Reg 2',
        status: 'SUBMITTED',
        updatedAt: exactTime
      }
    })

    // 3. Ejecutar pull limit=1 (debe traer solo un HourLog y el Placement)
    // Pero ojo: el límite aplica por tabla. Así que traerá 1 Placement y 1 HourLog.
    const page1 = await service.pull(student.id, undefined, 1)
    expect(page1.changes.hourLogs.length).toBe(1)
    
    // 4. Ejecutar pull con el cursor devuelto (debe traer el segundo HourLog sin saltárselo ni duplicarlo)
    const page2 = await service.pull(student.id, page1.checkpoint ?? undefined, 1)
    expect(page2.changes.hourLogs.length).toBe(1)
    
    // 5. Verificar que son los dos registros distintos y no perdimos ninguno
    const ids = [page1.changes.hourLogs[0].id, page2.changes.hourLogs[0].id]
    expect(ids[0]).not.toBe(ids[1])
  })
})
