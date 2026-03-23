import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import Stripe from "stripe";

const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

// Check seat availability
const checkSeatAvailability = async (showId, selectedSeats) => {
  const showData = await Show.findById(showId);
  if (!showData) return false;
  const occupiedSeats = showData.occupiedSeats || [];
  return !selectedSeats.some(seat => occupiedSeats.includes(seat));
};

// CREATE BOOKING - Payment success ke baad hi seats lock hongi
export const createBooking = async (req, res) => {
  try {
    const { showId, seats } = req.body;
    const userId = req.auth().userId;
    const origin = process.env.VITE_BASE_URL || req.headers.origin;

    if (!seats || seats.length === 0) {
      return res.status(400).json({ success: false, message: "No seats selected" });
    }

    // Check if seats are already booked
    const isAvailable = await checkSeatAvailability(showId, seats);
    if (!isAvailable) {
      return res.status(409).json({ success: false, message: "Some seats are already booked!" });
    }

    const showData = await Show.findById(showId).populate("movie");
    const amount = Number(showData.showPrice) * seats.length;

    // Create booking with isPaid = false (NO SEATS LOCKED YET)
    const booking = await Booking.create({
      user: userId,
      show: showId,
      amount,
      bookedSeats: seats,
      isPaid: false,
    });

    // Create Stripe session
    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "inr",
          product_data: { name: showData.movie.title },
          unit_amount: amount * 100,
        },
        quantity: 1,
      }],
      success_url: `${origin}/my-bookings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/my-bookings?canceled=true`,
      metadata: { 
        bookingId: booking._id.toString(),
        showId: showId,
        seats: seats.join(",")
      },
    });

    booking.paymentLink = session.url;
    await booking.save();

    res.json({ success: true, url: session.url });
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET OCCUPIED SEATS - Sirf paid bookings ke seats show honge
export const getOccupiedSeats = async (req, res) => {
  try {
    const { showId } = req.params;
    const showData = await Show.findById(showId);
    const occupiedSeats = showData.occupiedSeats || []; 
    
    console.log(`📊 Occupied seats for show ${showId}:`, occupiedSeats);
    
    res.json({ success: true, occupiedSeats });
  } catch (error) {
    console.error("Error fetching seats:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET USER BOOKINGS
export const getUserBookings = async (req, res) => {
  try {
    const userId = req.auth().userId;
    const bookings = await Booking.find({ user: userId })
      .populate({
        path: "show",
        populate: { path: "movie" },
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// CANCEL BOOKING - Cancel booking and release seats
export const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.auth().userId;

    // Find booking
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    // Check if booking belongs to user
    if (booking.user !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // If booking is paid, release seats from Show model
    if (booking.isPaid) {
      const showId = booking.show;
      const seats = booking.bookedSeats;
      
      // Release seats from occupiedSeats array
      await Show.findByIdAndUpdate(showId, {
        $pull: { occupiedSeats: { $in: seats } }
      });
      
      console.log(`✅ Seats released: ${seats.join(", ")} for show: ${showId}`);
    }

    // Delete the booking
    await Booking.findByIdAndDelete(bookingId);
    
    console.log(`✅ Booking ${bookingId} cancelled and seats released`);

    res.json({ success: true, message: "Booking cancelled successfully" });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};