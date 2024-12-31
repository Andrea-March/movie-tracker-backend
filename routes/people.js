const axios = require("axios");
const express = require("express");
const {cacheData, getData, quickCacheData} = require ("../utils/redisclient");
const { Error } = require("mongoose");

const TMDB_ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN; // Inserisci la tua API key OMDb
const TMDB_SEARCH_PERSON_API = "https://api.themoviedb.org/3/search/person/"
const TMDB_PEOPLE_API= "https://api.themoviedb.org/3/person/"


const router = express.Router();

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


module.exports = router;