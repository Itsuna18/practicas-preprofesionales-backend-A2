import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { HourLogStatus, PlacementStatus, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { validateHourLogDate } from '../common/date.utils'

import type { CreateHourLogDto } from './dto/create-hour-log.dto'
import { HourLogValidationService } from './hour-log-validation.service'
import { HourLogNotificationService } from './hour-log-notification.service'
import { HourLogReportService, type WeeklySummaryItem } from './hour-log-report.service'
import { HourLogExportService } from './hour-log-export.service'

/**
 * Servicio de orquestación y ciclo de vida de registros de horas (CRUD).
 * Las responsabilidades de validación, notificación, reportes y exportación
 * han sido extraídas a servicios independientes (E6-03, paga deuda D-02).
 */
@Injectable()
export class HourLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: HourLogValidationService = new HourLogValidationService(),
    private readonly notifier: HourLogNotificationService = new HourLogNotificationService(),
    private readonly reportService: HourLogReportService = new HourLogReportService(prisma),
    private readonly exportService: HourLogExportService = new HourLogExportService(prisma, validator),
  ) {}

  /**
   * Registra una jornada de horas para el placement del estudiante.
   */
  async create(dto: CreateHourLogDto, studentId: number) {
    const placement = await this.prisma.placement.findUnique({ where: { id: dto.placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')
    if (placement.studentId !== studentId) throw new BadRequestException('el placement no es tuyo')
    if (placement.status !== PlacementStatus.ACTIVE) {
      throw new BadRequestException('el placement no está activo')
    }

    this.validator.assertValidHourLogInput(dto)

    // E6-02: Normalización de fecha a día calendario institucional y validaciones
    // de fecha futura y rango de fechas de la práctica (startDate - endDate).
    const normalizedDate = validateHourLogDate(dto.date, placement)

    const created = await this.prisma.hourLog.create({
      data: {
        placementId: dto.placementId,
        date: normalizedDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        hours: dto.hours,
        activity: dto.activity,
        status: HourLogStatus.SUBMITTED,
      },
    })

    this.notifier.notifyTutor(placement.tutorId, created.id)
    return created
  }

  /**
   * Verifica que quien consulta un placement sea el estudiante dueño, su
   * tutor asignado, o un coordinador.
   */
  async assertPlacementAccess(placementId: number, userId: number, role: Role): Promise<void> {
    const placement = await this.prisma.placement.findUnique({ where: { id: placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')
    const allowed = role === Role.COORDINATOR || placement.studentId === userId || placement.tutorId === userId
    if (!allowed) throw new ForbiddenException('no tienes acceso a este placement')
  }

  /** Lista el libro de horas completo de un placement, más reciente primero. */
  listForPlacement(placementId: number) {
    return this.prisma.hourLog.findMany({
      where: { placementId, deletedAt: null },
      orderBy: { date: 'desc' },
    })
  }

  /**
   * Aprueba o rechaza un registro de horas validando pertenencia y estado.
   */
  async review(id: number, status: HourLogStatus, reviewerId: number, reviewerRole: Role, note?: string) {
    const log = await this.prisma.hourLog.findUnique({
      where: { id },
      include: { placement: true },
    })
    if (!log) throw new NotFoundException('registro de horas no encontrado')

    const allowed = reviewerRole === Role.COORDINATOR || log.placement.tutorId === reviewerId
    if (!allowed) {
      throw new ForbiddenException('solo el tutor asignado a la práctica puede revisar horas')
    }

    if (log.status !== HourLogStatus.SUBMITTED) {
      throw new BadRequestException('solo se revisan registros en SUBMITTED')
    }
    return this.prisma.hourLog.update({
      where: { id },
      data: {
        status,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note,
        version: { increment: 1 },
      },
    })
  }

  /**
   * Delega la suma de horas aprobadas al servicio de reportes.
   */
  approvedHours(placementId: number): Promise<number> {
    return this.reportService.approvedHours(placementId)
  }

  /**
   * Delega el reporte de avance al servicio de reportes.
   */
  progressReport(placementId: number) {
    return this.reportService.progressReport(placementId)
  }

  /**
   * Delega el resumen semanal de horas al servicio de reportes.
   */
  weeklySummary(placementId: number): Promise<WeeklySummaryItem[]> {
    return this.reportService.weeklySummary(placementId)
  }

  /**
   * Delega la exportación CSV al servicio de exportación.
   */
  exportRows(placementId: number): Promise<(string | number)[][]> {
    return this.exportService.exportRows(placementId)
  }
}
