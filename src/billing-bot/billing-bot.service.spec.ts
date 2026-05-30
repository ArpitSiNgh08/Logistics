import { Test, TestingModule } from '@nestjs/testing';
import { BillingBotService } from './billing-bot.service';

describe('BillingBotService', () => {
  let service: BillingBotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BillingBotService],
    }).compile();

    service = module.get<BillingBotService>(BillingBotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
