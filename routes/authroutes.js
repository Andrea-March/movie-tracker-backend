const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Il modello utente
const router = express.Router();
const nodemailer = require('nodemailer');
const crypto = require("crypto");

// render del template mail di verifica e attivazione account
const fs = require('fs');
const ejs = require('ejs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || "secretkey"; // Usa una chiave segreta sicura

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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

// Richiesta di reset password
router.post("/request-reset", async (req, res) => {
  const { username } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ message: "Utente non trovato" });

  const token = crypto.randomBytes(32).toString("hex");
  user.resetToken = token;
  user.resetTokenExpiration = Date.now() + 3600000; // 60 minuti
  await user.save();


  // Percorso al file del template
  const templatePath = path.join(__dirname, 'templates', 'passwordChangeTemplate.html');


  const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${token}&username=${username}`;
  const template = fs.readFileSync(templatePath, 'utf-8');
  const currentYear = new Date().getFullYear();
  const htmlContent = ejs.render(template, { name: username, url: resetLink, currentYear: currentYear });

  await transporter.sendMail({
    from:process.env.EMAIL_USER,
    to: user.email,
    subject: "Watchly Password Reset",
    html: htmlContent,
  });

  res.json({ message: "Email di reset inviata!" });
});

//Reimpostazione della password
router.post("/reset-password", async (req, res) => {
  const { token, newPassword, username } = req.body;
  const user = await User.findOne({
    username
  });
  console.log(new Date(user.resetTokenExpiration).getTime())
  console.log(Date.now())

  if (!user) return res.status(400).json({ message: "utente non trovato" });
  if (token !== user.resetToken) return res.status(400).json({message: "token non valido"});
  if(new Date(user.resetTokenExpiration).getTime() < Date.now()) return res.status(400).json({message: "token scaduto"});

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetToken = undefined;
  user.resetTokenExpiration = undefined;
  await user.save();

  res.json({ message: "Password aggiornata con successo!" });
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