import { Test, TestingModule } from '@nestjs/testing';
import { BillingBotController } from './billing-bot.controller';

describe('BillingBotController', () => {
  let controller: BillingBotController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingBotController],
    }).compile();

    controller = module.get<BillingBotController>(BillingBotController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
