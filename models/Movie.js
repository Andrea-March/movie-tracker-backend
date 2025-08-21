const mongoose = require("mongoose");

const movieSchema = new mongoose.Schema({
  id: {type:String, required: true, unique: true },
  title: { type: String, required: true },
  overview: {type: String},
  poster_path: {type: String, required: false},
  release_date: { type: Date },
  trailer_url: {type: String},
  genre_ids: [Number],
  genres:[String],
  runtime: {type: Number},
  vote_average: {type: Number}
});

module.exports = mongoose.model("Movie", movieSchema);