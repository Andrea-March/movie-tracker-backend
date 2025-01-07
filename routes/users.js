const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Movie = require("../models/Movie");
const {getData, cacheDataForUser, deleteCacheKeysForUser } = require("../utils/redisclient");
const { getMovieTrailer } = require("./movies.js");
const mongoose = require('mongoose');


const router = express.Router();

const WATCHED_MOVIES_CACHE_KEY = "watched_movies"
const TO_WATCH_MOVIES_CACHE_KEY = "to_watch_movies"

// Registrazione utente
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    const savedUser = await newUser.save();
    res.status(201).json(savedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login utente
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "365d" });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aggiungi un film per un utente
router.post("/:userId/movies", async (req, res) => {
  const { userId } = req.params;
  const { movie, watched } = req.body;

  try {
    // Invalida la cache
    /* if(watched){
      await deleteData(`watched_movies_${userId}`);
    }else{
      await deleteData(`to_watch_movies_${userId}`);
    } */
    await  deleteCacheKeysForUser(userId);
    
    /* console.log("cache invalidata con successo"); */
  } catch (err) {
    console.error(err);
  }

  try {
    const user = await User.findById(userId);
    // Cerca o crea il film nella collezione Movies
    let foundMovie = await Movie.findOne({ id: movie.id });
    if (foundMovie) {
      const userHasMovie = await User.exists({ 
        _id: userId, 
        "movies.movieId": foundMovie._id 
      });
    
      if (userHasMovie) {
        return res.status(400).json({ error: "Film già salvato!" });
      }
    }
    if (!foundMovie) {
      let trailerUrl = undefined;
      try{
        trailerUrl = await getMovieTrailer(movie.id);
      }catch(err){
        console.log("unable to find trailer you tube key for movie"+movie.title)
      }
      foundMovie = new Movie({
        title: movie.title,
        id: movie.id,
        overview: movie.overview,
        poster_path: "https://image.tmdb.org/t/p/original" + movie.poster_path,
        release_date: movie.release_date,
        trailer_url: trailerUrl,
        genre_ids: movie.genre_ids,
        vote_average: movie.vote_average,
      });
      await foundMovie.save();
    }

    // Aggiungi il riferimento al film nell'array movies dell'utente
    
    user.movies.push({ movieId: foundMovie._id, watched });
    await user.save();

    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ottieni i film visti di un utente
router.get("/:userId/movies/watched", async (req, res) => {
  const { userId } = req.params;

  const { page = 1, limit = 16, countPages } = req.query;

  const skip = (page - 1) * limit;

  try {
    // Controlla se i dati sono già nella cache
    const cachedData = await getData(`${WATCHED_MOVIES_CACHE_KEY}_${userId}_page_${page}_limit_${limit}`);
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }
  } catch (err) {
    console.error(err);
  }

  try {
    let totalPages = undefined;
    if(countPages){
            // Ottieni il numero totale di film (per calcolare totalPages)
      const totalMovies = await User.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(userId) } },
        { $unwind: "$movies" },
        { $match: { "movies.watched": true } },
        { $count: "total" } // Conta il numero totale di film
      ]);

      const totalCount = totalMovies[0]?.total || 0; // Se non ci sono film, total è 0
      totalPages = Math.ceil(totalCount / limit); // Calcola il numero totale di pagine
    }
    const movies = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(userId) } },
      { $unwind: "$movies" }, // Scompatta l'array di film
      { $match: { "movies.watched": true } }, // Filtra solo i film visti
      { $sort: { "movies.addedAt": -1 } }, // Ordina per data
      { $skip: skip }, // Salta i risultati per la paginazione
      { $limit: limit }, // Limita i risultati
      {
        $lookup: { // Popola i dettagli del film
          from: "movies",
          localField: "movies.movieId",
          foreignField: "_id",
          as: "movieId",
        },
      },
      { $unwind: "$movieId" }, // Scompatta i dettagli del film
      { $project: { movies: 1, movieId: 1 } }, // Seleziona solo i campi necessari
    ]);
  /*   const watchedMovies = user.movies
                            .filter(movie => movie.watched)
                            .sort((a, b) => b.addedAt - a.addedAt); */
    
    // Salva nella cache con un TTL (es. 3600 secondi = 1 ora)
    await cacheDataForUser(userId, `${WATCHED_MOVIES_CACHE_KEY}_${userId}_page_${page}_limit_${limit}`, JSON.stringify({movies, totalPages}));
    res.status(200).json({movies: movies, totalPages: totalPages});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ottieni i film  da vedere di un utente
