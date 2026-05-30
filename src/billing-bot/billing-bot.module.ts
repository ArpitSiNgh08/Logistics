import { Module } from '@nestjs/common';
import { BillingBotController } from './billing-bot.controller';
import { BillingBotService } from './billing-bot.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [BillingBotController],
  providers: [
    BillingBotService,
    PrismaService,
  ],
})
export class BillingBotModule {}
