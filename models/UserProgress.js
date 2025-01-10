const mongoose = require("mongoose");

const userProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Riferimento all'utente
  challengeId: { type: mongoose.Schema.Types.ObjectId, ref: "Challenge", required: true }, // Riferimento alla sfida
  selectedMovies: [
    {
      movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
      watched: { type: Boolean, default: false },
      watchedAt: { type: Date }, // Data in cui il film è stato visto
    },
  ],
  progress: { type: Number, default: 0 }, // Numero di film visti
  completed: { type: Boolean, default: false }, // Se la sfida è completata
});

module.exports = mongoose.model("UserProgress", userProgressSchema);