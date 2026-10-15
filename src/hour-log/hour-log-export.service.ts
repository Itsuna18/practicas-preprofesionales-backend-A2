import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { HourLogValidationService } from './hour-log-validation.service'

@Injectable()
export class HourLogExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: HourLogValidationService = new HourLogValidationService(),
  ) {}

  /**
   * Exporta las horas de un placement en formato de filas para CSV con totales.
   */
  async exportRows(placementId: number): Promise<(string | number)[][]> {
    const logs = await this.prisma.hourLog.findMany({
      where: { placementId, deletedAt: null },
      orderBy: { date: 'asc' },
    })

    const header = ['id', 'fecha', 'inicio', 'fin', 'horas', 'actividad', 'estado', 'revisadoPor']
    const rows: (string | number)[][] = [header]

    for (const dto of logs) {
      this.validationService.assertValidHourLogInput(dto)

      rows.push([
        dto.id,
        dto.date.toISOString().slice(0, 10),
        dto.startTime,
        dto.endTime,
        dto.hours,
        this.escapeCsvField(dto.activity),
        dto.status,
        dto.reviewedById ?? '',
      ])
    }

    let totalHours = 0
    for (const row of rows.slice(1)) {
      const hoursCell = row[4]
      if (typeof hoursCell === 'number') totalHours += hoursCell
    }
    rows.push(['', '', '', '', totalHours, 'TOTAL', '', ''])

    return rows
  }

  /**
   * Aplica escapado de campos según estándar RFC 4180.
   */
  escapeCsvField(value: string): string {
    const needsQuoting = value.includes(',') || value.includes('"') || value.includes('\n')
    if (!needsQuoting) return value
    return `"${value.replace(/"/g, '""')}"`
  }
}
