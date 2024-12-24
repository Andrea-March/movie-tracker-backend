const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Il modello utente
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "secretkey"; // Usa una chiave segreta sicura

router.get('/test' , async (req, res) => {return res.status(200).json({ message: "server healthy" });})

// Registrazione dell'utente
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Verifica se l'email o il nome utente esistono già
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ error: "L'utente esiste già." });
    }

    // Cripta la password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crea un nuovo utente
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });

    await newUser.save();
    res.status(201).json({ message: "Utente registrato con successo" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore durante la registrazione." });
  }
});

// Login dell'utente
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: "Nome utente o password errati." });
    }

    // Verifica la password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Nome utente o password errati." });
    }

    // Genera un token JWT
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "30d" });

    // Restituisci il token al client
    res.json({ message: "Login riuscito", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore durante il login." });
  }
});

// Middleware per proteggere le rotte (verifica del token)
const authMiddleware = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(403).json({ error: "Autenticazione richiesta" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token non valido" });
  }
};

module.exports = { router, authMiddleware };