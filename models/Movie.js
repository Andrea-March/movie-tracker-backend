const mongoose = require("mongoose");

const movieSchema = new mongoose.Schema({
  imdbID: {type:String, required: true},
  Title: { type: String, required: true },
  Poster: {type: String, required: false},
  Description: { type: String },
  Year: { type: Date },
  Genre: [String],
});

module.exports = mongoose.model("Movie", movieSchema);