import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('❌ DATABASE_URL missing from application environment variables! Ensure dotenv is loaded in main.ts.');
    }

    const poolInstance = new Pool({ connectionString });
    const adapterInstance = new PrismaPg(poolInstance);

    super({ adapter: adapterInstance });
    this.pool = poolInstance;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}