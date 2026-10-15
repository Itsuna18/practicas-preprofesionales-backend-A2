import { HourLogStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogExportService } from './hour-log-export.service'

describe('HourLogExportService', () => {
  const prisma = {
    hourLog: { findMany: vi.fn() },
  }

  let service: HourLogExportService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new HourLogExportService(prisma as never)
  })

  it('exporta las filas de horas correctamente con cabecera y fila de TOTAL', async () => {
    prisma.hourLog.findMany.mockResolvedValue([
      {
        id: 1,
        date: new Date('2026-04-01T08:00:00Z'),
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: 'Reunión de sprint',
        status: HourLogStatus.APPROVED,
        reviewedById: 10,
      },
      {
        id: 2,
        date: new Date('2026-04-02T08:00:00Z'),
        startTime: '08:00',
        endTime: '14:00',
        hours: 6,
        activity: 'Codificación, pruebas',
        status: HourLogStatus.SUBMITTED,
        reviewedById: null,
      },
    ])

    const rows = await service.exportRows(1)

    // Cabecera + 2 filas + Fila TOTAL
    expect(rows).toHaveLength(4)
    expect(rows[0]).toEqual(['id', 'fecha', 'inicio', 'fin', 'horas', 'actividad', 'estado', 'revisadoPor'])
    expect(rows[1][4]).toBe(4)
    expect(rows[2][4]).toBe(6)
    // Escapado con comillas para texto con comas
    expect(rows[2][5]).toBe('"Codificación, pruebas"')
    // Fila TOTAL
    expect(rows[3]).toEqual(['', '', '', '', 10, 'TOTAL', '', ''])
  })

  it('escapa comillas dobles y saltos de línea según RFC 4180', () => {
    expect(service.escapeCsvField('Texto simple')).toBe('Texto simple')
    expect(service.escapeCsvField('Texto con "comillas"')).toBe('"Texto con ""comillas"""')
    expect(service.escapeCsvField('Línea 1\nLínea 2')).toBe('"Línea 1\nLínea 2"')
  })
})
