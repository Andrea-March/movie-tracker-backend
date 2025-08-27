require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Error connecting to MongoDB:", err));

// API Routes
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const userRoutes = require("./routes/users");
const movieRoutes = require("./routes/movies");
const challengesRoutes = require("./routes/challenges")
const personRoutes = require("./routes/people");
const groupRoutes = require("./routes/groups");
const { router, authMiddleware } = require("./routes/authroutes")

app.use("/api/users", userRoutes);
app.use("/api/movies", movieRoutes);
app.use("/api/auth", router, authMiddleware); // Le route di login e registrazione
app.use("/api/challenges", challengesRoutes);
app.use("/api/person", personRoutes);
app.use("/api/groups", groupRoutes);