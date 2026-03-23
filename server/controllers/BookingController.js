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

// CREATE BOOKING - Payment ke baad hi seats book hongi
export const createBooking = async (req, res) => {
  try {
    const { showId, seats } = req.body;
    const userId = req.auth().userId;
    const { origin } = req.headers;

    if (!seats || seats.length === 0) {
      return res.json({ success: false, message: "No seats selected" });
    }

    // Check if seats are available
    const isAvailable = await checkSeatAvailability(showId, seats);
    if (!isAvailable) {
      return res.json({ success: false, message: "Seats already booked by someone else" });
    }

    const showData = await Show.findById(showId).populate("movie");
    const amount = Number(showData.showPrice) * seats.length;

    // Create booking with isPaid = false (seats not blocked yet)
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
      success_url: `${origin}/my-bookings?success=true&bookingId=${booking._id}&showId=${showId}&seats=${seats.join(",")}`,
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
    res.json({ success: false, message: error.message });
  }
};

// GET OCCUPIED SEATS - Sirf paid bookings ke seats show honge
export const getOccupiedSeats = async (req, res) => {
  try {
    const { showId } = req.params;
    const showData = await Show.findById(showId);
    const occupiedSeats = showData.occupiedSeats || []; 
    res.json({ success: true, occupiedSeats });
  } catch (error) {
    res.json({ success: false, message: error.message });
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
    res.json({ success: false, message: error.message });
  }
};