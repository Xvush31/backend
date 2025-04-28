const express = require("express");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt"); // Ajoute bcrypt
const { OAuth2Client } = require("google-auth-library");
require("dotenv").config();

const router = express.Router();

// Connexion à MySQL
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Vérifier la connexion à MySQL
pool
  .getConnection()
  .then(() => console.log("Connecté à MySQL (routes/auth)"))
  .catch((err) => console.error("Erreur MySQL (routes/auth):", err));

// Client Google OAuth
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Route pour l’inscription
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }

    // Vérifier si l’utilisateur existe déjà
    const [existingUser] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "Cet email est déjà utilisé" });
    }

    // Hacher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insérer le nouvel utilisateur (par défaut, rôle 'user')
    await pool.query(
      "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
      [email, hashedPassword, "user"]
    );

    res.status(201).json({ message: "Utilisateur créé" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de l’inscription" });
  }
});

// Route pour la connexion
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }

    const [user] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (user.length === 0) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    // Vérifier le mot de passe
    const isMatch = await bcrypt.compare(password, user[0].password);
    if (!isMatch) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    // Générer un token JWT
    const token = jwt.sign(
      { email: user[0].email, role: user[0].role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ success: true, token, role: user[0].role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la connexion" });
  }
});

// Route pour l’authentification Google
router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token Google requis" });
    }

    // Vérifier le token Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload["email"];

    // Vérifier si l’utilisateur existe
    let [user] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (user.length === 0) {
      // Créer un nouvel utilisateur (par défaut, rôle 'user')
      await pool.query(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        [email, null, "user"]
      );
      [user] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    }

    // Générer un token JWT
    const jwtToken = jwt.sign(
      { email: user[0].email, role: user[0].role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ success: true, token: jwtToken, role: user[0].role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de l’authentification Google" });
  }
});

// Route pour l’authentification Apple
router.post("/apple", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email requis" });
    }

    // Vérifier si l’utilisateur existe
    let [user] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (user.length === 0) {
      // Créer un nouvel utilisateur (par défaut, rôle 'user')
      await pool.query(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        [email, null, "user"]
      );
      [user] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    }

    // Générer un token JWT
    const token = jwt.sign(
      { email: user[0].email, role: user[0].role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ success: true, token, role: user[0].role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de l’authentification Apple" });
  }
});

module.exports = router;
