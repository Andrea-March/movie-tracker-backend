const axios = require("axios");
const express = require("express");
const router = express.Router();

// La tua API Key OMDb
const OMDB_API_KEY = process.env.OMDB_API_KEY; // Inserisci la tua API key OMDb

// Cerca un film tramite OMDb API
/* router.get("/search", async (req, res) => {
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
}); */

router.get("/search", async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Il parametro query è obbligatorio" });
  }

  try {
    // Chiamata a OMDb API per cercare i film
    const response = await axios.get("https://api.themoviedb.org/3/search/movie", {
      headers:{
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
      },
      params: {
        query: query, // 's' è il parametro di ricerca per il titolo
      },
    });

    if (response.data.Response === "False") {
      return res.status(404).json({ error: response.data.Error }); // Error handling
    }
    res.json(response.data.results); // Restituisce la lista di film trovati
  } catch (err) {
    console.error("Errore durante la ricerca OMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});

router.get('/popular', async (req, res) => {
  try {
    // Chiamata a TMDb API per cercare i film
    const response = await axios.get("https://api.themoviedb.org/3/movie/popular?language=it-IT&page=1", {
      headers:{
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
      },
   /*    params: {
        query: query, // 's' è il parametro di ricerca per il titolo
      }, */
    });

    if (response.data.Response === "False") {
      return res.status(404).json({ error: response.data.Error }); // Error handling
    }
    res.json(response.data.results); // Restituisce la lista di film trovati
  } catch (err) {
    console.error("Errore durante la ricerca TMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});

module.exports = router;