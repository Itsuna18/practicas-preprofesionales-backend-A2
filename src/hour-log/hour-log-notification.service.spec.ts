import { describe, expect, it, vi } from 'vitest'
import { HourLogNotificationService } from './hour-log-notification.service'

describe('HourLogNotificationService', () => {
  const service = new HourLogNotificationService()

  it('emite el mensaje de notificación al tutor', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    service.notifyTutor(12, 45)
    expect(spy).toHaveBeenCalledWith('[notificación] tutor 12: nueva hora registrada #45')
    spy.mockRestore()
  })
})
