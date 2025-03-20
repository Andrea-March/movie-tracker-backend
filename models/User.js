const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  movies: [
    {
      movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" }, // Riferimento al modello Movie
      watched: { type: Boolean, default: false },
      addedAt: { type: Date, default: Date.now },
    },
  ],
  activeChallenges: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Challenge" }, // Riferimento alle sfide attive
  ],
  fcmToken: { type: String }, // campo per le notifiche push firebase
  resetToken: String, // token per il reset della password
  resetTokenExpiration: Date, // scadenza del token per il reset della password
});

module.exports = mongoose.model("User", userSchema);