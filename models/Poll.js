const mongoose = require("mongoose");

const pollSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  title: { type: String, default: "Scegli il prossimo film" },
  options: [{
    movie: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true },
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, required: true },
  allowMultiple: { type: Boolean, default: false }
});
pollSchema.index({ group: 1, endsAt: 1 });

module.exports = mongoose.model("Poll", pollSchema);