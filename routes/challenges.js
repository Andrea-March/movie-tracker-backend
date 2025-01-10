const express = require("express");
const router = express.Router();
const Challenge = require("../models/Challenge");
const UserProgress = require("../models/UserProgress")
const Movie = require("../models/Movie"); // Assumendo che il modello Movie sia già implementato
const axios = require("axios");
const { authMiddleware } = require("./authroutes");

// Crea una sfida
// POST /challenges/create
router.post("/create", authMiddleware, async (req, res) => {
  const { title, theme, goal, startDate, endDate, genreIds } = req.body;

  try {
    // Recupera i film suggeriti da TMDb
    const response = await axios.get(`${TMDB_MOVIE_API}discover/movie`, {
      headers: {
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
      },
      params: {
        language: "it-IT",
        with_genres: genreIds.join(","), // Filtra per generi specifici
        sort_by: "popularity.desc",
      },
    });

    if (response.status !== 200) {
      return res.status(400).json({ error: "Errore nella chiamata a TMDb" });
    }

    // Crea la lista dei film suggeriti
    const suggestedMovies = response.data.results.map((movie) => ({
      movieId: movie.id,
      title: movie.title,
    }));

    // Crea una nuova sfida
    const challenge = new Challenge({
      title,
      theme,
      suggestedMovies,
      goal,
      startDate,
      endDate,
    });

    await challenge.save();
    res.status(201).json({ message: "Sfida creata con successo!", challenge });
  } catch (err) {
    console.error("Errore nella creazione della sfida:", err);
    res.status(500).json({ error: "Errore interno del server" });
  }
});


// Recupera tutte le sfide attive a cui un utente può unirsi o che ha completato
// GET /challenges
router.get("/", authMiddleware, async (req, res) => {
    const userId = req.user.id; // Decodificato dal middleware JWT
  
    try {
      // Recupera tutte le sfide attive
      const challenges = await Challenge.find({
        endDate: { $gte: new Date() }, // Solo sfide non ancora scadute
      });
  
      // Recupera le sfide a cui l'utente non è ancora iscritto
      const userProgresses = await UserProgress.find({ userId });
      const completedChallengeIds = userProgresses.map((progress) => progress.challengeId.toString());
  
      const availableChallenges = challenges.filter(
        (challenge) => !completedChallengeIds.includes(challenge._id.toString())
      );
  
      res.status(200).json({
        challenges: availableChallenges.map((challenge) => ({
          challengeId: challenge._id,
          title: challenge.title,
          theme: challenge.theme,
          goal: challenge.goal,
          startDate: challenge.startDate,
          endDate: challenge.endDate,
        })),
      });
    } catch (err) {
      console.error("Errore durante il recupero delle sfide:", err);
      res.status(500).json({ error: "Errore interno del server" });
    }
  });


// Permette di unirsi ad una sfida
// POST /challenges/:challengeId/join
router.post("/:challengeId/join", authMiddleware, async (req, res) => {
    const { challengeId } = req.params;
    const { selectedMovies } = req.body; // Array di movieId selezionati dall'utente
    const userId = req.user.id; // Decodificato dal middleware JWT
  
    try {
      // Controlla che la sfida esista
      const challenge = await Challenge.findById(challengeId);
      if (!challenge) {
        return res.status(404).json({ error: "Sfida non trovata" });
      }
  
      // Controlla che i film selezionati facciano parte dei film suggeriti
      const validMovies = challenge.suggestedMovies.map((movie) => movie.movieId.toString());
      const invalidMovies = selectedMovies.filter((movieId) => !validMovies.includes(movieId));
      if (invalidMovies.length > 0) {
        return res.status(400).json({
          error: "Alcuni film selezionati non fanno parte dei suggeriti",
          invalidMovies,
        });
      }
  
      // Controlla che l'utente non abbia già progressi per questa sfida
      const existingProgress = await UserProgress.findOne({ userId, challengeId });
      if (existingProgress) {
        return res.status(400).json({ error: "Sei già iscritto a questa sfida" });
      }
  
      // Crea un nuovo documento UserProgress
      const userProgress = new UserProgress({
        userId,
        challengeId,
        selectedMovies: selectedMovies.map((movieId) => ({
          movieId,
          watched: false,
        })),
      });
  
      await userProgress.save();
  
      res.status(201).json({ message: "Unito con successo alla sfida!", userProgress });
    } catch (err) {
      console.error("Errore durante l'iscrizione alla sfida:", err);
      res.status(500).json({ error: "Errore interno del server" });
    }
  });

// Aggiorna lo stato della sfida di un utente
// PATCH /challenges/:challengeId/progress
router.patch("/:challengeId/progress", authMiddleware, async (req, res) => {
    const { challengeId } = req.params;
    const { movieId } = req.body; // Film che l'utente ha visto
    const userId = req.user.id; // Decodificato dal middleware JWT
  
    try {
      // Trova il documento UserProgress per l'utente e la sfida
      const userProgress = await UserProgress.findOne({ userId, challengeId });
      if (!userProgress) {
        return res.status(404).json({ error: "Progressi per questa sfida non trovati" });
      }
  
      // Trova il film selezionato
      const movieProgress = userProgress.selectedMovies.find(
        (movie) => movie.movieId.toString() === movieId
      );
  
      if (!movieProgress) {
        return res.status(400).json({ error: "Il film specificato non fa parte dei film selezionati" });
      }
  
      if (movieProgress.watched) {
        return res.status(400).json({ error: "Il film è già stato segnato come visto" });
      }
  
      // Aggiorna lo stato del film
      movieProgress.watched = true;
      movieProgress.watchedAt = new Date();
  
      // Incrementa il progresso e verifica il completamento della sfida
      userProgress.progress += 1;
      if (userProgress.progress >= userProgress.selectedMovies.length) {
        userProgress.completed = true;
      }
  
      await userProgress.save();
  
      res.status(200).json({ message: "Progresso aggiornato con successo!", userProgress });
    } catch (err) {
      console.error("Errore durante l'aggiornamento dei progressi:", err);
      res.status(500).json({ error: "Errore interno del server" });
    }
  });

// Recupera i progressi di una certa sfida per un utente 
// GET /challenges/:challengeId/progress
router.get("/:challengeId/progress", authMiddleware, async (req, res) => {
    const { challengeId } = req.params;
    const userId = req.user.id; // Decodificato dal middleware JWT
  
    try {
      // Trova la sfida
      const challenge = await Challenge.findById(challengeId);
      if (!challenge) {
        return res.status(404).json({ error: "Sfida non trovata" });
      }
  
      // Trova il progresso dell'utente per questa sfida
      const userProgress = await UserProgress.findOne({ userId, challengeId }).populate("selectedMovies.movieId");
      if (!userProgress) {
        return res.status(404).json({ error: "Progressi non trovati per questa sfida" });
      }
  
      // Restituisci i dettagli dei progressi
      const progressDetails = {
        challengeId: challenge._id,
        title: challenge.title,
        theme: challenge.theme,
        goal: challenge.goal,
        progress: userProgress.progress,
        completed: userProgress.completed,
        selectedMovies: userProgress.selectedMovies.map((movie) => ({
          movieId: movie.movieId._id,
          title: movie.movieId.title,
          watched: movie.watched,
          watchedAt: movie.watchedAt,
        })),
      };
  
      res.status(200).json(progressDetails);
    } catch (err) {
      console.error("Errore durante il recupero dei progressi:", err);
      res.status(500).json({ error: "Errore interno del server" });
    }
  });
module.exports = router;