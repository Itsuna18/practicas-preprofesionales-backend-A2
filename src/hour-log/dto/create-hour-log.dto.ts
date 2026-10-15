import { Type } from 'class-transformer'
import { IsDate, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { HOURS_OUT_OF_RANGE_MESSAGE, MAX_HOURS_PER_LOG, MIN_HOURS_PER_LOG } from '../../common/hour-log-rules'

export class CreateHourLogDto {
  @IsInt() placementId!: number

  @Type(() => Date) @IsDate() date!: Date

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string

  @Min(MIN_HOURS_PER_LOG, { message: HOURS_OUT_OF_RANGE_MESSAGE })
  @Max(MAX_HOURS_PER_LOG, { message: HOURS_OUT_OF_RANGE_MESSAGE })
  hours!: number

  @IsString() @MaxLength(500) activity!: string
}