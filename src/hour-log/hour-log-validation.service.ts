import { BadRequestException, Injectable } from '@nestjs/common'
import { HOURS_OUT_OF_RANGE_MESSAGE, MAX_HOURS_PER_LOG, MIN_HOURS_PER_LOG } from '../common/hour-log-rules'

@Injectable()
export class HourLogValidationService {
  /**
   * Valida el rango de horas y el orden cronológico de inicio/fin de un registro.
   */
  assertValidHourLogInput(input: { hours: number; startTime: string; endTime: string }): void {
    if (input.hours < MIN_HOURS_PER_LOG || input.hours > MAX_HOURS_PER_LOG) {
      throw new BadRequestException(HOURS_OUT_OF_RANGE_MESSAGE)
    }
    const [startHour, startMinute] = input.startTime.split(':').map(Number)
    const [endHour, endMinute] = input.endTime.split(':').map(Number)
    if (startHour * 60 + startMinute >= endHour * 60 + endMinute) {
      throw new BadRequestException('la hora de inicio debe ser anterior a la de fin')
    }
  }
}
