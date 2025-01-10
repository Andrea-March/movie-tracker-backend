const mongoose = require("mongoose");

const challengeSchema = new mongoose.Schema({
  title: { type: String, required: true }, // Es: "Sfida Oscar Gennaio 2025"
  theme: { type: String, required: true }, // Es: "Oscar Movies"
  suggestedMovies: [
    {
      movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" }, // Riferimento al modello Movie
      title: { type: String, required: true },
    },
  ],
  goal: { type: Number, required: true }, // Numero di film da vedere (es: 5)
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
});

module.exports = mongoose.model("Challenge", challengeSchema);