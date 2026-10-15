import { BadRequestException } from '@nestjs/common'

/**
 * DECISIÓN DE DOMINIO: DÍA CALENDARIO VS INSTANTE (E6-02)
 *
 * La fecha de una jornada en el libro de horas (`HourLog.date`) es un DÍA CALENDARIO
 * (fecha civil institucional: año, mes, día), NO un instante de tiempo.
 *
 * Justificación:
 * 1. Un estudiante asiste a su práctica en un día civil concreto (ej. 15 de mayo de 2026),
 *    con un horario local definido por `startTime` (ej. 08:00) y `endTime` (ej. 12:00).
 * 2. Si se trata como un "instante" y se serializa con la zona horaria del cliente,
 *    un dispositivo en una zona horaria distinta (ej. España UTC+2, Japón UTC+9 o
 *    California UTC-7) envía un timestamp que al convertirse a UTC o consultarse en
 *    otra región cae en el día anterior o posterior.
 * 3. Representación canónica: Se normaliza la fecha a la zona horaria institucional
 *    y se persiste en la base de datos a las 00:00:00.000Z (medianoche UTC) de ese
 *    día calendario. Así:
 *    - `date.toISOString().slice(0, 10)` siempre coincide con `YYYY-MM-DD`.
 *    - Los registros existentes del seed y producción (que ya se guardaban a las 00:00:00.000Z)
 *      no cambian de día al desplegar (requisito 5).
 *    - Dispositivos en distintas zonas horarias registran exactamente el mismo día (requisito 4).
 */

export const DEFAULT_INSTITUTIONAL_TIMEZONE = 'America/Guayaquil'

/**
 * Obtiene la zona horaria institucional de forma configurable a través de variables de entorno.
 */
export function getInstitutionalTimezone(): string {
  return process.env.INSTITUTIONAL_TIMEZONE || process.env.TIMEZONE || DEFAULT_INSTITUTIONAL_TIMEZONE
}

/**
 * Formatea un Date normalizado a formato ISO `YYYY-MM-DD`.
 */
export function formatCalendarDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Normaliza cualquier entrada de fecha (string ISO con o sin offset, Date o timestamp)
 * a su representación canónica de DÍA CALENDARIO: medianoche UTC (00:00:00.000Z) del día
 * civil correspondiente.
 */
export function normalizeCalendarDate(
  input: string | Date | number,
  timeZone: string = getInstitutionalTimezone(),
): Date {
  if (input === null || input === undefined) {
    throw new BadRequestException('la fecha es obligatoria')
  }

  // Si es un string, revisar si contiene la fecha civil YYYY-MM-DD explícita
  if (typeof input === 'string') {
    const trimmed = input.trim()
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const year = parseInt(match[1], 10)
      const month = parseInt(match[2], 10)
      const day = parseInt(match[3], 10)

      if (month < 1 || month > 12 || day < 1 || day > 31) {
        throw new BadRequestException('fecha inválida')
      }

      const canonical = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
      if (
        canonical.getUTCFullYear() !== year ||
        canonical.getUTCMonth() + 1 !== month ||
        canonical.getUTCDate() !== day
      ) {
        throw new BadRequestException('fecha inválida')
      }
      return canonical
    }

    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('fecha inválida')
    }
    input = parsed
  }

  if (typeof input === 'number') {
    input = new Date(input)
  }

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new BadRequestException('fecha inválida')
    }

    // Si ya viene a medianoche UTC, representa directamente ese día calendario
    if (
      input.getUTCHours() === 0 &&
      input.getUTCMinutes() === 0 &&
      input.getUTCSeconds() === 0 &&
      input.getUTCMilliseconds() === 0
    ) {
      return input
    }

    // Si es un instante con hora/minuto, interpretamos qué día calendario es en la zona horaria institucional
    const { year, month, day } = extractDatePartsInTimezone(input, timeZone)
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  }

  throw new BadRequestException('fecha inválida')
}

/**
 * Extrae año, mes y día de una fecha en la zona horaria indicada.
 */
function extractDatePartsInTimezone(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  return { year, month, day }
}

/**
 * Obtiene el día calendario de "hoy" según la zona horaria institucional.
 */
export function getTodayCalendarDate(timeZone: string = getInstitutionalTimezone(), now?: Date): Date {
  const reference = now || new Date()
  const { year, month, day } = extractDatePartsInTimezone(reference, timeZone)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
}

export interface DateValidationPlacement {
  startDate?: Date | string | null
  endDate?: Date | string | null
}

export interface DateValidationOptions {
  timeZone?: string
  now?: Date
}

/**
 * Valida y normaliza la fecha para un registro de horas:
 * 1. Normaliza la fecha a día calendario canónico en la zona horaria institucional.
 * 2. Rechaza si la fecha es futura.
 * 3. Rechaza si la fecha está fuera del rango de la práctica (startDate a endDate),
 *    mostrando un mensaje claro con el rango válido.
 */
export function validateHourLogDate(
  date: Date | string | number,
  placement: DateValidationPlacement,
  options?: DateValidationOptions,
): Date {
  const timeZone = options?.timeZone || getInstitutionalTimezone()
  const normalizedDate = normalizeCalendarDate(date, timeZone)

  // 1. Validar que no sea fecha futura
  const today = getTodayCalendarDate(timeZone, options?.now)
  if (normalizedDate.getTime() > today.getTime()) {
    throw new BadRequestException('no se pueden registrar horas con fecha futura')
  }

  // 2. Validar rango de la práctica si el placement tiene definidos startDate y endDate
  if (placement.startDate && placement.endDate) {
    const start = normalizeCalendarDate(placement.startDate, timeZone)
    const end = normalizeCalendarDate(placement.endDate, timeZone)

    if (normalizedDate.getTime() < start.getTime() || normalizedDate.getTime() > end.getTime()) {
      const startStr = formatCalendarDate(start)
      const endStr = formatCalendarDate(end)
      throw new BadRequestException(
        `la fecha está fuera del rango de la práctica (rango válido: ${startStr} a ${endStr})`,
      )
    }
  }

  return normalizedDate
}
