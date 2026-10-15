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

  describe('E6-02: Normalización de fechas y validaciones de rango/futuro', () => {
    const activePlacement = {
      id: 10,
      studentId: 5,
      tutorId: 7,
      status: 'ACTIVE',
      startDate: new Date('2026-03-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T00:00:00.000Z'),
    }

    it('guarda el mismo día calendario exacto para clientes simulados en distintas zonas horarias (Criterio 4)', async () => {
      prisma.placement.findUnique.mockResolvedValue(activePlacement)
      const capturedDates: Date[] = []
      prisma.hourLog.create.mockImplementation(({ data }) => {
        capturedDates.push(data.date)
        return Promise.resolve({ id: 100 + capturedDates.length, ...data })
      })

      // Clientes en distintas zonas horarias registran la misma jornada: 15 de mayo de 2026
      const timezonesAndInputs = [
        { clientTz: 'Asia/Tokyo (UTC+9)', dateInput: '2026-05-15T00:00:00+09:00' },
        { clientTz: 'Europe/Madrid (UTC+2)', dateInput: '2026-05-15T00:00:00+02:00' },
        { clientTz: 'America/Guayaquil (UTC-5)', dateInput: '2026-05-15T00:00:00-05:00' },
        { clientTz: 'America/Los_Angeles (UTC-7)', dateInput: '2026-05-15T00:00:00-07:00' },
        { clientTz: 'UTC (Z)', dateInput: '2026-05-15T00:00:00.000Z' },
        { clientTz: 'Fecha plana YYYY-MM-DD', dateInput: '2026-05-15' },
      ]

      for (const item of timezonesAndInputs) {
        const result = await service.create(
          {
            placementId: 10,
            date: item.dateInput as never,
            startTime: '08:00',
            endTime: '12:00',
            hours: 4,
            activity: `Práctica desde ${item.clientTz}`,
          },
          5,
        )

        expect(result.status).toBe('SUBMITTED')
      }

      // Todos los registros guardados deben ser idénticos: 2026-05-15 a medianoche UTC
      expect(capturedDates).toHaveLength(6)
      const expectedTime = new Date('2026-05-15T00:00:00.000Z').getTime()
      for (const date of capturedDates) {
        expect(date.getTime()).toBe(expectedTime)
        expect(date.toISOString().slice(0, 10)).toBe('2026-05-15')
      }
    })

    it('rechaza una fecha anterior a startDate con mensaje claro del rango válido (Criterio 2)', async () => {
      prisma.placement.findUnique.mockResolvedValue(activePlacement)

      await expect(
        service.create(
          {
            placementId: 10,
            date: '2026-02-28' as never,
            startTime: '08:00',
            endTime: '12:00',
            hours: 4,
            activity: 'Antes de iniciar',
          },
          5,
        ),
      ).rejects.toThrowError(/la fecha está fuera del rango de la práctica \(rango válido: 2026-03-01 a 2026-07-31\)/)
    })

    it('rechaza una fecha posterior a endDate con mensaje claro del rango válido (Criterio 2)', async () => {
      prisma.placement.findUnique.mockResolvedValue({
        ...activePlacement,
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        endDate: new Date('2025-06-30T00:00:00.000Z'),
      })

      await expect(
        service.create(
          {
            placementId: 10,
            date: '2025-07-01' as never,
            startTime: '08:00',
            endTime: '12:00',
            hours: 4,
            activity: 'Después de finalizar',
          },
          5,
        ),
      ).rejects.toThrowError(/la fecha está fuera del rango de la práctica \(rango válido: 2025-01-01 a 2025-06-30\)/)
    })

    it('no permite registrar horas con fecha futura (Criterio 3)', async () => {
      prisma.placement.findUnique.mockResolvedValue({
        ...activePlacement,
        endDate: new Date('2030-12-31T00:00:00.000Z'),
      })

      // Fecha en el año 2030 (definitivamente futura)
      await expect(
        service.create(
          {
            placementId: 10,
            date: '2030-01-15' as never,
            startTime: '08:00',
            endTime: '12:00',
            hours: 4,
            activity: 'Horas del futuro',
          },
          5,
        ),
      ).rejects.toThrowError('no se pueden registrar horas con fecha futura')
    })

    it('permite registrar en los límites exactos de startDate y endDate (si no son futuros)', async () => {
      prisma.placement.findUnique.mockResolvedValue({
        ...activePlacement,
        startDate: new Date('2026-03-01T00:00:00.000Z'),
        endDate: new Date('2026-05-30T00:00:00.000Z'),
      })
      prisma.hourLog.create.mockImplementation(({ data }) => Promise.resolve({ id: 201, ...data }))

      const onStart = await service.create(
        { placementId: 10, date: '2026-03-01' as never, startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Día inicial' },
        5,
      )
      expect(onStart.date.toISOString().slice(0, 10)).toBe('2026-03-01')

      const onEnd = await service.create(
        { placementId: 10, date: '2026-05-30' as never, startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Día final' },
        5,
      )
      expect(onEnd.date.toISOString().slice(0, 10)).toBe('2026-05-30')
    })

    it('comprueba que registros existentes preservan su día al consultarlos y exportarlos (Criterio 5)', async () => {
      const existingDate = new Date('2026-03-10T00:00:00.000Z')
      prisma.hourLog.findMany.mockResolvedValue([
        {
          id: 1,
          placementId: 10,
          date: existingDate,
          startTime: '08:00',
          endTime: '12:00',
          hours: 4,
          activity: 'Tarea existente',
          status: 'APPROVED',
          reviewedById: 7,
        },
      ])

      const rows = await service.exportRows(10)
      expect(rows).toHaveLength(3) // header + 1 row + total
      expect(rows[1][1]).toBe('2026-03-10') // La fecha sigue siendo exactamente 2026-03-10
    })
  })
})
