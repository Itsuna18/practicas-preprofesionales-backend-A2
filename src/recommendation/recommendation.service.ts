import { Injectable, NotFoundException } from '@nestjs/common'
import { ApplicationStatus, OfferStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CAREER_NAMES, INTERESTS, MODALITIES } from './catalog'
import type { UpdateProfileDto } from './dto/update-profile.dto'
import { type StudentProfile, rankOffers } from './recommendation'

const PROFILE_SELECT = { career: true, interests: true, preferredModality: true } as const

@Injectable()
export class RecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadProfile(userId: number): Promise<StudentProfile> {
    const profile = await this.prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT })
    if (!profile) throw new NotFoundException('usuario no encontrado')
    return profile
  }

  /** El perfil del propio estudiante y las opciones válidas para editarlo. */
  async getProfile(userId: number) {
    return {
      profile: await this.loadProfile(userId),
      options: { careers: CAREER_NAMES, interests: INTERESTS, modalities: MODALITIES },
    }
  }

  updateProfile(userId: number, dto: UpdateProfileDto) {
    return this.prisma.user.update({ where: { id: userId }, data: dto, select: PROFILE_SELECT })
  }

  /**
   * Ofertas publicadas a las que el estudiante todavía no postuló, ordenadas
   * por afinidad con su carrera, sus intereses y su modalidad preferida.
   */
  async recommendOffers(userId: number) {
    const profile = await this.loadProfile(userId)
    const profileComplete = Boolean(profile.career) || profile.interests.length > 0
    if (!profileComplete) return { profileComplete, recommendations: [] }

    const offers = await this.prisma.offer.findMany({
      where: { status: OfferStatus.PUBLISHED, applications: { none: { studentId: userId } } },
      include: {
        company: { select: { name: true, sector: true } },
        _count: { select: { applications: { where: { status: ApplicationStatus.ACCEPTED } } } },
      },
    })
    const byId = new Map(offers.map((offer) => [offer.id, offer]))

    const ranked = rankOffers(
      profile,
      offers.map((offer) => ({
        id: offer.id,
        title: offer.title,
        description: offer.description,
        modality: offer.modality,
        seats: offer.seats,
        acceptedCount: offer._count.applications,
        publishedAt: offer.publishedAt,
        companySector: offer.company.sector,
      })),
    )

    return {
      profileComplete,
      recommendations: ranked.map((rec) => {
        const offer = byId.get(rec.offerId)!
        return {
          ...rec,
          offer: {
            id: offer.id,
            title: offer.title,
            modality: offer.modality,
            seats: offer.seats,
            periodStart: offer.periodStart,
            periodEnd: offer.periodEnd,
            company: offer.company,
          },
        }
      }),
    }
  }
}
