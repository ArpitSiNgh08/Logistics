import { Controller, Post, Body, HttpCode, HttpStatus, Param, Get} from '@nestjs/common';
import { BillingBotService } from './billing-bot.service';

@Controller('webhook')
export class BillingBotController {
  constructor(private readonly billingBotService: BillingBotService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: any) {
    // Navigate safely through the nested Meta Graph API JSON layer structure
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return { status: 'no_message' };
    }

    const fromPhone = message.from;

    // 1. Check if the incoming payload is a Telemetry Location update
    if (message.type === 'location' || message.location) {
      const { latitude, longitude } = message.location;
      
      console.log(`📡 [TELEMETRY INCOMING] From [${fromPhone}]: Lat ${latitude}, Lng ${longitude}`);
      
      await this.billingBotService.updateDriverLocation(fromPhone, latitude, longitude);
      return { status: 'telemetry_processed' };
    }

    // 2. Otherwise, treat it as a standard interactive/text command
    if (message.text?.body) {
      const textBody = message.text.body;
      console.log(`Received message from [${fromPhone}]: ${textBody}`);
      await this.billingBotService.processIncomingWorkflow(fromPhone, textBody);
      return { status: 'processed' };
    }

    return { status: 'unsupported_message_type' };
  }

  @Get(':orderId/track')
  async getTrackingDetails(@Param('orderId') orderId: string) {
    console.log(`🔍 [TRACKING REQUEST] Fetching details for Order ID: ${orderId}`);
    return this.billingBotService.getTripTrackingProfile(orderId);
  }
}