const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Movie = require("../models/Movie");

const router = express.Router();

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
    // Cerca o crea il film nella collezione Movies
    let title = movie.title;
    let foundMovie = await Movie.findOne({ title });
    if (!foundMovie) {
      foundMovie = new Movie(movie);
      await foundMovie.save();
    }

    // Aggiungi il riferimento al film nell'array movies dell'utente
    const user = await User.findById(userId);
    user.movies.push({ movieId: movie._id, watched });
    await user.save();

    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ottieni i film di un utente
router.get("/:userId/movies", async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId).populate("movies");
    console.log(user)
    res.json(user.movies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aggiorna lo stato di un film
router.put("/:userId/movies/:movieId", async (req, res) => {
  const { userId, movieId } = req.params;
  const { watched } = req.body;

  try {
    const user = await User.findById(userId);
    const movie = user.movies.find((m) => m.movieId.toString() === movieId);
    if (!movie) return res.status(404).json({ error: "Movie not found for this user" });

    movie.watched = watched;
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
    const user = await User.findById(userId);
    user.movies = user.movies.filter((m) => m.movieId.toString() !== movieId);
    await user.save();

    res.json({ message: "Movie removed from user's list" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;