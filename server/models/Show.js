import mongoose from 'mongoose';

const ShowSchema = new mongoose.Schema({
  movie: { type: String, ref: 'Movie' },
  showDateTime: { type: Date, required: true },
  showPrice: { type: Number, required: true },
  occupiedSeats: { type: [String], default: [] } // ✅ array of strings
}, { timestamps: true });

export default mongoose.model('Show', ShowSchema);