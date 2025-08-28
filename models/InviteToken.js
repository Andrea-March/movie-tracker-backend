const mongoose = require("mongoose");

const inviteTokenSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
  token: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true },
  maxUses: { type: Number, default: 1, min: 1 },
  usedCount: { type: Number, default: 0, min: 0 },
  revoked: { type: Boolean, default: false, index: true }
}, { timestamps: true });

// TTL auto-clean (rimuove doc quando expiresAt < now)
inviteTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

inviteTokenSchema.statics.consume = async function(token) {
  const doc = await this.findOneAndUpdate(
    {
      token,
      revoked: false,
      expiresAt: { $gt: new Date() },
      $expr: { $lt: ["$usedCount", "$maxUses"] }
    },
    { $inc: { usedCount: 1 }, $addToSet: { usedBy: /* opzionale */ undefined } },
    { new: true }
  );
  if (!doc) throw new Error("Invite token invalid/expired/exhausted");
  return doc;
};

module.exports = mongoose.model("InviteToken", inviteTokenSchema);