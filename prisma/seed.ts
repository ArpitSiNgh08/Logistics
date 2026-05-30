import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Force load environmental configurations from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL || "postgresql://platform_admin:secure_password123@localhost:5432/indian_freight_billing_db?schema=public";

// 1. Initialize the raw pg driver connection pool
const pool = new Pool({ connectionString });

// 2. Wrap it inside the official Prisma 7 driver adapter context
const adapter = new PrismaPg(pool);

// 3. Inject the driver adapter explicitly into your client instance
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clear any existing logs to start fresh
  await prisma.trip.deleteMany({});

  const sampleTrip = await prisma.trip.create({
    data: {
      orderId: 'HYD-9821', // Matches the exact blueprint ID from the SRS document
      shipperPhone: '919999999999', 
      driverPhone: '918888888888',
      receiverPhone: '917777777777',
      shipperName: 'Apex Textiles Pvt Ltd', 
      pickupAddress: 'Jeedimetla, Hyderabad', 
      deliveryAddress: 'Ambattur, Chennai', 
      settledPrice: 28000.0, 
      status: 'MATCHED',
      loadingOtp: '483712',    // Hardcoded from the SRS document sketch!
      unloadingOtp: '202645',  // Randomly assigned delivery closeout key
    },
  });

  console.log('🌱 Database seeded successfully with active trip record:');
  console.log(sampleTrip);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end(); // Clean up raw pool links on execution close
  });