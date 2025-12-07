const mongoose = require("mongoose");

const groupMovieSchema = new mongoose.Schema({
  group:   { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
  movie:   { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true, index: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User",  required: true },
  addedAt: { type: Date, default: Date.now },
  status:  { type: String, enum: ["to-watch","watched","archived"], default: "to-watch", index: true },
  notes:   { type: String },
  snapshot: {
    tmdbId: Number,
    title: String,
    year: Number,
    runtime: Number,
    poster: String,
    genres: [String],
    vote_average: Number,
    trailer_url: String,
  }
}, { timestamps: true });

groupMovieSchema.index({ group: 1, movie: 1 }, { unique: true });

module.exports = mongoose.model("GroupMovie", groupMovieSchema);