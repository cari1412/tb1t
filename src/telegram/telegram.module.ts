import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';
import { StartCommand } from './commands/start.command';
import { HelpCommand } from './commands/help.command';
import { SubscriptionCommand } from './commands/subscription.command';
import { SubscriptionService } from './subscription.service';
import { DatabaseModule } from '../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AiModule],
  providers: [
    TelegramService,
    TelegramUpdate,
    StartCommand,
    HelpCommand,
    SubscriptionCommand,
    SubscriptionService,
  ],
  exports: [TelegramService, SubscriptionService],
})
export class TelegramModule {}