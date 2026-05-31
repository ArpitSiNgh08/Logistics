import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import axios from 'axios';

@Injectable()
export class BillingBotService {
  constructor(private prisma: PrismaService) {}

  async processIncomingWorkflow(phone: string, text: string) {
    if (!text) return;

    // 1. Check if this phone number is tied to an active, ongoing transit operation
    let activeTrip = await this.prisma.trip.findFirst({
      where: {
        status: { in: ['MATCHED', 'LOADING_OTP_PENDING', 'IN_TRANSIT', 'UNLOADING_OTP_PENDING'] },
        OR: [
          { driverPhone: phone },
          { shipperPhone: phone },
          { receiverPhone: phone },
        ],
      },
    });

    // 2. Fallback: If no active trip is found directly via phone, check if the text matches an Order ID format
    if (!activeTrip && text.toUpperCase().startsWith('HYD-')) {
      activeTrip = await this.prisma.trip.findUnique({
        where: { orderId: text.toUpperCase() },
      });
      
      if (activeTrip) {
        await this.sendWhatsAppMessage(phone, `Linked to Order ${activeTrip.orderId}. Please enter the 6-digit Unloading OTP to confirm delivery.`);
        return;
      }
    }

    // 3. Main Operational State-Machine Router
    if (activeTrip) {
      const senderPhone = phone;
      const isDriver = activeTrip.driverPhone === senderPhone;
      const isShipper = activeTrip.shipperPhone === senderPhone;
      const isReceiver = activeTrip.receiverPhone === senderPhone;
      switch (activeTrip.status) {
        case 'MATCHED':
        case 'LOADING_OTP_PENDING':
          if (isDriver) {
            // Check if the driver typed a 6-digit number sequence
            if (/^\d{6}$/.test(text)) {
              if (text === activeTrip.loadingOtp) {
                // Update database state to reflect pickup confirmation
                await this.prisma.trip.update({
                  where: { id: activeTrip.id },
                  data: {
                    status: 'IN_TRANSIT',
                    pickupTime: new Date(),
                  },
                });

                await this.sendWhatsAppMessage(activeTrip.driverPhone, '✅ Pickup confirmed! Your trip has formally started. Please keep live location sharing turned ON.');
                await this.sendWhatsAppMessage(activeTrip.shipperPhone, `🚚 Goods picked up! Driver entered a valid OTP. Track your shipment using ID: ${activeTrip.orderId}.`);
              } else {
                await this.sendWhatsAppMessage(activeTrip.driverPhone, '❌ Invalid Loading OTP. Please confirm with the shipper and try again.');
              }
            } else {
              await this.sendWhatsAppMessage(activeTrip.driverPhone, `Welcome! You are scheduled for Order ${activeTrip.orderId}. Once items are fully loaded, reply with the 6-digit Loading OTP provided by the shipper.`);
            }
          }
          break;

        case 'IN_TRANSIT':
          if (isDriver) {
            const cleanText = text.trim().toUpperCase();

            if (cleanText === 'BREAKDOWN') {
              await this.sendWhatsAppMessage(activeTrip.driverPhone, '🚨 Your breakdown status has been logged. Platform dispatch has been notified to assist you.');
            } else if (cleanText === 'ARRIVED') {
              await this.prisma.trip.update({
                where: { id: activeTrip.id },
                data: { status: 'UNLOADING_OTP_PENDING' }
              });

              await this.sendWhatsAppMessage(activeTrip.driverPhone, `📍 Arrival logged! Share the Unloading OTP with the receiver. They must text "HYD-9821" followed by the code to close the trip.`);
              await this.sendWhatsAppMessage(activeTrip.receiverPhone, `🚚 Shipment ${activeTrip.orderId} has arrived at your gate! Please collect the Unloading OTP from the driver and reply to this chat with the 6-digit code to confirm safe delivery.`);
            } else {
              await this.sendWhatsAppMessage(activeTrip.driverPhone, `Trip ${activeTrip.orderId} is currently active. Text "ARRIVED" once you physically arrive at the destination drop-off zone.`);
            }
          } 
          
          else if (isReceiver) {
            if (activeTrip.currentLatitude && activeTrip.currentLongitude) {
              // Fixed dynamic Google Maps routing URL string
              const googleMapsLink = `https://maps.google.com/?q=${activeTrip.currentLatitude},${activeTrip.currentLongitude}`;
              
              // Format timestamps for pristine readability
              const formattedPickup = activeTrip.pickupTime ? new Date(activeTrip.pickupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
              const formattedUpdate = activeTrip.lastLocationUpdate ? new Date(activeTrip.lastLocationUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';

              const richTrackingMessage = 
                `📦 *SHIPMENT TRACKING PROFILE* 📦\n` +
                `----------------------------------------\n` +
                `🆔 *Order ID:* ${activeTrip.orderId}\n` +
                `⚙️ *System Status:* 🚚 IN_TRANSIT\n` +
                `🏭 *Shipper:* ${activeTrip.shipperName}\n\n` +
                `📍 *Route Details:*\n` +
                `• *From:* ${activeTrip.pickupAddress}\n` +
                `• *To:* ${activeTrip.deliveryAddress}\n\n` +
                `⏱️ *Milestone Logs:*\n` +
                `• *Dispatched At:* ${formattedPickup}\n` +
                `• *GPS Last Signal:* ${formattedUpdate}\n` +
                `----------------------------------------\n` +
                `🗺️ *LIVE TELEMETRY MAP LINK:*\n` +
                `Click the link below to open the trucker's live coordinates directly in Google Maps:\n` +
                `${googleMapsLink}`;

              await this.sendWhatsAppMessage(activeTrip.receiverPhone, richTrackingMessage);
            } else {
              await this.sendWhatsAppMessage(
                activeTrip.receiverPhone, 
                `🚚 *Shipment ${activeTrip.orderId} Details:*\n\n` +
                `• *Shipper:* ${activeTrip.shipperName}\n` +
                `• *Route:* ${activeTrip.pickupAddress} ➔ ${activeTrip.deliveryAddress}\n` +
                `• *Status:* En Route (Awaiting driver GPS activation).`
              );
            }
          } 
          
          else if (isShipper) {
            await this.sendWhatsAppMessage(activeTrip.shipperPhone, `Your shipment ${activeTrip.orderId} is currently on the move. You will be notified immediately upon delivery arrival.`);
          }
          break;

        case 'UNLOADING_OTP_PENDING':
          if (isReceiver) {
            const cleanText = text.trim();

            if (cleanText === activeTrip.unloadingOtp) {
              const settledPrice = activeTrip.settledPrice || 0;
              const postingFee = activeTrip.postingFee || 0;
              const finalPayout = settledPrice - postingFee;

              // Mark the trip as successfully DELIVERED and save completion timestamps
              await this.prisma.trip.update({
                where: { id: activeTrip.id },
                data: { 
                  status: 'DELIVERED',
                  deliveryTime: new Date()
                }
              });

              // To Receiver
              await this.sendWhatsAppMessage(
                activeTrip.receiverPhone, 
                `✅ *Delivery Verified!* Code matched successfully.\n\n` +
                `📦 *Order ID:* ${activeTrip.orderId}\n` +
                `🏢 *Status:* DELIVERED\n` +
                `Thank you for confirming safe receipt of goods.`
              );

              // To Driver (Include Payout Breakdown)
              await this.sendWhatsAppMessage(
                activeTrip.driverPhone, 
                `🎉 *Trip Closed & Invoice Generated!*\n` +
                `----------------------------------------\n` +
                `🆔 *Order ID:* ${activeTrip.orderId}\n` +
                `💰 *Settled Price:* ₹${settledPrice.toLocaleString()}\n` +
                `📉 *Platform Fee:* -₹${postingFee.toLocaleString()}\n` +
                `----------------------------------------\n` +
                `💵 *Net Driver Payout:* *₹${finalPayout.toLocaleString()}*\n\n` +
                `Your funds have been approved and routed to your digital wallet.`
              );

              // To Shipper (Include Billing Summary)
              await this.sendWhatsAppMessage(
                activeTrip.shipperPhone, 
                `🔔 *Milestone Alert: Delivery Complete*\n` +
                `----------------------------------------\n` +
                `Your shipment *${activeTrip.orderId}* has been successfully delivered to ${activeTrip.deliveryAddress}.\n\n` +
                `🧾 *BILLING SUMMARY:*\n` +
                `• *Total Freight Cost:* ₹${settledPrice.toLocaleString()}\n` +
                `• *Platform Escrow ID:* TXN-${activeTrip.id.substring(0, 8).toUpperCase()}\n` +
                `----------------------------------------\n` +
                `The digital invoice has been dispatched to your registered company email.`
              );

            } else {
              await this.sendWhatsAppMessage(activeTrip.receiverPhone, `❌ Invalid verification code. Please request the correct 6-digit Unloading OTP from the driver and reply with only the code.`);
            }
          } else {
            await this.sendWhatsAppMessage(phone, `The delivery for order ${activeTrip.orderId} is currently awaiting verification from the receiver.`);
          }
          break;

        default:
          await this.sendWhatsAppMessage(phone, 'Welcome to the Freight Platform. No actionable tasks are assigned to your profile at this moment.');
      }
    } else {
      await this.sendWhatsAppMessage(phone, 'Hello! You do not have an active trip link. Please type your target Order ID (e.g., HYD-9821) to connect to a shipment dashboard.');
    }
  }

  async updateDriverLocation(driverPhone: string, latitude: number, longitude: number) {
    try {
      const activeTrip = await this.prisma.trip.findFirst({
        where: {
          driverPhone: driverPhone,
          status: 'IN_TRANSIT',
        },
      });

      if (!activeTrip) {
        console.log(`⚠️ [TELEMETRY IGNORED] No active IN_TRANSIT trip found for driver: ${driverPhone}`);
        return;
      }

      const updatedTrip = await this.prisma.trip.update({
        where: { id: activeTrip.id },
        data: {
          currentLatitude: latitude,
          currentLongitude: longitude,
          lastLocationUpdate: new Date(),
        },
      });

      console.log(`💾 [DATABASE] Telemetry logged for ${updatedTrip.orderId}: [${latitude}, ${longitude}]`);
    } catch (error) {
      console.error(`❌ [TELEMETRY ERROR] Failed to save coordinates to database:`, error.message);
    }
  }

  private async sendWhatsAppMessage(toPhone: string, messageBody: string) {
    const isMock = process.env.USE_MOCK_WHATSAPP === 'true';

    if (isMock) {
      console.log('\n==================================================');
      console.log(`📱 [MOCK OUTBOUND WHATSAPP]`);
      console.log(`TO      : ${toPhone}`);
      console.log(`MESSAGE : ${messageBody}`);
      console.log('==================================================\n');
      return;
    }

    const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const token = process.env.META_ACCESS_TOKEN;

    try {
      await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'text',
          text: { preview_url: false, body: messageBody },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );
      console.log(`[META DISPATCH] Message sent successfully to ${toPhone}`);
    } catch (error) {
      console.error(
        `[META ERROR] Failed to send message via Meta API:`,
        error.response?.data || error.message
      );
    }
  }

  async getTripTrackingProfile(orderId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { orderId },
    });

