import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ApplicationStatus, OfferStatus, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateOfferDto } from './dto/create-offer.dto'

@Injectable()
export class OfferService {
  constructor(private readonly prisma: PrismaService) {}

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

  private async assertOfferOwnership(
    offerCompanyId: number,
    user: { sub?: number; role?: Role; companyId?: number | null },
    actionMsg: string,
  ): Promise<void> {
    if (user.role === Role.COORDINATOR) return
    const companyId = await this.resolveCompanyId(user)
    if (!companyId || offerCompanyId !== companyId) {
      throw new ForbiddenException(actionMsg)
    }
  }

  async create(dto: CreateOfferDto, user?: { sub?: number; role?: Role; companyId?: number | null }) {
    let companyId = dto.companyId
    if (user?.role === Role.COMPANY) {
      const userCompanyId = await this.resolveCompanyId(user)
      if (!userCompanyId) throw new BadRequestException('el usuario no tiene una empresa asociada')
      companyId = userCompanyId
    }
    return this.prisma.offer.create({ data: { ...dto, companyId, status: OfferStatus.DRAFT } })
  }

  findAll() {
    return this.prisma.offer.findMany({
      where: { status: OfferStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      include: { company: true },
    })
  }

  async findOne(id: number, user?: { sub?: number; role?: Role; companyId?: number | null }) {
    const offer = await this.prisma.offer.findUnique({ where: { id }, include: { company: true } })
    if (!offer) throw new NotFoundException('oferta no encontrada')
    if (offer.status === OfferStatus.DRAFT) {
      if (!user) throw new ForbiddenException('no tienes acceso a esta oferta en borrador')
      await this.assertOfferOwnership(offer.companyId, user, 'no tienes acceso a esta oferta en borrador')
    }
    return offer
  }

  // Ofertas de la empresa del usuario autenticado, en cualquier estado —
  // a diferencia de findAll() (solo PUBLISHED, para el catálogo del estudiante).
  // Incluye el estado de las postulaciones para que la empresa vea cupos
  // ocupados sin que el front tenga que pedir una lista aparte por oferta.
  async findAllForCompanyUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } })
    if (!user?.companyId) throw new NotFoundException('el usuario no tiene una empresa asociada')
    return this.prisma.offer.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: 'desc' },
      include: { company: true, applications: { select: { status: true } } },
    })
  }

  async publish(id: number, user?: { sub?: number; role?: Role; companyId?: number | null }) {
    const offer = await this.prisma.offer.findUnique({ where: { id } })
    if (!offer) throw new NotFoundException('oferta no encontrada')
    if (user) {
      await this.assertOfferOwnership(offer.companyId, user, 'no tienes permiso para publicar ofertas de otra empresa')
    }
    if (offer.status !== OfferStatus.DRAFT) {
      throw new BadRequestException('solo se publican ofertas en DRAFT')
    }
    return this.prisma.offer.update({
      where: { id },
      data: { status: OfferStatus.PUBLISHED, publishedAt: new Date() },
    })
  }

  async close(id: number, user?: { sub?: number; role?: Role; companyId?: number | null }) {
    const offer = await this.prisma.offer.findUnique({ where: { id } })
    if (!offer) throw new NotFoundException('oferta no encontrada')
    if (user) {
      await this.assertOfferOwnership(offer.companyId, user, 'no tienes permiso para cerrar ofertas de otra empresa')
    }
    if (offer.status !== OfferStatus.PUBLISHED) {
      throw new BadRequestException('solo se cierran ofertas publicadas')
    }
    return this.prisma.offer.update({ where: { id }, data: { status: OfferStatus.CLOSED } })
  }

  // Cuenta las postulaciones ya aceptadas para una oferta.
  acceptedCount(offerId: number): Promise<number> {
    return this.prisma.application.count({
      where: { offerId, status: ApplicationStatus.ACCEPTED },
    })
  }
}
