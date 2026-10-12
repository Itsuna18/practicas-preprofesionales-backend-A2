import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ApplicationStatus, Role } from '@prisma/client'
import { OfferService } from '../offer/offer.service'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offers: OfferService,
  ) {}

  apply(offerId: number, studentId: number, motivation: string) {
    return this.prisma.application.create({
      data: { offerId, studentId, motivation, status: ApplicationStatus.SUBMITTED },
    })
  }

  // Postulaciones del propio estudiante, con la oferta y la empresa incluidas
  // para que la pantalla no tenga que resolverlas con llamadas aparte.
  listForStudent(studentId: number) {
    return this.prisma.application.findMany({
      where: { studentId },
      orderBy: { submittedAt: 'desc' },
      include: { offer: { include: { company: true } } },
    })
  }

  private async resolveCompanyId(user: { sub?: number; companyId?: number | null }): Promise<number | null> {
    if (user.companyId !== undefined && user.companyId !== null) {
      return user.companyId
    }
    if (user.sub) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.sub },
        select: { companyId: true },
      })
      return dbUser?.companyId ?? null
    }
    return null
  }

  async assertOfferAccess(
    offerId: number,
    user: { sub?: number; role?: Role; companyId?: number | null },
  ): Promise<void> {
    if (user.role === Role.COORDINATOR) return

    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } })
    if (!offer) throw new NotFoundException('oferta no encontrada')

    const companyId = await this.resolveCompanyId(user)
    if (!companyId || offer.companyId !== companyId) {
      throw new ForbiddenException('no tienes acceso a las postulaciones de esta oferta')
    }
  }

  // D-04: N+1. Una consulta por la lista y otra por cada estudiante.
  async listByOffer(
    offerId: number,
    user?: { sub?: number; role?: Role; companyId?: number | null },
  ) {
    if (user) {
      await this.assertOfferAccess(offerId, user)
    }

    const applications = await this.prisma.application.findMany({ where: { offerId } })
    const rows = []
    for (const application of applications) {
      const student = await this.prisma.user.findUnique({
        where: { id: application.studentId },
        select: { id: true, email: true, fullName: true },
      })
      rows.push({ ...application, student })
    }
    return rows
  }

  private assertValidStatusTransition(applicationStatus: ApplicationStatus): void {
    if (applicationStatus !== ApplicationStatus.SUBMITTED && applicationStatus !== ApplicationStatus.INTERVIEW) {
      throw new BadRequestException('la postulación ya fue decidida')
    }
  }

  private async assertOfferHasSeats(offerId: number): Promise<void> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } })
    if (!offer) throw new NotFoundException('oferta no encontrada')
    const accepted = await this.offers.acceptedCount(offerId)
    if (accepted >= offer.seats) throw new BadRequestException('la oferta ya no tiene cupos')
  }

  async decide(
    id: number,
    status: ApplicationStatus,
    user?: { sub?: number; role?: Role; companyId?: number | null },
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: { offer: true },
    })
    if (!application) throw new NotFoundException('postulación no encontrada')

    if (user && user.role !== Role.COORDINATOR) {
      const companyId = await this.resolveCompanyId(user)
      if (!companyId || application.offer.companyId !== companyId) {
        throw new ForbiddenException('no tienes permiso para decidir postulaciones de esta oferta')
      }
    }

    this.assertValidStatusTransition(application.status)

    if (status === ApplicationStatus.ACCEPTED) {
      await this.assertOfferHasSeats(application.offerId)
    }

    return this.prisma.application.update({
      where: { id },
      data: { status, decidedAt: new Date() },
    })
  }
}
