const axios = require("axios");
const express = require("express");
const router = express.Router();
const {cacheData, getData, quickCacheData} = require ("../utils/redisclient");
const { Error } = require("mongoose");
const { authMiddleware } = require("./authroutes");

// La tua API Key OMDb
const TMDB_ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN; // Inserisci la tua API key OMDb
const TMDB_MOVIE_API= "https://api.themoviedb.org/3/movie/"
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

router.get("/search", authMiddleware, async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Il parametro query è obbligatorio" });
  }
  /* try{
    const cachedData = await getData(`search_${query}`);
    if(cacheData) return response.status(200).json(JSON.parse(cachedData));
  }catch(err) {
    console.log("unable to access cache:" + err.message)
  } */
  try {
    // Chiamata a OMDb API per cercare i film
    const response = await axios.get("https://api.themoviedb.org/3/search/movie", {
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
    const limitedResults = response.data.results.slice(0, 5);
    /* await quickCacheData(`search_${query}`, JSON.stringify(limitedResults)); */
    res.json(limitedResults); // Restituisce la lista di film trovati
  } catch (err) {
    console.error("Errore durante la ricerca OMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});

router.get('/popular', authMiddleware, async (req, res) => {
  const page = parseInt(req.query.page) || 1;

  try{
    const cachedData = await getData(`popular_movies_page_${page}`)
    if (cachedData) {
      // Se i dati sono in cache, rispondi con i dati memorizzati
      /* console.log(`Restituendo i dati dalla cache per la pagina ${page}`); */
      return res.json(JSON.parse(cachedData));
    }
  }catch(err) {
    console.log(err)
  }

  try {
    // Chiamata a TMDb API per cercare i film
    const response = await axios.get(`${TMDB_MOVIE_API}popular`, {
      headers: {
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
      },
      params: {
        language: "it-IT",
        page, // Passa il numero di pagina alla query
      },
    });

    if (response.status !== 200) {
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

router.get('/top_rated', authMiddleware, async (req, res) => {
  const page = parseInt(req.query.page) || 1;

  try{
    const cachedData = await getData(`top_rated_page_${page}`)
    if (cachedData) {
      // Se i dati sono in cache, rispondi con i dati memorizzati
      /* console.log(`Restituendo i dati dalla cache per la pagina ${page}`); */
      return res.json(JSON.parse(cachedData));
    }
  }catch(err) {
    console.log(err)
  }

  try {
    // Chiamata a TMDb API per cercare i film
    const response = await axios.get(`${TMDB_MOVIE_API}top_rated`, {
      headers: {
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
      },
      params: {
        language: "it-IT",
        page, // Passa il numero di pagina alla query
      },
    });

    if (response.status !== 200) {
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

router.get('/upcoming', authMiddleware, async (req, res) => {
  const page = parseInt(req.query.page) || 1;

  try{
    const cachedData = await getData(`upcoming_page_${page}`)
    if (cachedData) {
      // Se i dati sono in cache, rispondi con i dati memorizzati
      /* console.log(`Restituendo i dati dalla cache per la pagina ${page}`); */
      return res.json(JSON.parse(cachedData));
    }
  }catch(err) {
    console.log(err)
  }

  try {
    // Chiamata a TMDb API per cercare i film
    const response = await axios.get(`${TMDB_MOVIE_API}upcoming`, {
      headers: {
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
      },
      params: {
        language: "it-IT",
        page, // Passa il numero di pagina alla query
      },
    });

    if (response.status !== 200) {
      return res.status(404).json({ error: response.data.Error }); // Error handling
    }
    const responseObject = {
      movies: response.data.results, // Restituisce i film
      totalPages: response.data.total_pages, // Restituisce il numero totale di pagine
      currentPage: page, // Restituisce la pagina corrente
    }
    cacheData(`upcoming_page_${page}`, JSON.stringify(responseObject))
    res.json(responseObject);
  } catch (err) {
    console.error("Errore durante la ricerca TMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});


// Endpoint per ottenere i film per decennio con paginazione e caching
router.get("/movies-by-decade", authMiddleware, async (req, res) => {
  const { decade, page = 1 } = req.query; // Decennio e pagina (default 1)

  if (!decade) {
    return res.status(400).json({ error: "Decennio non specificato" });
  }

  const startYear = decade;
  const endYear = parseInt(decade) + 10;
  const startDate = `01/01/${startYear}`;
  const endDate = `01/01/${endYear}`;
  // Crea una chiave unica per la cache
  const cacheKey = `movies_${decade}_page_${page}`;

  try {
    // Verifica se i dati sono già presenti in cache
    const cachedData = await getData(cacheKey);
    if (cachedData) {
      console.log("Restituendo dati dalla cache");
      return res.json(JSON.parse(cachedData));
    }

    // Chiamata a TMDb API con paginazione
    const response = await axios.get("https://api.themoviedb.org/3/discover/movie", {
      headers: {
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
      },
      params: {
        language: "it-IT",
        'primary_release_date.gte': startDate,
        'primary_release_date.lte': endDate,
        sort_by: "vote_average.desc",
        "vote_count.gte": 1000,
        page, // Paginazione
      },
    });

    const movies = response.data.results;
    const totalPages = response.data.total_pages;
    const currentPage = page;

    // Memorizza i dati in cache
    cacheData(cacheKey, JSON.stringify({
      decade: `${startYear}s`,
      movies: response.data.results,
      totalPages,
      currentPage,
    }));

    // Rispondi con i film trovati
    res.json({
      decade: `${startYear}s`,
      movies,
      totalPages,
      currentPage,
    });
  } catch (err) {
    res.status(500).json({ error: "Errore durante la ricerca dei film"+ err.message });
  }
});

router.get('/providers/:movieId', async (req, res) => {
  const {movieId} = req.params;

  try{
    const cachedData = await getData(`providers_${movieId}`)
    if (cachedData) {
      // Se i dati sono in cache, rispondi con i dati memorizzati
      return res.json(JSON.parse(cachedData));
    }
  }catch(err) {
    console.log(err)
  }

  try {
    // Chiamata a TMDb API per cercare i film
    const response = await axios.get(`${TMDB_MOVIE_API}${movieId}/watch/providers `, {
      headers: {
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
      },
      params: {
        movie_id: movieId,
      },
    });

    if (response.status !== 200) {
      return res.status(404).json({ error: response.data.Error }); // Error handling
    }
    const providers = response.data.results.IT
    cacheData(`providers_${movieId}`, JSON.stringify(providers))
    res.json(providers);
  } catch (err) {
    console.error("Errore durante la ricerca TMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});

router.get("/:movieId/trailer", authMiddleware, async (req, res) => {
  const {movieId} = req.params;
  try{
    const cachedData = await getData(`trailer_${movieId}`)
    if (cachedData) {
      // Se i dati sono in cache, rispondi con i dati memorizzati
      return res.json(JSON.parse(cachedData));
    }
  }catch(err) {
    console.log(err)
  }

  try {
    // Chiamata a OMDb API per cercare i film
    const trailer_url = await getMovieTrailer(movieId)
    if (!trailer_url) {
      return res.status(404).json({ error: "trailer url not found" }); // Error handling
    }
    cacheData(`trailer_${movieId}`, JSON.stringify({trailer_url:`${trailer_url}`}))
    res.status(200).json({trailer_url:`${trailer_url}`}); // Restituisce la lista di film trovati
  } catch (err) {
    console.error("Errore durante la ricerca OMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});

router.get("/:movieId/credits", authMiddleware, async (req, res) => {
  const {movieId} = req.params;
  try{
    const cachedData = await getData(`credits_${movieId}`)
    if (cachedData) {
      // Se i dati sono in cache, rispondi con i dati memorizzati
      return res.json(JSON.parse(cachedData));
    }
  }catch(err) {
    console.log(err)
  }

  try {
    // Chiamata a TMDb API per cercare i film
    const response = await axios.get(`${TMDB_MOVIE_API}${movieId}/credits `, {
      headers: {
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
      },
      params: {
        language: "it-IT",
      },
    });

    if (response.status !== 200) {
      return res.status(404).json({ error: response.data.Error }); // Error handling
    }
    const credits = response.data.cast
    quickCacheData(`credits_${movieId}`, JSON.stringify(credits))
    res.json(credits);
  } catch (err) {
    console.error("Errore durante la ricerca TMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});


 


async function getMovieTrailer(movieId){
  try {
    // Chiamata a TMDb API per cercare i film
    const response = await axios.get(`${TMDB_MOVIE_API}${movieId}/videos`, {
      headers: {
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
      },
      params: {
        movie_id: movieId,
        language: "it-IT",
      },
    });

    if (response.status !== 200) {
      return null; // Error handling
    }
    const videos = response.data.results;
    const youTubeVideo = videos.find((el) => el["site"] === "YouTube");
    let youtubeUrl;
    if(youTubeVideo){
      youtubeUrl = `https://www.youtube.com/embed/${youTubeVideo.key}`;
    }
    return youtubeUrl;
  } catch (err) {
    console.error("Errore durante la ricerca TMDb:", err);
    return null;
  }
}

module.exports = router;