import { ArrayMaxSize, IsArray, IsIn, IsOptional } from 'class-validator'
import { CAREER_NAMES, INTERESTS, MODALITIES } from '../catalog'

export class UpdateProfileDto {
  @IsOptional() @IsIn(CAREER_NAMES) career?: string | null
  @IsOptional() @IsArray() @ArrayMaxSize(INTERESTS.length) @IsIn(INTERESTS, { each: true }) interests?: string[]
  @IsOptional() @IsIn(MODALITIES) preferredModality?: string | null
}
