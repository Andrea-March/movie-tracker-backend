const mongoose = require("mongoose");

const voteSchema = new mongoose.Schema({
  poll:  { type: mongoose.Schema.Types.ObjectId, ref: "Poll", required: true },
  user:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  optionMovie: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true },
  createdAt: { type: Date, default: Date.now },
});
voteSchema.index({ poll: 1, user: 1 }, { unique: true }); // 1 voto per poll (o gestisci multiple)


module.exports = mongoose.model("Vote", voteSchema);