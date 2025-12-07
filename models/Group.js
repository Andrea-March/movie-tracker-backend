
const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, maxlength: 2000 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  membersCount: { type: Number, default: 1, min: 0 },
  icon: { type: String, default: "fa-users" },
  invitePolicy: { type: String, enum: ["open", "token"], default: "token" },
  visibility: { type: String, enum: ["private", "link", "public"], default: "private" },
  settings: {
    maxCandidates: { type: Number, default: 10, min: 1, max: 50 },
    voteType: { type: String, enum: ["plurality", "ranked"], default: "plurality" },
    tieBreak: { type: String, enum: ["owner", "random", "runtimeShorter"], default: "owner" }
  }
}, { timestamps: true });

groupSchema.index({ name: "text" }); // se vuoi ricerca testuale
groupSchema.index({ visibility: 1, name: 1 });


module.exports = mongoose.model("Group", groupSchema);