router.get("/:userId/movies/to-watch", async (req, res) => {
  const { userId } = req.params;

  const { page = 1, limit = 16, countPages } = req.query;

  const skip = (page - 1) * limit;


  try {
    // Controlla se i dati sono già nella cache
    const cachedData = await getData(`${TO_WATCH_MOVIES_CACHE_KEY}_${userId}_page_${page}_limit_${limit}`);
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }
  } catch (err) {
    console.error(err);
  }

  try {
    let totalPages = undefined;
    if(countPages){
            // Ottieni il numero totale di film (per calcolare totalPages)
      const totalMovies = await User.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(userId) } },
        { $unwind: "$movies" },
        { $match: { "movies.watched": false } },
        { $count: "total" } // Conta il numero totale di film
      ]);

      const totalCount = totalMovies[0]?.total || 0; // Se non ci sono film, total è 0
      totalPages = Math.ceil(totalCount / limit); // Calcola il numero totale di pagine
    }
    const movies = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(userId) } },
      { $unwind: "$movies" }, // Scompatta l'array di film
      { $match: { "movies.watched": false } }, // Filtra solo i film visti
      { $sort: { "movies.addedAt": -1 } }, // Ordina per data
      { $skip: skip }, // Salta i risultati per la paginazione
      { $limit: limit }, // Limita i risultati
      {
        $lookup: { // Popola i dettagli del film
          from: "movies",
          localField: "movies.movieId",
          foreignField: "_id",
          as: "movieId",
        },
      },
      { $unwind: "$movieId" }, // Scompatta i dettagli del film
      { $project: { movies: 1, movieId: 1 } }, // Seleziona solo i campi necessari
    ]);
    
    // Salva nella cache con un TTL (es. 3600 secondi = 1 ora)
    await cacheDataForUser(userId, `${TO_WATCH_MOVIES_CACHE_KEY}_${userId}_page_${page}_limit_${limit}`,  JSON.stringify({movies, totalPages}));

    res.json({movies, totalPages});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Aggiorna lo stato di un film
router.put("/:userId/movies/:movieId", async (req, res) => {
  const { userId, movieId } = req.params;
  const { watched } = req.body;

  try {
    // Invalida la cache
    /* await deleteData(`watched_movies_${userId}`);
    await deleteData(`to_watch_movies_${userId}`); */
    await deleteCacheKeysForUser(userId);
  } catch (err) {
    console.error(err);
  }

  try {
    const user = await User.findById(userId);
    const movie = user.movies.find((m) => m.movieId.toString() === movieId);
    if (!movie) return res.status(404).json({ error: "Movie not found for this user" });

    movie.watched = watched;

    movie.addedAt = new Date(); 

    await user.save();

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Elimina un film dall'utente
router.delete("/:userId/movies/:movieId", async (req, res) => {
  const { userId, movieId } = req.params;

  try {
    // Invalida la cache
    /* await deleteData(`watched_movies_${userId}`);
    await deleteData(`to_watch_movies_${userId}`); */
    await deleteCacheKeysForUser(userId);
    /* console.log("cache invalidata con successo"); */
  } catch (err) {
    console.error(err);
  }

  try {
    const user = await User.findById(userId);
    user.movies = user.movies.filter((m) => m.movieId.toString() !== movieId);
    await user.save();
    res.json({ message: "Movie removed from user's list" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;