const express = require("express");
const mongoose = require("mongoose");
const { authMiddleware } = require("./authroutes");
const Event = require("../models/Event");
const router = express.Router();


router.get("/:eventId", authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!mongoose.isValidObjectId(eventId)) return res.status(400).json({ error: "Group id non valido" });
    const event = await Event.findById(eventId)
      .populate("movie", "title poster_path runtime genres")
      .populate("createdBy", "username")
      .lean();
    if (!event) return res.status(404).json({ error: "Evento non trovato" });

    res.json(event);
  } catch (err) {
    res.status(500).json({ error: "Errore caricamento evento" });
  }
});


module.exports = router;