import { Inngest } from "inngest";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";

// 👉 Client
export const inngest = new Inngest({ id: "movie-ticket-booking" });

/**
 *  Create User
 */
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "clerk/user.created" },

  async ({ event, step }) => {
    const { id, first_name, last_name, email_addresses, image_url } = event.data;

    const email = email_addresses?.[0]?.email_address;

    if (!email) {
      throw new Error("Email not found");
    }

    const userData = {
      _id: id,
      email,
      name: `${first_name || ""} ${last_name || ""}`,
      image: image_url,
    };

    await step.run("create-user", async () => {
      // 👉 upsert = create if not exists
      await User.findByIdAndUpdate(id, userData, { upsert: true });
    });
  }
);

/**
 *  Delete User
 */
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-with-clerk" },
  { event: "clerk/user.deleted" },

  async ({ event, step }) => {
    const { id } = event.data;

    await step.run("delete-user", async () => {
      await User.findByIdAndDelete(id);
    });
  }
);

/**
 *  Update User
 */
const syncUserUpdation = inngest.createFunction(
  { id: "update-user-with-clerk" },
  { event: "clerk/user.updated" },

  async ({ event, step }) => {
    const { id, first_name, last_name, email_addresses, image_url } = event.data;

    const email = email_addresses?.[0]?.email_address;

    const updatedData = {
      email,
      name: `${first_name || ""} ${last_name || ""}`,
      image: image_url,
    };

    await step.run("update-user", async () => {
      await User.findByIdAndUpdate(id, updatedData);
    });
  }
);



// ⚡ Function: Release seat if payment not completed in 10 min
export const releaseSeatAndDeleteBooking = inngest.createFunction(
  { id: "release-seats-delete-booking" },
  { event: "app/checkpayment" }, // trigger when a booking is created
  async ({ event }) => {
    const { bookingId, showId, seats } = event.data;

    console.log(`🕒 Scheduled release for Booking: ${bookingId} in 10 minutes`);

    // wait 10 minutes
    await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000));

    try {
      const booking = await Booking.findById(bookingId);

      if (!booking) {
        console.log(`❌ Booking ${bookingId} not found`);
        return;
      }

      if (booking.isPaid) {
        console.log(`✅ Booking ${bookingId} already paid, no action needed`);
        return;
      }

      // Delete booking
      await Booking.findByIdAndDelete(bookingId);

      // Release seats in Show model
      await Show.findByIdAndUpdate(showId, {
        $pull: { occupiedSeats: { $in: seats } },
      });

      console.log(`✅ Booking ${bookingId} deleted and seats released`);
    } catch (err) {
      console.error("❌ Error releasing booking:", err);
    }
  }
);

// 👉 Export
export const functions = [
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdation,
  releaseSeatAndDeleteBooking
];