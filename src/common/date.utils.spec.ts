import { BadRequestException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_INSTITUTIONAL_TIMEZONE,
  formatCalendarDate,
  getInstitutionalTimezone,
  getTodayCalendarDate,
  normalizeCalendarDate,
  validateHourLogDate,
} from './date.utils'

describe('Date Utilities (E6-02)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('Configurable Institutional Timezone', () => {
    it('uses default timezone America/Guayaquil when env var is not set', () => {
      delete process.env.INSTITUTIONAL_TIMEZONE
      delete process.env.TIMEZONE
      expect(getInstitutionalTimezone()).toBe(DEFAULT_INSTITUTIONAL_TIMEZONE)
    })

    it('reads institutional timezone from INSTITUTIONAL_TIMEZONE env var', () => {
      process.env.INSTITUTIONAL_TIMEZONE = 'Europe/Madrid'
      expect(getInstitutionalTimezone()).toBe('Europe/Madrid')
    })

    it('reads institutional timezone from TIMEZONE env var as fallback', () => {
      delete process.env.INSTITUTIONAL_TIMEZONE
      process.env.TIMEZONE = 'UTC'
      expect(getInstitutionalTimezone()).toBe('UTC')
    })
  })

  describe('Calendar Date Normalization across Timezones', () => {
    const EXPECTED_DAY = '2026-05-15'
    const EXPECTED_CANONICAL = new Date('2026-05-15T00:00:00.000Z')

    it('normalizes plain date string YYYY-MM-DD', () => {
      const result = normalizeCalendarDate('2026-05-15')
      expect(result.toISOString()).toBe('2026-05-15T00:00:00.000Z')
      expect(formatCalendarDate(result)).toBe(EXPECTED_DAY)
    })

    it('normalizes UTC ISO string ending in Z', () => {
      const result = normalizeCalendarDate('2026-05-15T00:00:00.000Z')
      expect(result.toISOString()).toBe('2026-05-15T00:00:00.000Z')
      expect(formatCalendarDate(result)).toBe(EXPECTED_DAY)
    })

    it('normalizes simulated client from Tokyo (UTC+9)', () => {
      // Medianoche en Tokio
      const result = normalizeCalendarDate('2026-05-15T00:00:00+09:00')
      expect(result.getTime()).toBe(EXPECTED_CANONICAL.getTime())
      expect(formatCalendarDate(result)).toBe(EXPECTED_DAY)

      // Fin de jornada en Tokio
      const eveningResult = normalizeCalendarDate('2026-05-15T18:30:00+09:00')
      expect(eveningResult.getTime()).toBe(EXPECTED_CANONICAL.getTime())
      expect(formatCalendarDate(eveningResult)).toBe(EXPECTED_DAY)
    })

    it('normalizes simulated client from Madrid (UTC+2)', () => {
      const result = normalizeCalendarDate('2026-05-15T00:00:00+02:00')
      expect(result.getTime()).toBe(EXPECTED_CANONICAL.getTime())
      expect(formatCalendarDate(result)).toBe(EXPECTED_DAY)

      const afternoonResult = normalizeCalendarDate('2026-05-15T15:00:00+02:00')
      expect(afternoonResult.getTime()).toBe(EXPECTED_CANONICAL.getTime())
      expect(formatCalendarDate(afternoonResult)).toBe(EXPECTED_DAY)
    })

    it('normalizes simulated client from Guayaquil / Ecuador (UTC-5)', () => {
      const result = normalizeCalendarDate('2026-05-15T00:00:00-05:00')
      expect(result.getTime()).toBe(EXPECTED_CANONICAL.getTime())
      expect(formatCalendarDate(result)).toBe(EXPECTED_DAY)

      const lateResult = normalizeCalendarDate('2026-05-15T23:45:00-05:00')
      expect(lateResult.getTime()).toBe(EXPECTED_CANONICAL.getTime())
      expect(formatCalendarDate(lateResult)).toBe(EXPECTED_DAY)
    })

    it('normalizes simulated client from Los Angeles (UTC-7)', () => {
      const result = normalizeCalendarDate('2026-05-15T00:00:00-07:00')
      expect(result.getTime()).toBe(EXPECTED_CANONICAL.getTime())
      expect(formatCalendarDate(result)).toBe(EXPECTED_DAY)

      const eveningResult = normalizeCalendarDate('2026-05-15T21:00:00-07:00')
      expect(eveningResult.getTime()).toBe(EXPECTED_CANONICAL.getTime())
      expect(formatCalendarDate(eveningResult)).toBe(EXPECTED_DAY)
    })

    it('preserves existing records created with UTC midnight without shifting day (Criterio 5)', () => {
      // Registros típicos del seed o BD existente
      const seedDate = new Date('2026-03-02T00:00:00.000Z')
      const normalized = normalizeCalendarDate(seedDate)
      expect(normalized.toISOString()).toBe('2026-03-02T00:00:00.000Z')
      expect(formatCalendarDate(normalized)).toBe('2026-03-02')
    })

    it('throws BadRequestException for invalid date inputs', () => {
      expect(() => normalizeCalendarDate(null as never)).toThrow(BadRequestException)
      expect(() => normalizeCalendarDate('')).toThrow(BadRequestException)
      expect(() => normalizeCalendarDate('fecha-invalida')).toThrow(BadRequestException)
      expect(() => normalizeCalendarDate('2026-02-30')).toThrow(BadRequestException)
      expect(() => normalizeCalendarDate('2026-13-01')).toThrow(BadRequestException)
    })
  })

  describe('Validation of Practice Date Range (Criterio 2)', () => {
    const placement = {
      startDate: new Date('2026-03-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T00:00:00.000Z'),
    }
    const fixedNow = new Date('2026-06-15T12:00:00.000Z')

    it('allows dates on the exact startDate boundary', () => {
      const result = validateHourLogDate('2026-03-01', placement, { now: fixedNow })
      expect(result.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    })

    it('allows dates inside the practice range', () => {
      const result = validateHourLogDate('2026-04-15', placement, { now: fixedNow })
      expect(result.toISOString()).toBe('2026-04-15T00:00:00.000Z')
    })

    it('allows dates on the exact endDate boundary when not future', () => {
      const futureNow = new Date('2026-08-15T12:00:00.000Z')
      const result = validateHourLogDate('2026-07-31', placement, { now: futureNow })
      expect(result.toISOString()).toBe('2026-07-31T00:00:00.000Z')
    })

    it('rejects dates before the startDate with a clear message showing the valid range', () => {
      expect(() => validateHourLogDate('2026-02-28', placement, { now: fixedNow })).toThrowError(
        /la fecha está fuera del rango de la práctica \(rango válido: 2026-03-01 a 2026-07-31\)/,
      )
    })

    it('rejects dates after the endDate with a clear message showing the valid range', () => {
      const futureNow = new Date('2026-09-01T12:00:00.000Z')
      expect(() => validateHourLogDate('2026-08-01', placement, { now: futureNow })).toThrowError(
        /la fecha está fuera del rango de la práctica \(rango válido: 2026-03-01 a 2026-07-31\)/,
      )
    })
  })

  describe('Rejection of Future Dates (Criterio 3)', () => {
    const placement = {
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
    }
    const fixedNow = new Date('2026-05-15T12:00:00.000Z') // Today is 2026-05-15 in America/Guayaquil

    it('allows registering for today', () => {
      const result = validateHourLogDate('2026-05-15', placement, { now: fixedNow })
      expect(formatCalendarDate(result)).toBe('2026-05-15')
    })

    it('allows registering for a past day within range', () => {
      const result = validateHourLogDate('2026-05-14', placement, { now: fixedNow })
      expect(formatCalendarDate(result)).toBe('2026-05-14')
    })

    it('rejects tomorrow as a future date', () => {
      expect(() => validateHourLogDate('2026-05-16', placement, { now: fixedNow })).toThrowError(
        'no se pueden registrar horas con fecha futura',
      )
    })

    it('rejects far future dates', () => {
      expect(() => validateHourLogDate('2026-11-20', placement, { now: fixedNow })).toThrowError(
        'no se pueden registrar horas con fecha futura',
      )
    })
  })
})
