import { Module } from '@nestjs/common'
import { AssistantContextService } from './assistant-context.service'
import { AssistantController } from './assistant.controller'
import { CHAT_PROVIDER, AssistantService } from './assistant.service'
import { createChatProvider } from './chat-provider'

@Module({
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantContextService,
    { provide: CHAT_PROVIDER, useFactory: () => createChatProvider() },
  ],
})
export class AssistantModule {}
