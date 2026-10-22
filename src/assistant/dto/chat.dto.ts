import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator'

export const MAX_MESSAGES = 20
export const MAX_MESSAGE_LENGTH = 2000

export class ChatMessageDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant'
  @IsString() @MinLength(1) @MaxLength(MAX_MESSAGE_LENGTH) content!: string
}

export class ChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MESSAGES)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[]
}
