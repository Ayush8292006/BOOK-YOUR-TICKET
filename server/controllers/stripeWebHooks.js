import Stripe from "stripe";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import nodemailer from "nodemailer";

const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

// Email transporter setup
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
        .header p {
          margin: 10px 0 0;
          opacity: 0.9;
        }
        .content {
          padding: 30px;
        }
        .ticket {
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          border-radius: 12px;
          padding: 20px;
          margin: 20px 0;
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
          <p style="text-align: center; color: #999; font-size: 12px;">
            Thank you for booking with us! Enjoy your movie experience 🍿
          </p>
        </div>
        <div class="footer">
          <p>© Movie Ticket Booking App</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Movie Ticket App" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: `🎬 Booking Confirmed - ${movieName}`,
    html: emailHtml
  });
};

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

      case "checkout.session.completed": {
        const session = event.data.object;
        const { bookingId, showId, seats, userEmail } = session.metadata;
        
        console.log("📧 Webhook received - Processing payment...");
        console.log("📧 Booking ID:", bookingId);
        console.log("📧 User Email:", userEmail);
        
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

        // Lock seats in Show model
        await Show.findByIdAndUpdate(showId, {
          $addToSet: { occupiedSeats: { $each: seatsArray } }
        });

        console.log(`✅ Seats ${seatsArray.join(", ")} locked successfully`);

        // Send email confirmation
        try {
          const showData = await Show.findById(showId).populate("movie");
          const showDate = new Date(showData.showDateTime).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          });
          const showTime = new Date(showData.showDateTime).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
          });
          
          await sendBookingConfirmationEmail(userEmail, {
            movieName: showData.movie.title,
            showDate,
            showTime,
            seats: seatsArray,
            amount: booking.amount,
            bookingId: booking._id.toString()
          });
          
          console.log(`✅ Email sent successfully to ${userEmail}`);
        } catch (emailError) {
          console.error("❌ Email sending failed:", emailError.message);
        }

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