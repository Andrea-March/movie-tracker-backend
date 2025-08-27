const mongoose = require("mongoose");

const movieSchema = new mongoose.Schema({
  // ID canonico
  tmdbId: { type: Number },

  // legacy: il vecchio "id" (string) resta, ma lo chiamiamo legacyId
  legacyId: { type: String, alias: "id" }, // alias mantiene compatibilità col codice che legge "id"

  title: { type: String, required: true, trim: true },
  overview: { type: String },
  poster_path: { type: String },          // es: "/kqjL17yufvn9OVLyXYpvtyrFfak.jpg"
  release_date: { type: Date },           
  releaseYear: { type: Number },          // comodo per liste/ordinamenti
  trailer_url: { type: String },

  genre_ids: [Number],                    
  genres: [String],                       
  runtime: { type: Number },
  vote_average: { type: Number }
}, { timestamps: true });

// Unicità: rendiamo unici tmdbId o legacyId SOLO se esistono.
// Evita conflitti nei record vecchi mentre migri gradualmente.
movieSchema.index(
  { tmdbId: 1 },
  { unique: true, partialFilterExpression: { tmdbId: { $exists: true } } }
);

movieSchema.index(
  { legacyId: 1 },
  { unique: true, partialFilterExpression: { legacyId: { $exists: true } } }
);

// Qualche auto-derivazione utile
movieSchema.pre("validate", function(next) {
  // Se manca tmdbId ma c'è legacyId numerico, deriva
  if (!this.tmdbId && this.legacyId) {
    const n = Number(this.legacyId);
    if (!Number.isNaN(n)) this.tmdbId = n;
  }
  // Se manca releaseYear, derivala da release_date
  if (!this.releaseYear && this.release_date instanceof Date) {
    this.releaseYear = this.release_date.getUTCFullYear();
  }
  next();
});

module.exports = mongoose.model("Movie", movieSchema);