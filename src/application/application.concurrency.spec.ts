import { describe, it, expect, vi } from 'vitest'
import { ApplicationService } from './application.service'

const prisma = {
  application: { findUnique: vi.fn(), update: vi.fn() },
  offer: { findUnique: vi.fn() },
}
const offers = { acceptedCount: vi.fn() }

describe('ApplicationService Concurrency', () => {
  it('E2-01: demuestra el sobrecupo con dos aceptaciones simultáneas', async () => {
    // 1. Configuramos el servicio con dependencias simuladas
    const service = new ApplicationService(prisma as never, offers as never)

    // 2. Simulamos que la oferta tiene 1 sola plaza
    prisma.offer.findUnique.mockResolvedValue({ id: 1, seats: 1, status: 'PUBLISHED' })
    
    // 3. Simulamos las dos postulaciones
    prisma.application.findUnique
      .mockResolvedValueOnce({ id: 101, offerId: 1, status: 'SUBMITTED' })
      .mockResolvedValueOnce({ id: 102, offerId: 1, status: 'SUBMITTED' })

    // 4. Simulamos que la oferta aún tiene 0 plazas aceptadas para AMBAS lecturas simultáneas
    // Al ser llamadas concurrentes con Promise.all, ambas leen "0" antes de que alguna pueda escribir
    offers.acceptedCount.mockResolvedValue(0)

    // Simulamos la actualización exitosa
    prisma.application.update.mockImplementation(({ data }) => Promise.resolve({ ...data }))

    // 5. Lanzamos ambas aceptaciones al mismo tiempo
    const results = await Promise.all([
      service.decide(101, 'ACCEPTED' as never),
      service.decide(102, 'ACCEPTED' as never)
    ])

    // 6. Demostramos que AMBAS pasan indebidamente
    expect(results[0].status).toBe('ACCEPTED')
    expect(results[1].status).toBe('ACCEPTED')
    
    // El count fue llamado 2 veces, demostrando la lectura duplicada
    expect(offers.acceptedCount).toHaveBeenCalledTimes(2)
  })
})
