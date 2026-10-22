import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import type { AssistantUser } from './assistant-context.service'
import { AssistantService } from './assistant.service'
import { ChatDto } from './dto/chat.dto'

// Cualquier rol autenticado. El contexto se arma con req.user.sub, así que
// cada persona solo conversa sobre sus propios datos.
@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  @Post('chat')
  chat(@Req() req: { user: AssistantUser }, @Body() dto: ChatDto) {
    return this.service.chat(req.user, dto.messages)
  }
}
