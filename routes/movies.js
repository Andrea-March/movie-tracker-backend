const axios = require("axios");
const express = require("express");
const router = express.Router();
const {cacheData, getData} = require ("../utils/redisclient")

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
  const page = parseInt(req.query.page) || 1;

  try{
    const cachedData = await getData(`popular_movies_page_${page}`)
    if (cachedData) {
      // Se i dati sono in cache, rispondi con i dati memorizzati
      console.log(`Restituendo i dati dalla cache per la pagina ${page}`);
      return res.json(JSON.parse(cachedData));
    }
  }catch(err) {
    console.log(err)
  }

  try {
    // Chiamata a TMDb API per cercare i film
    const response = await axios.get("https://api.themoviedb.org/3/movie/popular", {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
      },
      params: {
        language: "it-IT",
        page, // Passa il numero di pagina alla query
      },
    });

    if (response.data.Response === "False") {
      return res.status(404).json({ error: response.data.Error }); // Error handling
    }
    const responseObject = {
      movies: response.data.results, // Restituisce i film
      totalPages: response.data.total_pages, // Restituisce il numero totale di pagine
      currentPage: page, // Restituisce la pagina corrente
    }
    cacheData(`popular_movies_page_${page}`, JSON.stringify(responseObject))
    res.json(responseObject);
  } catch (err) {
    console.error("Errore durante la ricerca TMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});

router.get('/top_rated', async (req, res) => {
  const page = parseInt(req.query.page) || 1;

  try{
    const cachedData = await getData(`top_rated_page_${page}`)
    if (cachedData) {
      // Se i dati sono in cache, rispondi con i dati memorizzati
      console.log(`Restituendo i dati dalla cache per la pagina ${page}`);
      return res.json(JSON.parse(cachedData));
    }
  }catch(err) {
    console.log(err)
  }

  try {
    // Chiamata a TMDb API per cercare i film
    const response = await axios.get("https://api.themoviedb.org/3/movie/top_rated", {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
      },
      params: {
        language: "it-IT",
        page, // Passa il numero di pagina alla query
      },
    });

    if (response.data.Response === "False") {
      return res.status(404).json({ error: response.data.Error }); // Error handling
    }
    const responseObject = {
      movies: response.data.results, // Restituisce i film
      totalPages: response.data.total_pages, // Restituisce il numero totale di pagine
      currentPage: page, // Restituisce la pagina corrente
    }
    cacheData(`top_rated_page_${page}`, JSON.stringify(responseObject))
    res.json(responseObject);
  } catch (err) {
    console.error("Errore durante la ricerca TMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});

module.exports = router;