import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationService } from './application.service'

describe('ApplicationService Concurrency (E2-02)', () => {
  let prisma: {
    application: {
      findUnique: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      count: ReturnType<typeof vi.fn>
    }
    offer: {
      findUnique: ReturnType<typeof vi.fn>
    }
    $queryRaw: ReturnType<typeof vi.fn>
    $transaction: ReturnType<typeof vi.fn>
  }
  let offers: {
    acceptedCount: ReturnType<typeof vi.fn>
  }
  let service: ApplicationService

  beforeEach(() => {
    prisma = {
      application: {
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      offer: {
        findUnique: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
    }
    offers = {
      acceptedCount: vi.fn(),
    }
    service = new ApplicationService(prisma as never, offers as never)
  })

  it('garantiza que exactamente una aceptación tiene éxito y la otra recibe error claro de sobrecupo', async () => {
    // 1. Simulación de la oferta con 1 sola vacante disponible
    const offerData = { id: 1, seats: 1, status: 'PUBLISHED' }
    prisma.offer.findUnique.mockResolvedValue(offerData)
    prisma.$queryRaw.mockResolvedValue([offerData])

    // 2. Dos postulaciones pendientes
    prisma.application.findUnique
      .mockResolvedValueOnce({ id: 101, offerId: 1, status: 'SUBMITTED', offer: offerData })
      .mockResolvedValueOnce({ id: 102, offerId: 1, status: 'SUBMITTED', offer: offerData })

    // 3. Simulación del bloqueo transaccional a nivel de BD (SELECT FOR UPDATE)
    // El bloqueo serializa las transacciones concurrentes sobre la misma oferta
    let acceptedInDb = 0
    let queue = Promise.resolve()

    prisma.$transaction.mockImplementation(async (callback) => {
      const wait = queue
      let release: () => void
      queue = new Promise((resolve) => {
        release = resolve
      })
      await wait
      try {
        return await callback(prisma)
      } finally {
        release!()
      }
    })

    // Cada transacción consulta los cupos dentro de su contexto transaccional
    offers.acceptedCount.mockImplementation(() => Promise.resolve(acceptedInDb))
    prisma.application.count.mockImplementation(() => Promise.resolve(acceptedInDb))

    // Al ejecutarse el update exitoso, se incrementa el contador de aceptadas
    prisma.application.update.mockImplementation(({ where, data }) => {
      acceptedInDb += 1
      return Promise.resolve({ id: where.id, ...data })
    })

    // 4. Lanzamos ambas aceptaciones concurrentemente (Promise.allSettled)
    const [res1, res2] = await Promise.allSettled([
      service.decide(101, 'ACCEPTED' as never),
      service.decide(102, 'ACCEPTED' as never),
    ])

    const fulfilled = [res1, res2].filter(
      (r) => r.status === 'fulfilled',
    ) as Array<PromiseFulfilledResult<{ id: number; status: string }>>
    const rejected = [res1, res2].filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[]

    // 5. Criterio 1: Exactamente una tiene éxito y la otra falla
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    // 6. Criterio 2: El error explica que la oferta ya se llenó (BadRequestException, no un 500)
    expect(fulfilled[0].value.status).toBe('ACCEPTED')
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException)
    expect((rejected[0].reason as BadRequestException).message).toBe('la oferta ya no tiene cupos')

    // 7. Criterio 3: Comprueba que se ejecutó la transacción y el bloqueo pesimista de fila (FOR UPDATE)
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(prisma.$queryRaw).toHaveBeenCalled()
  })

  it('permite aceptar postulaciones normalmente cuando hay cupos de sobra', async () => {
    const offerData = { id: 1, seats: 5, status: 'PUBLISHED' }
    prisma.offer.findUnique.mockResolvedValue(offerData)
    prisma.$queryRaw.mockResolvedValue([offerData])

    prisma.application.findUnique
      .mockResolvedValueOnce({ id: 101, offerId: 1, status: 'SUBMITTED', offer: offerData })
      .mockResolvedValueOnce({ id: 102, offerId: 1, status: 'SUBMITTED', offer: offerData })

    prisma.$transaction.mockImplementation((cb) => cb(prisma))
    offers.acceptedCount.mockResolvedValue(1)
    prisma.application.update.mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data }))

    const [res1, res2] = await Promise.all([
      service.decide(101, 'ACCEPTED' as never),
      service.decide(102, 'ACCEPTED' as never),
    ])

    expect(res1.status).toBe('ACCEPTED')
    expect(res2.status).toBe('ACCEPTED')
  })
})
