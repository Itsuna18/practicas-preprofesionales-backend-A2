import { Module } from '@nestjs/common'
import { AssistantContextService } from './assistant-context.service'
import { AssistantController } from './assistant.controller'
import { ANTHROPIC_CLIENT, AssistantService, createAnthropicClient } from './assistant.service'

@Module({
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantContextService,
    { provide: ANTHROPIC_CLIENT, useFactory: createAnthropicClient },
  ],
})
export class AssistantModule {}
