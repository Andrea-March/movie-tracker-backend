const mongoose = require("mongoose");

const rsvpSchema = new mongoose.Schema({
  user:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status:{ type: String, enum: ["yes", "no", "maybe"], default: "maybe" },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });


const eventSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  movie: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" }, // opzionale
  description: { type: String, maxlength: 2000 },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date },
  timezone: { type: String, default: "Europe/Rome" },
  status: { type: String, enum: ["scheduled", "cancelled", "finished"], default: "scheduled", index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  location: { type: String, maxlength: 500 },
  rsvp: { type: [rsvpSchema], default: [] },
  icsUid: { type: String } // utile se generi .ics
}, { timestamps: true });

eventSchema.index({ group: 1, status: 1, startsAt: 1 });

eventSchema.pre("validate", function(next) {
  if (!this.rsvp) return next();
  const ids = this.rsvp.map(r => String(r.user));
  const unique = new Set(ids);
  if (unique.size !== ids.length) return next(new Error("Duplicate RSVP entries for the same user"));
  next();
});

module.exports = mongoose.model("Event", eventSchema);