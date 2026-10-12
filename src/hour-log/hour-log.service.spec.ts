import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogService } from './hour-log.service'

const prisma = {
  hourLog: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
  placement: { findUnique: vi.fn() },
}

describe('HourLogService', () => {
  let service: HourLogService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new HourLogService(prisma as never)
  })

  it('creates an hour log in SUBMITTED for an active placement', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5, tutorId: 7, status: 'ACTIVE' })
    prisma.hourLog.create.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))

    const result = await service.create(
      { placementId: 1, date: new Date('2026-04-01'), startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Desarrollo de módulo de reportes' },
      5,
    )

    expect(result.status).toBe('SUBMITTED')
    expect(result.hours).toBe(4)
  })

  it('rejects an hour log with more hours than the service allows', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5, tutorId: 7, status: 'ACTIVE' })

    await expect(
      service.create(
        { placementId: 1, date: new Date('2026-04-01'), startTime: '08:00', endTime: '20:00', hours: 11, activity: 'Jornada larga de soporte' },
        5,
      ),
    ).rejects.toThrow(BadRequestException)
  })

  describe('review (E3-02)', () => {
    const mockLog = {
      id: 99,
      placementId: 1,
      status: 'SUBMITTED',
      version: 1,
      placement: { id: 1, studentId: 5, tutorId: 7 },
    }

    it('rejects with 403 Forbidden when a tutor is not assigned to the placement', async () => {
      prisma.hourLog.findUnique.mockResolvedValue(mockLog)

      await expect(
        service.review(99, 'APPROVED' as never, 999, Role.TUTOR, 'intento ajeno'),
      ).rejects.toThrow(ForbiddenException)
      expect(prisma.hourLog.update).not.toHaveBeenCalled()
    })

    it('approves a submitted hour log when reviewer is the assigned tutor', async () => {
      prisma.hourLog.findUnique.mockResolvedValue(mockLog)
      prisma.hourLog.update.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))

      const result = await service.review(99, 'APPROVED' as never, 7, Role.TUTOR, 'ok')

      expect(result.status).toBe('APPROVED')
      expect(result.reviewedById).toBe(7)
      expect(prisma.hourLog.update).toHaveBeenCalledWith({
        where: { id: 99 },
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedById: 7,
          reviewNote: 'ok',
        }),
      })
    })

    it('rejects a submitted hour log when reviewer is the assigned tutor', async () => {
      prisma.hourLog.findUnique.mockResolvedValue(mockLog)
      prisma.hourLog.update.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))

      const result = await service.review(99, 'REJECTED' as never, 7, Role.TUTOR, 'horas no justificadas')

      expect(result.status).toBe('REJECTED')
      expect(result.reviewedById).toBe(7)
    })

    it('allows a coordinator to review an hour log even if not the assigned tutor', async () => {
      prisma.hourLog.findUnique.mockResolvedValue(mockLog)
      prisma.hourLog.update.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))

      const result = await service.review(99, 'APPROVED' as never, 100, Role.COORDINATOR, 'aprobado por coordinacion')

      expect(result.status).toBe('APPROVED')
      expect(result.reviewedById).toBe(100)
    })

    it('throws NotFoundException when hour log does not exist', async () => {
      prisma.hourLog.findUnique.mockResolvedValue(null)

      await expect(
        service.review(999, 'APPROVED' as never, 7, Role.TUTOR),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws BadRequestException when reviewing an hour log that is not SUBMITTED', async () => {
      prisma.hourLog.findUnique.mockResolvedValue({
        ...mockLog,
        status: 'APPROVED',
      })

      await expect(
        service.review(99, 'APPROVED' as never, 7, Role.TUTOR),
      ).rejects.toThrow(BadRequestException)
    })
  })
})
