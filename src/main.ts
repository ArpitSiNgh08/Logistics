import * as dotenv from 'dotenv';
import * as path from 'path';

// Force load the environment variables right at the process boot stage
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable global CORS if you plan to hit this endpoint from web tools later
  app.enableCors();
  
  await app.listen(process.env.PORT || 3000);
  console.log(`🚀 Billing Bot Webhook Gateway is running on: ${await app.getUrl()}`);
}
bootstrap();