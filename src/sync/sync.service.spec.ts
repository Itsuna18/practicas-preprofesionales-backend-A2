import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncService } from './sync.service'

const prisma = {
  placement: { findMany: vi.fn(), findUnique: vi.fn() },
  hourLog: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  document: { findMany: vi.fn() },
  evaluation: { findMany: vi.fn() },
  syncOperation: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}

describe('SyncService', () => {
  let service: SyncService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.placement.findMany.mockResolvedValue([])
    prisma.document.findMany.mockResolvedValue([])
    prisma.evaluation.findMany.mockResolvedValue([])
    service = new SyncService(prisma as never)
  })

  it('returns changes and a checkpoint from the newest row', async () => {
    prisma.hourLog.findMany.mockResolvedValue([
      { id: 9, updatedAt: new Date('2026-04-01T12:00:00.000Z'), placementId: 1 },
    ])

    const result = await service.pull(5, undefined, 200)

    expect(result.changes.hourLogs).toHaveLength(1)
    expect(result.checkpoint).toBeTypeOf('string')
    expect(result.hasMore).toBe(false)
  })

  it('applies a create operation and returns applied', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5 })
    prisma.hourLog.create.mockResolvedValue({ id: 77, version: 1 })

    const result = await service.push(5, [
      {
        clientOpId: '11111111-1111-4111-8111-111111111111',
        entity: 'hourLog',
        op: 'create',
        baseVersion: null,
        payload: { placementId: 1, date: '2026-04-02', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
      },
    ])

    expect(result.results[0]).toMatchObject({ status: 'applied' })
    expect(prisma.syncOperation.create).toHaveBeenCalled()
  })

  it('rejects offline update if the hour was already APPROVED by the tutor', async () => {
    prisma.hourLog.findUnique.mockResolvedValue({
      id: 10,
      placement: { studentId: 5 },
      status: 'APPROVED',
      version: 2,
      reviewNote: 'Aprobado por tutor',
      updatedAt: new Date('2026-04-02T10:00:00.000Z'),
    })

    const result = await service.push(5, [
      {
        clientOpId: '22222222-2222-4222-8222-222222222222',
        entity: 'hourLog',
        op: 'update',
        baseVersion: 1,
        payload: { id: 10, activity: 'Cambio offline posterior' },
      },
    ])

    expect(result.results[0]).toMatchObject({
      status: 'rejected',
      reason: expect.stringMatching(/aprobada por el tutor/i),
      server: expect.objectContaining({ id: 10, status: 'APPROVED' }),
    })
    expect(prisma.hourLog.update).not.toHaveBeenCalled()
  })

  it('rejects offline update if the hour was already REJECTED by the tutor', async () => {
    prisma.hourLog.findUnique.mockResolvedValue({
      id: 11,
      placement: { studentId: 5 },
      status: 'REJECTED',
      version: 2,
      reviewNote: 'Horas no justificadas',
      updatedAt: new Date('2026-04-02T10:00:00.000Z'),
    })

    const result = await service.push(5, [
      {
        clientOpId: '33333333-3333-4333-8333-333333333333',
        entity: 'hourLog',
        op: 'update',
        baseVersion: 1,
        payload: { id: 11, activity: 'Intento de modificar rechazada' },
      },
    ])

    expect(result.results[0]).toMatchObject({
      status: 'rejected',
      reason: expect.stringMatching(/rechazada por el tutor/i),
      server: expect.objectContaining({ id: 11, status: 'REJECTED' }),
    })
    expect(prisma.hourLog.update).not.toHaveBeenCalled()
  })

  it('applies the update if both sides are DRAFT or SUBMITTED and incoming version is newer', async () => {
    prisma.hourLog.findUnique.mockResolvedValue({
      id: 12,
      placement: { studentId: 5 },
      status: 'SUBMITTED',
      version: 1,
      updatedAt: new Date('2026-04-01T10:00:00.000Z'),
    })
    prisma.hourLog.update.mockResolvedValue({
      id: 12,
      status: 'SUBMITTED',
      version: 2,
      activity: 'Actividad editada',
    })

    const result = await service.push(5, [
      {
        clientOpId: '44444444-4444-4444-8444-444444444444',
        entity: 'hourLog',
        op: 'update',
        baseVersion: 1,
        payload: {
          id: 12,
          activity: 'Actividad editada',
          updatedAt: '2026-04-01T11:00:00.000Z',
        },
      },
    ])

    expect(result.results[0]).toMatchObject({
      status: 'applied',
      server: expect.objectContaining({ id: 12, version: 2 }),
      reason: null,
    })
    expect(prisma.hourLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 12 },
        data: expect.objectContaining({ activity: 'Actividad editada' }),
      }),
    )
  })

  it('rejects update if server has a more recent version when both are in draft/submitted', async () => {
    prisma.hourLog.findUnique.mockResolvedValue({
      id: 13,
      placement: { studentId: 5 },
      status: 'SUBMITTED',
      version: 3,
      updatedAt: new Date('2026-04-01T15:00:00.000Z'),
    })

    const result = await service.push(5, [
      {
        clientOpId: '55555555-5555-4555-8555-555555555555',
        entity: 'hourLog',
        op: 'update',
        baseVersion: 1,
        payload: {
          id: 13,
          activity: 'Cambio viejo',
          updatedAt: '2026-04-01T12:00:00.000Z',
        },
      },
    ])

    expect(result.results[0]).toMatchObject({
      status: 'rejected',
      reason: expect.stringMatching(/servidor tiene una versión más reciente/i),
      server: expect.objectContaining({ id: 13, version: 3 }),
    })
    expect(prisma.hourLog.update).not.toHaveBeenCalled()
  })
})
