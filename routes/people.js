const axios = require("axios");
const express = require("express");
const {cacheData, getData, quickCacheData} = require ("../utils/redisclient");
const { Error } = require("mongoose");
const { authMiddleware } = require("./authroutes");

const TMDB_ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN; // Inserisci la tua API key OMDb
const TMDB_SEARCH_PERSON_API = "https://api.themoviedb.org/3/search/person/"
const TMDB_PEOPLE_API= "https://api.themoviedb.org/3/person/"


const router = express.Router();

/**
 * @route GET /api/person/search
 * @description Ritorna i match con la query fra le persone
 */
router.get("/search", async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Il parametro query è obbligatorio" });
  }
  try{
    const cachedData = getData(`search_person_${query}`);
    if(cacheData) return response.status(200).json(JSON.parse(cachedData));
  }catch(err) {
    console.log("unable to access cache:" + err.message)
  }
  try {
    // Chiamata a OMDb API per cercare i film
    const response = await axios.get(TMDB_SEARCH_PERSON_API, {
      headers:{
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
      },
      params: {
        language: "it-IT",
        query: query, // 's' è il parametro di ricerca per il titolo
      },
    });

    if (response.status !== 200) {
      return res.status(404).json({ error: response.data.Error }); // Error handling
    }
    const limitedResults = response.data.results.slice(0, 3);
    quickCacheData(`search_person_${query}`, JSON.stringify(limitedResults));
    res.json(limitedResults); // Restituisce la lista di film trovati
  } catch (err) {
    console.error("Errore durante la ricerca OMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});


/**
 * @route GET /api/person/movies/:personId/:personRole
 * @description Ritorna i film che ha diretto o in cui ha partecipato una persona
 * @param {String} personId - ID della persona
 * @param {Number} personRole - 'Director' || 'Crew'
 * @cache {duration: 6h}
 */
router.get("/movies/:personId/:personRole", authMiddleware, async (req, res) => {
  const { personId, personRole } = req.params;

  try{
    const cachedData = await getData(`person_movies_${personId}_${personRole}`)
    if (cachedData) {
      // Se i dati sono in cache, rispondi con i dati memorizzati
      return res.json(JSON.parse(cachedData));
    }
  }catch(err) {
    console.log(err)
  }

  try {
     const [personDetail, credits] = await Promise.all([
      getPersonById(personId),
      getPersonMovieCredits(personId, personRole),
    ]);
    cacheData(`person_movies_${personId}_${personRole}`, JSON.stringify({personDetail, credits}))
    res.json({personDetail, credits});
  } catch (err) {
    console.error("Errore durante la ricerca dei film della persona:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film della persona" });
  }
});


async function getPersonMovieCredits(personId, personRole) {
  try {
    const response = await axios.get(`https://api.themoviedb.org/3/person/${personId}/movie_credits`, {
      headers: {
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
      },
      params: {
        language: "it-IT",
      },
    });

    if (response.status !== 200) {
      throw new Error("Errore nella risposta TMDb");
    }

    const data = response.data;

    // Separiamo cast e crew
    const movies = personRole === "Director" ? (data.crew || []).filter(c => c.job === "Director") : data.cast || []

    const sorted = (movies || [])
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 30);

    return movies;
  } catch (err) {
    console.error("Errore durante la chiamata TMDb:", err);
    throw new Error("Errore durante il recupero dei film della persona");
  }
}

async function getPersonById(personId) {
  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/person/${personId}`,
      {
        headers: {
          Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
        },
        params: {
          /* language: "it-IT",  */ /* altrimenti non ritorna la biografia */
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(`Errore TMDb: status ${response.status}`);
    }
    return response.data; // contiene i dettagli della persona
  } catch (err) {
    console.error("Errore durante getPersonById:", err.message);
    throw new Error("Errore durante la ricerca della persona");
  }
}

module.exports = router;