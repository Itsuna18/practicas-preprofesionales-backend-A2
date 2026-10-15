import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { HourLogValidationService } from './hour-log-validation.service'

describe('HourLogValidationService', () => {
  const service = new HourLogValidationService()

  it('permite una jornada con horas y horario válido', () => {
    expect(() =>
      service.assertValidHourLogInput({ hours: 4, startTime: '08:00', endTime: '12:00' }),
    ).not.toThrow()
  })

  it('rechaza cuando la hora de fin es anterior a la hora de inicio', () => {
    expect(() =>
      service.assertValidHourLogInput({ hours: 4, startTime: '14:00', endTime: '10:00' }),
    ).toThrow(BadRequestException)
  })

  it('rechaza cuando la hora de inicio y fin son iguales', () => {
    expect(() =>
      service.assertValidHourLogInput({ hours: 2, startTime: '09:00', endTime: '09:00' }),
    ).toThrow('la hora de inicio debe ser anterior a la de fin')
  })

  it('rechaza horas menores al mínimo (0.5)', () => {
    expect(() =>
      service.assertValidHourLogInput({ hours: 0.2, startTime: '08:00', endTime: '08:12' }),
    ).toThrow(BadRequestException)
  })

  it('rechaza horas mayores al máximo (10)', () => {
    expect(() =>
      service.assertValidHourLogInput({ hours: 11, startTime: '07:00', endTime: '18:00' }),
    ).toThrow(BadRequestException)
  })
})