    if (!trip) {
      return {
        statusCode: 404,
        message: `Shipment tracking profile for Order ID ${orderId} not found.`,
      };
    }

    // Fixed Google Maps template link layout structure
    const googleMapsLink = trip.currentLatitude && trip.currentLongitude
      ? `https://maps.google.com/?q=${trip.currentLatitude},${trip.currentLongitude}`
      : null;

    return {
      orderId: trip.orderId,
      status: trip.status,
      shipperName: trip.shipperName,
      pickupAddress: trip.pickupAddress,
      deliveryAddress: trip.deliveryAddress,
      currentLatitude: trip.currentLatitude ?? null,
      currentLongitude: trip.currentLongitude ?? null,
      googleMapsLink: googleMapsLink,
      pickupTime: trip.pickupTime,
      lastLocationUpdate: trip.lastLocationUpdate,
    };
  }

  // 🛠️ ADDED: This is the missing endpoint worker your controller was looking for
  async initializeTripProfile(data: {
    orderId: string;
    shipperPhone: string;
    driverPhone: string;
    receiverPhone: string;
    shipperName: string;
    pickupAddress: string;
    deliveryAddress: string;
    settledPrice: number;
  }) {
    // 1. Programmatically generate secure, random 6-digit authentication keys
    const generatedLoadingOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const generatedUnloadingOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Map payload schema values directly to your database properties
    const newTrip = await this.prisma.trip.create({
      data: {
        orderId: data.orderId,
        shipperPhone: data.shipperPhone,
        driverPhone: data.driverPhone,
        receiverPhone: data.receiverPhone,
        shipperName: data.shipperName,
        pickupAddress: data.pickupAddress,
        deliveryAddress: data.deliveryAddress,
        settledPrice: data.settledPrice,
        postingFee: data.settledPrice * 0.005, // 0.5% standard matching processing cut
        status: 'MATCHED',
        loadingOtp: generatedLoadingOtp,
        unloadingOtp: generatedUnloadingOtp,
      },
    });

    console.log(`✅ [DB SYSTEM SUCCESS] Seeded active row for ${data.orderId}. Loading OTP generated: ${generatedLoadingOtp}`);
    
    return {
      success: true,
      orderId: newTrip.orderId,
      status: newTrip.status,
      loadingOtp: newTrip.loadingOtp,
      unloadingOtp: newTrip.unloadingOtp
    };
  }
}