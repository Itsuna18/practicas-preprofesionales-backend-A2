import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ApplicationStatus, Prisma, Role } from '@prisma/client'
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

  async listByOffer(
    offerId: number,
    user?: { sub?: number; role?: Role; companyId?: number | null },
  ) {
    if (user) {
      await this.assertOfferAccess(offerId, user)
    }

    return this.prisma.application.findMany({
      where: { offerId },
      include: {
        student: {
          select: { id: true, email: true, fullName: true },
        },
      },
    })
  }

  private assertValidStatusTransition(applicationStatus: ApplicationStatus): void {
    if (applicationStatus !== ApplicationStatus.SUBMITTED && applicationStatus !== ApplicationStatus.INTERVIEW) {
      throw new BadRequestException('la postulación ya fue decidida')
    }
  }

  private async assertCompanyDecisionAccess(
    offer?: { companyId: number },
    user?: { sub?: number; role?: Role; companyId?: number | null },
  ): Promise<void> {
    if (user && user.role !== Role.COORDINATOR) {
      const resolvedCompanyId = await this.resolveCompanyId(user)
      if (!resolvedCompanyId || offer?.companyId !== resolvedCompanyId) {
        throw new ForbiddenException('no tienes permiso para decidir postulaciones de esta oferta')
      }
    }
  }

  private async assertOfferHasSeats(
    offerId: number,
    client?: Prisma.TransactionClient | PrismaService,
  ): Promise<void> {
    const tx = client ?? this.prisma
    let offerSeats: number | undefined

    if (typeof tx.$queryRaw === 'function') {
      const lockedOffers = await tx.$queryRaw<Array<{ id: number; seats: number }>>`
        SELECT id, seats FROM "offers" WHERE id = ${offerId} FOR UPDATE
      `
      offerSeats = lockedOffers?.[0]?.seats
    }

    if (offerSeats === undefined) {
      const offer = await tx.offer.findUnique({ where: { id: offerId } })
      if (!offer) throw new NotFoundException('oferta no encontrada')
      offerSeats = offer.seats
    }

    const accepted = typeof this.offers.acceptedCount === 'function'
      ? await this.offers.acceptedCount(offerId, tx)
      : await tx.application.count({
          where: { offerId, status: ApplicationStatus.ACCEPTED },
        })

    if (accepted >= offerSeats) throw new BadRequestException('la oferta ya no tiene cupos')
  }

  async decide(
    id: number,
    status: ApplicationStatus,
    user?: { sub?: number; role?: Role; companyId?: number | null },
  ) {
    const executeInTx = typeof this.prisma.$transaction === 'function'
      ? <T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => this.prisma.$transaction(action)
      : <T>(action: (tx: PrismaService) => Promise<T>): Promise<T> => action(this.prisma)

    return executeInTx(async (tx) => {
      const application = await tx.application.findUnique({
        where: { id },
        include: { offer: true },
      })
      if (!application) throw new NotFoundException('postulación no encontrada')

      await this.assertCompanyDecisionAccess(application.offer, user)
      this.assertValidStatusTransition(application.status)

      if (status === ApplicationStatus.ACCEPTED) {
        await this.assertOfferHasSeats(application.offerId, tx)
      }

      return tx.application.update({
        where: { id },
        data: { status, decidedAt: new Date() },
      })
    })
  }
}
