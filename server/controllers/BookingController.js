import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import Stripe from "stripe";
import nodemailer from "nodemailer";

const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Function to send booking confirmation email
const sendBookingConfirmationEmail = async (userEmail, bookingDetails) => {
  const { movieName, showDate, showTime, seats, amount, bookingId } = bookingDetails;
  
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Booking Confirmation</title>
      <style>
        body {
          font-family: 'Arial', sans-serif;
          background-color: #f4f4f4;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
        }
        .content {
          padding: 30px;
        }
        .ticket {
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          border-radius: 12px;
          padding: 20px;
          margin: 20px 0;
          position: relative;
        }
        .ticket-detail {
          margin: 15px 0;
          padding: 10px;
          background: white;
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .ticket-label {
          font-weight: bold;
          color: #555;
          font-size: 14px;
        }
        .ticket-value {
          font-weight: bold;
          color: #333;
          font-size: 16px;
        }
        .seats {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        .seat-badge {
          background: #667eea;
          color: white;
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: bold;
        }
        .footer {
          background-color: #f8f9fa;
          padding: 20px;
          text-align: center;
          color: #666;
          font-size: 12px;
        }
        .button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 8px;
          display: inline-block;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎬 Booking Confirmed!</h1>
          <p>Your movie ticket is ready</p>
        </div>
        <div class="content">
          <div class="ticket">
            <div class="ticket-detail">
              <span class="ticket-label">🎥 Movie</span>
              <span class="ticket-value">${movieName}</span>
            </div>
            <div class="ticket-detail">
              <span class="ticket-label">📅 Date</span>
              <span class="ticket-value">${showDate}</span>
            </div>
            <div class="ticket-detail">
              <span class="ticket-label">⏰ Time</span>
              <span class="ticket-value">${showTime}</span>
            </div>
            <div class="ticket-detail">
              <span class="ticket-label">💺 Seats</span>
              <div class="seats">
                ${seats.map(seat => `<span class="seat-badge">${seat}</span>`).join('')}
              </div>
            </div>
            <div class="ticket-detail">
              <span class="ticket-label">💰 Amount</span>
              <span class="ticket-value">₹${amount}</span>
            </div>
            <div class="ticket-detail">
              <span class="ticket-label">🎫 Booking ID</span>
              <span class="ticket-value">#${bookingId.slice(-6)}</span>
            </div>
          </div>
          <p style="text-align: center; color: #666; margin-top: 20px;">
            Please show this ticket at the cinema entrance.
          </p>
        </div>
        <div class="footer">
          <p>Thank you for booking with us!</p>
          <p>Enjoy your movie experience 🍿</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: userEmail,
    subject: `🎬 Booking Confirmed - ${movieName}`,
    html: emailHtml
  });
};

// Check seat availability
const checkSeatAvailability = async (showId, selectedSeats) => {
  const showData = await Show.findById(showId);
  if (!showData) return false;
  const occupiedSeats = showData.occupiedSeats || [];
  return !selectedSeats.some(seat => occupiedSeats.includes(seat));
};

// CREATE BOOKING
export const createBooking = async (req, res) => {
  try {
    const { showId, seats } = req.body;
    const userId = req.auth().userId;
    const origin = process.env.VITE_BASE_URL || req.headers.origin;
    const userEmail = req.auth().emailAddresses?.[0]?.emailAddress;

    if (!seats || seats.length === 0) {
      return res.status(400).json({ success: false, message: "No seats selected" });
    }

    const isAvailable = await checkSeatAvailability(showId, seats);
    if (!isAvailable) {
      return res.status(409).json({ success: false, message: "Some seats are already booked!" });
    }

    const showData = await Show.findById(showId).populate("movie");
    const amount = Number(showData.showPrice) * seats.length;

    const booking = await Booking.create({
      user: userId,
      show: showId,
      amount,
      bookedSeats: seats,
      isPaid: false,
      userEmail: userEmail
    });

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
        seats: seats.join(","),
        userEmail: userEmail
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

// GET OCCUPIED SEATS
export const getOccupiedSeats = async (req, res) => {
  try {
    const { showId } = req.params;
    const showData = await Show.findById(showId);
    const occupiedSeats = showData.occupiedSeats || []; 
    res.json({ success: true, occupiedSeats });
  } catch (error) {
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

// CANCEL BOOKING
export const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.auth().userId;

    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.user !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (booking.isPaid) {
      const showId = booking.show;
      const seats = booking.bookedSeats;
      
      await Show.findByIdAndUpdate(showId, {
        $pull: { occupiedSeats: { $in: seats } }
      });
    }

    await Booking.findByIdAndDelete(bookingId);

    res.json({ success: true, message: "Booking cancelled successfully" });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

