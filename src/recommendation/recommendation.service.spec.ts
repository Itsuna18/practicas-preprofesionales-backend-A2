import { NotFoundException } from '@nestjs/common'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { RecommendationService } from './recommendation.service'

const prisma = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  offer: { findMany: vi.fn() },
}

function dbOffer(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: 'Practicante Backend — Acme',
    description: 'Desarrollo de APIs y servicios backend.',
    modality: 'HIBRIDA',
    seats: 3,
    publishedAt: new Date('2026-02-15'),
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-07-31'),
    company: { name: 'Acme', sector: 'Software' },
    _count: { applications: 1 },
    ...overrides,
  }
}

describe('RecommendationService', () => {
  let service: RecommendationService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new RecommendationService(prisma as never)
  })

  it('returns the own profile with the valid options', async () => {
    prisma.user.findUnique.mockResolvedValue({ career: null, interests: [], preferredModality: null })

    const result = await service.getProfile(7)

    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }))
    expect(result.options.careers).toContain('Ingeniería de Software')
    expect(result.options.modalities).toEqual(['PRESENCIAL', 'HIBRIDA', 'REMOTA'])
  })

  it('fails clearly when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    await expect(service.getProfile(7)).rejects.toThrow(NotFoundException)
  })

  it('updates only the own user and never returns the password', async () => {
    prisma.user.update.mockResolvedValue({ career: 'Ciencia de Datos', interests: ['datos'], preferredModality: null })

    await service.updateProfile(7, { career: 'Ciencia de Datos', interests: ['datos'] })

    const call = prisma.user.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 7 })
    expect(call.select).toEqual({ career: true, interests: true, preferredModality: true })
  })

  it('asks for a profile before recommending anything', async () => {
    prisma.user.findUnique.mockResolvedValue({ career: null, interests: [], preferredModality: null })

    await expect(service.recommendOffers(7)).resolves.toEqual({ profileComplete: false, recommendations: [] })
    expect(prisma.offer.findMany).not.toHaveBeenCalled()
  })

  it('recommends published offers the student has not applied to, with seats and reasons', async () => {
    prisma.user.findUnique.mockResolvedValue({ career: 'Ingeniería de Software', interests: [], preferredModality: null })
    prisma.offer.findMany.mockResolvedValue([
      dbOffer(1),
      dbOffer(2, { title: 'Auxiliar de enfermería', description: 'Atención a pacientes', company: { name: 'Clínica', sector: 'Salud' } }),
    ])

    const result = await service.recommendOffers(7)

    const where = prisma.offer.findMany.mock.calls[0][0].where
    expect(where).toEqual({ status: 'PUBLISHED', applications: { none: { studentId: 7 } } })
    expect(result.profileComplete).toBe(true)
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0]).toMatchObject({
      offerId: 1,
      seatsLeft: 2,
      offer: { id: 1, title: 'Practicante Backend — Acme', company: { name: 'Acme', sector: 'Software' } },
    })
    expect(result.recommendations[0].reasons[0]).toMatch(/Ingeniería de Software/)
  })
})

describe('UpdateProfileDto', () => {
  it('accepts values from the catalog', async () => {
    const dto = plainToInstance(UpdateProfileDto, { career: 'Agronomía', interests: ['agro'], preferredModality: 'REMOTA' })
    await expect(validate(dto)).resolves.toHaveLength(0)
  })

  it('rejects values outside the catalog', async () => {
    const dto = plainToInstance(UpdateProfileDto, { career: 'Magia', interests: ['hackear'], preferredModality: 'LUNA' })
    const errors = await validate(dto)
    expect(errors.map((e) => e.property).sort()).toEqual(['career', 'interests', 'preferredModality'])
  })
})
