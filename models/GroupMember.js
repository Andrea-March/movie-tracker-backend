const mongoose = require("mongoose");

const groupMemberSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
  user:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  role:  { type: String, enum: ["owner", "admin", "member"], default: "member" },
  joinedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// 1) Unicità membership
groupMemberSchema.index({ group: 1, user: 1 }, { unique: true });

// 2) Lista "i miei gruppi": filtra per user, ordina per joinedAt
groupMemberSchema.index({ user: 1, joinedAt: -1 });

// 3) Preview membri per gruppo: owner/admin prima, poi più recenti
// (copre sort per role e joinedAt dentro lo stesso group)
groupMemberSchema.index({ group: 1, role: 1, joinedAt: -1 });

// 4) Safety: un solo owner per gruppo (ENFORCED)
groupMemberSchema.index(
  { group: 1, role: 1 },
  { unique: true, partialFilterExpression: { role: "owner" } }
);


module.exports = mongoose.model("GroupMemeber", groupMemberSchema);