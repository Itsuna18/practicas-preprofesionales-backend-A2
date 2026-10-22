import { Injectable } from '@nestjs/common'
import { HourLogStatus, OfferStatus, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface AssistantUser {
  sub: number
  role: Role
}

function day(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : 'sin fecha'
}

/**
 * Arma, en el servidor, el contexto que el asistente puede usar: solo datos
 * de la persona con la sesión iniciada, con el mismo criterio de pertenencia
 * que el resto de la API. Nada de lo que envía el cliente entra aquí.
 */
@Injectable()
export class AssistantContextService {
  constructor(private readonly prisma: PrismaService) {}

  async build(user: AssistantUser): Promise<string> {
    const me = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { fullName: true, career: true, interests: true, companyId: true },
    })
    const profile = { career: me?.career ?? null, interests: me?.interests ?? [], companyId: me?.companyId ?? null }
    const header = `Persona: ${me?.fullName ?? 'desconocida'} · Rol: ${user.role} · Hoy: ${day(new Date())}`
    return `${header}\n${await this.forRole(user, profile)}`
  }

  private forRole(
    user: AssistantUser,
    profile: { career: string | null; interests: string[]; companyId: number | null },
  ): Promise<string> {
    switch (user.role) {
      case Role.STUDENT:
        return this.student(user.sub, profile.career, profile.interests)
      case Role.TUTOR:
        return this.tutor(user.sub)
      case Role.COMPANY:
        return this.company(profile.companyId)
      default:
        return this.coordinator()
    }
  }

  private async student(studentId: number, career: string | null, interests: string[]): Promise<string> {
    const lines = [`Carrera: ${career ?? 'sin indicar'} · Intereses: ${interests.join(', ') || 'sin indicar'}`]

    const placement = await this.prisma.placement.findFirst({
      where: { studentId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { company: { select: { name: true, sector: true } }, tutor: { select: { fullName: true } } },
    })
    if (!placement) {
      lines.push('Práctica: todavía no tiene una práctica asignada.')
    } else {
      const totals = await this.prisma.hourLog.groupBy({
        by: ['status'],
        where: { placementId: placement.id, deletedAt: null },
        _sum: { hours: true },
        _count: { _all: true },
      })
      const sum = (status: HourLogStatus) => totals.find((t) => t.status === status)?._sum.hours ?? 0
      const count = (status: HourLogStatus) => totals.find((t) => t.status === status)?._count._all ?? 0
      const last = await this.prisma.hourLog.findFirst({
        where: { placementId: placement.id, deletedAt: null },
        orderBy: { date: 'desc' },
        select: { date: true },
      })
      lines.push(
        `Práctica: ${placement.company.name} (${placement.company.sector}) · Tutor: ${placement.tutor.fullName} · ` +
          `Estado: ${placement.status} · Periodo: ${day(placement.startDate)} a ${day(placement.endDate)}`,
        `Horas requeridas: ${placement.requiredHours} · Aprobadas: ${sum(HourLogStatus.APPROVED)} · ` +
          `Enviadas sin revisar: ${sum(HourLogStatus.SUBMITTED)} (${count(HourLogStatus.SUBMITTED)} registros) · ` +
          `Rechazadas: ${count(HourLogStatus.REJECTED)} registros · Último registro: ${day(last?.date)}`,
      )
    }

    const applications = await this.prisma.application.findMany({
      where: { studentId },
      orderBy: { submittedAt: 'desc' },
      take: 5,
      select: { status: true, offer: { select: { title: true } } },
    })
    lines.push(
      applications.length
        ? 'Postulaciones recientes: ' + applications.map((a) => `${a.offer.title} (${a.status})`).join('; ')
        : 'Postulaciones: ninguna.',
    )
    return lines.join('\n')
  }

  private async tutor(tutorId: number): Promise<string> {
    const placements = await this.prisma.placement.findMany({
      where: { tutorId, deletedAt: null },
      take: 15,
      orderBy: { startDate: 'desc' },
      select: {
        status: true,
        student: { select: { fullName: true } },
        _count: { select: { hourLogs: { where: { status: HourLogStatus.SUBMITTED, deletedAt: null } } } },
      },
    })
    if (placements.length === 0) return 'Practicantes a cargo: ninguno.'
    const pending = placements.reduce((total, p) => total + p._count.hourLogs, 0)
    return [
      `Practicantes a cargo: ${placements.length} · Registros de horas por revisar en total: ${pending}`,
      ...placements.map((p) => `- ${p.student.fullName}: práctica ${p.status}, ${p._count.hourLogs} registros por revisar`),
    ].join('\n')
  }

  private async company(companyId: number | null): Promise<string> {
    if (!companyId) return 'Empresa: el usuario no tiene una empresa asociada.'
    const offers = await this.prisma.offer.findMany({
      where: { companyId },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: { title: true, status: true, seats: true, _count: { select: { applications: true } } },
    })
    if (offers.length === 0) return 'Ofertas de la empresa: ninguna.'
    return [
      'Ofertas de la empresa:',
      ...offers.map((o) => `- ${o.title}: ${o.status}, ${o.seats} cupos, ${o._count.applications} postulaciones`),
    ].join('\n')
  }

  private async coordinator(): Promise<string> {
    const [byStatus, pendingHours, published] = await Promise.all([
      this.prisma.placement.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.hourLog.count({ where: { status: HourLogStatus.SUBMITTED, deletedAt: null } }),
      this.prisma.offer.count({ where: { status: OfferStatus.PUBLISHED } }),
    ])
    return [
      'Prácticas por estado: ' + (byStatus.map((s) => `${s.status} ${s._count._all}`).join(', ') || 'ninguna'),
      `Registros de horas esperando revisión: ${pendingHours} · Ofertas publicadas: ${published}`,
    ].join('\n')
  }
}
