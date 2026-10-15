import { NotFoundException } from '@nestjs/common'
import { HourLogStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogReportService } from './hour-log-report.service'

describe('HourLogReportService', () => {
  const prisma = {
    hourLog: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    placement: { findUnique: vi.fn() },
  }

  let service: HourLogReportService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new HourLogReportService(prisma as never)
  })

  it('calcula las horas aprobadas sumando los registros APPROVED', async () => {
    prisma.hourLog.aggregate.mockResolvedValue({ _sum: { hours: 24 } })
    const hours = await service.approvedHours(1)
    expect(hours).toBe(24)
    expect(prisma.hourLog.aggregate).toHaveBeenCalledWith({
      where: { placementId: 1, status: HourLogStatus.APPROVED, deletedAt: null },
      _sum: { hours: true },
    })
  })

  it('devuelve 0 si no hay horas aprobadas', async () => {
    prisma.hourLog.aggregate.mockResolvedValue({ _sum: { hours: null } })
    const hours = await service.approvedHours(1)
    expect(hours).toBe(0)
  })

  it('calcula el reporte de avance correctamente', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, requiredHours: 100 })
    prisma.hourLog.aggregate.mockResolvedValue({ _sum: { hours: 50 } })
    prisma.hourLog.count.mockResolvedValue(3)

    const report = await service.progressReport(1)

    expect(report).toEqual({
      placementId: 1,
      requiredHours: 100,
      approvedHours: 50,
      pendingLogs: 3,
      percentage: 50,
    })
  })

  it('lanza NotFoundException en progressReport si el placement no existe', async () => {
    prisma.placement.findUnique.mockResolvedValue(null)
    await expect(service.progressReport(99)).rejects.toThrow(NotFoundException)
  })

  it('calcula el resumen semanal agrupando por semana ISO', async () => {
    prisma.placement.findUnique.mockResolvedValue({
      id: 1,
      requiredHours: 80,
      startDate: new Date('2026-04-01T00:00:00Z'),
      endDate: new Date('2026-04-30T00:00:00Z'),
    })

    prisma.hourLog.findMany.mockResolvedValue([
      { date: new Date('2026-04-06T10:00:00Z'), hours: 4, status: HourLogStatus.APPROVED },
      { date: new Date('2026-04-07T10:00:00Z'), hours: 4, status: HourLogStatus.SUBMITTED },
      { date: new Date('2026-04-08T10:00:00Z'), hours: 2, status: HourLogStatus.REJECTED },
    ])

    const summary = await service.weeklySummary(1)

    expect(summary.length).toBeGreaterThan(0)
    expect(summary[0].approvedHours).toBe(4)
    expect(summary[0].submittedHours).toBe(4)
    expect(summary[0].logsCount).toBe(2)
  })

  it('determina correctamente la semana ISO 8601', () => {
    expect(service.isoWeekLabel(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01')
    expect(service.isoWeekLabel(new Date('2026-04-06T12:00:00Z'))).toBe('2026-W15')
  })
})
