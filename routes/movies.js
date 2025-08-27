const axios = require("axios");
const express = require("express");
const router = express.Router();
const {cacheData, getData, quickCacheData} = require ("../utils/redisclient");
const { Error } = require("mongoose");
const { authMiddleware } = require("./authroutes");

// La tua API Key OMDb
const TMDB_ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN; // Inserisci la tua API key OMDb
const TMDB_MOVIE_API= "https://api.themoviedb.org/3/movie/";
const TMDB_MOVIE_DISCOVER_API = "https://api.themoviedb.org/3/discover/movie";
const PERSONS_POPULARITY_THRESHOLD = 0.2;
const MOVIES_POPULARITY_THRESHOLD = 0.5;
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


/**
 * @route GET /api/movies/search
 * @description Ritorna i film che matchano la query
 */
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

/**
 * @route GET /api/movies/search/multi
 * @description Ritorna i film e le persone che matchano la query
 */
router.get("/search/multi", authMiddleware, async (req, res) => {
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
    const [moviesResp, personsResp] = await Promise.all([
      axios.get("https://api.themoviedb.org/3/search/movie", {
        headers:{
          Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
        },
        params: {
          language: "it-IT",
          query, 
        },
      }),
      axios.get("https://api.themoviedb.org/3/search/person", {
        headers:{
          Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
        },
        params: {
          query,
          language: "en-US",
        },
      }),
    ]);
    if (moviesResp.status !== 200 || personsResp.status !== 200) {
      return res.status(404).json({ error: response.data.Error }); // Error handling
    }
    let movies = moviesResp.data.results
      .filter(item => item.popularity && item.popularity >= MOVIES_POPULARITY_THRESHOLD)
      .slice(0,3)
      .map(r => ({
        ...r,
        media_type: "movie",
      }));
    let persons = personsResp.data.results
      .filter(item => item.popularity && item.popularity >= PERSONS_POPULARITY_THRESHOLD)
      .slice(0, 3)
      .sort((a, b) => b.popularity - a.popularity)
      .map(r => ({
        ...r,
        media_type: "person",
      }));
    let results = [...movies, ...persons].sort((a, b) => b.popularity - a.popularity);
    /* await quickCacheData(`search_${query}`, JSON.stringify(limitedResults)); */
    res.json(results); // Restituisce la lista di film trovati
  } catch (err) {
    console.error("Errore durante la ricerca OMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film" });
  }
});


/**
 * @route GET /api/movies/detail/:movieId
 * @description Ritorna i dettagli del film corrispondente all'id
 * @param {String} movieId - ID del film
 * @cache {duration: 6h}
 */
router.get("/detail/:movieId", authMiddleware, async (req, res) => {
  const {movieId} = req.params;
  try{
    const cachedData = await getData(`movie_detail_${movieId}`)
    if (cachedData) {
      // Se i dati sono in cache, rispondi con i dati memorizzati
      return res.json(JSON.parse(cachedData));
    }
  }catch(err) {
    console.log(err)
  }
 
  try {
     let movieDetail = await getMovieById(movieId);
     cacheData(`movie_detail_${movieId}`, JSON.stringify({trailer_url:`${trailer_url}`}))
    res.json(movieDetail); // Restituisce il film trovato
  } catch (err) {
    console.error("Errore durante la ricerca OMDb:", err);
    res.status(500).json({ error: "Errore durante la ricerca del film" });
  }
});


/**
 * @route GET /api/movies/popular
 * @description Ritorna i film popolari
 * @cache {duration: 6h}
 */
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


/**
 * @route GET /api/movies/top-rated
 * @description Ritorna i film con i voti più alti di sempre
 * @cache {duration: 6h}
 */
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


/**
 * @route GET /api/movies/upcoming
 * @description Ritorna i film in uscita
 * @cache {duration: 6h}
 */
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


/**
 * @route GET /api/movies/movies-by-decade
 * @description Ritorna i film per il decennio indicato nel payload (paginati)
 * @cache {duration: 6h}
 */
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
    const data = await getMoviesByDecade(startYear, startDate, endDate, page);

    // Memorizza i dati in cache
    cacheData(cacheKey, JSON.stringify(data));

    // Rispondi con i film trovati
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Errore durante la ricerca dei film"+ err.message });
  }
});


/**
 * @route GET /api/movies/providers/:movieId
 * @description Ritorna i provider sui quali è possibile vedere il film che ha un certo id
 * @param {String} movieId - ID del film
 * @cache {duration: 6h}
 */
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


/**
 * @route GET /api/movies/:movieId/trailer
 * @description Ritorna il link youtube al trailer del film di un dato id.
 * @param {String} movieId - ID del film
 * @cache {duration: 6h}
 */
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


/**
 * @route GET /api/movies/:movieId/credits
 * @description Ritorna le persone che hanno partecipato alla realizzazione del film
 * @param {String} movieId - ID del film
 * @cache {duration: 6h}
 */
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


/**
 * @route GET /api/movies/:movieId/related
 * @description Ritorna i film correlati ad un dato film
 * @param {String} movieId - ID del film
 * @cache {duration: 6h}
 */
router.get('/:movieId/related', authMiddleware, async (req, res) => {
  const movieId = req.params.movieId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.body.limit) || 10; /* quanti film mostrare per pagina (tmdb defaults to 20) */

  if (!movieId) {
    return res.status(400).json({ error: "Movie ID mancante" });
  }

  const cacheKey = `related_movies_${movieId}_page_${page}`;

  // Controllo cache
  try {
    const cachedData = await getData(cacheKey);
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }
  } catch (err) {
    console.error("Errore cache:", err);
  }

  // Chiamata TMDB
  try {
    const response = await axios.get(`${TMDB_MOVIE_API}${movieId}/recommendations`, {
      headers: {
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
      },
      params: {
        language: "it-IT",
        page
      }
    });

    if (response.status !== 200) {
      return res.status(404).json({ error: "Dati non trovati" });
    }

    const responseObject = {
      movies: response.data.results
        .slice(0, limit),
      totalPages: response.data.total_pages,
      currentPage: page,
    };

    // Salva in cache
    await cacheData(cacheKey, JSON.stringify(responseObject));

    res.json(responseObject);
  } catch (err) {
    console.error("Errore TMDB:", err);
    res.status(500).json({ error: "Errore durante la ricerca dei film correlati" });
  }
});

 
async function getMoviesByDecade (startYear, startDate, endDate, page){
  try {
    // Chiamata a TMDb API con paginazione
    const response = await axios.get(TMDB_MOVIE_DISCOVER_API, {
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

    return({
      decade: `${startYear}s`,
      movies,
      totalPages,
      currentPage,
    })
  } catch (err) {
    throw err;
  }
  return;
} 


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

async function getMovieById(movieId){
  try {
    // Chiamata a OMDb API per cercare i film
    const response = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
      headers:{
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
      },
      params: {
        language: "it-IT",
      },
    });

    if (response.status !== 200) {
      throw new Error({ error: response.data.Error }); // Error handling
    }
    return response.data;
  } catch (err) {
    console.error("Errore durante la ricerca OMDb:", err);
    throw new Error("Errore durante la ricerca del film: getMovieById")
  }
}

module.exports = router;
module.exports.getMoviesByDecade = getMoviesByDecade;
module.exports.getMovieTrailer = getMovieTrailer;
module.exports.getMovieById = getMovieById;