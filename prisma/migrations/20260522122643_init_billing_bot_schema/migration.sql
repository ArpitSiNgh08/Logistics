-- CreateEnum
CREATE TYPE "TripState" AS ENUM ('MATCHED', 'LOADING_OTP_PENDING', 'IN_TRANSIT', 'UNLOADING_OTP_PENDING', 'DELIVERED', 'CLOSED');

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shipperPhone" TEXT NOT NULL,
    "driverPhone" TEXT NOT NULL,
    "receiverPhone" TEXT NOT NULL,
    "shipperName" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "settledPrice" DOUBLE PRECISION NOT NULL,
    "postingFee" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "status" "TripState" NOT NULL DEFAULT 'MATCHED',
    "currentLatitude" DOUBLE PRECISION,
    "currentLongitude" DOUBLE PRECISION,
    "lastLocationUpdate" TIMESTAMP(3),
    "loadingOtp" TEXT NOT NULL,
    "unloadingOtp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickupTime" TIMESTAMP(3),
    "deliveryTime" TIMESTAMP(3),
    "driverRatingForShipper" INTEGER,
    "shipperRatingForDriver" INTEGER,
    "receiverRatingForDriver" INTEGER,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trip_orderId_key" ON "Trip"("orderId");
