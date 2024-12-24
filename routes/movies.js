const axios = require("axios");
const express = require("express");
const router = express.Router();

// La tua API Key OMDb
const OMDB_API_KEY = process.env.OMDB_API_KEY; // Inserisci la tua API key OMDb

// Cerca un film tramite OMDb API
router.get("/search", async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Il parametro query è obbligatorio" });
  }

  try {
    // Chiamata a OMDb API per cercare i film
    const response = await axios.get("http://www.omdbapi.com/", {
      params: {
        s: query, // 's' è il parametro di ricerca per il titolo
        apikey: OMDB_API_KEY,
      },
    });

    if (response.data.Response === "False") {
      return res.status(404).json({ error: response.data.Error }); // Error handling
    }

    res.json(response.data.Search); // Restituisce la lista di film trovati
  } catch (err) {
    console.error("Errore durante la ricerca OMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});

module.exports = router;