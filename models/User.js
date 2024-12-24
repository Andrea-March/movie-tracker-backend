const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  movies: [
    {
      movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" }, // Riferimento al modello Movie
      watched: { type: Boolean, default: false },
    },
  ],
});

module.exports = mongoose.model("User", userSchema);