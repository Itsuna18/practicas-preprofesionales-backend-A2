import { Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantContextService } from './assistant-context.service'

const prisma = {
  user: { findUnique: vi.fn() },
  placement: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  hourLog: { groupBy: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  application: { findMany: vi.fn() },
  offer: { findMany: vi.fn(), count: vi.fn() },
}

describe('AssistantContextService', () => {
  let service: AssistantContextService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new AssistantContextService(prisma as never)
    prisma.user.findUnique.mockResolvedValue({ fullName: 'Estudiante 0', career: 'Ciencia de Datos', interests: ['datos'], companyId: null })
  })

  it('builds the student context only from their own placement, hours and applications', async () => {
    prisma.placement.findFirst.mockResolvedValue({
      id: 3,
      status: 'ACTIVE',
      requiredHours: 240,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-07-31'),
      company: { name: 'Acme', sector: 'Software' },
      tutor: { fullName: 'Tutor 1' },
    })
    prisma.hourLog.groupBy.mockResolvedValue([
      { status: 'APPROVED', _sum: { hours: 60 }, _count: { _all: 15 } },
      { status: 'SUBMITTED', _sum: { hours: 20 }, _count: { _all: 5 } },
    ])
    prisma.hourLog.findFirst.mockResolvedValue({ date: new Date('2026-05-01') })
    prisma.application.findMany.mockResolvedValue([{ status: 'ACCEPTED', offer: { title: 'Practicante Datos' } }])

    const text = await service.build({ sub: 7, role: Role.STUDENT })

    expect(prisma.placement.findFirst.mock.calls[0][0].where).toEqual({ studentId: 7, deletedAt: null })
    expect(prisma.application.findMany.mock.calls[0][0].where).toEqual({ studentId: 7 })
    expect(text).toContain('Rol: STUDENT')
    expect(text).toContain('Carrera: Ciencia de Datos')
    expect(text).toContain('Acme (Software) · Tutor: Tutor 1')
    expect(text).toContain('Aprobadas: 60 · Enviadas sin revisar: 20 (5 registros) · Rechazadas: 0 registros')
    expect(text).toContain('Último registro: 2026-05-01')
    expect(text).toContain('Practicante Datos (ACCEPTED)')
  })

  it('tells when the student has no placement yet', async () => {
    prisma.placement.findFirst.mockResolvedValue(null)
    prisma.application.findMany.mockResolvedValue([])
    const text = await service.build({ sub: 7, role: Role.STUDENT })
    expect(text).toContain('todavía no tiene una práctica asignada')
    expect(text).toContain('Postulaciones: ninguna.')
  })

  it('builds the tutor context from their own placements', async () => {
    prisma.placement.findMany.mockResolvedValue([
      { status: 'ACTIVE', student: { fullName: 'Ana' }, _count: { hourLogs: 2 } },
      { status: 'ACTIVE', student: { fullName: 'Luis' }, _count: { hourLogs: 1 } },
    ])
    const text = await service.build({ sub: 4, role: Role.TUTOR })
    expect(prisma.placement.findMany.mock.calls[0][0].where).toEqual({ tutorId: 4, deletedAt: null })
    expect(text).toContain('Practicantes a cargo: 2 · Registros de horas por revisar en total: 3')
    expect(text).toContain('- Ana: práctica ACTIVE, 2 registros por revisar')
  })

  it('builds the company context from its own offers', async () => {
    prisma.user.findUnique.mockResolvedValue({ fullName: 'Contacto', career: null, interests: [], companyId: 9 })
    prisma.offer.findMany.mockResolvedValue([{ title: 'Practicante QA', status: 'PUBLISHED', seats: 3, _count: { applications: 4 } }])
    const text = await service.build({ sub: 2, role: Role.COMPANY })
    expect(prisma.offer.findMany.mock.calls[0][0].where).toEqual({ companyId: 9 })
    expect(text).toContain('- Practicante QA: PUBLISHED, 3 cupos, 4 postulaciones')
  })

  it('does not look up offers for a company user without a company', async () => {
    prisma.user.findUnique.mockResolvedValue({ fullName: 'Contacto', career: null, interests: [], companyId: null })
    const text = await service.build({ sub: 2, role: Role.COMPANY })
    expect(text).toContain('no tiene una empresa asociada')
    expect(prisma.offer.findMany).not.toHaveBeenCalled()
  })

  it('builds aggregate numbers for coordination', async () => {
    prisma.placement.groupBy.mockResolvedValue([{ status: 'ACTIVE', _count: { _all: 200 } }])
    prisma.hourLog.count.mockResolvedValue(1000)
    prisma.offer.count.mockResolvedValue(36)
    const text = await service.build({ sub: 1, role: Role.COORDINATOR })
    expect(text).toContain('Prácticas por estado: ACTIVE 200')
    expect(text).toContain('Registros de horas esperando revisión: 1000 · Ofertas publicadas: 36')
  })
})
