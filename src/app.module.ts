import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BillingBotModule } from './billing-bot/billing-bot.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [BillingBotModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
