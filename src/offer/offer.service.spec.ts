import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfferService } from './offer.service'

const prisma = {
  offer: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  application: { count: vi.fn() },
  user: { findUnique: vi.fn() },
}

describe('OfferService', () => {
  let service: OfferService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new OfferService(prisma as never)
  })

  it('publishes a DRAFT offer and stamps publishedAt', async () => {
    prisma.offer.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT' })
    prisma.offer.update.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))

    const result = await service.publish(1)

    expect(result.status).toBe('PUBLISHED')
    expect(result.publishedAt).toBeInstanceOf(Date)
  })

  it('rejects publishing an offer that is not DRAFT', async () => {
    prisma.offer.findUnique.mockResolvedValue({ id: 1, status: 'CLOSED' })

    await expect(service.publish(1)).rejects.toThrow(BadRequestException)
  })

  it('counts accepted applications for an offer', async () => {
    prisma.application.count.mockResolvedValue(3)

    await expect(service.acceptedCount(1)).resolves.toBe(3)
    expect(prisma.application.count).toHaveBeenCalledWith({
      where: { offerId: 1, status: 'ACCEPTED' },
    })
  })

  it('lists all offers of the company tied to the authenticated user, any status', async () => {
    prisma.user.findUnique.mockResolvedValue({ companyId: 7 })
    prisma.offer.findMany.mockResolvedValue([{ id: 1, companyId: 7, status: 'DRAFT' }])

    const result = await service.findAllForCompanyUser(42)

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 42 }, select: { companyId: true } })
    expect(prisma.offer.findMany).toHaveBeenCalledWith({
      where: { companyId: 7 },
      orderBy: { createdAt: 'desc' },
      include: { company: true, applications: { select: { status: true } } },
    })
    expect(result).toEqual([{ id: 1, companyId: 7, status: 'DRAFT' }])
  })

  it('rejects listing offers for a user with no company', async () => {
    prisma.user.findUnique.mockResolvedValue({ companyId: null })

    await expect(service.findAllForCompanyUser(42)).rejects.toThrow('el usuario no tiene una empresa asociada')
  })

  describe('E3-07: Seguridad y pertenencia de ofertas', () => {
    it('asigna el companyId propio al crear una oferta como COMPANY', async () => {
      prisma.offer.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))

      const dto = {
        companyId: 999, // Intentando crear a nombre de otra empresa
        title: 'Desarrollador',
        description: 'Puesto dev',
        modality: 'Remoto',
        seats: 2,
        requiredHours: 240,
        periodStart: new Date(),
        periodEnd: new Date(),
      }

      const result = await service.create(dto, { sub: 10, role: Role.COMPANY, companyId: 5 })

      expect(result.companyId).toBe(5)
      expect(prisma.offer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ companyId: 5, status: 'DRAFT' }),
      })
    })

    it('permite a coordinación especificar cualquier companyId al crear oferta', async () => {
      prisma.offer.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))

      const dto = {
        companyId: 12,
        title: 'Pasantía',
        description: 'Pasantía',
        modality: 'Presencial',
        seats: 1,
        requiredHours: 160,
        periodStart: new Date(),
        periodEnd: new Date(),
      }

      const result = await service.create(dto, { sub: 1, role: Role.COORDINATOR })
      expect(result.companyId).toBe(12)
    })

    it('bloquea a una empresa ajena al publicar una oferta (403 Forbidden)', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 10, status: 'DRAFT' })

      await expect(
        service.publish(1, { sub: 5, role: Role.COMPANY, companyId: 99 }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('permite a la empresa dueña publicar su propia oferta', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 10, status: 'DRAFT' })
      prisma.offer.update.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))

      const result = await service.publish(1, { sub: 5, role: Role.COMPANY, companyId: 10 })
      expect(result.status).toBe('PUBLISHED')
    })

    it('permite a coordinación publicar cualquier oferta', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 10, status: 'DRAFT' })
      prisma.offer.update.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))

      const result = await service.publish(1, { sub: 1, role: Role.COORDINATOR })
      expect(result.status).toBe('PUBLISHED')
    })

    it('bloquea a una empresa ajena al cerrar una oferta (403 Forbidden)', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 10, status: 'PUBLISHED' })

      await expect(
        service.close(1, { sub: 5, role: Role.COMPANY, companyId: 99 }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('permite a la empresa dueña cerrar su propia oferta', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 10, status: 'PUBLISHED' })
      prisma.offer.update.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))

      const result = await service.close(1, { sub: 5, role: Role.COMPANY, companyId: 10 })
      expect(result.status).toBe('CLOSED')
    })

    it('en findOne bloquea consultar una oferta DRAFT si es empresa ajena (403 Forbidden)', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 10, status: 'DRAFT' })

      await expect(
        service.findOne(1, { sub: 5, role: Role.COMPANY, companyId: 99 }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('en findOne permite a la empresa dueña consultar su oferta DRAFT', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 10, status: 'DRAFT' })

      const result = await service.findOne(1, { sub: 5, role: Role.COMPANY, companyId: 10 })
      expect(result).toBeDefined()
    })

    it('en findOne permite a coordinación consultar una oferta DRAFT', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 10, status: 'DRAFT' })

      const result = await service.findOne(1, { sub: 1, role: Role.COORDINATOR })
      expect(result).toBeDefined()
    })

    it('en findOne permite consultar ofertas PUBLISHED sin restricción', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 10, status: 'PUBLISHED' })

      const result = await service.findOne(1, { sub: 20, role: Role.STUDENT })
      expect(result).toBeDefined()
    })
  })
})
