import { Controller, Post, Body, HttpCode, HttpStatus, Param, Get, Query, Res} from '@nestjs/common';
import type { Response } from 'express';
import { BillingBotService } from './billing-bot.service';

@Controller('webhook')
export class BillingBotController {
  constructor(private readonly billingBotService: BillingBotService) {}


  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response // Use Express response directly to ensure no JSON wrapping
  ) {
    // This must match your verify token exactly
    const MY_VERIFY_TOKEN = 'my_local_dev_token_123'; 

    console.log(`🔍 [WEBHOOK VERIFICATION REQ] Mode: ${mode}, Token: ${token}`);

    if (mode === 'subscribe' && token === MY_VERIFY_TOKEN) {
      console.log('✅ Webhook successfully authenticated with Meta!');
      
      // CRITICAL: Send back ONLY the raw challenge string with a 200 status
      return res.status(HttpStatus.OK).send(challenge);
    }

    console.log('❌ Webhook authentication failed. Token mismatch.');
    return res.status(HttpStatus.FORBIDDEN).send('Verification failed');
  }

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