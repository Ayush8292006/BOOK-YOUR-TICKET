import Stripe from "stripe";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";

const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

export const stripeWebHooks = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripeInstance.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("❌ Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      // ✅ PAYMENT SUCCESS - YAHAN SEATS LOCK HOTI HAIN
      case "checkout.session.completed": {
        const session = event.data.object;
        const { bookingId, showId, seats } = session.metadata;
        
        if (!bookingId || !showId || !seats) {
          console.log("❌ Missing metadata in webhook");
          return res.status(400).json({ success: false, message: "Missing metadata" });
        }

        const seatsArray = seats.split(",");
        
        console.log(`✅ Payment successful for booking: ${bookingId}`);
        console.log(`📦 Locking seats: ${seatsArray.join(", ")}`);

        // Update booking to paid
        const booking = await Booking.findByIdAndUpdate(bookingId, {
          isPaid: true,
          paymentLink: ""
        }, { new: true });

        if (!booking) {
          console.log(`❌ Booking ${bookingId} not found`);
          return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // ✅ LOCK SEATS - Payment success ke BAAD
        await Show.findByIdAndUpdate(showId, {
          $addToSet: { occupiedSeats: { $each: seatsArray } }
        });

        console.log(`✅ Seats ${seatsArray.join(", ")} locked successfully for show ${showId}`);
        break;
      }

      default:
        console.log(" Unhandled event:", event.type);
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.log("❌ Webhook processing error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};